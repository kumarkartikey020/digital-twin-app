const db = require('../src/db');
const leaderboardModel = require('../src/models/leaderboardModel');
const leaderboardCron = require('../src/services/leaderboardCron');

describe('Leaderboard Cron Aggregation Deduplication & Constraint Fix (P0.1)', () => {
  const testUserId1 = '90000000-0000-4000-a000-000000000001';
  const testUserId2 = '90000000-0000-4000-a000-000000000002';
  const testGuestSession1 = 'guest_test_session_alpha';
  const testGuestSession2 = 'guest_test_session_beta';

  beforeEach(async () => {
    // 1. Clean up any existing test records
    await db.query("DELETE FROM leaderboard_snapshot WHERE user_id IN ($1, $2) OR session_id IN ($3, $4)", [
      testUserId1, testUserId2, testGuestSession1, testGuestSession2
    ]);
    await db.query("DELETE FROM user_activity_log WHERE user_id IN ($1, $2) OR session_id IN ($3, $4)", [
      testUserId1, testUserId2, testGuestSession1, testGuestSession2
    ]);
    await db.query("DELETE FROM users WHERE id IN ($1, $2)", [testUserId1, testUserId2]);

    // 2. Ensure leaderboard_config default rows exist
    await db.query(`
      INSERT INTO leaderboard_config (action_type, points) VALUES
      ('daily_login', 10),
      ('simulation_complete', 50),
      ('assessment_complete', 100),
      ('profile_update', 20),
      ('onboarding_complete', 150)
      ON CONFLICT (action_type) DO NOTHING;
    `);

    // 3. Create mock users
    await db.query(`
      INSERT INTO users (id, email, password_hash, role, name, is_active, public_leaderboard_opt_in, app_data)
      VALUES 
      ($1, 'alice.lead@test.com', 'hash123', 'student', 'Alice Leaderboard', true, true, '{"city": "Bangalore"}'::jsonb),
      ($2, 'bob.lead@test.com', 'hash123', 'student', 'Bob Leaderboard', true, true, '{"city": "Mumbai"}'::jsonb)
      ON CONFLICT (id) DO NOTHING;
    `, [testUserId1, testUserId2]);

    // 4. Seed user_activity_log:
    // User 1 has multiple records across DIFFERENT session_ids AND NULL session_id:
    await db.query(`
      INSERT INTO user_activity_log (user_id, session_id, action_type, points_awarded, created_at)
      VALUES
      ($1, NULL, 'daily_login', 10, now() - interval '3 hours'),
      ($1, 'guest_prior_session_1', 'simulation_complete', 50, now() - interval '2 hours'),
      ($1, 'guest_prior_session_2', 'assessment_complete', 100, now() - interval '1 hour');
    `, [testUserId1]);

    // User 2 has 1 record:
    await db.query(`
      INSERT INTO user_activity_log (user_id, session_id, action_type, points_awarded, created_at)
      VALUES
      ($1, NULL, 'profile_update', 20, now() - interval '4 hours');
    `, [testUserId2]);

    // Guest 1 has multiple records with same session_id:
    await db.query(`
      INSERT INTO user_activity_log (user_id, session_id, action_type, points_awarded, created_at)
      VALUES
      (NULL, $1, 'daily_login', 10, now() - interval '5 hours'),
      (NULL, $1, 'simulation_complete', 50, now() - interval '2 hours');
    `, [testGuestSession1]);

    // Guest 2 has 1 record:
    await db.query(`
      INSERT INTO user_activity_log (user_id, session_id, action_type, points_awarded, created_at)
      VALUES
      (NULL, $1, 'daily_login', 10, now() - interval '1 hour');
    `, [testGuestSession2]);
  });

  afterAll(async () => {
    // Teardown test rows
    await db.query("DELETE FROM leaderboard_snapshot WHERE user_id IN ($1, $2) OR session_id IN ($3, $4)", [
      testUserId1, testUserId2, testGuestSession1, testGuestSession2
    ]);
    await db.query("DELETE FROM user_activity_log WHERE user_id IN ($1, $2) OR session_id IN ($3, $4)", [
      testUserId1, testUserId2, testGuestSession1, testGuestSession2
    ]);
    await db.query("DELETE FROM users WHERE id IN ($1, $2)", [testUserId1, testUserId2]);
  });

  describe('1. SQL Aggregation Logic (aggregateScores)', () => {
    it('groups all activity for an authenticated student under user_id with null session_id', async () => {
      const aggregates = await leaderboardModel.aggregateScores(null, null);

      // Find Alice (User 1)
      const aliceAgg = aggregates.filter(a => a.user_id === testUserId1);
      expect(aliceAgg.length).toBe(1);
      expect(aliceAgg[0].total_score).toBe(160); // 10 + 50 + 100
      expect(aliceAgg[0].session_id).toBeNull();

      // Find Bob (User 2)
      const bobAgg = aggregates.filter(a => a.user_id === testUserId2);
      expect(bobAgg.length).toBe(1);
      expect(bobAgg[0].total_score).toBe(20);
      expect(bobAgg[0].session_id).toBeNull();

      // Find Guest 1
      const guest1Agg = aggregates.filter(a => a.session_id === testGuestSession1);
      expect(guest1Agg.length).toBe(1);
      expect(guest1Agg[0].total_score).toBe(60); // 10 + 50
      expect(guest1Agg[0].user_id).toBeNull();

      // Find Guest 2
      const guest2Agg = aggregates.filter(a => a.session_id === testGuestSession2);
      expect(guest2Agg.length).toBe(1);
      expect(guest2Agg[0].total_score).toBe(10);
      expect(guest2Agg[0].user_id).toBeNull();
    });

    it('returns scores in descending order', async () => {
      const aggregates = await leaderboardModel.aggregateScores(null, null);
      const relevant = aggregates.filter(a => 
        a.user_id === testUserId1 || 
        a.user_id === testUserId2 || 
        a.session_id === testGuestSession1 || 
        a.session_id === testGuestSession2
      );

      expect(relevant.length).toBe(4);
      expect(relevant[0].user_id).toBe(testUserId1); // 160 pts
      expect(relevant[1].session_id).toBe(testGuestSession1); // 60 pts
      expect(relevant[2].user_id).toBe(testUserId2); // 20 pts
      expect(relevant[3].session_id).toBe(testGuestSession2); // 10 pts
    });
  });

  describe('2. Background Cron Aggregation & Database Snapshot Upsert', () => {
    it('executes full cron aggregation without unique constraint errors', async () => {
      // Trigger cron job covering all periods
      await expect(leaderboardCron.runCronJob()).resolves.not.toThrow();

      // Verify records in leaderboard_snapshot for period 'all_time'
      const snapshots = await db.query(
        "SELECT * FROM leaderboard_snapshot WHERE period = 'all_time' AND (user_id IN ($1, $2) OR session_id IN ($3, $4)) ORDER BY rank ASC",
        [testUserId1, testUserId2, testGuestSession1, testGuestSession2]
      );

      expect(snapshots.rows.length).toBe(4);

      // Verify Alice has rank 1 and score 160 with session_id NULL
      const aliceSnap = snapshots.rows.find(r => r.user_id === testUserId1);
      expect(aliceSnap).toBeDefined();
      expect(aliceSnap.score).toBe(160);
      expect(aliceSnap.session_id).toBeNull();
      expect(aliceSnap.display_name).toContain('Alice');
      expect(aliceSnap.city).toBe('Bangalore');

      // Verify Guest 1 has score 60
      const guest1Snap = snapshots.rows.find(r => r.session_id === testGuestSession1);
      expect(guest1Snap).toBeDefined();
      expect(guest1Snap.score).toBe(60);
      expect(guest1Snap.user_id).toBeNull();

      // Verify Bob has score 20
      const bobSnap = snapshots.rows.find(r => r.user_id === testUserId2);
      expect(bobSnap).toBeDefined();
      expect(bobSnap.score).toBe(20);
      expect(bobSnap.session_id).toBeNull();

      // Verify Guest 2 has score 10
      const guest2Snap = snapshots.rows.find(r => r.session_id === testGuestSession2);
      expect(guest2Snap).toBeDefined();
      expect(guest2Snap.score).toBe(10);
      expect(guest2Snap.user_id).toBeNull();
    });

    it('getUserRank retrieves the unified score and rank correctly', async () => {
      await leaderboardCron.runCronJob();
      const userRank = await leaderboardModel.getUserRank(testUserId1, null, 'all_time');
      expect(userRank).not.toBeNull();
      expect(userRank.score).toBe(160);
      expect(userRank.display_name).toContain('Alice');
    });
  });

  describe('3. Defensive In-Memory Deduplication in bulkUpsertSnapshots', () => {
    it('silently and safely deduplicates intentional conflicting keys in the input batch', async () => {
      const duplicateBatch = [
        {
          user_id: testUserId1,
          session_id: 'guest_prior_session_1', // Conflict with same user
          period: 'weekly',
          score: 160,
          rank: 1,
          previous_rank: null,
          display_name: 'Alice L.',
          city: 'Bangalore'
        },
        {
          user_id: testUserId1,
          session_id: null, // Same user, same period -> duplicate key!
          period: 'weekly',
          score: 160,
          rank: 2,
          previous_rank: null,
          display_name: 'Alice Duplicate',
          city: 'Bangalore'
        },
        {
          user_id: null,
          session_id: testGuestSession1,
          period: 'weekly',
          score: 60,
          rank: 3,
          previous_rank: null,
          display_name: 'Clever Explorer 42',
          city: null
        }
      ];

      // Must NOT throw "duplicate key value violates unique constraint"
      await expect(leaderboardModel.bulkUpsertSnapshots(duplicateBatch)).resolves.not.toThrow();

      // Verify that in leaderboard_snapshot for 'weekly', testUserId1 only appears ONCE
      const weeklyRows = await db.query(
        "SELECT * FROM leaderboard_snapshot WHERE period = 'weekly' AND user_id = $1",
        [testUserId1]
      );
      expect(weeklyRows.rows.length).toBe(1);
      expect(weeklyRows.rows[0].rank).toBe(1);
    });

    it('handles empty input gracefully without database error', async () => {
      await expect(leaderboardModel.bulkUpsertSnapshots([])).resolves.not.toThrow();
      await expect(leaderboardModel.bulkUpsertSnapshots(null)).resolves.not.toThrow();
    });
  });
});
