/**
 * =====================================================
 * TSHIKOTA RO FARANA - SMS SERVICE MODULE
 * =====================================================
 * 
 * Handles SMS notifications for South African mobile numbers.
 * Supports multiple SA SMS providers:
 * - BulkSMS (SA-based, recommended)
 * - Clickatell (SA-based)
 * - Africa's Talking
 * 
 * SETUP INSTRUCTIONS:
 * 1. Choose your SMS provider and create an account
 * 2. Get your API credentials
 * 3. Update SMS_CONFIG below with your credentials
 * 4. For production, move credentials to Firebase Cloud Functions
 * 
 * PRICING (approximate as of 2024):
 * - BulkSMS: ~R0.29 per SMS
 * - Clickatell: ~R0.35 per SMS
 * - Africa's Talking: ~R0.25 per SMS
 * 
 * =====================================================
 */

const SMS = {
    /**
     * ==========================================
     * CONFIGURATION
     * ==========================================
     * Update these settings for your SMS provider
     */
    
    config: {
        // Set your preferred provider: 'bulksms', 'clickatell', 'africastalking', 'mock'
        // Use 'mock' for development/testing (logs to console, saves to Firestore)
        provider: 'mock',
        
        // BulkSMS Configuration (https://www.bulksms.com)
        bulksms: {
            username: 'YOUR_BULKSMS_USERNAME',
            password: 'YOUR_BULKSMS_PASSWORD',
            baseUrl: 'https://api.bulksms.com/v1'
        },
        
        // Clickatell Configuration (https://www.clickatell.com)
        clickatell: {
            apiKey: 'YOUR_CLICKATELL_API_KEY',
            baseUrl: 'https://platform.clickatell.com/messages'
        },
        
        // Africa's Talking Configuration (https://africastalking.com)
        africastalking: {
            username: 'YOUR_AT_USERNAME',
            apiKey: 'YOUR_AT_API_KEY',
            baseUrl: 'https://api.africastalking.com/version1/messaging'
        },
        
        // Sender ID (your stokvel name - max 11 chars, no spaces)
        senderId: 'TshikotaRF',
        
        // Default country code for SA
        countryCode: '+27'
    },

    /**
     * ==========================================
     * MESSAGE TEMPLATES
     * ==========================================
     * Pre-defined SMS templates for common notifications
     * Keep messages under 160 chars for single SMS billing
     */
    
    templates: {
        /**
         * Registration confirmation
         * Variables: {name}
         */
        registration: (data) => 
            `Welcome to Tshikota Ro Farana Stokvel, ${data.name}! ` +
            `Your registration is complete. ` +
            `Min contribution: R300/month by the 7th. ` +
            `Ref: ${data.memberRef}`,
        
        /**
         * POP submission confirmation  
         * Variables: {name}, {amount}, {reference}, {month}
         */
        popSubmitted: (data) =>
            `Hi ${data.name}, your R${data.amount} payment proof for ${data.month} ` +
            `has been received. Ref: ${data.reference}. ` +
            `Pending admin approval.`,
        
        /**
         * Payment approved notification
         * Variables: {name}, {amount}, {month}, {totalSaved}
         */
        paymentApproved: (data) =>
            `Good news ${data.name}! Your R${data.amount} payment for ${data.month} ` +
            `has been approved. Total saved: R${data.totalSaved}. ` +
            `Thank you! - Tshikota RF`,
        
        /**
         * Payment rejected notification
         * Variables: {name}, {amount}, {reason}
         */
        paymentRejected: (data) =>
            `Hi ${data.name}, your R${data.amount} payment was not approved. ` +
            `Reason: ${data.reason}. ` +
            `Please resubmit or contact admin.`,
        
        /**
         * Late payment reminder
         * Variables: {name}, {month}
         */
        lateReminder: (data) =>
            `Reminder: Hi ${data.name}, your ${data.month} contribution is due. ` +
            `Min R300 required. Payments after 7th incur R50 fine. ` +
            `- Tshikota RF`,
        
        /**
         * Password reset OTP
         * Variables: {otp}
         */
        passwordReset: (data) =>
            `Your Tshikota Ro Farana password reset code is: ${data.otp}. ` +
            `Valid for 10 minutes. Do not share this code.`,
        
        /**
         * Custom message (for admin use)
         */
        custom: (data) => data.message
    },

    /**
     * ==========================================
     * CORE FUNCTIONS
     * ==========================================
     */

    /**
     * Format SA phone number to international format
     * Handles: 0821234567, 821234567, +27821234567, 27821234567
     * 
     * @param {string} phone - Phone number in any format
     * @returns {string} Phone in +27XXXXXXXXX format
     */
    formatPhoneNumber(phone) {
        // Remove all non-digits except leading +
        let cleaned = phone.replace(/[^\d+]/g, '');
        
        // Remove leading + for processing
        const hasPlus = cleaned.startsWith('+');
        if (hasPlus) cleaned = cleaned.substring(1);
        
        // Handle different formats
        if (cleaned.startsWith('27') && cleaned.length === 11) {
            // Already in 27XXXXXXXXX format
            return '+' + cleaned;
        } else if (cleaned.startsWith('0') && cleaned.length === 10) {
            // SA format: 0XXXXXXXXX -> +27XXXXXXXXX
            return '+27' + cleaned.substring(1);
        } else if (cleaned.length === 9 && /^[6-8]/.test(cleaned)) {
            // Missing leading 0: XXXXXXXXX -> +27XXXXXXXXX
            return '+27' + cleaned;
        }
        
        // Return as-is with + prefix if we can't determine format
        console.warn('SMS: Unexpected phone format:', phone);
        return hasPlus ? '+' + cleaned : '+27' + cleaned;
    },

    /**
     * Validate SA mobile number
     * SA mobile numbers start with 06, 07, or 08
     * 
     * @param {string} phone - Phone number to validate
     * @returns {boolean} Whether phone is valid SA mobile
     */
    isValidSAMobile(phone) {
        const formatted = this.formatPhoneNumber(phone);
        // +27 followed by 6, 7, or 8, then 8 more digits
        return /^\+27[6-8]\d{8}$/.test(formatted);
    },

    /**
     * Send SMS using configured provider
     * 
     * @param {string} phone - Recipient phone number
     * @param {string} templateName - Template name from templates object
     * @param {object} data - Data to inject into template
     * @returns {Promise<object>} Send result {success, messageId, error}
     */
    async send(phone, templateName, data = {}) {
        try {
            // Validate phone number
            if (!this.isValidSAMobile(phone)) {
                throw new Error('Invalid SA mobile number: ' + phone);
            }
            
            // Format phone number
            const formattedPhone = this.formatPhoneNumber(phone);
            
            // Get message from template
            const template = this.templates[templateName];
            if (!template) {
                throw new Error('Unknown SMS template: ' + templateName);
            }
            const message = template(data);
            
            // Validate message length (warn if over 160 chars)
            if (message.length > 160) {
                console.warn(`SMS: Message is ${message.length} chars (>${160}), may be charged as multiple SMS`);
            }
            
            // Send via configured provider
            let result;
            switch (this.config.provider) {
                case 'bulksms':
                    result = await this.sendViaBulkSMS(formattedPhone, message);
                    break;
                case 'clickatell':
                    result = await this.sendViaClickatell(formattedPhone, message);
                    break;
                case 'africastalking':
                    result = await this.sendViaAfricasTalking(formattedPhone, message);
                    break;
                case 'mock':
                default:
                    result = await this.sendMock(formattedPhone, message);
                    break;
            }
            
            // Log to Firestore for audit trail
            await this.logSMS({
                phone: formattedPhone,
                template: templateName,
                message: message,
                result: result,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return result;
            
        } catch (error) {
            console.error('SMS send error:', error);
            
            // Log failed attempt
            await this.logSMS({
                phone: phone,
                template: templateName,
                error: error.message,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    },

    /**
     * Send custom message (not from template)
     * 
     * @param {string} phone - Recipient phone number
     * @param {string} message - Custom message text
     * @returns {Promise<object>} Send result
     */
    async sendCustom(phone, message) {
        return this.send(phone, 'custom', { message });
    },

    /**
     * ==========================================
     * PROVIDER IMPLEMENTATIONS
     * ==========================================
     */

    /**
     * Mock SMS sender for development/testing
     * Logs to console and saves to Firestore
     */
    async sendMock(phone, message) {
        console.log('📱 SMS (Mock Mode):');
        console.log('   To:', phone);
        console.log('   Message:', message);
        console.log('   Length:', message.length, 'chars');
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return {
            success: true,
            messageId: 'MOCK-' + Date.now(),
            provider: 'mock',
            note: 'SMS logged to console (mock mode). Configure a real provider for production.'
        };
    },

    /**
     * Send via BulkSMS (South African provider)
     * API Docs: https://www.bulksms.com/developer/json/v1/
     */
    async sendViaBulkSMS(phone, message) {
        const { username, password, baseUrl } = this.config.bulksms;
        
        const response = await fetch(`${baseUrl}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(`${username}:${password}`)
            },
            body: JSON.stringify({
                to: phone,
                body: message,
                from: this.config.senderId
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error('BulkSMS error: ' + error);
        }
        
        const result = await response.json();
        
        return {
            success: true,
            messageId: result[0]?.id,
            provider: 'bulksms',
            credits: result[0]?.creditCost
        };
    },

    /**
     * Send via Clickatell (South African provider)
     * API Docs: https://www.clickatell.com/developers/api-documentation/
     */
    async sendViaClickatell(phone, message) {
        const { apiKey, baseUrl } = this.config.clickatell;
        
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': apiKey
            },
            body: JSON.stringify({
                content: message,
                to: [phone.replace('+', '')], // Clickatell expects no + prefix
                from: this.config.senderId
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error('Clickatell error: ' + error);
        }
        
        const result = await response.json();
        
        return {
            success: true,
            messageId: result.messages?.[0]?.apiMessageId,
            provider: 'clickatell'
        };
    },

    /**
     * Send via Africa's Talking
     * API Docs: https://developers.africastalking.com/docs/sms/sending
     */
    async sendViaAfricasTalking(phone, message) {
        const { username, apiKey, baseUrl } = this.config.africastalking;
        
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('to', phone);
        formData.append('message', message);
        formData.append('from', this.config.senderId);
        
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'apiKey': apiKey,
                'Accept': 'application/json'
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error('Africa\'s Talking error: ' + error);
        }
        
        const result = await response.json();
        
        if (result.SMSMessageData?.Recipients?.[0]?.status !== 'Success') {
            throw new Error(result.SMSMessageData?.Recipients?.[0]?.status || 'Send failed');
        }
        
        return {
            success: true,
            messageId: result.SMSMessageData?.Recipients?.[0]?.messageId,
            provider: 'africastalking',
            cost: result.SMSMessageData?.Recipients?.[0]?.cost
        };
    },

    /**
     * ==========================================
     * UTILITY FUNCTIONS
     * ==========================================
     */

    /**
     * Log SMS to Firestore for audit trail
     * 
     * @param {object} logData - Data to log
     */
    async logSMS(logData) {
        try {
            await db.collection('smsLogs').add(logData);
        } catch (error) {
            console.error('Failed to log SMS:', error);
        }
    },

    /**
     * Generate OTP code for password reset
     * 
     * @param {number} length - OTP length (default 6)
     * @returns {string} Generated OTP
     */
    generateOTP(length = 6) {
        const digits = '0123456789';
        let otp = '';
        for (let i = 0; i < length; i++) {
            otp += digits[Math.floor(Math.random() * 10)];
        }
        return otp;
    },

    /**
     * Send registration confirmation SMS
     * Convenience wrapper for registration template
     * 
     * @param {string} phone - Member phone number
     * @param {string} name - Member name
     * @param {string} memberRef - Member reference/ID
     */
    async sendRegistrationConfirmation(phone, name, memberRef) {
        return this.send(phone, 'registration', { name, memberRef });
    },

    /**
     * Send POP submission confirmation SMS
     * Convenience wrapper for popSubmitted template
     * 
     * @param {string} phone - Submitter phone number
     * @param {object} submission - Submission data
     */
    async sendPOPConfirmation(phone, submission) {
        return this.send(phone, 'popSubmitted', {
            name: submission.name,
            amount: submission.amount,
            reference: submission.reference,
            month: submission.paymentMonth
        });
    },

    /**
     * Send payment approved notification
     * 
     * @param {string} phone - Member phone
     * @param {object} data - Payment data
     */
    async sendApprovalNotification(phone, data) {
        return this.send(phone, 'paymentApproved', data);
    },

    /**
     * Send password reset OTP
     * 
     * @param {string} phone - Member phone
     * @returns {Promise<{success: boolean, otp?: string}>}
     */
    async sendPasswordResetOTP(phone) {
        const otp = this.generateOTP(6);
        const result = await this.send(phone, 'passwordReset', { otp });
        
        if (result.success) {
            // Store OTP in Firestore with expiry (10 minutes)
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            await db.collection('otpCodes').doc(this.formatPhoneNumber(phone)).set({
                otp: otp,
                expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt),
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                used: false
            });
            
            return { success: true, otp }; // Return OTP for testing/logging
        }
        
        return { success: false, error: result.error };
    },

    /**
     * Verify OTP code
     * 
     * @param {string} phone - Member phone
     * @param {string} otp - OTP to verify
     * @returns {Promise<boolean>} Whether OTP is valid
     */
    async verifyOTP(phone, otp) {
        try {
            const docRef = db.collection('otpCodes').doc(this.formatPhoneNumber(phone));
            const doc = await docRef.get();
            
            if (!doc.exists) return false;
            
            const data = doc.data();
            
            // Check if OTP matches and not expired
            const isValid = data.otp === otp && 
                           !data.used && 
                           data.expiresAt.toDate() > new Date();
            
            if (isValid) {
                // Mark as used
                await docRef.update({ used: true });
            }
            
            return isValid;
        } catch (error) {
            console.error('OTP verification error:', error);
            return false;
        }
    },

    /**
     * Check SMS provider status
     * Useful for admin dashboard
     * 
     * @returns {object} Provider status info
     */
    getProviderStatus() {
        return {
            provider: this.config.provider,
            isConfigured: this.config.provider !== 'mock',
            senderId: this.config.senderId,
            note: this.config.provider === 'mock' 
                ? 'Using mock mode - SMS logged to console only' 
                : `Using ${this.config.provider} for SMS delivery`
        };
    }
};

// Export for use
window.SMS = SMS;
