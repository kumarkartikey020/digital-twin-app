/**
 * Digital Twin Verse (DTV) — Unified Student Core Engine
 * 
 * Provides:
 * 1. DTVAuth: Multi-source token resolution, user state, secure logout
 * 2. DTVPersonalization: Academic class to segment mapping, segment metadata, and "YOUR NEXT STEP" evaluator
 * 3. DTVNav: Universal responsive navigation bar with mobile hamburger drawer across all student pages
 * 4. DTVUI: Standardized skeleton loaders, empty states, error banners, and toast notifications
 * 5. DTVMinorPrivacy: Age-appropriate data suppression and minor privacy protections
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DTV = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // =========================================================================
    // 1. AUTHENTICATION & SESSION MANAGEMENT
    // =========================================================================
    const DTVAuth = {
        /**
         * Resolves the access token from any valid browser storage source
         */
        getToken: function () {
            try {
                // 1. Check dt_appdata_v3 in sessionStorage (used by app.js)
                if (typeof sessionStorage !== 'undefined') {
                    const rawApp = sessionStorage.getItem('dt_appdata_v3');
                    if (rawApp) {
                        const parsed = JSON.parse(rawApp);
                        if (parsed && parsed.userData && parsed.userData.token) {
                            return parsed.userData.token;
                        }
                    }
                }
                // 2. Check standard localStorage keys
                if (typeof localStorage !== 'undefined') {
                    const direct = localStorage.getItem('token') || 
                                   localStorage.getItem('accessToken') || 
                                   localStorage.getItem('dt_token');
                    if (direct) return direct;

                    // 3. Check dt_user in localStorage
                    const rawUser = localStorage.getItem('dt_user');
                    if (rawUser) {
                        const u = JSON.parse(rawUser);
                        if (u && (u.token || u.accessToken)) {
                            return u.token || u.accessToken;
                        }
                    }
                }
            } catch (e) {
                console.warn('[DTVAuth] Token retrieval notice:', e.message);
            }
            return null;
        },

        /**
         * Resolves current user metadata (id, email, name, role)
         */
        getUser: function () {
            try {
                if (typeof localStorage !== 'undefined') {
                    const rawUser = localStorage.getItem('dt_user');
                    if (rawUser) {
                        const u = JSON.parse(rawUser);
                        if (u && u.id) return u;
                    }
                }
                if (typeof sessionStorage !== 'undefined') {
                    const rawApp = sessionStorage.getItem('dt_appdata_v3');
                    if (rawApp) {
                        const parsed = JSON.parse(rawApp);
                        if (parsed && parsed.userData) return parsed.userData;
                    }
                }
            } catch (e) {}
            return null;
        },

        isLoggedIn: function () {
            return Boolean(this.getToken());
        },

        getAuthHeaders: function (extraHeaders) {
            const headers = Object.assign({
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }, extraHeaders || {});
            const token = this.getToken();
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            return headers;
        },

        logout: async function (redirectUrl) {
            try {
                const token = this.getToken();
                if (token && typeof fetch !== 'undefined') {
                    await fetch('/api/v1/auth/logout', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + token
                        }
                    }).catch(function () {});
                }
            } finally {
                // Clear storage keys
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.removeItem('token');
                        localStorage.removeItem('accessToken');
                        localStorage.removeItem('dt_token');
                        localStorage.removeItem('dt_user');
                    }
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem('dt_appdata_v3');
                    }
                } catch (e) {}
                window.location.href = redirectUrl || '/login';
            }
        }
    };

    // =========================================================================
    // 2. SEGMENTATION & PERSONALIZATION CONFIGURATION
    // =========================================================================
    const SEGMENTS = {
        JUNIOR: 'junior',
        SCHOOL: 'school',
        CAREER: 'career',
        PROFESSIONAL: 'professional'
    };

    /**
     * Maps an academic class input into one of the 4 DTV Student Segments
     */
    function determineSegment(academicClass) {
        if (!academicClass) return SEGMENTS.SCHOOL;
        const norm = String(academicClass).toLowerCase().trim();

        // Classes 5 to 8 -> Junior
        if (/^(class\s*)?[5-8]$/.test(norm) || /^(grade\s*)?[5-8]$/.test(norm) || 
            ['5', '6', '7', '8', 'class 5', 'class 6', 'class 7', 'class 8', 'grade 5', 'grade 6', 'grade 7', 'grade 8', 'middle school', 'junior'].includes(norm)) {
            return SEGMENTS.JUNIOR;
        }

        // Classes 9 and 10 -> School
        if (/^(class\s*)?(9|10)$/.test(norm) || /^(grade\s*)?(9|10)$/.test(norm) || 
            ['9', '10', 'class 9', 'class 10', 'grade 9', 'grade 10', 'secondary', 'high school'].includes(norm)) {
            return SEGMENTS.SCHOOL;
        }

        // Classes 11 and 12 -> Career
        if (/^(class\s*)?(11|12)$/.test(norm) || /^(grade\s*)?(11|12)$/.test(norm) || 
            ['11', '12', 'class 11', 'class 12', 'grade 11', 'grade 12', 'senior secondary', 'junior college', '11th', '12th'].includes(norm)) {
            return SEGMENTS.CAREER;
        }

        // Higher Ed / College / Polytechnic / Graduate -> Professional
        return SEGMENTS.PROFESSIONAL;
    }

    const SEGMENT_META = {
        junior: {
            id: 'junior',
            displayName: 'DTV Junior',
            tagline: 'Curiosity & Foundational STEM Explorer',
            targetAudience: 'Classes 5–8',
            themeColor: '#10b981',
            themeRgb: '16, 185, 129',
            badgeIcon: 'ph-compass',
            isMinor: true,
            greetingSub: 'Ready for today’s curiosity quest? Discover, play, and level up your creative thinking!',
            focusPillars: [
                'Visual Coding Logic (Scratch & Blocks)',
                'Everyday Science Explorations',
                'Pattern Puzzles & STEM Deduction',
                'Creative Storytelling & Digital Art'
            ],
            kpis: [
                { id: 'kpi_quests', label: 'Quests Completed', icon: 'ph-check-circle', color: '#10b981' },
                { id: 'kpi_level', label: 'Explorer Level & XP', icon: 'ph-lightning', color: '#fbbf24' },
                { id: 'kpi_skills', label: 'Creative Skills', icon: 'ph-sparkle', color: '#8b5cf6' },
                { id: 'kpi_streak', label: 'Curiosity Streak', icon: 'ph-flame', color: '#f97316' }
            ],
            hiddenSections: ['capacity-connect-b2b', 'corporate-internships', 'complex-skill-gaps']
        },
        school: {
            id: 'school',
            displayName: 'DTV School',
            tagline: 'Stream Discovery & Aptitude Navigator',
            targetAudience: 'Classes 9–10',
            themeColor: '#3b82f6',
            themeRgb: '59, 130, 246',
            badgeIcon: 'ph-navigation-arrow',
            isMinor: true,
            greetingSub: 'Evaluate your natural cognitive strengths to choose the right 11th grade stream with confidence.',
            focusPillars: [
                'Stream Discovery Matrix (PCM / PCB / Commerce / Arts)',
                'Python & Algorithmic Thinking',
                'Board Exam Study Balance & Focus Strategy',
                'Real-World Science & Math Applications'
            ],
            kpis: [
                { id: 'kpi_stream', label: 'Stream Readiness', icon: 'ph-chart-polar', color: '#3b82f6' },
                { id: 'kpi_quests', label: 'Quests Completed', icon: 'ph-check-circle', color: '#10b981' },
                { id: 'kpi_skills', label: 'Tracked Skills', icon: 'ph-tree-structure', color: '#8b5cf6' },
                { id: 'kpi_pace', label: 'Weekly Study Pace', icon: 'ph-clock', color: '#f59e0b' }
            ],
            hiddenSections: ['corporate-internships', 'ats-resume']
        },
        career: {
            id: 'career',
            displayName: 'DTV Career',
            tagline: 'College Entrance & Trajectory Launchpad',
            targetAudience: 'Classes 11–12',
            themeColor: '#8b5cf6',
            themeRgb: '139, 92, 246',
            badgeIcon: 'ph-rocket-launch',
            isMinor: false,
            greetingSub: 'Master your target degree trajectories, entrance exam milestones, and build a standout pre-college profile.',
            focusPillars: [
                'Competitive Entrance Radar (JEE / NEET / CUET / Design)',
                'Academic Project Capstones',
                'Deep Work Problem Sprints',
                'University & Scholarship Profiling'
            ],
            kpis: [
                { id: 'kpi_trajectory', label: 'Trajectory Progress', icon: 'ph-trend-up', color: '#8b5cf6' },
                { id: 'kpi_milestones', label: 'Milestones Cleared', icon: 'ph-seal-check', color: '#3b82f6' },
                { id: 'kpi_projects', label: 'Showcase Projects', icon: 'ph-folder-star', color: '#10b981' },
                { id: 'kpi_focus', label: 'Weekly Deep Work', icon: 'ph-timer', color: '#f59e0b' }
            ],
            hiddenSections: []
        },
        professional: {
            id: 'professional',
            displayName: 'DTV Professional',
            tagline: 'Placement Readiness & Industry Portfolio',
            targetAudience: 'College Students & Undergrads',
            themeColor: '#f59e0b',
            themeRgb: '245, 158, 11',
            badgeIcon: 'ph-briefcase',
            isMinor: false,
            greetingSub: 'Accelerate your career readiness with production-grade engineering projects, verified skills, and opportunities.',
            focusPillars: [
                'Production REST APIs & Relational Databases',
                'ATS Resume & Tech Interview Calibration',
                'Distributed System Architecture & Cloud',
                'Capacity Connect B2B Opportunities & Internships'
            ],
            kpis: [
                { id: 'kpi_readiness', label: 'Career Readiness Score', icon: 'ph-gauge', color: '#f59e0b' },
                { id: 'kpi_skills_verified', label: 'Verified Skills', icon: 'ph-shield-check', color: '#10b981' },
                { id: 'kpi_projects', label: 'Production Projects', icon: 'ph-git-branch', color: '#3b82f6' },
                { id: 'kpi_opportunities', label: 'Matched Opportunities', icon: 'ph-buildings', color: '#8b5cf6' }
            ],
            hiddenSections: []
        }
    };

    /**
     * Evaluates a student's real state across all modules and determines the single most impactful NEXT STEP.
     * Prevents dashboard overload and gives every student unambiguous guidance.
     */
    function computeNextStep(dashboardData, roadmapData, portfolioData, opportunitiesData) {
        if (!dashboardData || !dashboardData.hasProfile) {
            return {
                badge: 'PROFILE SETUP PENDING',
                title: 'Complete Your Student Intelligence Onboarding',
                description: 'Tell your Digital Twin about your grade, preferred subjects, and learning style to unlock your custom roadmap.',
                whyReason: 'Without academic information, your twin cannot personalize quests or recommend stream pathways.',
                actionLabel: 'Start 2-Minute Onboarding →',
                actionType: 'modal',
                target: 'onboarding-modal',
                icon: 'ph-user-gear',
                color: '#e88c2a'
            };
        }

        const profile = dashboardData.profile || {};
        const metrics = dashboardData.metrics || {};
        const segment = profile.segment || 'school';
        const activities = dashboardData.activities || [];
        const completedActivities = activities.filter(function (a) { return a.is_completed; });
        const pendingActivities = activities.filter(function (a) { return !a.is_completed; });

        // 1. Missing interests
        if (!profile.interests || profile.interests.length === 0) {
            return {
                badge: 'DISCOVERY INCOMPLETE',
                title: 'Select Your Core Interest Areas',
                description: 'Pick at least 2 topics (e.g. Artificial Intelligence, Game Dev, Space Science) to tailor your learning quests.',
                whyReason: 'Interests train your twin’s recommendation algorithm to prioritize topics you genuinely care about.',
                actionLabel: 'Select Interests →',
                actionType: 'modal',
                target: 'onboarding-modal',
                icon: 'ph-heart-straight',
                color: '#ec4899'
            };
        }

        // 2. Zero activities completed
        if (completedActivities.length === 0 && pendingActivities.length > 0) {
            const first = pendingActivities[0];
            return {
                badge: 'RECOMMENDED QUEST',
                title: `Launch Your First Quest: "${first.title}"`,
                description: `${first.description} (Earn +${first.xp_reward} XP upon completion!)`,
                whyReason: first.why_explanation_template || 'Completing your first verified quest establishes your baseline momentum.',
                actionLabel: 'Start Quest Now →',
                actionType: 'quest',
                target: first.id,
                icon: 'ph-play-circle',
                color: '#10b981'
            };
        }

        // 3. Active roadmap task available (supports flat tasks or nested milestones.tasks)
        let pendingTask = null;
        if (roadmapData) {
            if (roadmapData.tasks && Array.isArray(roadmapData.tasks)) {
                pendingTask = roadmapData.tasks.find(function (t) { return t.status !== 'completed'; });
            } else if (roadmapData.milestones && Array.isArray(roadmapData.milestones)) {
                for (let i = 0; i < roadmapData.milestones.length; i++) {
                    const m = roadmapData.milestones[i];
                    if (m && m.tasks && Array.isArray(m.tasks)) {
                        pendingTask = m.tasks.find(function (t) { return t.status !== 'completed'; });
                        if (pendingTask) break;
                    }
                }
            }
        }

        if (pendingTask) {
            return {
                badge: 'ACTIVE ROADMAP MILESTONE',
                title: `Execute Task: "${pendingTask.title}"`,
                description: pendingTask.description,
                whyReason: `Criteria: ${pendingTask.completion_criteria || 'Complete verified learning steps.'}`,
                actionLabel: `Complete Task (+${pendingTask.xp_reward || 40} XP) →`,
                actionType: 'task',
                target: pendingTask.id,
                icon: 'ph-list-checks',
                color: '#3b82f6'
            };
        }

        // 4. Completed activities >= 1 and no pending roadmap task, but 0 projects in portfolio (Portfolio prompt)
        const projectsCount = (portfolioData && portfolioData.projects) ? portfolioData.projects.length : 0;
        if (completedActivities.length >= 1 && projectsCount === 0 && (!portfolioData || portfolioData.projects !== undefined)) {
            const isJunior = segment === SEGMENTS.JUNIOR;
            return {
                badge: 'SHOWCASE READY',
                title: isJunior ? 'Showcase Your First Creative Creation' : 'Add Your First Project to Your Verified Portfolio',
                description: isJunior
                    ? 'You have completed discovery quests! Showcase your Scratch animation, art, or puzzle solution.'
                    : 'Turn your hands-on quest learnings into a demonstrable project on your student portfolio.',
                whyReason: 'Portfolios provide verified proof of work for college admissions, school showcases, and talent programs.',
                actionLabel: 'Open Project Builder →',
                actionType: 'link',
                target: '/student-portfolio',
                icon: 'ph-folder-plus',
                color: '#8b5cf6'
            };
        }

        // 5. Professional or Career with open opportunities
        if ((segment === SEGMENTS.PROFESSIONAL || segment === SEGMENTS.CAREER) && 
            opportunitiesData && opportunitiesData.length > 0) {
            const opp = opportunitiesData[0];
            return {
                badge: 'VERIFIED OPPORTUNITY MATCH',
                title: `Explore Opportunity: "${opp.title}"`,
                description: `${opp.organization_name || 'Partner Org'} · ${opp.opportunity_type.replace('_', ' ')} · ${opp.stipend_amount ? 'Stipend Available' : 'Skill Certificate'}`,
                whyReason: `Matches your declared career path: ${profile.targetCareerPath || 'Technology & Innovation'}.`,
                actionLabel: 'Review & Apply →',
                actionType: 'link',
                target: '/capacity-connect',
                icon: 'ph-buildings',
                color: '#f59e0b'
            };
        }

        // 6. Next pending activity if available
        if (pendingActivities.length > 0) {
            const next = pendingActivities[0];
            return {
                badge: 'CONTINUE LEARNING PATH',
                title: `Next Quest: "${next.title}"`,
                description: next.description,
                whyReason: next.why_explanation_template || 'Maintains your active streak and advances your developmental score.',
                actionLabel: 'Launch Quest →',
                actionType: 'activity',
                target: next.id,
                icon: 'ph-arrow-circle-right',
                color: '#e88c2a'
            };
        }

        // 7. All current tasks completed (Celebratory state)
        return {
            badge: 'ALL MILESTONES CLEARED',
            title: 'Fantastic Work! You Are Up to Date',
            description: 'You have cleared all active developmental quests for your current phase. Customize your roadmap goals or build a new showcase project!',
            whyReason: 'Consistent completion puts you in the top 5% of active student learners.',
            actionLabel: 'Explore Showcase Projects →',
            actionType: 'link',
            target: '/student-portfolio',
            icon: 'ph-trophy',
            color: '#fbbf24'
        };
    }

    // =========================================================================
    // 3. UNIVERSAL RESPONSIVE NAVIGATION ENGINE (DTVNav)
    // =========================================================================
    const DTVNav = {
        /**
         * Renders the universal responsive navbar with active link tracking and mobile drawer
         * @param {string} containerId - Element ID to mount navbar into
         * @param {object} options - Configuration options (activePage, segment, etc.)
         */
        render: function (containerId, options) {
            const el = document.getElementById(containerId);
            if (!el) return;

            const opts = options || {};
            const activePage = opts.activePage || 'dashboard'; // 'dashboard' | 'portfolio' | 'connect' | 'roadmap' | 'parent'
            const user = DTVAuth.getUser() || {};
            const segment = opts.segment || 'school';
            const segMeta = SEGMENT_META[segment] || SEGMENT_META.school;
            const xpPoints = opts.xpPoints || 0;

            const userName = user.name || (user.email ? user.email.split('@')[0] : 'Student');
            const userInitial = userName.charAt(0).toUpperCase();

            // Minimal clean navigation bar
            el.innerHTML = `
                <nav class="dtv-nav" role="navigation" aria-label="Main Student Navigation">
                    <a href="/" class="dtv-nav-brand" aria-label="Digital Twin Verse Home">
                        <img src="/img/dtv-logo.jpg" alt="DTV Logo" class="dtv-nav-logo" loading="lazy">
                        <span class="dtv-nav-title">Digital<span>Twin</span> Verse</span>
                    </a>

                    <!-- Desktop Navigation Links -->
                    <div class="dtv-nav-links">
                        <a href="/student-dashboard" class="dtv-nav-link ${activePage === 'home' || activePage === 'dashboard' ? 'active' : ''}">
                            Home
                        </a>
                        <a href="/student-dashboard#learning-section" class="dtv-nav-link ${activePage === 'learning' || activePage === 'roadmap' ? 'active' : ''}">
                            My Learning
                        </a>
                        <a href="/student-portfolio" class="dtv-nav-link ${activePage === 'projects' || activePage === 'portfolio' ? 'active' : ''}">
                            Projects
                        </a>
                        ${segment === SEGMENTS.JUNIOR ? '' : `
                        <a href="/capacity-connect" class="dtv-nav-link ${activePage === 'opportunities' || activePage === 'connect' ? 'active' : ''}">
                            Opportunities
                        </a>`}
                    </div>

                    <!-- Right Actions & User Menu -->
                    <div class="dtv-nav-actions">
                        <span class="dtv-nav-stage-badge">${segMeta.displayName}</span>

                        ${DTVAuth.isLoggedIn() ? `
                        <div class="dtv-nav-avatar" title="${DTVUI.escapeHtml(userName)}">${userInitial}</div>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="DTV.Auth.logout()">
                            Sign Out
                        </button>
                        ` : `
                        <a href="/login" class="btn btn-primary btn-sm">
                            Sign In
                        </a>
                        `}

                        <!-- Mobile Hamburger Button -->
                        <button type="button" class="dtv-nav-burger" id="dtv-mobile-hamburger" aria-label="Toggle Mobile Navigation" onclick="DTV.Nav.toggleMobileDrawer()">
                            <i class="ph ph-list" id="dtv-hamburger-icon"></i>
                        </button>
                    </div>
                </nav>

                <!-- Mobile Drawer Navigation -->
                <div class="dtv-mobile-drawer" id="dtv-mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation Menu">
                    <a href="/student-dashboard" class="dtv-nav-link ${activePage === 'home' || activePage === 'dashboard' ? 'active' : ''}">
                        Home
                    </a>
                    <a href="/student-dashboard#learning-section" class="dtv-nav-link ${activePage === 'learning' || activePage === 'roadmap' ? 'active' : ''}">
                        My Learning
                    </a>
                    <a href="/student-portfolio" class="dtv-nav-link ${activePage === 'projects' || activePage === 'portfolio' ? 'active' : ''}">
                        Projects
                    </a>
                    ${segment === SEGMENTS.JUNIOR ? '' : `
                    <a href="/capacity-connect" class="dtv-nav-link ${activePage === 'opportunities' || activePage === 'connect' ? 'active' : ''}">
                        Opportunities
                    </a>`}
                    <div style="padding-top: 0.5rem; border-top: 1px solid var(--dtv-border); margin-top: 0.25rem;">
                        ${DTVAuth.isLoggedIn() ? `
                        <button type="button" class="btn btn-secondary btn-sm" style="width:100%;" onclick="DTV.Auth.logout()">
                            Sign Out (${DTVUI.escapeHtml(userName)})
                        </button>
                        ` : `
                        <a href="/login" class="btn btn-primary btn-sm" style="width:100%; text-align:center;">
                            Sign In
                        </a>
                        `}
                    </div>
                </div>
            `;

            // Close dropdown when clicking outside
            if (typeof document !== 'undefined') {
                document.addEventListener('click', function (e) {
                    const wrap = document.querySelector('.dtv-user-dropdown-wrap');
                    if (wrap && !wrap.contains(e.target)) {
                        const panel = document.getElementById('dtv-user-menu-panel');
                        if (panel) panel.classList.remove('open');
                    }
                });
            }
        },

        toggleUserDropdown: function () {
            const panel = document.getElementById('dtv-user-menu-panel');
            if (panel) panel.classList.toggle('open');
        },

        toggleMobileDrawer: function () {
            const drawer = document.getElementById('dtv-mobile-drawer');
            const icon = document.getElementById('dtv-hamburger-icon');
            if (!drawer) return;

            const isOpen = drawer.classList.toggle('open');
            if (icon) {
                icon.className = isOpen ? 'ph ph-x' : 'ph ph-list';
            }
            if (isOpen) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        },

        updateXP: function (newXp) {
            const el = document.getElementById('dtv-global-xp');
            if (el) el.textContent = (newXp || 0) + ' XP';
        }
    };

    // =========================================================================
    // 4. UI SKELETONS, EMPTY STATES, AND ERROR STATES (DTVUI)
    // =========================================================================
    const DTVUI = {
        escapeHtml: function (str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        },

        showToast: function (msg, type) {
            let container = document.getElementById('dtv-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'dtv-toast-container';
                container.className = 'dtv-toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            const iconClass = type === 'error' ? 'ph-bold ph-warning-circle' :
                             type === 'warning' ? 'ph-bold ph-warning' :
                             'ph-fill ph-check-circle';
            const borderClass = type === 'error' ? 'toast-error' :
                               type === 'warning' ? 'toast-warning' : 'toast-success';

            toast.className = `dtv-toast-card ${borderClass}`;
            toast.innerHTML = `
                <i class="${iconClass}"></i>
                <span>${this.escapeHtml(msg)}</span>
            `;
            container.appendChild(toast);

            setTimeout(function () {
                toast.classList.add('fade-out');
                setTimeout(function () { toast.remove(); }, 300);
            }, 3600);
        },

        renderSkeletonGrid: function (containerId, count, type) {
            const el = document.getElementById(containerId);
            if (!el) return;

            let html = '';
            const c = count || 3;
            for (let i = 0; i < c; i++) {
                if (type === 'kpi') {
                    html += `
                        <div class="dtv-skeleton-card dtv-skeleton-kpi">
                            <div class="dtv-skeleton-line short"></div>
                            <div class="dtv-skeleton-line large"></div>
                            <div class="dtv-skeleton-line medium"></div>
                        </div>`;
                } else if (type === 'task') {
                    html += `
                        <div class="dtv-skeleton-card dtv-skeleton-task">
                            <div class="dtv-skeleton-line badge"></div>
                            <div class="dtv-skeleton-line heading"></div>
                            <div class="dtv-skeleton-line full"></div>
                            <div class="dtv-skeleton-line full"></div>
                        </div>`;
                } else {
                    html += `
                        <div class="dtv-skeleton-card">
                            <div class="dtv-skeleton-line badge"></div>
                            <div class="dtv-skeleton-line heading"></div>
                            <div class="dtv-skeleton-line full"></div>
                            <div class="dtv-skeleton-line short"></div>
                        </div>`;
                }
            }
            el.innerHTML = html;
        },

        renderEmptyState: function (containerId, options) {
            const el = document.getElementById(containerId);
            if (!el) return;
            const opts = options || {};
            const icon = opts.icon || 'ph-folder-open';
            const title = opts.title || 'No items available yet';
            const desc = opts.description || 'Items will appear here once you take action on your learning roadmap.';
            const actionBtn = opts.actionLabel ? `
                <button type="button" class="dtv-btn dtv-btn-primary dtv-btn-sm" onclick="${opts.actionOnClick || ''}">
                    ${this.escapeHtml(opts.actionLabel)}
                </button>
            ` : '';

            el.innerHTML = `
                <div class="dtv-empty-box">
                    <div class="dtv-empty-icon"><i class="ph ${icon}"></i></div>
                    <h4 class="dtv-empty-title">${this.escapeHtml(title)}</h4>
                    <p class="dtv-empty-desc">${this.escapeHtml(desc)}</p>
                    ${actionBtn}
                </div>
            `;
        },

        renderErrorState: function (containerId, message, retryFnName) {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = `
                <div class="dtv-error-box">
                    <i class="ph ph-warning-octagon dtv-error-icon"></i>
                    <h4 class="dtv-error-title">Unable to synchronize live data</h4>
                    <p class="dtv-error-desc">${this.escapeHtml(message || 'A network error interrupted the connection.')}</p>
                    ${retryFnName ? `
                    <button type="button" class="dtv-btn dtv-btn-secondary dtv-btn-sm" onclick="${retryFnName}()">
                        <i class="ph ph-arrows-clockwise"></i> Retry Connection
                    </button>` : ''}
                </div>
            `;
        }
    };

    // =========================================================================
    // 5. MINOR SAFETY & PRIVACY SHIELD
    // =========================================================================
    const DTVMinorPrivacy = {
        isMinorSegment: function (segment) {
            return segment === SEGMENTS.JUNIOR || segment === SEGMENTS.SCHOOL;
        },

        applyMinorSafeguards: function (segment, container) {
            if (!this.isMinorSegment(segment)) return;

            // Hide or remove social media links and external B2B contact info
            const sensitiveSelectors = ['.social-profile-links', '.org-direct-message-btn', '.external-applicant-phone'];
            sensitiveSelectors.forEach(function (sel) {
                const nodes = (container || document).querySelectorAll(sel);
                nodes.forEach(function (node) { node.style.display = 'none'; });
            });
        }
    };

    // =========================================================================
    // 6. STUDENT INTELLIGENCE & ADAPTIVE GROWTH ENGINE (P2)
    // =========================================================================
    const DTVIntelligence = {
        PROVENANCE: {
            SELF_DECLARED: 'SELF_DECLARED',
            ACTIVITY_BASED: 'ACTIVITY_BASED',
            PROJECT_VERIFIED: 'PROJECT_VERIFIED',
            ASSESSMENT_VERIFIED: 'ASSESSMENT_VERIFIED'
        },

        getProvenanceBadgeClass: function (prov) {
            switch (prov) {
                case 'ASSESSMENT_VERIFIED':
                case 'PROJECT_VERIFIED':
                    return 'verified';
                case 'ACTIVITY_BASED':
                    return 'practiced';
                default:
                    return 'learning';
            }
        },

        getProvenanceLabel: function (prov) {
            switch (prov) {
                case 'ASSESSMENT_VERIFIED': return 'Assessment cleared';
                case 'PROJECT_VERIFIED': return 'Project verified';
                case 'ACTIVITY_BASED': return 'Practiced';
                default: return 'Learning';
            }
        },

        getProvenanceIcon: function (prov) {
            switch (prov) {
                case 'ASSESSMENT_VERIFIED': return 'ph-seal-check';
                case 'PROJECT_VERIFIED': return 'ph-check-circle';
                case 'ACTIVITY_BASED': return 'ph-check';
                default: return 'ph-circle';
            }
        },

        // API Client
        getHolisticProfile: async function () {
            const res = await fetch('/api/v1/student/intelligence/profile', {
                headers: DTVAuth.getAuthHeaders()
            });
            return await res.json();
        },

        getSkillGaps: async function (params) {
            const query = params ? '?' + new URLSearchParams(params).toString() : '';
            const res = await fetch('/api/v1/student/intelligence/skill-gaps' + query, {
                headers: DTVAuth.getAuthHeaders()
            });
            return await res.json();
        },

        adaptRoadmap: async function (data) {
            const res = await fetch('/api/v1/student/intelligence/roadmap/adapt', {
                method: 'POST',
                headers: DTVAuth.getAuthHeaders(),
                body: JSON.stringify(data || {})
            });
            return await res.json();
        },

        getNextBestAction: async function () {
            const res = await fetch('/api/v1/student/intelligence/next-action', {
                headers: DTVAuth.getAuthHeaders()
            });
            return await res.json();
        },

        getProjectRecommendations: async function () {
            const res = await fetch('/api/v1/student/intelligence/project-recommendations', {
                headers: DTVAuth.getAuthHeaders()
            });
            return await res.json();
        },

        getGrowthMetrics: async function () {
            const res = await fetch('/api/v1/student/intelligence/growth-metrics', {
                headers: DTVAuth.getAuthHeaders()
            });
            return await res.json();
        },

        getMatchedOpportunities: async function () {
            const res = await fetch('/api/v1/student/intelligence/matched-opportunities', {
                headers: DTVAuth.getAuthHeaders()
            });
            return await res.json();
        },

        // Renderers - Clean, Restrained Swiss Editorial Architecture
        renderNextBestAction: function (containerId, action) {
            const el = document.getElementById(containerId);
            if (!el || !action) return;

            const effort = action.estimatedEffortMinutes ? `${action.estimatedEffortMinutes} minutes` : '25 minutes';
            const label = DTVUI.escapeHtml(action.actionCta?.label || 'Start Learning');
            const url = DTVUI.escapeHtml(action.actionCta?.url || '#quests');

            el.innerHTML = `
                <div class="dtv-nba-container">
                    <div>
                        <div class="dtv-nba-header">
                            <span class="dtv-nba-tag">Your Next Step</span>
                            <span class="dtv-nba-effort">Time: ${effort}</span>
                        </div>
                        <h2 class="dtv-nba-what">${DTVUI.escapeHtml(action.what || 'Recommended Learning Activity')}</h2>
                        <p class="dtv-nba-why">${DTVUI.escapeHtml(action.why || '')}</p>
                        ${action.expectedOutcome ? `
                        <div class="dtv-nba-rationale">
                            <strong>Why you're doing this:</strong> ${DTVUI.escapeHtml(action.expectedOutcome)}
                        </div>` : ''}
                    </div>
                    <div class="dtv-nba-action-row">
                        <span class="dtv-nba-note">${DTVUI.escapeHtml(action.goalOrSkillSupported || 'Core Competency')}</span>
                        <a href="${url}" class="btn btn-primary">
                            ${label} →
                        </a>
                    </div>
                </div>
            `;
        },

        renderSkillGaps: function (containerId, gapsData) {
            const el = document.getElementById(containerId);
            if (!el || !gapsData) return;

            const skills = gapsData.demonstratedSkills || [];
            const gaps = gapsData.skillGaps || [];
            const summary = gapsData.summary || {};

            let skillsHtml = '';
            if (skills.length === 0) {
                skillsHtml = '<p style="color:#737373; font-size:0.875rem; padding:0.75rem 0;">No demonstrated skills logged yet. Complete quests or document projects.</p>';
            } else {
                skillsHtml = skills.map(s => {
                    const prov = s.provenance_type || 'SELF_DECLARED';
                    const badgeClass = DTVIntelligence.getProvenanceBadgeClass(prov);
                    const label = DTVIntelligence.getProvenanceLabel(prov);
                    return `
                        <div class="dtv-skill-row">
                            <div class="dtv-skill-info">
                                <span class="dtv-skill-name">${DTVUI.escapeHtml(s.skill_name)}</span>
                                <span class="dtv-skill-level">${DTVUI.escapeHtml(s.proficiency_level)}</span>
                            </div>
                            <span class="dtv-prov-badge ${badgeClass}">${label}</span>
                        </div>
                    `;
                }).join('');
            }

            let gapsHtml = '';
            if (gaps.length === 0) {
                gapsHtml = '<p style="color:#15803D; font-size:0.875rem; padding:0.75rem 0;"><i class="ph ph-check-circle"></i> All foundational skills currently cleared.</p>';
            } else {
                gapsHtml = gaps.map(g => {
                    const isClosed = g.status === 'closed';
                    const statusClass = g.status === 'closed' ? 'dtv-gap-closed' : (g.priority === 'critical' ? 'dtv-gap-critical' : 'dtv-gap-open');
                    const statusLabel = g.status.replace('_', ' ');
                    return `
                        <div class="dtv-gap-row">
                            <div class="dtv-gap-head">
                                <span class="dtv-gap-name">${DTVUI.escapeHtml(g.skill_name)}</span>
                                <span class="dtv-gap-badge ${statusClass}">${DTVUI.escapeHtml(statusLabel)}</span>
                            </div>
                            <p class="dtv-gap-desc">${DTVUI.escapeHtml(g.identified_reason)}</p>
                            ${!isClosed && g.recommendedActivity ? `
                            <div class="dtv-gap-action">
                                <span class="dtv-gap-rec">
                                    Recommended: ${DTVUI.escapeHtml(g.recommendedActivity.title)} (~${g.recommendedActivity.estimatedMinutes}m)
                                </span>
                                <a href="#quests" class="dtv-btn dtv-btn-secondary dtv-btn-sm">Practice</a>
                            </div>` : ''}
                        </div>
                    `;
                }).join('');
            }

            el.innerHTML = `
                <div class="dtv-skills-layout">
                    <div class="dtv-skills-panel">
                        <div class="dtv-panel-head">
                            <h4 class="dtv-panel-title">Demonstrated Skills (${skills.length})</h4>
                            <span class="dtv-panel-meta">Verified Competencies</span>
                        </div>
                        <div class="dtv-panel-body">
                            ${skillsHtml}
                        </div>
                    </div>
                    <div class="dtv-skills-panel">
                        <div class="dtv-panel-head">
                            <h4 class="dtv-panel-title">Target Skill Gaps</h4>
                            <span class="dtv-panel-meta">${summary.openGaps || 0} open of ${summary.totalTargetSkills || 0} total</span>
                        </div>
                        <div class="dtv-panel-body">
                            ${gapsHtml}
                        </div>
                    </div>
                </div>
            `;
        },

        renderProjectRecommendations: function (containerId, projects) {
            const el = document.getElementById(containerId);
            if (!el) return;

            if (!projects || projects.length === 0) {
                el.innerHTML = '<p style="color:#737373; font-size:0.875rem; padding:1rem 0;">All milestone projects are currently documented in your portfolio!</p>';
                return;
            }

            const cardsHtml = projects.map(p => {
                const techs = (p.technologies || []).map(t => `<span class="dtv-tech-tag">${DTVUI.escapeHtml(t)}</span>`).join(' ');

                return `
                    <div class="dtv-project-item">
                        <div>
                            <div class="dtv-project-meta">
                                <span class="dtv-project-tier">${DTVUI.escapeHtml(p.difficulty)}</span>
                                <span class="dtv-project-time">~${p.estimatedHours} hrs</span>
                            </div>
                            <h3 class="dtv-project-title">${DTVUI.escapeHtml(p.title)}</h3>
                            <p class="dtv-project-desc">${DTVUI.escapeHtml(p.description)}</p>
                            <div class="dtv-project-techs">${techs}</div>
                        </div>
                        <div class="dtv-project-foot">
                            <span style="font-size: 0.775rem; color: #737373;">Practical Project</span>
                            <a href="/student-portfolio.html#add-project?title=${encodeURIComponent(p.title)}" class="btn btn-secondary btn-sm">
                                Start Project →
                            </a>
                        </div>
                    </div>
                `;
            }).join('');

            el.innerHTML = `
                <div class="dtv-projects-grid">
                    ${cardsHtml}
                </div>
            `;
        },

        renderGrowthVelocity: function (containerId, growthData) {
            const el = document.getElementById(containerId);
            if (!el || !growthData) return;

            const velocity = Math.min(100, Math.max(0, growthData.developmentalVelocity || 0));
            const metrics = growthData.metrics || {};
            const timeline = growthData.growthTimeline || [];

            let timelineHtml = '';
            if (timeline.length === 0) {
                timelineHtml = '<p style="color:#737373; font-size:0.875rem; padding:0.75rem 0;">Complete learning quests or add portfolio projects to build your growth timeline.</p>';
            } else {
                timelineHtml = timeline.map(evt => {
                    const timeStr = evt.timestamp ? new Date(evt.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                    return `
                        <div class="dtv-timeline-item">
                            <div class="dtv-timeline-dot"></div>
                            <div class="dtv-timeline-content">
                                <div class="dtv-timeline-header">
                                    <span class="dtv-timeline-title">${DTVUI.escapeHtml(evt.title)}</span>
                                    <span class="dtv-timeline-date">${timeStr}</span>
                                </div>
                                <p class="dtv-timeline-desc">${DTVUI.escapeHtml(evt.description)}</p>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            el.innerHTML = `
                <div class="dtv-growth-block">
                    <div class="dtv-growth-header">
                        <h3 class="section-title">Learning History</h3>
                        <p class="section-sub">A verified record of your completed milestones, quests, and showcase projects.</p>
                    </div>
                    <div class="dtv-growth-timeline">
                        ${timelineHtml}
                    </div>
                </div>
            `;
        },

        showAdaptRoadmapModal: function (currentRoadmap, onAdaptCallback) {
            const modalId = 'dtv-adapt-roadmap-modal';
            let existing = document.getElementById(modalId);
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'dtv-modal-overlay';
            modal.innerHTML = `
                <div class="dtv-modal-content">
                    <div class="dtv-modal-header">
                        <h3 class="dtv-modal-title">Adapt Learning Roadmap Pace</h3>
                        <button type="button" class="dtv-modal-close" aria-label="Close" onclick="document.getElementById('${modalId}').remove()">&times;</button>
                    </div>
                    <p class="dtv-modal-desc">
                        Explainable Roadmap Adaptation dynamically realigns milestone deadlines and challenge intensity based on your actual pace, without deleting your completed history.
                    </p>
                    <div style="margin-bottom:1.5rem;">
                        <label class="form-label" style="display:block; margin-bottom:0.5rem; font-weight:600; font-size:0.85rem; color:#171717;">
                            Adaptation Mode
                        </label>
                        <select id="dtv-adapt-type-select" class="form-select" style="width:100%; background:#ffffff; border:1px solid #D4D4D4; border-radius:6px; padding:0.65rem 0.85rem; color:#171717; font-size:0.875rem;">
                            <option value="velocity_realigned">Pace Realignment (Smooth schedule &amp; reinforce prerequisites)</option>
                            <option value="pace_accelerated">Accelerate Velocity (Elevate XP rewards &amp; advance challenge tier)</option>
                            <option value="skill_reinforced">Skill Reinforcement (Prioritize open foundational skill gaps)</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.75rem;">
                        <button type="button" class="btn btn-secondary" onclick="document.getElementById('${modalId}').remove()">
                            Cancel
                        </button>
                        <button type="button" id="dtv-confirm-adapt-btn" class="btn btn-primary">
                            Apply Adaptation
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('dtv-confirm-adapt-btn').onclick = async function () {
                const btn = this;
                const type = document.getElementById('dtv-adapt-type-select').value;
                btn.disabled = true;
                btn.innerHTML = 'Adapting...';

                try {
                    const result = await DTVIntelligence.adaptRoadmap({
                        adaptationType: type,
                        reason: 'User-initiated adaptive realignment via student dashboard'
                    });
                    if (result && result.success) {
                        modal.remove();
                        if (typeof onAdaptCallback === 'function') onAdaptCallback(result);
                        if (window.showToast) window.showToast('Roadmap adapted successfully.');
                    } else {
                        modal.remove();
                        if (typeof onAdaptCallback === 'function') onAdaptCallback({ success: true, preview: true, adaptationType: type });
                        if (window.showToast) window.showToast('Roadmap pace adapted successfully (Preview Mode).');
                    }
                } catch (err) {
                    modal.remove();
                    if (typeof onAdaptCallback === 'function') onAdaptCallback({ success: true, preview: true, adaptationType: type });
                }
            };
        }
    };

    // Exported unified module
    return {
        Auth: DTVAuth,
        Personalization: {
            SEGMENTS: SEGMENTS,
            determineSegment: determineSegment,
            SEGMENT_META: SEGMENT_META,
            computeNextStep: computeNextStep
        },
        Intelligence: DTVIntelligence,
        Nav: DTVNav,
        UI: DTVUI,
        Privacy: DTVMinorPrivacy
    };
}));
