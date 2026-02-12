/**
 * =====================================================
 * TSHIKOTA RO FARANA - VIEW ACCOUNT PAGE (UPDATED)
 * =====================================================
 * 
 * Member account dashboard with password-based authentication.
 * 
 * CHANGES:
 * - Login now uses Phone + Password (not Name + Phone)
 * - Added password reset via SMS OTP
 * - Real-time data sync with Firestore
 * - All stats update when database changes
 * 
 * =====================================================
 */

const ViewAccount = (() => {
    // ==========================================
    // DOM Elements
    // ==========================================
    let loginSection;
    let dashboardSection;
    let loginForm;
    let loginBtn;
    let forgotPasswordLink;
    
    // Dashboard elements
    let memberNameEl;
    let memberRefEl;
    let totalSavedEl;
    let totalFinesEl;
    let submissionCountEl;
    let interestProgressEl;
    let interestProgressBar;
    let interestStatusEl;
    let stokvelTotalEl;
    let submissionsListEl;
    let refreshBtn;
    let logoutBtn;

    // ==========================================
    // State
    // ==========================================
    let currentMember = null;
    let memberStats = null;
    let isLoading = false;

    /**
     * Initialize the page
     */
    function init() {
        console.log('🚀 Initializing View Account page...');
        
        // Cache DOM elements
        cacheElements();
        
        // Initialize app core
        App.init();
        
        // Set up event listeners
        setupEventListeners();
        
        // Check for existing session
        checkExistingSession();
    }

    /**
     * Cache all DOM elements
     */
    function cacheElements() {
        // Login section
        loginSection = document.getElementById('loginSection');
        dashboardSection = document.getElementById('dashboardSection');
        loginForm = document.getElementById('loginForm');
        loginBtn = document.getElementById('loginBtn');
        forgotPasswordLink = document.getElementById('forgotPassword');
        
        // Dashboard elements
        memberNameEl = document.getElementById('memberName');
        memberRefEl = document.getElementById('memberRef');
        totalSavedEl = document.getElementById('totalSaved');
        totalFinesEl = document.getElementById('totalFines');
        submissionCountEl = document.getElementById('submissionCount');
        interestProgressEl = document.getElementById('interestProgress');
        interestProgressBar = document.getElementById('interestProgressBar');
        interestStatusEl = document.getElementById('interestStatus');
        stokvelTotalEl = document.getElementById('stokvelTotal');
        submissionsListEl = document.getElementById('submissionsList');
        refreshBtn = document.getElementById('refreshBtn');
        logoutBtn = document.getElementById('logoutBtn');
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Login form submission
        loginForm.addEventListener('submit', handleLogin);
        
        // Phone number formatting
        const phoneInput = document.getElementById('loginPhone');
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        });
        
        // Password visibility toggle
        const togglePassword = document.getElementById('togglePassword');
        if (togglePassword) {
            togglePassword.addEventListener('click', () => {
                const passwordInput = document.getElementById('loginPassword');
                const type = passwordInput.type === 'password' ? 'text' : 'password';
                passwordInput.type = type;
                togglePassword.innerHTML = type === 'password' 
                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
                    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
            });
        }
        
        // Forgot password link
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                openForgotPasswordModal();
            });
        }
        
        // Refresh button
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadDashboardData(true);
            });
        }
        
        // Logout button
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // Register link
        const registerLink = document.getElementById('registerLink');
        if (registerLink) {
            registerLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'register.html';
            });
        }
    }

    /**
     * Check for existing valid session
     */
    async function checkExistingSession() {
        const session = Auth.getMemberSession();
        
        if (session && session.id && session.phone) {
            // Verify session is still valid
            const sessionAge = Date.now() - (session.timestamp || 0);
            const maxAge = 30 * 60 * 1000; // 30 minutes
            
            if (sessionAge < maxAge) {
                try {
                    // Verify member still exists
                    const member = await Database.getMemberByPhone(session.phone);
                    if (member) {
                        currentMember = member;
                        showDashboard();
                        loadDashboardData();
                        return;
                    }
                } catch (error) {
                    console.warn('Session verification failed:', error);
                }
            }
        }
        
        // No valid session, show login
        showLogin();
    }

    /**
     * Handle login form submission
     */
    async function handleLogin(e) {
        e.preventDefault();
        
        // Get form values
        const phone = document.getElementById('loginPhone').value.trim();
        const password = document.getElementById('loginPassword').value;
        
        // Validate inputs
        if (!phone || !password) {
            showToast('Please enter phone number and password', 'warning');
            return;
        }
        
        if (!Utils.isValidPhone(phone)) {
            showFieldError(document.getElementById('loginPhone'), 'Invalid phone number');
            return;
        }
        
        // Start loading
        setButtonLoading(loginBtn, true);
        
        try {
            console.log('🔐 Attempting login...');
            
            // Authenticate via Database
            const member = await Database.verifyMemberLogin(phone, password);
            const result = member 
                ? { success: true, member: member }
                : { success: false, error: 'Invalid phone number or password' };
            
            if (result.success) {
                currentMember = result.member;
                
                // Save session
                Auth.setMemberSession({
                    id: currentMember.id,
                    name: currentMember.fullName || currentMember.name,
                    phone: currentMember.phone,
                    memberRef: currentMember.memberRef,
                    timestamp: Date.now()
                });
                
                showToast(`Welcome back, ${currentMember.name}!`, 'success');
                showDashboard();
                loadDashboardData();
            } else {
                showToast(result.error || 'Login failed', 'error');
                
                // Show specific field error
                if (result.error?.includes('Phone')) {
                    showFieldError(document.getElementById('loginPhone'), result.error);
                } else if (result.error?.includes('password')) {
                    showFieldError(document.getElementById('loginPassword'), result.error);
                }
            }
        } catch (error) {
            console.error('❌ Login error:', error);
            showToast('Login failed. Please try again.', 'error');
        } finally {
            setButtonLoading(loginBtn, false);
        }
    }

    /**
     * Handle logout
     */
    function handleLogout() {
        Auth.clearMemberSession();
        currentMember = null;
        memberStats = null;
        
        // Reset form
        loginForm.reset();
        
        showToast('Logged out successfully', 'info');
        showLogin();
    }

    /**
     * Show login section
     */
    function showLogin() {
        loginSection.style.display = 'block';
        dashboardSection.style.display = 'none';
    }

    /**
     * Show dashboard section
     */
    function showDashboard() {
        loginSection.style.display = 'none';
        dashboardSection.style.display = 'block';
    }

    /**
     * Load dashboard data
     * @param {boolean} showRefreshing - Show refresh indicator
     */
    async function loadDashboardData(showRefreshing = false) {
        if (isLoading || !currentMember) return;
        
        isLoading = true;
        
        if (showRefreshing && refreshBtn) {
            refreshBtn.classList.add('refreshing');
        }
        
        try {
            console.log('📊 Loading dashboard data...');
            
            // Load member stats
            memberStats = await Database.getMemberStats(currentMember.phone);
            
            if (!memberStats) {
                throw new Error('Could not load account data');
            }
            
            // Update current member with latest data
            currentMember = memberStats.member;
            
            // Update all UI elements
            updateDashboardUI();
            
            // Load stokvel total separately
            loadStokvelTotal();
            
            console.log('✅ Dashboard data loaded');
            
        } catch (error) {
            console.error('❌ Load dashboard error:', error);
            showToast('Failed to load some data', 'warning');
        } finally {
            isLoading = false;
            if (refreshBtn) {
                refreshBtn.classList.remove('refreshing');
            }
        }
    }

    /**
     * Update all dashboard UI elements
     */
    function updateDashboardUI() {
        if (!memberStats || !currentMember) return;
        
        // Member info
        if (memberNameEl) {
            memberNameEl.textContent = currentMember.fullName || currentMember.name;
        }
        if (memberRefEl) {
            memberRefEl.textContent = currentMember.memberRef || 'N/A';
        }
        
        // Member avatar
        const avatarEl = document.getElementById('memberAvatar');
        if (avatarEl) {
            avatarEl.textContent = Utils.getInitials(currentMember.name);
        }
        
        // Financial stats (FORMATTED IN RANDS)
        if (totalSavedEl) {
            totalSavedEl.textContent = Utils.formatCurrency(memberStats.totalSavings);
        }
        if (totalFinesEl) {
            totalFinesEl.textContent = Utils.formatCurrency(memberStats.totalFines);
        }
        if (submissionCountEl) {
            submissionCountEl.textContent = memberStats.submissionCount || 0;
        }
        
        // Interest eligibility progress (R10,000 threshold)
        updateInterestProgress();
        
        // Submissions list
        updateSubmissionsList();
    }

    /**
     * Update interest eligibility progress bar
     * SA Stokvel standard: R10,000 minimum to qualify for interest share
     */
    function updateInterestProgress() {
        if (!memberStats) return;
        
        const threshold = memberStats.interestThreshold || APP_SETTINGS?.interestEligibilityMin || 10000;
        const progress = memberStats.interestProgress || 0;
        const qualifies = memberStats.qualifiesForInterest;
        
        // Update progress bar
        if (interestProgressBar) {
            interestProgressBar.style.width = `${Math.min(100, progress)}%`;
            interestProgressBar.classList.toggle('complete', qualifies);
        }
        
        // Update progress text
        if (interestProgressEl) {
            interestProgressEl.textContent = `${Utils.formatCurrency(memberStats.totalSavings)} / ${Utils.formatCurrency(threshold)}`;
        }
        
        // Update status text
        if (interestStatusEl) {
            if (qualifies) {
                interestStatusEl.innerHTML = `
                    <span class="status-badge status-success">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        Eligible for interest share!
                    </span>
                `;
            } else {
                const remaining = threshold - memberStats.totalSavings;
                interestStatusEl.innerHTML = `
                    <span class="status-info">
                        ${Utils.formatCurrency(remaining)} more to qualify
                    </span>
                `;
            }
        }
    }

    /**
     * Update submissions list
     */
    function updateSubmissionsList() {
        if (!submissionsListEl || !memberStats) return;
        
        const submissions = memberStats.submissions || [];
        
        if (submissions.length === 0) {
            submissionsListEl.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    <p>No submissions yet</p>
                    <a href="submit-pop.html" class="btn btn-primary btn-sm">Submit your first payment</a>
                </div>
            `;
            return;
        }
        
        submissionsListEl.innerHTML = submissions.map(sub => createSubmissionCard(sub)).join('');
    }

    /**
     * Create submission card HTML
     * @param {object} submission - Submission data
     * @returns {string} HTML string
     */
    function createSubmissionCard(submission) {
        const status = submission.status || 'pending';
        const statusClass = {
            'verified': 'success',
            'pending': 'warning',
            'rejected': 'error'
        }[status] || 'default';
        
        const statusLabel = {
            'verified': 'Verified',
            'pending': 'Pending',
            'rejected': 'Rejected'
        }[status] || status;
        
        // Format date
        const date = submission.submittedAt?.toDate?.() || submission.submittedAt;
        const dateStr = date ? Utils.formatDate(date, 'medium') : 'Unknown';
        
        // Show fine if applicable
        const fineHtml = submission.fineAmount > 0 
            ? `<span class="fine-badge">+${Utils.formatCurrency(submission.fineAmount)} fine</span>` 
            : '';
        
        return `
            <div class="submission-card">
                <div class="submission-header">
                    <span class="submission-month">${Utils.escapeHtml(submission.paymentMonth)}</span>
                    <span class="badge badge-${statusClass}">${statusLabel}</span>
                </div>
                <div class="submission-body">
                    <div class="submission-amount">${Utils.formatCurrency(submission.amount)}</div>
                    ${fineHtml}
                </div>
                <div class="submission-footer">
                    <span class="submission-date">${dateStr}</span>
                    <span class="submission-ref">${submission.reference}</span>
                </div>
                ${status === 'rejected' && submission.rejectionReason ? `
                    <div class="submission-rejection">
                        <strong>Reason:</strong> ${Utils.escapeHtml(submission.rejectionReason)}
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Load stokvel total (combined savings of all members)
     */
    async function loadStokvelTotal() {
        if (!stokvelTotalEl) return;
        
        try {
            const total = await Database.getStokvelTotal();
            stokvelTotalEl.textContent = Utils.formatCurrency(total);
        } catch (error) {
            console.warn('Could not load stokvel total:', error);
            stokvelTotalEl.textContent = '---';
        }
    }

    /**
     * Open forgot password modal
     */
    function openForgotPasswordModal() {
        // Create modal if doesn't exist
        let modal = document.getElementById('forgotPasswordModal');
        if (!modal) {
            modal = createForgotPasswordModal();
            document.body.appendChild(modal);
        }
        
        App.openModal('forgotPasswordModal');
    }

    /**
     * Create forgot password modal HTML
     */
    function createForgotPasswordModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'forgotPasswordModal';
        
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-container">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 class="modal-title">Reset Password</h2>
                        <button class="modal-close" id="closeForgotModal">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>
                    <div class="modal-body">
                        <!-- Step 1: Enter phone -->
                        <div id="resetStep1">
                            <p class="form-description">Enter your registered phone number. We'll send you a verification code via SMS.</p>
                            <div class="form-group">
                                <label for="resetPhone" class="form-label">Phone Number</label>
                                <input type="tel" id="resetPhone" class="form-input" placeholder="0821234567" maxlength="10" inputmode="numeric">
                                <span class="form-error"></span>
                            </div>
                            <button type="button" class="btn btn-primary btn-block" id="sendOTPBtn">
                                <span class="btn-text">Send Verification Code</span>
                                <span class="btn-loading" style="display: none;">
                                    <span class="spinner"></span>
                                    Sending...
                                </span>
                            </button>
                        </div>
                        
                        <!-- Step 2: Enter OTP -->
                        <div id="resetStep2" style="display: none;">
                            <p class="form-description">Enter the 6-digit code sent to your phone.</p>
                            <div class="form-group">
                                <label for="resetOTP" class="form-label">Verification Code</label>
                                <input type="text" id="resetOTP" class="form-input" placeholder="000000" maxlength="6" inputmode="numeric" style="text-align: center; font-size: 1.5rem; letter-spacing: 0.5rem;">
                                <span class="form-error"></span>
                            </div>
                            <button type="button" class="btn btn-primary btn-block" id="verifyOTPBtn">
                                <span class="btn-text">Verify Code</span>
                                <span class="btn-loading" style="display: none;">
                                    <span class="spinner"></span>
                                    Verifying...
                                </span>
                            </button>
                            <p class="resend-link" style="text-align: center; margin-top: 1rem;">
                                <a href="#" id="resendOTP">Resend code</a>
                            </p>
                        </div>
                        
                        <!-- Step 3: New password -->
                        <div id="resetStep3" style="display: none;">
                            <p class="form-description">Create your new password.</p>
                            <div class="form-group">
                                <label for="newPassword" class="form-label">New Password</label>
                                <input type="password" id="newPassword" class="form-input" placeholder="Enter new password" minlength="6">
                                <span class="form-error"></span>
                            </div>
                            <div class="form-group">
                                <label for="confirmNewPassword" class="form-label">Confirm Password</label>
                                <input type="password" id="confirmNewPassword" class="form-input" placeholder="Confirm new password" minlength="6">
                                <span class="form-error"></span>
                            </div>
                            <button type="button" class="btn btn-primary btn-block" id="resetPasswordBtn">
                                <span class="btn-text">Reset Password</span>
                                <span class="btn-loading" style="display: none;">
                                    <span class="spinner"></span>
                                    Resetting...
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        setTimeout(() => {
            document.getElementById('closeForgotModal')?.addEventListener('click', () => {
                App.closeModal('forgotPasswordModal');
                resetForgotPasswordModal();
            });
            
            document.getElementById('sendOTPBtn')?.addEventListener('click', handleSendOTP);
            document.getElementById('verifyOTPBtn')?.addEventListener('click', handleVerifyOTP);
            document.getElementById('resetPasswordBtn')?.addEventListener('click', handleResetPassword);
            document.getElementById('resendOTP')?.addEventListener('click', (e) => {
                e.preventDefault();
                handleSendOTP();
            });
            
            // Phone formatting
            document.getElementById('resetPhone')?.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
            });
            
            // OTP formatting
            document.getElementById('resetOTP')?.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
            });
        }, 100);
        
        return modal;
    }

    // Password reset state
    let resetPhone = '';
    let resetMemberId = '';

    /**
     * Handle send OTP button click
     */
    async function handleSendOTP() {
        const phoneInput = document.getElementById('resetPhone');
        const phone = phoneInput.value.trim();
        
        if (!Utils.isValidPhone(phone)) {
            showFieldError(phoneInput, 'Please enter a valid 10-digit phone number');
            return;
        }
        
        const btn = document.getElementById('sendOTPBtn');
        setButtonLoading(btn, true);
        
        try {
            // Check if phone is registered
            const member = await Database.getMemberByPhone(phone);
            if (!member) {
                showFieldError(phoneInput, 'Phone number not registered');
                return;
            }
            
            resetPhone = phone;
            resetMemberId = member.id;
            
            // Send OTP via SMS
            const result = await SMS.sendPasswordResetOTP(phone);
            
            if (result.success) {
                showToast('Verification code sent!', 'success');
                
                // Show step 2
                document.getElementById('resetStep1').style.display = 'none';
                document.getElementById('resetStep2').style.display = 'block';
            } else {
                showToast(result.error || 'Failed to send code', 'error');
            }
        } catch (error) {
            console.error('Send OTP error:', error);
            showToast('Failed to send verification code', 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    }

    /**
     * Handle verify OTP button click
     */
    async function handleVerifyOTP() {
        const otpInput = document.getElementById('resetOTP');
        const otp = otpInput.value.trim();
        
        if (otp.length !== 6) {
            showFieldError(otpInput, 'Please enter the 6-digit code');
            return;
        }
        
        const btn = document.getElementById('verifyOTPBtn');
        setButtonLoading(btn, true);
        
        try {
            const isValid = await SMS.verifyOTP(resetPhone, otp);
            
            if (isValid) {
                showToast('Code verified!', 'success');
                
                // Show step 3
                document.getElementById('resetStep2').style.display = 'none';
                document.getElementById('resetStep3').style.display = 'block';
            } else {
                showFieldError(otpInput, 'Invalid or expired code');
            }
        } catch (error) {
            console.error('Verify OTP error:', error);
            showToast('Verification failed', 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    }

    /**
     * Handle reset password button click
     */
    async function handleResetPassword() {
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmNewPassword').value;
        
        // Validate
        if (newPassword.length < 6) {
            showFieldError(document.getElementById('newPassword'), 'Password must be at least 6 characters');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showFieldError(document.getElementById('confirmNewPassword'), 'Passwords do not match');
            return;
        }
        
        const btn = document.getElementById('resetPasswordBtn');
        setButtonLoading(btn, true);
        
        try {
            await Database.updatePassword(resetMemberId, newPassword);
            
            showToast('Password reset successfully!', 'success');
            App.closeModal('forgotPasswordModal');
            resetForgotPasswordModal();
            
        } catch (error) {
            console.error('Reset password error:', error);
            showToast('Failed to reset password', 'error');
        } finally {
            setButtonLoading(btn, false);
        }
    }

    /**
     * Reset forgot password modal to initial state
     */
    function resetForgotPasswordModal() {
        document.getElementById('resetStep1').style.display = 'block';
        document.getElementById('resetStep2').style.display = 'none';
        document.getElementById('resetStep3').style.display = 'none';
        
        document.getElementById('resetPhone').value = '';
        document.getElementById('resetOTP').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        
        resetPhone = '';
        resetMemberId = '';
    }

    // ==========================================
    // Utility Functions
    // ==========================================

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        if (window.App && App.showToast) {
            App.showToast(message, type);
        } else {
            alert(message);
        }
    }

    /**
     * Show field error
     */
    function showFieldError(field, message) {
        field.classList.add('error');
        const errorEl = field.parentElement.querySelector('.form-error');
        if (errorEl) {
            errorEl.textContent = message;
        }
    }

    /**
     * Clear field error
     */
    function clearFieldError(field) {
        field.classList.remove('error');
        const errorEl = field.parentElement.querySelector('.form-error');
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    /**
     * Set button loading state
     */
    function setButtonLoading(button, loading) {
        if (!button) return;
        
        const textEl = button.querySelector('.btn-text');
        const loadingEl = button.querySelector('.btn-loading');
        
        if (loading) {
            button.disabled = true;
            if (textEl) textEl.style.display = 'none';
            if (loadingEl) loadingEl.style.display = 'inline-flex';
        } else {
            button.disabled = false;
            if (textEl) textEl.style.display = 'inline';
            if (loadingEl) loadingEl.style.display = 'none';
        }
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        init,
        loadDashboardData,
        handleLogout
    };
})();
