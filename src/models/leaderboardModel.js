const db = require('../db');

/**
 * Track a granular user activity action.
 */
async function trackActivity(userId, sessionId, actionType) {
  // We look up points dynamically in case config changes
  const configRes = await db.query('SELECT points FROM leaderboard_config WHERE action_type = $1 AND is_active = true', [actionType]);
  if (configRes.rows.length === 0) {
    throw new Error(`Invalid or inactive action type: ${actionType}`);
  }
  const points = configRes.rows[0].points;
  
  await db.query(
    'INSERT INTO user_activity_log (user_id, session_id, action_type, points_awarded) VALUES ($1, $2, $3, $4)',
    [userId || null, sessionId || null, actionType, points]
  );
  return points;
}

/**
 * Toggle opt-in preference for a logged-in user.
 */
async function setPublicOptIn(userId, isOptedIn) {
  const res = await db.query(
    'UPDATE users SET public_leaderboard_opt_in = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [isOptedIn, userId]
  );
  return res.rows[0];
}

/**
 * Get paginated leaderboard for a given period (excluding opted-out users).
 */
async function getLeaderboardSnapshot(period, page, limit, isAdmin = false) {
  const offset = (page - 1) * limit;
  // We join with users to filter out those who opted out. Guests (session_id) are always opted in by default.
  const query = `
    SELECT ls.user_id, ls.session_id, ls.score, ls.rank, ls.previous_rank, ls.display_name, ls.city
    FROM leaderboard_snapshot ls
    LEFT JOIN users u ON ls.user_id = u.id
    WHERE ls.period = $1
      ${isAdmin ? '' : 'AND (ls.user_id IS NULL OR u.public_leaderboard_opt_in = true)'}
    ORDER BY ls.rank ASC
    LIMIT $2 OFFSET $3
  `;
  const result = await db.query(query, [period, limit, offset]);
  return result.rows;
}

/**
 * Get a specific user's rank (even if they opted out).
 */
async function getUserRank(userId, sessionId, period) {
  const query = `
    SELECT score, rank, previous_rank, display_name, city
    FROM leaderboard_snapshot
    WHERE period = $1
      AND (user_id = $2 OR session_id = $3)
    LIMIT 1
  `;
  const res = await db.query(query, [period, userId || null, sessionId || null]);
  if (res.rows.length === 0) return null;
  return res.rows[0];
}

/**
 * Function used by the Cron job to fetch aggregated scores for a given time window.
 */
async function aggregateScores(startDate, endDate) {
  // Groups by user_id OR session_id. 
  // Ties broken by MIN(created_at)
  let timeFilter = '';
  const params = [];
  if (startDate) {
    params.push(startDate);
    timeFilter += ` AND created_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(endDate);
    timeFilter += ` AND created_at <= $${params.length}`;
  }

  const query = `
    SELECT 
      user_id, 
      CASE WHEN user_id IS NOT NULL THEN NULL ELSE session_id END as session_id, 
      SUM(points_awarded)::int as total_score,
      MIN(created_at) as first_action
    FROM user_activity_log
    WHERE 1=1 ${timeFilter}
      AND (user_id IS NOT NULL OR (session_id IS NOT NULL AND TRIM(session_id) != ''))
    GROUP BY user_id, (CASE WHEN user_id IS NOT NULL THEN NULL ELSE session_id END)
    ORDER BY total_score DESC, first_action ASC
  `;
  const res = await db.query(query, params);
  return res.rows;
}

/**
 * Used by the Cron job to fetch display names and cities for a batch of users
 */
async function getUserDetails(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const query = `SELECT id, name, app_data FROM users WHERE id = ANY($1::uuid[])`;
  const res = await db.query(query, [userIds]);
  const details = {};
  res.rows.forEach(row => {
    let city = null;
    if (row.app_data && row.app_data.city) {
      city = row.app_data.city;
    }
    details[row.id] = {
      name: row.name,
      city: city
    };
  });
  return details;
}

/**
 * Function used by the Cron job to bulk upsert calculated snapshots.
 */
async function bulkUpsertSnapshots(snapshots) {
  // Snapshots is an array of objects: { user_id, session_id, period, score, rank, previous_rank, display_name, city }
  if (!snapshots || snapshots.length === 0) return;

  // In-memory deduplication defensively protects against composite key collisions in the VALUES batch
  const seenKeys = new Set();
  const deduped = [];
  for (const s of snapshots) {
    const targetUserId = s.user_id || null;
    const targetSessionId = targetUserId ? null : (s.session_id || null);
    const uKey = targetUserId || '00000000-0000-0000-0000-000000000000';
    const sKey = targetSessionId || 'none';
    const key = `${uKey}:::${sKey}:::${s.period}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push({
        ...s,
        user_id: targetUserId,
        session_id: targetSessionId,
        rank: deduped.length + 1
      });
    }
  }

  if (deduped.length === 0) return;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear snapshot for the period, then batch insert
    const period = deduped[0].period;
    await client.query('DELETE FROM leaderboard_snapshot WHERE period = $1', [period]);

    // Construct bulk insert query (values)
    const values = [];
    let queryStr = `
      INSERT INTO leaderboard_snapshot 
      (user_id, session_id, period, score, rank, previous_rank, display_name, city) 
      VALUES 
    `;
    let i = 1;
    deduped.forEach((s, idx) => {
      queryStr += `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`;
      if (idx < deduped.length - 1) queryStr += ', ';
      
      values.push(s.user_id, s.session_id, s.period, s.score, s.rank, s.previous_rank, s.display_name, s.city || null);
    });

    queryStr += `
      ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(session_id, 'none'), period)
      DO UPDATE SET
        score = EXCLUDED.score,
        rank = EXCLUDED.rank,
        previous_rank = EXCLUDED.previous_rank,
        display_name = EXCLUDED.display_name,
        city = EXCLUDED.city
    `;

    await client.query(queryStr, values);
    
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Retrieve previous ranks for a period to calculate trend.
 */
async function getPreviousRanks(period) {
  const res = await db.query(`SELECT user_id, session_id, rank FROM leaderboard_snapshot WHERE period = $1`, [period]);
  const map = {};
  res.rows.forEach(r => {
    const key = r.user_id ? `user_${r.user_id}` : `session_${r.session_id}`;
    map[key] = r.rank;
  });
  return map;
}

async function clearSnapshot(period) { await db.query('DELETE FROM leaderboard_snapshot WHERE period = $1', [period]); }

module.exports = {
  clearSnapshot,
  trackActivity,
  setPublicOptIn,
  getLeaderboardSnapshot,
  getUserRank,
  aggregateScores,
  getUserDetails,
  bulkUpsertSnapshots,
  getPreviousRanks
};
