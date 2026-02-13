/**
 * =====================================================
 * TSHIKOTA RO FARANA - ADMIN DASHBOARD
 * =====================================================
 */

const Admin = (() => {
    // ==========================================
    // STATE
    // ==========================================
    let currentAdmin = null;
    let pendingSubmissions = [];
    let allMembers = [];
    let currentSubmission = null;

    // ==========================================
    // INITIALIZATION
    // ==========================================
    
    function init() {
        console.log('🚀 Initializing Admin Dashboard...');
        
        // Set up event listeners
        setupEventListeners();
        
        // Check for existing session
        checkAdminSession();
    }

    function setupEventListeners() {
        // Login form
        const loginForm = document.getElementById('adminLoginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // Tab navigation
        const adminTabs = document.getElementById('adminTabs');
        if (adminTabs) {
            adminTabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.admin-tab');
                if (tab) {
                    switchTab(tab.dataset.tab);
                }
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshPending');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadPendingSubmissions(true);
            });
        }

        // Close POP viewer
        const closePopBtn = document.getElementById('closePopViewer');
        if (closePopBtn) {
            closePopBtn.addEventListener('click', closePOPViewer);
        }

        // POP viewer backdrop click
        const popViewer = document.getElementById('popViewer');
        if (popViewer) {
            popViewer.addEventListener('click', (e) => {
                if (e.target === popViewer) {
                    closePOPViewer();
                }
            });
        }
    }

    // ==========================================
    // AUTHENTICATION
    // ==========================================

    async function checkAdminSession() {
        const session = Auth.getAdminSession();
        
        if (session && session.authenticated) {
            currentAdmin = session;
            showDashboard();
            loadDashboardData();
        } else {
            showLogin();
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        
        const codeInput = document.getElementById('adminCode');
        const code = codeInput.value.trim();
        const loginBtn = document.getElementById('loginBtn');
        
        if (!code) {
            App.showToast('Please enter admin code', 'warning');
            return;
        }
        
        // Start loading
        App.setButtonLoading(loginBtn, true);
        App.showLoading('Verifying access...', 'Please wait');
        
        try {
            const adminInfo = await Auth.verifyAdminCode(code);
            
            if (adminInfo) {
                currentAdmin = Auth.getAdminSession();
                
                App.hideLoading();
                App.showToast(`Welcome, ${adminInfo.name}!`, 'success');
                showDashboard();
                loadDashboardData();
            } else {
                App.hideLoading();
                App.showToast('Invalid admin code', 'error');
                codeInput.classList.add('error');
            }
        } catch (error) {
            console.error('Admin login error:', error);
            App.hideLoading();
            App.showToast('Login failed. Please try again.', 'error');
        } finally {
            App.setButtonLoading(loginBtn, false);
        }
    }

    async function handleLogout() {
        if (confirm('Are you sure you want to logout?')) {
            await Auth.signOutAdmin();
            currentAdmin = null;
            App.showToast('Logged out successfully', 'info');
            showLogin();
        }
    }

    // ==========================================
    // VIEW MANAGEMENT
    // ==========================================

    function showLogin() {
        const loginSection = document.getElementById('adminLogin');
        const dashboardSection = document.getElementById('adminDashboard');
        
        if (loginSection) loginSection.style.display = 'flex';
        if (dashboardSection) dashboardSection.style.display = 'none';
    }

    function showDashboard() {
        const loginSection = document.getElementById('adminLogin');
        const dashboardSection = document.getElementById('adminDashboard');
        
        if (loginSection) loginSection.style.display = 'none';
        if (dashboardSection) dashboardSection.style.display = 'block';
        
        // Update role badge
        const roleBadge = document.getElementById('adminRoleBadge');
        if (roleBadge && currentAdmin) {
            roleBadge.textContent = currentAdmin.roleName || 'Admin';
            roleBadge.style.display = 'inline-block';
        }
    }

    function switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabName}Panel`);
        });
        
        // Load data for specific tabs
        if (tabName === 'members') {
            loadMembers();
        } else if (tabName === 'verified') {
            loadVerifiedSubmissions();
        }
    }

    // ==========================================
    // DATA LOADING
    // ==========================================

    async function loadDashboardData() {
        App.showLoading('Loading dashboard...', 'Fetching data');
        
        try {
            await Promise.all([
                loadStats(),
                loadPendingSubmissions(),
                loadMembers()
            ]);
        } catch (error) {
            console.error('Dashboard data error:', error);
            App.showToast('Failed to load some data', 'warning');
        } finally {
            App.hideLoading();
        }
    }

    async function loadStats() {
        try {
            // Get totals from database
            let totalMembers = 0;
            let totalSavings = 0;
            let totalFines = 0;
            
            // Try to get from Database module
            if (typeof Database !== 'undefined' && Database.getStokvelTotals) {
                const totals = await Database.getStokvelTotals();
                totalMembers = totals.memberCount || 0;
                totalSavings = totals.totalSavings || 0;
                totalFines = totals.totalFines || 0;
            } else {
                // Fallback: count from Firestore directly
                const membersSnap = await db.collection('members').get();
                totalMembers = membersSnap.size;
                
                membersSnap.forEach(doc => {
                    const data = doc.data();
                    totalSavings += data.totalSaved || 0;
                    totalFines += data.totalFines || 0;
                });
            }
            
            // Update UI
            const statMembers = document.getElementById('statTotalMembers');
            const statSavings = document.getElementById('statTotalSavings');
            const statPending = document.getElementById('statPending');
            const statFines = document.getElementById('statInterestPool');
            
            if (statMembers) statMembers.textContent = totalMembers;
            if (statSavings) statSavings.textContent = Utils.formatCurrency(totalSavings);
            if (statFines) statFines.textContent = Utils.formatCurrency(totalFines);
            
            // Update chart if exists
            updateSavingsChart(totalSavings, totalFines);
            
        } catch (error) {
            console.error('Stats error:', error);
        }
    }

    async function loadPendingSubmissions(showRefresh = false) {
        if (showRefresh) {
            App.showLoading('Refreshing...', 'Loading submissions');
        }
        
        try {
            // Get pending submissions from Firestore
            const snapshot = await db.collection('submissions')
                .where('status', '==', 'pending')
                .orderBy('submittedAt', 'desc')
                .get();
            
            pendingSubmissions = [];
            snapshot.forEach(doc => {
                pendingSubmissions.push({ id: doc.id, ...doc.data() });
            });
            
            renderPendingList();
            
            // Update badge
            const pendingBadge = document.getElementById('pendingBadge');
            const statPending = document.getElementById('statPending');
            
            if (pendingBadge) pendingBadge.textContent = pendingSubmissions.length;
            if (statPending) statPending.textContent = pendingSubmissions.length;
            
        } catch (error) {
            console.error('Pending submissions error:', error);
            
            // Show empty state on error
            const pendingList = document.getElementById('pendingList');
            if (pendingList) {
                pendingList.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-exclamation-circle" style="font-size: 3rem; color: #DC2626;"></i>
                        <p>Failed to load submissions</p>
                        <button class="btn btn-primary btn-sm" onclick="Admin.loadPendingSubmissions(true)">
                            <i class="fa-solid fa-refresh"></i> Retry
                        </button>
                    </div>
                `;
            }
        } finally {
            if (showRefresh) {
                App.hideLoading();
            }
        }
    }

    async function loadMembers() {
        try {
            const snapshot = await db.collection('members')
                .orderBy('createdAt', 'desc')
                .get();
            
            allMembers = [];
            snapshot.forEach(doc => {
                allMembers.push({ id: doc.id, ...doc.data() });
            });
            
            renderMembersList();
            
        } catch (error) {
            console.error('Members error:', error);
        }
    }

    async function loadVerifiedSubmissions() {
        try {
            const snapshot = await db.collection('submissions')
                .where('status', '==', 'verified')
                .orderBy('verifiedAt', 'desc')
                .limit(50)
                .get();
            
            const verified = [];
            snapshot.forEach(doc => {
                verified.push({ id: doc.id, ...doc.data() });
            });
            
            renderVerifiedList(verified);
            
        } catch (error) {
            console.error('Verified submissions error:', error);
        }
    }

    // ==========================================
    // RENDERING
    // ==========================================

    function renderPendingList() {
        const pendingList = document.getElementById('pendingList');
        const emptyState = document.getElementById('pendingEmpty');
        
        if (!pendingList) return;
        
        if (pendingSubmissions.length === 0) {
            pendingList.innerHTML = '';
            if (emptyState) emptyState.style.display = 'block';
            return;
        }
        
        if (emptyState) emptyState.style.display = 'none';
        
        pendingList.innerHTML = pendingSubmissions.map(sub => `
            <div class="pending-card" data-id="${sub.id}">
                <div class="pending-info">
                    <div class="pending-member">
                        <i class="fa-solid fa-user"></i>
                        <span>${sub.memberName || 'Unknown'}</span>
                    </div>
                    <div class="pending-meta">
                        <span><i class="fa-solid fa-calendar"></i> ${sub.month || 'Unknown'}</span>
                        <span><i class="fa-solid fa-clock"></i> ${formatTimeAgo(sub.submittedAt)}</span>
                        ${sub.isLate ? '<span class="late-tag"><i class="fa-solid fa-warning"></i> Late</span>' : ''}
                    </div>
                </div>
                <div class="pending-amount">
                    ${Utils.formatCurrency(sub.amount || 0)}
                </div>
                <div class="pending-actions">
                    <button class="btn btn-icon" onclick="Admin.viewPOP('${sub.id}')" title="View POP">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button class="btn btn-icon btn-danger" onclick="Admin.rejectSubmission('${sub.id}')" title="Reject">
                        <i class="fa-solid fa-times"></i>
                    </button>
                    <button class="btn btn-icon btn-success" onclick="Admin.approveSubmission('${sub.id}')" title="Approve">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    function renderMembersList() {
        const membersList = document.getElementById('membersList');
        if (!membersList) return;
        
        if (allMembers.length === 0) {
            membersList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-users" style="font-size: 3rem; color: var(--neutral-400);"></i>
                    <p class="empty-title">No members yet</p>
                    <p class="empty-text">Members will appear here after registration</p>
                </div>
            `;
            return;
        }
        
        membersList.innerHTML = allMembers.map(member => `
            <div class="member-card" data-id="${member.id}">
                <div class="member-avatar">
                    ${Utils.getInitials(member.fullName || member.name || 'U')}
                </div>
                <div class="member-info">
                    <div class="member-name">${member.fullName || member.name || 'Unknown'}</div>
                    <div class="member-details">
                        <span><i class="fa-solid fa-id-card"></i> ${member.memberRef || 'N/A'}</span>
                        <span><i class="fa-solid fa-phone"></i> ${member.phone || 'N/A'}</span>
                    </div>
                </div>
                <div class="member-stats">
                    <div class="member-savings">${Utils.formatCurrency(member.totalSaved || 0)}</div>
                    <div class="member-status ${member.status === 'active' ? 'active' : 'inactive'}">
                        ${member.status || 'active'}
                    </div>
                </div>
            </div>
        `).join('');
    }

    function renderVerifiedList(verified) {
        const verifiedList = document.getElementById('verifiedList');
        if (!verifiedList) return;
        
        if (verified.length === 0) {
            verifiedList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-check-circle" style="font-size: 3rem; color: var(--primary);"></i>
                    <p>No verified payments yet</p>
                </div>
            `;
            return;
        }
        
        verifiedList.innerHTML = verified.map(sub => `
            <div class="verified-card">
                <div class="verified-info">
                    <span class="verified-member">${sub.memberName || 'Unknown'}</span>
                    <span class="verified-month">${sub.month || 'Unknown'}</span>
                </div>
                <div class="verified-amount">${Utils.formatCurrency(sub.amount || 0)}</div>
                <div class="verified-date">${Utils.formatDate(sub.verifiedAt)}</div>
            </div>
        `).join('');
    }

    // ==========================================
    // POP VIEWER
    // ==========================================

    function viewPOP(submissionId) {
        const submission = pendingSubmissions.find(s => s.id === submissionId);
        if (!submission) {
            App.showToast('Submission not found', 'error');
            return;
        }
        
        if (!submission.proofUrl) {
            App.showToast('No proof of payment found', 'warning');
            return;
        }
        
        currentSubmission = submission;
        
        const popViewer = document.getElementById('popViewer');
        const popImage = document.getElementById('popViewerImage');
        const popInfo = document.getElementById('popViewerInfo');
        
        if (popImage) {
            popImage.src = submission.proofUrl;
        }
        
        if (popInfo) {
            popInfo.innerHTML = `
                <p><strong>Member:</strong> ${submission.memberName}</p>
                <p><strong>Amount:</strong> ${Utils.formatCurrency(submission.amount)}</p>
                <p><strong>Month:</strong> ${submission.month}</p>
                <p><strong>Submitted:</strong> ${Utils.formatDate(submission.submittedAt)}</p>
            `;
        }
        
        if (popViewer) {
            popViewer.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
        // Set up action buttons
        const approveBtn = document.getElementById('popApproveBtn');
        const rejectBtn = document.getElementById('popRejectBtn');
        
        if (approveBtn) {
            approveBtn.onclick = () => {
                closePOPViewer();
                approveSubmission(submissionId);
            };
        }
        
        if (rejectBtn) {
            rejectBtn.onclick = () => {
                closePOPViewer();
                rejectSubmission(submissionId);
            };
        }
    }

    function closePOPViewer() {
        const popViewer = document.getElementById('popViewer');
        if (popViewer) {
            popViewer.classList.remove('active');
            document.body.style.overflow = '';
        }
        currentSubmission = null;
    }

    // ==========================================
    // ACTIONS
    // ==========================================

    async function approveSubmission(submissionId) {
        const submission = pendingSubmissions.find(s => s.id === submissionId);
        if (!submission) return;
        
        if (!confirm(`Approve ${Utils.formatCurrency(submission.amount)} from ${submission.memberName}?`)) {
            return;
        }
        
        App.showLoading('Processing...', 'Approving payment');
        
        try {
            // Update submission status
            await db.collection('submissions').doc(submissionId).update({
                status: 'verified',
                verifiedBy: currentAdmin?.roleName || 'Admin',
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update member's total saved
            if (submission.memberId) {
                const memberRef = db.collection('members').doc(submission.memberId);
                await memberRef.update({
                    totalSaved: firebase.firestore.FieldValue.increment(submission.amount || 0),
                    lastPaymentDate: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            App.hideLoading();
            App.showToast('Payment approved!', 'success');
            
            // Refresh data
            await loadPendingSubmissions();
            await loadStats();
            
        } catch (error) {
            console.error('Approve error:', error);
            App.hideLoading();
            App.showToast('Failed to approve', 'error');
        }
    }

    async function rejectSubmission(submissionId) {
        const submission = pendingSubmissions.find(s => s.id === submissionId);
        if (!submission) return;
        
        const reason = prompt('Reason for rejection (optional):');
        
        if (!confirm(`Reject submission from ${submission.memberName}?`)) {
            return;
        }
        
        App.showLoading('Processing...', 'Rejecting submission');
        
        try {
            await db.collection('submissions').doc(submissionId).update({
                status: 'rejected',
                rejectedBy: currentAdmin?.roleName || 'Admin',
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectionReason: reason || 'Rejected by admin'
            });
            
            App.hideLoading();
            App.showToast('Submission rejected', 'info');
            
            // Refresh
            await loadPendingSubmissions();
            
        } catch (error) {
            console.error('Reject error:', error);
            App.hideLoading();
            App.showToast('Failed to reject', 'error');
        }
    }

    // ==========================================
    // CHARTS
    // ==========================================

    function updateSavingsChart(savings, fines) {
        const chartContainer = document.getElementById('savingsChart');
        if (!chartContainer) return;
        
        // Simple donut chart using CSS
        const total = savings + fines;
        const savingsPercent = total > 0 ? (savings / total) * 100 : 0;
        
        chartContainer.innerHTML = `
            <div class="donut-chart" style="--percent: ${savingsPercent}">
                <div class="donut-hole">
                    <span class="donut-value">${Utils.formatCurrency(total)}</span>
                    <span class="donut-label">Total</span>
                </div>
            </div>
            <div class="chart-legend">
                <div class="legend-item">
                    <span class="legend-color savings"></span>
                    <span>Savings (${savingsPercent.toFixed(0)}%)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color fines"></span>
                    <span>Fines (${(100 - savingsPercent).toFixed(0)}%)</span>
                </div>
            </div>
        `;
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    function formatTimeAgo(timestamp) {
        if (!timestamp) return 'Unknown';
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        
        return Utils.formatDate(date);
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        init,
        viewPOP,
        approveSubmission,
        rejectSubmission,
        loadPendingSubmissions,
        closePOPViewer
    };
})();

// Export for global use
window.Admin = Admin;