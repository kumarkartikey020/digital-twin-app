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

            // Mobile menu drawer and desktop nav combined
            el.innerHTML = `
                <nav class="dtv-navbar" role="navigation" aria-label="Main Student Navigation">
                    <div class="dtv-nav-brand-wrap">
                        <a href="/" class="dtv-nav-brand" aria-label="Digital Twin Verse Home">
                            <img src="/img/dtv-logo.jpg" alt="DTV Logo" class="dtv-nav-logo" loading="lazy">
                            <div class="dtv-brand-text">
                                <span class="dtv-brand-main">Digital</span><span class="dtv-brand-accent">Twin Verse</span>
                            </div>
                        </a>
                        <div class="dtv-segment-pill" style="--seg-color: ${segMeta.themeColor};" title="Active Student Segment">
                            <i class="${segMeta.badgeIcon}"></i>
                            <span>${segMeta.displayName}</span>
                        </div>
                    </div>

                    <!-- Desktop Navigation Links -->
                    <div class="dtv-nav-links-desktop">
                        <a href="/student-dashboard" class="dtv-nav-link ${activePage === 'dashboard' ? 'active' : ''}">
                            <i class="ph ph-squares-four"></i> Dashboard
                        </a>
                        <a href="/student-dashboard#roadmap-section" class="dtv-nav-link ${activePage === 'roadmap' ? 'active' : ''}">
                            <i class="ph ph-path"></i> Roadmap
                        </a>
                        <a href="/student-portfolio" class="dtv-nav-link ${activePage === 'portfolio' ? 'active' : ''}">
                            <i class="ph ph-briefcase"></i> Portfolio
                        </a>
                        ${segment === SEGMENTS.JUNIOR ? '' : `
                        <a href="/capacity-connect" class="dtv-nav-link ${activePage === 'connect' ? 'active' : ''}">
                            <i class="ph ph-buildings"></i> Opportunities
                        </a>`}
                    </div>

                    <!-- Right Actions & User Menu -->
                    <div class="dtv-nav-actions">
                        <div class="dtv-xp-chip" title="Verified Development Experience Points">
                            <i class="ph-fill ph-lightning"></i>
                            <span id="dtv-global-xp">${xpPoints} XP</span>
                        </div>

                        ${DTVAuth.isLoggedIn() ? `
                        <div class="dtv-user-dropdown-wrap">
                            <button type="button" class="dtv-user-btn" id="dtv-user-menu-btn" aria-expanded="false" aria-label="Open User Menu" onclick="DTV.Nav.toggleUserDropdown()">
                                <div class="dtv-user-avatar">${userInitial}</div>
                                <span class="dtv-user-name-short">${DTVUI.escapeHtml(userName)}</span>
                                <i class="ph ph-caret-down dtv-caret"></i>
                            </button>
                            <div class="dtv-user-menu" id="dtv-user-menu-panel">
                                <div class="dtv-user-menu-header">
                                    <strong>${DTVUI.escapeHtml(userName)}</strong>
                                    <span class="dtv-user-role-badge">${segMeta.targetAudience}</span>
                                </div>
                                <div class="dtv-user-menu-divider"></div>
                                <button type="button" class="dtv-menu-item" onclick="if(window.openOnboardingModal){window.openOnboardingModal();}else{window.location.href='/student-dashboard';}">
                                    <i class="ph ph-sliders"></i> Customize Focus
                                </button>
                                <a href="/student-portfolio" class="dtv-menu-item">
                                    <i class="ph ph-user"></i> My Portfolio
                                </a>
                                <a href="/parent" class="dtv-menu-item">
                                    <i class="ph ph-users"></i> Parent Portal
                                </a>
                                <div class="dtv-user-menu-divider"></div>
                                <button type="button" class="dtv-menu-item dtv-menu-danger" onclick="DTV.Auth.logout()">
                                    <i class="ph ph-sign-out"></i> Sign Out
                                </button>
                            </div>
                        </div>
                        ` : `
                        <a href="/login" class="dtv-btn dtv-btn-primary dtv-btn-sm">
                            <i class="ph ph-sign-in"></i> Sign In
                        </a>
                        `}

                        <!-- Mobile Hamburger Button -->
                        <button type="button" class="dtv-hamburger-btn" id="dtv-mobile-hamburger" aria-label="Toggle Mobile Navigation" onclick="DTV.Nav.toggleMobileDrawer()">
                            <i class="ph ph-list" id="dtv-hamburger-icon"></i>
                        </button>
                    </div>
                </nav>

                <!-- Mobile Drawer Navigation -->
                <div class="dtv-mobile-drawer" id="dtv-mobile-drawer" role="dialog" aria-modal="true" aria-label="Mobile Navigation Menu">
                    <div class="dtv-drawer-head">
                        <div class="dtv-brand-text">
                            <span class="dtv-brand-main">Digital</span><span class="dtv-brand-accent">Twin Verse</span>
                        </div>
                        <button type="button" class="dtv-drawer-close" aria-label="Close Mobile Menu" onclick="DTV.Nav.toggleMobileDrawer()">
                            <i class="ph ph-x"></i>
                        </button>
                    </div>

                    <div class="dtv-drawer-user-card">
                        <div class="dtv-user-avatar dtv-avatar-lg">${userInitial}</div>
                        <div>
                            <div class="dtv-drawer-name">${DTVUI.escapeHtml(userName)}</div>
                            <div class="dtv-segment-pill dtv-pill-sm" style="--seg-color: ${segMeta.themeColor}; margin-top: 0.35rem;">
                                <i class="${segMeta.badgeIcon}"></i>
                                <span>${segMeta.displayName}</span>
                            </div>
                        </div>
                    </div>

                    <div class="dtv-drawer-nav-list">
                        <a href="/student-dashboard" class="dtv-drawer-link ${activePage === 'dashboard' ? 'active' : ''}">
                            <i class="ph ph-squares-four"></i> Dashboard
                        </a>
                        <a href="/student-dashboard#roadmap-section" class="dtv-drawer-link ${activePage === 'roadmap' ? 'active' : ''}">
                            <i class="ph ph-path"></i> 6-Month Roadmap
                        </a>
                        <a href="/student-portfolio" class="dtv-drawer-link ${activePage === 'portfolio' ? 'active' : ''}">
                            <i class="ph ph-briefcase"></i> Verified Portfolio
                        </a>
                        ${segment === SEGMENTS.JUNIOR ? '' : `
                        <a href="/capacity-connect" class="dtv-drawer-link ${activePage === 'connect' ? 'active' : ''}">
                            <i class="ph ph-buildings"></i> Capacity Connect
                        </a>`}
                        <a href="/parent" class="dtv-drawer-link">
                            <i class="ph ph-users"></i> Parent Portal
                        </a>
                        <a href="/" class="dtv-drawer-link">
                            <i class="ph ph-house"></i> Home
                        </a>
                    </div>

                    <div class="dtv-drawer-footer">
                        ${DTVAuth.isLoggedIn() ? `
                        <button type="button" class="dtv-btn dtv-btn-secondary dtv-btn-block" onclick="DTV.Auth.logout()">
                            <i class="ph ph-sign-out"></i> Sign Out
                        </button>
                        ` : `
                        <a href="/login" class="dtv-btn dtv-btn-primary dtv-btn-block">
                            <i class="ph ph-sign-in"></i> Sign In
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

    // Exported unified module
    return {
        Auth: DTVAuth,
        Personalization: {
            SEGMENTS: SEGMENTS,
            determineSegment: determineSegment,
            SEGMENT_META: SEGMENT_META,
            computeNextStep: computeNextStep
        },
        Nav: DTVNav,
        UI: DTVUI,
        Privacy: DTVMinorPrivacy
    };
}));
