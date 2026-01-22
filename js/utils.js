/**
 * =====================================================
 * TSHIKOTA RO FARANA - UTILITY FUNCTIONS (UPDATED)
 * =====================================================
 * 
 * Common utility functions used across the application.
 * 
 * SOUTH AFRICAN SPECIFIC:
 * - Currency formatting in ZAR (Rands)
 * - SA phone number validation (10 digits)
 * - SA ID number validation (Luhn algorithm)
 * - SA date formats
 * - SA banking standards
 * 
 * =====================================================
 */

const Utils = {
    /**
     * ==========================================
     * CURRENCY FORMATTING (SOUTH AFRICAN RAND)
     * ==========================================
     */

    /**
     * Format amount as South African Rand
     * 
     * @param {number} amount - Amount to format
     * @param {boolean} showCents - Whether to show cents (default: false for whole amounts)
     * @returns {string} Formatted amount (e.g., "R 1,234.00" or "R 1 234")
     */
    formatCurrency(amount, showCents = false) {
        if (amount === null || amount === undefined || isNaN(amount)) {
            return 'R 0';
        }

        // South African locale uses space as thousand separator
        const formatter = new Intl.NumberFormat('en-ZA', {
            style: 'currency',
            currency: 'ZAR',
            minimumFractionDigits: showCents ? 2 : 0,
            maximumFractionDigits: showCents ? 2 : 0
        });

        return formatter.format(amount);
    },

    /**
     * Format amount as compact currency (for large amounts)
     * e.g., R 1.2M, R 500K
     * 
     * @param {number} amount - Amount to format
     * @returns {string} Compact formatted amount
     */
    formatCurrencyCompact(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) {
            return 'R 0';
        }

        if (amount >= 1000000) {
            return `R ${(amount / 1000000).toFixed(1)}M`;
        } else if (amount >= 1000) {
            return `R ${(amount / 1000).toFixed(0)}K`;
        }

        return this.formatCurrency(amount);
    },

    /**
     * Parse currency string to number
     * Handles "R 1,234.56", "R1234", "1234", etc.
     * 
     * @param {string} str - Currency string
     * @returns {number} Parsed amount
     */
    parseCurrency(str) {
        if (typeof str === 'number') return str;
        if (!str) return 0;
        
        // Remove currency symbol, spaces, and non-numeric except decimal
        const cleaned = str.replace(/[R\s,]/gi, '');
        return parseFloat(cleaned) || 0;
    },

    /**
     * ==========================================
     * SOUTH AFRICAN PHONE NUMBER UTILITIES
     * ==========================================
     */

    /**
     * Validate South African phone number
     * SA mobile numbers: 10 digits starting with 0 (06, 07, 08)
     * 
     * @param {string} phone - Phone number to validate
     * @returns {boolean} Whether phone is valid
     */
    isValidPhone(phone) {
        if (!phone) return false;
        
        // Remove all non-digits
        const digits = phone.replace(/\D/g, '');
        
        // Must be exactly 10 digits
        if (digits.length !== 10) return false;
        
        // Must start with 0 followed by 6, 7, or 8 (SA mobile prefixes)
        return /^0[678]\d{8}$/.test(digits);
    },

    /**
     * Format phone number for display
     * Input: 0821234567 → Output: 082 123 4567
     * 
     * @param {string} phone - Phone number to format
     * @returns {string} Formatted phone number
     */
    formatPhone(phone) {
        if (!phone) return '';
        
        const digits = phone.replace(/\D/g, '');
        
        if (digits.length === 10) {
            return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
        }
        
        return phone;
    },

    /**
     * Normalize phone number (remove formatting)
     * 
     * @param {string} phone - Phone number
     * @returns {string} Normalized phone (digits only)
     */
    normalizePhone(phone) {
        if (!phone) return '';
        return phone.replace(/\D/g, '');
    },

    /**
     * Convert to international format (+27)
     * 
     * @param {string} phone - SA phone number
     * @returns {string} International format (+27XXXXXXXXX)
     */
    toInternationalPhone(phone) {
        const digits = this.normalizePhone(phone);
        
        if (digits.startsWith('0') && digits.length === 10) {
            return '+27' + digits.substring(1);
        }
        
        if (digits.startsWith('27') && digits.length === 11) {
            return '+' + digits;
        }
        
        return phone;
    },

    /**
     * ==========================================
     * SOUTH AFRICAN ID NUMBER VALIDATION
     * ==========================================
     */

    /**
     * Validate South African ID number
     * Uses Luhn algorithm for checksum validation
     * 
     * Format: YYMMDD SSSS C A Z
     * - YYMMDD: Date of birth
     * - SSSS: Sequence number (gender: 0000-4999 female, 5000-9999 male)
     * - C: Citizenship (0 = SA citizen, 1 = permanent resident)
     * - A: Usually 8 (deprecated)
     * - Z: Checksum digit
     * 
     * @param {string} idNumber - 13-digit SA ID number
     * @returns {{valid: boolean, details?: object, error?: string}} Validation result
     */
    validateSAId(idNumber) {
        if (!idNumber) {
            return { valid: false, error: 'ID number is required' };
        }

        // Remove any spaces or dashes
        const id = idNumber.replace(/[\s-]/g, '');

        // Must be exactly 13 digits
        if (!/^\d{13}$/.test(id)) {
            return { valid: false, error: 'ID number must be 13 digits' };
        }

        // Extract and validate date components
        const year = parseInt(id.substring(0, 2));
        const month = parseInt(id.substring(2, 4));
        const day = parseInt(id.substring(4, 6));

        // Validate month (01-12)
        if (month < 1 || month > 12) {
            return { valid: false, error: 'Invalid month in ID number' };
        }

        // Validate day (01-31, basic check)
        if (day < 1 || day > 31) {
            return { valid: false, error: 'Invalid day in ID number' };
        }

        // Luhn algorithm checksum
        let sum = 0;
        for (let i = 0; i < 13; i++) {
            let digit = parseInt(id[i]);
            if (i % 2 === 1) { // Odd positions (0-indexed: 1, 3, 5, 7, 9, 11)
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
        }

        if (sum % 10 !== 0) {
            return { valid: false, error: 'Invalid ID number checksum' };
        }

        // Extract additional details
        const fullYear = year > 30 ? 1900 + year : 2000 + year; // Assume < 30 is 2000s
        const sequence = parseInt(id.substring(6, 10));
        const gender = sequence >= 5000 ? 'Male' : 'Female';
        const citizen = id[10] === '0';

        return {
            valid: true,
            details: {
                dateOfBirth: `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
                gender: gender,
                isCitizen: citizen,
                age: this.calculateAge(`${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`)
            }
        };
    },

    /**
     * ==========================================
     * DATE & TIME UTILITIES
     * ==========================================
     */

    /**
     * Format date for display
     * 
     * @param {Date|string|object} date - Date to format (accepts Firestore Timestamp)
     * @param {string} format - Format type: 'short', 'medium', 'long', 'relative', 'time'
     * @returns {string} Formatted date
     */
    formatDate(date, format = 'medium') {
        if (!date) return '';
        
        // Handle Firestore Timestamp
        if (date?.toDate) {
            date = date.toDate();
        }
        
        // Handle string dates
        if (typeof date === 'string') {
            date = new Date(date);
        }
        
        if (!(date instanceof Date) || isNaN(date)) {
            return '';
        }

        // South African locale
        const locale = 'en-ZA';

        switch (format) {
            case 'short':
                // 15/01/2024
                return date.toLocaleDateString(locale, {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
            
            case 'medium':
                // 15 Jan 2024
                return date.toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
            
            case 'long':
                // 15 January 2024
                return date.toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
            
            case 'relative':
                return this.getRelativeTime(date);
            
            case 'time':
                // 14:30
                return date.toLocaleTimeString(locale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            
            case 'datetime':
                // 15 Jan 2024, 14:30
                return date.toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            
            default:
                return date.toLocaleDateString(locale);
        }
    },

    /**
     * Get relative time string (e.g., "2 hours ago", "Yesterday")
     * 
     * @param {Date} date - Date to compare
     * @returns {string} Relative time string
     */
    getRelativeTime(date) {
        if (!date) return '';
        
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffSecs < 60) {
            return 'Just now';
        } else if (diffMins < 60) {
            return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else {
            return this.formatDate(date, 'medium');
        }
    },

    /**
     * Calculate age from date of birth
     * 
     * @param {string|Date} dateOfBirth - DOB in YYYY-MM-DD or Date
     * @returns {number} Age in years
     */
    calculateAge(dateOfBirth) {
        const dob = new Date(dateOfBirth);
        const today = new Date();
        
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        
        return age;
    },

    /**
     * Check if payment is late (after 7th of the month)
     * SA Stokvel standard: payments due by 7th
     * 
     * @param {Date} paymentDate - Date of payment
     * @returns {boolean} Whether payment is late
     */
    isPaymentLate(paymentDate) {
        if (!paymentDate) return false;
        
        const date = new Date(paymentDate);
        const lateDay = APP_SETTINGS?.lateDayOfMonth || 7;
        
        return date.getDate() > lateDay;
    },

    /**
     * Get month name from number
     * 
     * @param {number} month - Month number (1-12)
     * @returns {string} Month name
     */
    getMonthName(month) {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[month - 1] || '';
    },

    /**
     * Get current payment month string
     * 
     * @returns {string} Current month (e.g., "January 2024")
     */
    getCurrentPaymentMonth() {
        const now = new Date();
        return `${this.getMonthName(now.getMonth() + 1)} ${now.getFullYear()}`;
    },

    /**
     * Generate month options for dropdown
     * 
     * @param {number} count - Number of months to generate
     * @param {boolean} includePast - Include past months
     * @returns {Array} Array of {value, label} objects
     */
    generateMonthOptions(count = 12, includePast = true) {
        const options = [];
        const now = new Date();
        
        for (let i = includePast ? -6 : 0; i < count; i++) {
            const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const value = `${this.getMonthName(date.getMonth() + 1)} ${date.getFullYear()}`;
            
            options.push({
                value: value,
                label: value,
                date: date
            });
        }
        
        return options;
    },

    /**
     * ==========================================
     * STRING UTILITIES
     * ==========================================
     */

    /**
     * Get initials from name
     * 
     * @param {string} name - Full name
     * @returns {string} Initials (max 2 characters)
     */
    getInitials(name) {
        if (!name) return '??';
        
        const words = name.trim().split(/\s+/);
        if (words.length === 1) {
            return words[0].substring(0, 2).toUpperCase();
        }
        
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    },

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
     * Truncate text with ellipsis
     * 
     * @param {string} str - String to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated string
     */
    truncate(str, maxLength = 50) {
        if (!str || str.length <= maxLength) return str || '';
        return str.substring(0, maxLength - 3) + '...';
    },

    /**
     * Capitalize first letter of each word
     * 
     * @param {string} str - String to capitalize
     * @returns {string} Capitalized string
     */
    titleCase(str) {
        if (!str) return '';
        return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
    },

    /**
     * ==========================================
     * VALIDATION UTILITIES
     * ==========================================
     */

    /**
     * Validate email address
     * 
     * @param {string} email - Email to validate
     * @returns {boolean} Whether email is valid
     */
    isValidEmail(email) {
        if (!email) return false;
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    /**
     * Check if user qualifies for interest
     * SA Stokvel: R10,000 minimum savings
     * 
     * @param {number} totalSavings - Member's total savings
     * @returns {boolean} Whether member qualifies
     */
    qualifiesForInterest(totalSavings) {
        const threshold = APP_SETTINGS?.interestEligibilityMin || 10000;
        return (totalSavings || 0) >= threshold;
    },

    /**
     * ==========================================
     * REFERENCE CODE GENERATION
     * ==========================================
     */

    /**
     * Generate unique reference code
     * Format: TRF-XXXXXX (6 alphanumeric characters)
     * 
     * @returns {string} Reference code
     */
    generateReference() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded similar chars (0, O, I, 1)
        let result = 'TRF-';
        
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return result;
    },

    /**
     * ==========================================
     * FILE UTILITIES
     * ==========================================
     */

    /**
     * Format file size for display
     * 
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * ==========================================
     * UI UTILITIES
     * ==========================================
     */

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
            button.classList.add('loading');
            if (textEl) textEl.style.display = 'none';
            if (loadingEl) loadingEl.style.display = 'inline-flex';
        } else {
            button.disabled = false;
            button.classList.remove('loading');
            if (textEl) textEl.style.display = 'inline';
            if (loadingEl) loadingEl.style.display = 'none';
        }
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
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        } catch (error) {
            console.error('Copy to clipboard failed:', error);
            return false;
        }
    },

    /**
     * Debounce function calls
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
     * Throttle function calls
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
     * ==========================================
     * LOCAL STORAGE UTILITIES
     * ==========================================
     */

    storage: {
        /**
         * Get item from localStorage (with JSON parse)
         * @param {string} key - Storage key
         * @returns {any} Parsed value or null
         */
        get(key) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            } catch (error) {
                console.warn('Storage get error:', error);
                return null;
            }
        },

        /**
         * Set item in localStorage (with JSON stringify)
         * @param {string} key - Storage key
         * @param {any} value - Value to store
         */
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.warn('Storage set error:', error);
            }
        },

        /**
         * Remove item from localStorage
         * @param {string} key - Storage key
         */
        remove(key) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.warn('Storage remove error:', error);
            }
        },

        /**
         * Clear all app storage
         */
        clear() {
            try {
                localStorage.clear();
            } catch (error) {
                console.warn('Storage clear error:', error);
            }
        }
    },

    /**
     * ==========================================
     * MATH UTILITIES (A-LEVEL ACCURACY)
     * ==========================================
     */

    /**
     * Calculate percentage
     * 
     * @param {number} value - Current value
     * @param {number} total - Total value
     * @param {number} decimals - Decimal places
     * @returns {number} Percentage
     */
    calculatePercentage(value, total, decimals = 1) {
        if (!total || total === 0) return 0;
        const percentage = (value / total) * 100;
        return Number(percentage.toFixed(decimals));
    },

    /**
     * Calculate monthly interest (simple interest)
     * SA prime rate reference: ~11.75% (as of 2024)
     * 
     * @param {number} principal - Principal amount
     * @param {number} annualRate - Annual interest rate (decimal, e.g., 0.05 for 5%)
     * @param {number} months - Number of months
     * @returns {number} Interest earned
     */
    calculateSimpleInterest(principal, annualRate, months) {
        return principal * annualRate * (months / 12);
    },

    /**
     * Calculate compound interest
     * 
     * @param {number} principal - Principal amount
     * @param {number} annualRate - Annual interest rate (decimal)
     * @param {number} years - Number of years
     * @param {number} compoundingFreq - Times compounded per year (default: 12 for monthly)
     * @returns {number} Final amount (principal + interest)
     */
    calculateCompoundInterest(principal, annualRate, years, compoundingFreq = 12) {
        return principal * Math.pow(1 + annualRate / compoundingFreq, compoundingFreq * years);
    },

    /**
     * Round to specific decimal places
     * 
     * @param {number} value - Value to round
     * @param {number} decimals - Decimal places
     * @returns {number} Rounded value
     */
    round(value, decimals = 2) {
        return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
    }
};

// Export for use
window.Utils = Utils;
