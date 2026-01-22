/**
 * =====================================================
 * TSHIKOTA RO FARANA - CORE APP MODULE
 * =====================================================
 * 
 * Core application functionality shared across all pages:
 * - Toast notifications
 * - Modal management
 * - Loading states
 * - Global utilities
 * 
 * =====================================================
 */

const App = {
    /**
     * Initialize the app
     */
    init() {
        console.log('🚀 Tshikota Ro Farana App Initialized');
        
        // Initialize auth if not already done
        this.initAuth();
        
        // Set up global error handling
        this.setupErrorHandling();
        
        // Initialize toast container if not present
        this.initToastContainer();
    },

    /**
     * Initialize Firebase Auth
     */
    async initAuth() {
        try {
            if (typeof Auth !== 'undefined' && !Auth.currentUser) {
                await Auth.signInAnonymously();
            }
        } catch (error) {
            console.warn('Auth init:', error.message);
        }
    },

    /**
     * Set up global error handling
     */
    setupErrorHandling() {
        window.onerror = (message, source, lineno, colno, error) => {
            console.error('Global error:', message, source, lineno);
            // Don't show toast for every error to avoid spam
        };

        window.onunhandledrejection = (event) => {
            console.error('Unhandled promise rejection:', event.reason);
        };
    },

    /**
     * Initialize toast container
     */
    initToastContainer() {
        if (!document.getElementById('toastContainer')) {
            const container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    },

    /**
     * ==========================================
     * TOAST NOTIFICATIONS
     * ==========================================
     */

    /**
     * Show toast notification
     * 
     * @param {string} message - Message to display
     * @param {string} type - Toast type: 'success', 'error', 'warning', 'info'
     * @param {number} duration - Duration in ms (default 3000)
     */
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        if (!container) {
            console.warn('Toast container not found');
            alert(message);
            return;
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        // Icon based on type
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * ==========================================
     * MODAL MANAGEMENT
     * ==========================================
     */

    /**
     * Open a modal
     * 
     * @param {string} modalId - Modal element ID
     */
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // Focus first input if present
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    },

    /**
     * Close a modal
     * 
     * @param {string} modalId - Modal element ID
     */
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    },

    /**
     * Show confirmation modal
     * 
     * @param {object} options - Modal options
     * @returns {Promise<boolean>} User's choice
     */
    showConfirmModal(options = {}) {
        return new Promise((resolve) => {
            const {
                title = 'Confirm',
                message = 'Are you sure?',
                confirmText = 'Confirm',
                cancelText = 'Cancel',
                type = 'warning' // 'success', 'warning', 'error'
            } = options;

            // Create modal if doesn't exist
            let modal = document.getElementById('confirmModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'confirmModal';
                modal.className = 'modal';
                modal.innerHTML = `
                    <div class="modal-backdrop"></div>
                    <div class="modal-container">
                        <div class="modal-content">
                            <h2 class="modal-title" id="confirmTitle"></h2>
                            <p class="modal-message" id="confirmMessage"></p>
                            <div class="modal-actions">
                                <button class="btn btn-ghost" id="confirmCancelBtn"></button>
                                <button class="btn" id="confirmOkBtn"></button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            // Update content
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            document.getElementById('confirmCancelBtn').textContent = cancelText;
            
            const okBtn = document.getElementById('confirmOkBtn');
            okBtn.textContent = confirmText;
            okBtn.className = `btn btn-${type === 'success' ? 'primary' : type === 'error' ? 'error' : 'warning'}`;

            // Event handlers
            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                this.closeModal('confirmModal');
                okBtn.removeEventListener('click', handleConfirm);
                document.getElementById('confirmCancelBtn').removeEventListener('click', handleCancel);
                modal.querySelector('.modal-backdrop').removeEventListener('click', handleCancel);
            };

            okBtn.addEventListener('click', handleConfirm);
            document.getElementById('confirmCancelBtn').addEventListener('click', handleCancel);
            modal.querySelector('.modal-backdrop').addEventListener('click', handleCancel);

            this.openModal('confirmModal');
        });
    },

    /**
     * ==========================================
     * LOADING STATES
     * ==========================================
     */

    /**
     * Show page loading overlay
     * 
     * @param {string} message - Loading message
     */
    showLoading(message = 'Loading...') {
        let loader = document.getElementById('pageLoader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'pageLoader';
            loader.className = 'page-loader';
            loader.innerHTML = `
                <div class="loader-content">
                    <div class="spinner-large"></div>
                    <p class="loader-message">${this.escapeHtml(message)}</p>
                </div>
            `;
            document.body.appendChild(loader);
        } else {
            loader.querySelector('.loader-message').textContent = message;
        }
        loader.classList.add('active');
    },

    /**
     * Hide page loading overlay
     */
    hideLoading() {
        const loader = document.getElementById('pageLoader');
        if (loader) {
            loader.classList.remove('active');
        }
    },

    /**
     * Set button loading state
     * 
     * @param {HTMLElement} button - Button element
     * @param {boolean} loading - Loading state
     */
    setButtonLoading(button, loading) {
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
    },

    /**
     * ==========================================
     * UTILITIES
     * ==========================================
     */

    /**
     * Escape HTML to prevent XSS
     * 
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Copy text to clipboard
     * 
     * @param {string} text - Text to copy
     * @returns {Promise<boolean>} Success status
     */
    async copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
            
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        } catch (error) {
            console.error('Copy failed:', error);
            return false;
        }
    },

    /**
     * Debounce function
     * 
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait = 300) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle function
     * 
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function} Throttled function
     */
    throttle(func, limit = 300) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Format date for display
     * 
     * @param {Date|string} date - Date to format
     * @param {string} format - Format type
     * @returns {string} Formatted date
     */
    formatDate(date, format = 'medium') {
        if (typeof Utils !== 'undefined' && Utils.formatDate) {
            return Utils.formatDate(date, format);
        }
        return new Date(date).toLocaleDateString('en-ZA');
    },

    /**
     * Format currency (ZAR)
     * 
     * @param {number} amount - Amount to format
     * @returns {string} Formatted amount
     */
    formatCurrency(amount) {
        if (typeof Utils !== 'undefined' && Utils.formatCurrency) {
            return Utils.formatCurrency(amount);
        }
        return new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR'
        }).format(amount);
    }
};

// Auto-initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Only init if not already initialized by page-specific script
    if (!window.appInitialized) {
        App.init();
        window.appInitialized = true;
    }
});

// Export for use
window.App = App;
