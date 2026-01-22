/**
 * =====================================================
 * TSHIKOTA RO FARANA - SMS SERVICE (SMSPortal Integration)
 * =====================================================
 * 
 * SMS notification service using SMSPortal REST API.
 * South African SMS provider with reliable delivery.
 * 
 * API DOCUMENTATION: https://docs.smsportal.com/docs/rest
 * 
 * FEATURES:
 * - Send SMS notifications via SMSPortal REST API
 * - SA phone number formatting (+27 / 27 format)
 * - Pre-defined message templates for stokvel operations
 * - OTP generation and verification for password reset
 * - SMS audit logging to Firestore
 * - Test mode support (no credits deducted)
 * 
 * AUTHENTICATION:
 * - Basic HTTP Authentication with Base64 encoded credentials
 * - Format: Base64(ClientID:APISecret)
 * 
 * PRICING (approx): R0.25-R0.35 per SMS (South Africa)
 * 
 * =====================================================
 */

const SMS = {
    /**
     * ==========================================
     * CONFIGURATION
     * ==========================================
     * 
     * SMSPortal API credentials and settings.
     * Get your credentials from: https://cp.smsportal.com
     */
    config: {
        // SMSPortal API credentials
        // ⚠️ SECURITY NOTE: In production, consider using Firebase Cloud Functions
        //    to keep credentials server-side. For client-side usage, ensure your
        //    domain is whitelisted in SMSPortal settings.
        clientId: '784d7c57-4f62-41f1-85bc-369301895b95',
        apiSecret: '7bcf0228-0089-4ae8-b589-55535247d342',
        
        // API endpoints
        baseUrl: 'https://rest.smsportal.com',
        version: 'v1',
        
        // Settings
        testMode: false,  // Set to true to test without sending real SMS (no credits deducted)
        logToFirestore: true,  // Log all SMS to Firestore for audit trail
        
        // Sender ID (optional - will use default if not registered)
        senderId: 'TshikotaRF',
        
        // South African country code
        countryCode: '27'
    },

    /**
     * ==========================================
     * MESSAGE TEMPLATES (Under 160 chars for single SMS billing)
     * ==========================================
     * 
     * Pre-defined SMS templates for stokvel operations.
     * All messages kept under 160 characters for single SMS billing.
     */
    templates: {
        // Registration confirmation (158 chars max)
        registration: (name, memberRef) => 
            `Welcome to Tshikota Ro Farana, ${name}! Ref: ${memberRef}. Min R300/month by the 7th. Keep saving! - Tshikota RF`,
        
        // POP submission confirmation (156 chars max)
        popSubmitted: (name, amount, month, reference) => 
            `Hi ${name}, R${amount} POP for ${month} received (${reference}). Pending admin approval. - Tshikota RF`,
        
        // Payment approved notification (155 chars max)
        paymentApproved: (name, amount, month, totalSaved) => 
            `Great news ${name}! R${amount} for ${month} approved. Total saved: R${totalSaved}. Keep it up! - Tshikota RF`,
        
        // Payment rejected notification (158 chars max)
        paymentRejected: (name, amount, month, reason) => 
            `Hi ${name}, R${amount} POP for ${month} declined: ${reason}. Please resubmit. - Tshikota RF`,
        
        // Late payment reminder (150 chars max)
        lateReminder: (name, month) => 
            `Reminder ${name}: ${month} payment is late. R50 fine applies after 7th. Pay now! - Tshikota RF`,
        
        // Password reset OTP (120 chars max)
        passwordReset: (otp) => 
            `Your Tshikota Ro Farana reset code: ${otp}. Valid for 10 mins. Do not share. - Tshikota RF`,
        
        // Interest eligibility notification (140 chars max)
        interestEligible: (name, totalSaved) => 
            `Congrats ${name}! R${totalSaved} saved - you qualify for interest share! - Tshikota RF`,
        
        // Month-end reminder (145 chars max)
        monthEndReminder: (name, nextMonth) => 
            `Hi ${name}, ${nextMonth} contribution due by 7th. Min R300. Avoid R50 late fee! - Tshikota RF`,
        
        // Custom message (admin use)
        custom: (message) => message
    },

    /**
     * ==========================================
     * CORE SMS FUNCTIONS
     * ==========================================
     */

    /**
     * Send SMS via SMSPortal REST API
     * 
     * @param {string} phoneNumber - Recipient phone number (SA format)
     * @param {string} message - Message content (max 160 chars for single SMS)
     * @param {object} options - Additional options (testMode, etc.)
     * @returns {Promise<object>} API response with success status
     */
    async sendSMS(phoneNumber, message, options = {}) {
        try {
            // Validate inputs
            if (!phoneNumber || !message) {
                throw new Error('Phone number and message are required');
            }

            // Format phone number for SA (E.164 format: 27XXXXXXXXX)
            const formattedPhone = this.formatPhoneNumber(phoneNumber);
            
            if (!formattedPhone) {
                throw new Error('Invalid phone number format');
            }

            // Warn if message too long (will be billed as multiple SMS)
            if (message.length > 160) {
                console.warn(`⚠️ SMS message is ${message.length} chars. May be billed as multiple SMS.`);
            }

            console.log(`📱 Sending SMS to ${formattedPhone}...`);
            console.log(`   Message (${message.length} chars): "${message.substring(0, 50)}..."`);

            // Build request payload
            const payload = {
                messages: [{
                    destination: formattedPhone,
                    content: message
                }]
            };

            // Add test mode if configured
            if (this.config.testMode || options.testMode) {
                payload.testMode = true;
                console.log('🧪 TEST MODE - No real SMS will be sent, no credits deducted');
            }

            // Build API URL
            const apiUrl = `${this.config.baseUrl}/${this.config.version}/bulkmessages`;

            // Create Basic Auth header (Base64 encoded ClientID:APISecret)
            const credentials = `${this.config.clientId}:${this.config.apiSecret}`;
            const base64Credentials = btoa(credentials);

            // Make API request
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${base64Credentials}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            // Parse response
            const responseData = await response.json();

            // Check for success
            if (response.ok) {
                console.log('✅ SMS sent successfully!');
                console.log(`   Event ID: ${responseData.eventId}`);
                console.log(`   Cost: ${responseData.cost} credit(s)`);
                console.log(`   Remaining Balance: ${responseData.remainingBalance}`);

                // Log to Firestore for audit trail
                if (this.config.logToFirestore) {
                    await this.logSMS({
                        phone: formattedPhone,
                        message: message,
                        status: 'sent',
                        eventId: responseData.eventId,
                        cost: responseData.cost,
                        remainingBalance: responseData.remainingBalance,
                        testMode: payload.testMode || false
                    });
                }

                return {
                    success: true,
                    eventId: responseData.eventId,
                    cost: responseData.cost,
                    remainingBalance: responseData.remainingBalance,
                    message: 'SMS sent successfully'
                };
            } else {
                // API returned error
                console.error('❌ SMS API error:', responseData);

                // Log failed attempt
                if (this.config.logToFirestore) {
                    await this.logSMS({
                        phone: formattedPhone,
                        message: message.substring(0, 100),
                        status: 'failed',
                        error: responseData.errorMessage || response.statusText,
                        errorCode: responseData.errorCode
                    });
                }

                return {
                    success: false,
                    error: responseData.errorMessage || 'SMS sending failed',
                    errorCode: responseData.errorCode
                };
            }

        } catch (error) {
            console.error('❌ SMS send error:', error.message);

            // Log error to Firestore
            if (this.config.logToFirestore) {
                try {
                    await this.logSMS({
                        phone: phoneNumber,
                        message: message?.substring(0, 50) + '...',
                        status: 'error',
                        error: error.message
                    });
                } catch (logError) {
                    console.warn('Could not log SMS error:', logError.message);
                }
            }

            return {
                success: false,
                error: error.message || 'Failed to send SMS'
            };
        }
    },

    /**
     * Send bulk SMS to multiple recipients (up to 500 per batch)
     * 
     * @param {Array} recipients - Array of {phone, message} objects
     * @param {object} options - Additional options
     * @returns {Promise<object>} API response with batch results
     */
    async sendBulkSMS(recipients, options = {}) {
        try {
            if (!Array.isArray(recipients) || recipients.length === 0) {
                throw new Error('Recipients array is required');
            }

            // SMSPortal allows up to 500 messages per batch
            if (recipients.length > 500) {
                throw new Error('Maximum 500 messages per batch. Split into multiple requests.');
            }

            console.log(`📱 Sending bulk SMS to ${recipients.length} recipients...`);

            // Format all phone numbers and filter invalid ones
            const messages = recipients
                .map(r => ({
                    destination: this.formatPhoneNumber(r.phone),
                    content: r.message
                }))
                .filter(m => m.destination !== null);

            if (messages.length === 0) {
                throw new Error('No valid phone numbers in recipients');
            }

            if (messages.length !== recipients.length) {
                console.warn(`⚠️ ${recipients.length - messages.length} invalid numbers filtered out`);
            }

            // Build payload
            const payload = { messages };

            if (this.config.testMode || options.testMode) {
                payload.testMode = true;
                console.log('🧪 TEST MODE - No real SMS will be sent');
            }

            // Make API request
            const apiUrl = `${this.config.baseUrl}/${this.config.version}/bulkmessages`;
            const credentials = `${this.config.clientId}:${this.config.apiSecret}`;
            const base64Credentials = btoa(credentials);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${base64Credentials}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const responseData = await response.json();

            if (response.ok) {
                console.log('✅ Bulk SMS sent successfully!');
                console.log(`   Messages sent: ${messages.length}`);
                console.log(`   Total cost: ${responseData.cost} credit(s)`);

                return {
                    success: true,
                    eventId: responseData.eventId,
                    cost: responseData.cost,
                    remainingBalance: responseData.remainingBalance,
                    messagesSent: messages.length
                };
            } else {
                console.error('❌ Bulk SMS error:', responseData);
                return {
                    success: false,
                    error: responseData.errorMessage || 'Bulk SMS failed'
                };
            }

        } catch (error) {
            console.error('❌ Bulk SMS error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Check SMS credit balance from SMSPortal
     * 
     * @returns {Promise<object>} Balance information
     */
    async getBalance() {
        try {
            const apiUrl = `${this.config.baseUrl}/${this.config.version}/balance`;
            const credentials = `${this.config.clientId}:${this.config.apiSecret}`;
            const base64Credentials = btoa(credentials);

            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Basic ${base64Credentials}`,
                    'Accept': 'application/json'
                }
            });

            const data = await response.json();

            if (response.ok) {
                console.log('💰 SMS Balance:', data.balance);
                return {
                    success: true,
                    balance: data.balance,
                    currency: 'ZAR'
                };
            } else {
                return {
                    success: false,
                    error: data.errorMessage || 'Failed to get balance'
                };
            }

        } catch (error) {
            console.error('Balance check error:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * ==========================================
     * PHONE NUMBER UTILITIES
     * ==========================================
     */

    /**
     * Format phone number for SMSPortal (E.164 format for SA)
     * Converts various SA formats to 27XXXXXXXXX
     * 
     * Examples:
     *   0821234567   -> 27821234567
     *   +27821234567 -> 27821234567
     *   27821234567  -> 27821234567
     *   821234567    -> 27821234567
     * 
     * @param {string} phone - Phone number in any SA format
     * @returns {string|null} Formatted number (27XXXXXXXXX) or null if invalid
     */
    formatPhoneNumber(phone) {
        if (!phone) return null;

        // Remove all non-digits
        let cleaned = phone.toString().replace(/\D/g, '');

        // Handle various formats
        if (cleaned.startsWith('27') && cleaned.length === 11) {
            // Already in 27XXXXXXXXX format
            return cleaned;
        } else if (cleaned.startsWith('0') && cleaned.length === 10) {
            // SA local format: 0XXXXXXXXX -> 27XXXXXXXXX
            return '27' + cleaned.substring(1);
        } else if (cleaned.length === 9 && !cleaned.startsWith('0')) {
            // Missing leading 0: XXXXXXXXX -> 27XXXXXXXXX
            return '27' + cleaned;
        }

        // Invalid format
        console.warn('⚠️ Invalid phone number format:', phone);
        return null;
    },

    /**
     * Validate South African phone number
     * 
     * @param {string} phone - Phone number to validate
     * @returns {boolean} Whether phone is valid SA number
     */
    isValidSAPhone(phone) {
        const formatted = this.formatPhoneNumber(phone);
        return formatted !== null && /^27[0-9]{9}$/.test(formatted);
    },

    /**
     * Format phone for display (0XX XXX XXXX)
     * 
     * @param {string} phone - Phone in any format
     * @returns {string} Formatted for display
     */
    formatForDisplay(phone) {
        const cleaned = phone.toString().replace(/\D/g, '');
        
        // Convert to local format
        let local = cleaned;
        if (cleaned.startsWith('27')) {
            local = '0' + cleaned.substring(2);
        } else if (!cleaned.startsWith('0')) {
            local = '0' + cleaned;
        }
        
        // Format: 0XX XXX XXXX
        if (local.length === 10) {
            return `${local.substring(0, 3)} ${local.substring(3, 6)} ${local.substring(6)}`;
        }
        
        return phone;
    },

    /**
     * ==========================================
     * TEMPLATE-BASED SENDING FUNCTIONS
     * ==========================================
     * 
     * Convenience methods for common SMS notifications.
     * All use pre-defined templates to ensure consistent messaging.
     */

    /**
     * Send registration confirmation SMS
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member first name
     * @param {string} memberRef - Member reference code (e.g., TRF-M1234)
     * @returns {Promise<object>} Send result
     */
    async sendRegistrationConfirmation(phone, name, memberRef) {
        const message = this.templates.registration(name, memberRef);
        console.log(`📱 Sending registration SMS to ${name}...`);
        return await this.sendSMS(phone, message);
    },

    /**
     * Send POP submission confirmation
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member name
     * @param {number} amount - Payment amount in Rands
     * @param {string} month - Payment month (e.g., "January 2024")
     * @param {string} reference - Submission reference (e.g., TRF-12345)
     * @returns {Promise<object>} Send result
     */
    async sendPOPConfirmation(phone, name, amount, month, reference) {
        const message = this.templates.popSubmitted(name, amount, month, reference);
        console.log(`📱 Sending POP confirmation to ${name}...`);
        return await this.sendSMS(phone, message);
    },

    /**
     * Send payment approval notification
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member name
     * @param {number} amount - Approved amount in Rands
     * @param {string} month - Payment month
     * @param {number} totalSaved - Member's total savings after approval
     * @returns {Promise<object>} Send result
     */
    async sendApprovalNotification(phone, name, amount, month, totalSaved) {
        const message = this.templates.paymentApproved(name, amount, month, totalSaved);
        console.log(`📱 Sending approval SMS to ${name}...`);
        return await this.sendSMS(phone, message);
    },

    /**
     * Send payment rejection notification
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member name
     * @param {number} amount - Rejected amount
     * @param {string} month - Payment month
     * @param {string} reason - Rejection reason (keep short!)
     * @returns {Promise<object>} Send result
     */
    async sendRejectionNotification(phone, name, amount, month, reason) {
        // Truncate reason if too long
        const shortReason = reason.length > 40 ? reason.substring(0, 37) + '...' : reason;
        const message = this.templates.paymentRejected(name, amount, month, shortReason);
        console.log(`📱 Sending rejection SMS to ${name}...`);
        return await this.sendSMS(phone, message);
    },

    /**
     * Send late payment reminder
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member name
     * @param {string} month - Payment month
     * @returns {Promise<object>} Send result
     */
    async sendLateReminder(phone, name, month) {
        const message = this.templates.lateReminder(name, month);
        console.log(`📱 Sending late reminder to ${name}...`);
        return await this.sendSMS(phone, message);
    },

    /**
     * Send interest eligibility notification
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member name
     * @param {number} totalSaved - Total amount saved
     * @returns {Promise<object>} Send result
     */
    async sendInterestEligibleNotification(phone, name, totalSaved) {
        const message = this.templates.interestEligible(name, totalSaved);
        console.log(`📱 Sending interest eligibility SMS to ${name}...`);
        return await this.sendSMS(phone, message);
    },

    /**
     * Send month-end payment reminder
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member name
     * @param {string} nextMonth - Upcoming payment month
     * @returns {Promise<object>} Send result
     */
    async sendMonthEndReminder(phone, name, nextMonth) {
        const message = this.templates.monthEndReminder(name, nextMonth);
        console.log(`📱 Sending month-end reminder to ${name}...`);
        return await this.sendSMS(phone, message);
    },

    /**
     * ==========================================
     * OTP FUNCTIONS (Password Reset)
     * ==========================================
     */

    /**
     * Generate and send OTP for password reset
     * OTP is stored in Firestore with 10-minute expiry.
     * 
     * @param {string} phone - Member phone number
     * @returns {Promise<object>} Result with success status
     */
    async sendPasswordResetOTP(phone) {
        try {
            const formattedPhone = this.formatPhoneNumber(phone);
            
            if (!formattedPhone) {
                return { success: false, error: 'Invalid phone number' };
            }

            // Generate 6-digit OTP
            const otp = this.generateOTP(6);

            // Store OTP in Firestore with 10-minute expiry
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            
            await db.collection('otpCodes').doc(formattedPhone).set({
                otp: otp,
                phone: formattedPhone,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                used: false,
                attempts: 0
            });

            // Send OTP via SMS
            const message = this.templates.passwordReset(otp);
            const result = await this.sendSMS(phone, message);

            if (result.success) {
                console.log('✅ Password reset OTP sent');
                return { success: true, message: 'OTP sent to your phone' };
            } else {
                // Delete OTP if SMS failed
                await db.collection('otpCodes').doc(formattedPhone).delete();
                return { success: false, error: 'Failed to send OTP. Please try again.' };
            }

        } catch (error) {
            console.error('Send OTP error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Verify OTP code for password reset
     * 
     * @param {string} phone - Member phone number
     * @param {string} otp - OTP code entered by user
     * @returns {Promise<boolean>} Whether OTP is valid
     */
    async verifyOTP(phone, otp) {
        try {
            const formattedPhone = this.formatPhoneNumber(phone);
            
            if (!formattedPhone) {
                console.log('Invalid phone format for OTP verification');
                return false;
            }

            // Get stored OTP from Firestore
            const docRef = db.collection('otpCodes').doc(formattedPhone);
            const doc = await docRef.get();
            
            if (!doc.exists) {
                console.log('No OTP found for this phone');
                return false;
            }

            const data = doc.data();

            // Check if already used
            if (data.used) {
                console.log('OTP already used');
                return false;
            }

            // Check if expired (10 minutes)
            const now = new Date();
            const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
            
            if (now > expiresAt) {
                console.log('OTP has expired');
                await docRef.delete();
                return false;
            }

            // Check if too many attempts (max 3)
            if (data.attempts >= 3) {
                console.log('Too many OTP attempts');
                await docRef.delete();
                return false;
            }

            // Check if OTP matches
            if (data.otp !== otp.toString()) {
                console.log('OTP mismatch');
                // Increment attempt counter
                await docRef.update({
                    attempts: firebase.firestore.FieldValue.increment(1)
                });
                return false;
            }

            // OTP is valid! Mark as used
            await docRef.update({
                used: true,
                usedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ OTP verified successfully');
            return true;

        } catch (error) {
            console.error('OTP verification error:', error);
            return false;
        }
    },

    /**
     * Generate numeric OTP code
     * 
     * @param {number} length - OTP length (default 6)
     * @returns {string} Generated OTP
     */
    generateOTP(length = 6) {
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += Math.floor(Math.random() * 10);
        }
        return otp;
    },

    /**
     * ==========================================
     * LOGGING & AUDIT TRAIL
     * ==========================================
     */

    /**
     * Log SMS to Firestore for audit trail
     * 
     * @param {object} logData - SMS log data
     */
    async logSMS(logData) {
        try {
            await db.collection('smsLogs').add({
                ...logData,
                provider: 'smsportal',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('📝 SMS logged to Firestore');
        } catch (error) {
            // Don't throw - logging failure shouldn't break SMS sending
            console.warn('⚠️ Failed to log SMS:', error.message);
        }
    },

    /**
     * Get SMS logs (for admin dashboard)
     * 
     * @param {object} filters - Optional filters {status, limit, phone}
     * @returns {Promise<Array>} Array of SMS logs
     */
    async getLogs(filters = {}) {
        try {
            let query = db.collection('smsLogs');
            
            if (filters.status) {
                query = query.where('status', '==', filters.status);
            }
            
            if (filters.phone) {
                const formattedPhone = this.formatPhoneNumber(filters.phone);
                query = query.where('phone', '==', formattedPhone);
            }
            
            const limit = filters.limit || 100;
            const snapshot = await query.limit(limit).get();

            const logs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sort by timestamp in JS (avoids needing composite index)
            logs.sort((a, b) => {
                const dateA = a.timestamp?.toDate?.() || new Date(0);
                const dateB = b.timestamp?.toDate?.() || new Date(0);
                return dateB - dateA;
            });

            return logs;

        } catch (error) {
            console.error('Get SMS logs error:', error);
            return [];
        }
    },

    /**
     * ==========================================
     * UTILITY & CONTROL FUNCTIONS
     * ==========================================
     */

    /**
     * Enable test mode (SMS not actually sent, no credits used)
     */
    enableTestMode() {
        this.config.testMode = true;
        console.log('🧪 SMS Test Mode ENABLED');
        console.log('   - SMS will NOT be sent');
        console.log('   - No credits will be deducted');
        console.log('   - API will still return success response');
    },

    /**
     * Disable test mode (real SMS will be sent)
     */
    disableTestMode() {
        this.config.testMode = false;
        console.log('📱 SMS Test Mode DISABLED');
        console.log('   - Real SMS will be sent');
        console.log('   - Credits will be deducted');
    },

    /**
     * Check if test mode is enabled
     * 
     * @returns {boolean} Test mode status
     */
    isTestMode() {
        return this.config.testMode;
    },

    /**
     * Update API credentials (use if credentials change)
     * 
     * @param {string} clientId - New SMSPortal Client ID
     * @param {string} apiSecret - New SMSPortal API Secret
     */
    updateCredentials(clientId, apiSecret) {
        if (!clientId || !apiSecret) {
            console.error('Both clientId and apiSecret are required');
            return;
        }
        this.config.clientId = clientId;
        this.config.apiSecret = apiSecret;
        console.log('🔐 SMS credentials updated');
    },

    /**
     * Get current configuration (for debugging - hides secret)
     * 
     * @returns {object} Config with masked secret
     */
    getConfig() {
        return {
            clientId: this.config.clientId,
            apiSecret: '****' + this.config.apiSecret.slice(-4),
            baseUrl: this.config.baseUrl,
            version: this.config.version,
            testMode: this.config.testMode,
            logToFirestore: this.config.logToFirestore
        };
    }
};

// Export for use in other modules
window.SMS = SMS;

// Log initialization
console.log('📱 SMS Service initialized (SMSPortal)');
console.log(`   Provider: SMSPortal (https://smsportal.com)`);
console.log(`   Test Mode: ${SMS.config.testMode ? '🧪 ON (no real SMS)' : '📱 OFF (real SMS)'}`);
console.log(`   Firestore Logging: ${SMS.config.logToFirestore ? 'ON' : 'OFF'}`);