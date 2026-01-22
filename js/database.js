/**
 * =====================================================
 * TSHIKOTA RO FARANA - DATABASE OPERATIONS (UPDATED)
 * =====================================================
 * 
 * Firestore CRUD operations and business logic.
 * 
 * KEY UPDATES:
 * - Fixed sync issues (submissionCount, totalSubmissions, interestPool year)
 * - Added member registration with password support
 * - Added next of kin storage
 * - Improved data integrity with batch operations
 * - South African financial calculations (ZAR)
 * 
 * DATA COLLECTIONS:
 * - members: Registered stokvel members
 * - submissions: Payment proof submissions
 * - nextOfKin: Emergency contacts for members
 * - interestPool: Collected fines and bank interest per year
 * - settings: App configuration (admin code, banking details)
 * - auditLogs: Admin action audit trail
 * - smsLogs: SMS sending history
 * - otpCodes: Password reset OTP codes
 * 
 * =====================================================
 */

const Database = {
    /**
     * ==========================================
     * MEMBER REGISTRATION (NEW)
     * ==========================================
     */

    /**
     * Register a new member (public registration form)
     * Creates member document with pending status
     * 
     * @param {object} memberData - Registration data
     * @param {string} memberData.name - Full name (Name & Surname)
     * @param {string} memberData.surname - Surname (separate field)
     * @param {string} memberData.dateOfBirth - DOB in YYYY-MM-DD format
     * @param {string} memberData.idNumber - SA ID number (13 digits)
     * @param {string} memberData.phone - Phone number (10 digits)
     * @param {string} memberData.email - Email (optional)
     * @param {string} memberData.password - Account password
     * @returns {Promise<{memberId: string, memberRef: string}>} New member info
     */
    async registerMember(memberData) {
        try {
            // Normalize phone number (remove spaces, ensure 10 digits)
            const normalizedPhone = memberData.phone.replace(/[\s-]/g, '');
            
            // Check if phone already registered
            const existingMember = await this.getMemberByPhone(normalizedPhone);
            if (existingMember) {
                throw new Error('This phone number is already registered. Please use View Account to log in.');
            }

            // Check if ID number already registered
            const existingId = await this.getMemberByIdNumber(memberData.idNumber);
            if (existingId) {
                throw new Error('This ID number is already registered.');
            }

            // Generate member reference code
            const memberRef = this.generateMemberRef();

            // Hash password (simple hash for client-side, consider bcrypt with Cloud Functions)
            const passwordHash = await this.hashPassword(memberData.password);

            // Create member document
            const docRef = await db.collection('members').add({
                // Personal details
                name: memberData.name.trim(),
                surname: memberData.surname?.trim() || '',
                fullName: `${memberData.name.trim()} ${memberData.surname?.trim() || ''}`.trim(),
                dateOfBirth: memberData.dateOfBirth,
                idNumber: memberData.idNumber,
                phone: normalizedPhone,
                email: memberData.email?.trim().toLowerCase() || '',
                
                // Authentication
                passwordHash: passwordHash,
                
                // Reference
                memberRef: memberRef,
                
                // Financial stats (all start at 0)
                totalSavings: 0,
                totalFines: 0,
                submissionCount: 0,
                verifiedCount: 0,
                pendingCount: 0,
                rejectedCount: 0,
                
                // Status tracking
                status: 'active',
                skippedMonths: 0,
                lastPaymentDate: null,
                lastPaymentMonth: null,
                
                // Interest eligibility
                qualifiesForInterest: false,
                
                // Registration metadata
                registrationComplete: false, // Set to true after next of kin added
                registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                
                // Registration source
                registrationSource: 'public_form' // vs 'admin_added'
            });

            console.log('✅ Member registered:', memberRef);

            return {
                memberId: docRef.id,
                memberRef: memberRef
            };

        } catch (error) {
            console.error('❌ Member registration error:', error);
            throw error;
        }
    },

    /**
     * Save next of kin information
     * Called after member registration form
     * 
     * @param {string} memberId - Member document ID
     * @param {object} kinData - Next of kin data
     * @returns {Promise<void>}
     */
    async saveNextOfKin(memberId, kinData) {
        try {
            const batch = db.batch();

            // Save primary next of kin (required)
            if (kinData.primary) {
                const primaryRef = db.collection('nextOfKin').doc();
                batch.set(primaryRef, {
                    memberId: memberId,
                    type: 'primary',
                    name: kinData.primary.name.trim(),
                    relationship: kinData.primary.relationship,
                    phone: kinData.primary.phone.replace(/[\s-]/g, ''),
                    email: kinData.primary.email?.trim().toLowerCase() || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Save secondary next of kin (required)
            if (kinData.secondary) {
                const secondaryRef = db.collection('nextOfKin').doc();
                batch.set(secondaryRef, {
                    memberId: memberId,
                    type: 'secondary',
                    name: kinData.secondary.name.trim(),
                    relationship: kinData.secondary.relationship,
                    phone: kinData.secondary.phone.replace(/[\s-]/g, ''),
                    email: kinData.secondary.email?.trim().toLowerCase() || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Save tertiary next of kin (optional)
            if (kinData.tertiary && kinData.tertiary.name) {
                const tertiaryRef = db.collection('nextOfKin').doc();
                batch.set(tertiaryRef, {
                    memberId: memberId,
                    type: 'tertiary',
                    name: kinData.tertiary.name.trim(),
                    relationship: kinData.tertiary.relationship || '',
                    phone: kinData.tertiary.phone?.replace(/[\s-]/g, '') || '',
                    email: kinData.tertiary.email?.trim().toLowerCase() || '',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Update member as registration complete
            const memberRef = db.collection('members').doc(memberId);
            batch.update(memberRef, {
                registrationComplete: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await batch.commit();
            console.log('✅ Next of kin saved for member:', memberId);

        } catch (error) {
            console.error('❌ Save next of kin error:', error);
            throw error;
        }
    },

    /**
     * Get next of kin for a member
     * 
     * @param {string} memberId - Member document ID
     * @returns {Promise<object>} Next of kin data grouped by type
     */
    async getNextOfKin(memberId) {
        try {
            const snapshot = await db.collection('nextOfKin')
                .where('memberId', '==', memberId)
                .get();

            const result = {
                primary: null,
                secondary: null,
                tertiary: null
            };

            snapshot.docs.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                result[data.type] = data;
            });

            return result;

        } catch (error) {
            console.error('Get next of kin error:', error);
            throw error;
        }
    },

    /**
     * Generate unique member reference code
     * Format: TRF-MXXXX (e.g., TRF-M4K7P)
     * 
     * @returns {string} Member reference code
     */
    generateMemberRef() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = 'TRF-M';
        for (let i = 0; i < 4; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    /**
     * Simple password hashing (SHA-256)
     * For production, consider using Firebase Auth or Cloud Functions with bcrypt
     * 
     * @param {string} password - Plain text password
     * @returns {Promise<string>} Hashed password
     */
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + 'tshikota_salt_2024');
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Verify password against stored hash
     * 
     * @param {string} password - Plain text password
     * @param {string} hash - Stored password hash
     * @returns {Promise<boolean>} Whether password matches
     */
    async verifyPassword(password, hash) {
        const inputHash = await this.hashPassword(password);
        return inputHash === hash;
    },

    /**
     * ==========================================
     * MEMBER OPERATIONS (UPDATED)
     * ==========================================
     */

    /**
     * Get all members
     * 
     * @returns {Promise<Array>} Array of member objects
     */
    async getMembers() {
        try {
            const snapshot = await db.collection('members')
                .orderBy('name')
                .get();
            
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error('Get members error:', error);
            throw error;
        }
    },

    /**
     * Get a single member by ID
     * 
     * @param {string} memberId - Member document ID
     * @returns {Promise<object|null>} Member data or null
     */
    async getMember(memberId) {
        try {
            const doc = await db.collection('members').doc(memberId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Get member error:', error);
            throw error;
        }
    },

    /**
     * Get member by phone number
     * 
     * @param {string} phone - Phone number (will be normalized)
     * @returns {Promise<object|null>} Member data or null
     */
    async getMemberByPhone(phone) {
        try {
            const normalizedPhone = phone.replace(/[\s-]/g, '');
            const snapshot = await db.collection('members')
                .where('phone', '==', normalizedPhone)
                .limit(1)
                .get();
            
            if (snapshot.empty) return null;
            
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error('Get member by phone error:', error);
            throw error;
        }
    },

    /**
     * Get member by ID number
     * 
     * @param {string} idNumber - SA ID number
     * @returns {Promise<object|null>} Member data or null
     */
    async getMemberByIdNumber(idNumber) {
        try {
            const snapshot = await db.collection('members')
                .where('idNumber', '==', idNumber)
                .limit(1)
                .get();
            
            if (snapshot.empty) return null;
            
            const doc = snapshot.docs[0];
            return { id: doc.id, ...doc.data() };
        } catch (error) {
            console.error('Get member by ID number error:', error);
            throw error;
        }
    },

    /**
     * Authenticate member with phone and password
     * 
     * @param {string} phone - Phone number
     * @param {string} password - Password
     * @returns {Promise<object|null>} Member data if authenticated, null otherwise
     */
    async authenticateMember(phone, password) {
        try {
            const member = await this.getMemberByPhone(phone);
            
            if (!member) {
                return { success: false, error: 'Phone number not found. Please register first.' };
            }

            if (!member.passwordHash) {
                return { success: false, error: 'Account not set up. Please contact admin.' };
            }

            const isValid = await this.verifyPassword(password, member.passwordHash);
            
            if (!isValid) {
                return { success: false, error: 'Incorrect password.' };
            }

            // Update last login
            await db.collection('members').doc(member.id).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, member: member };

        } catch (error) {
            console.error('Authentication error:', error);
            return { success: false, error: 'Login failed. Please try again.' };
        }
    },

    /**
     * Update member password
     * 
     * @param {string} memberId - Member document ID
     * @param {string} newPassword - New password
     * @returns {Promise<void>}
     */
    async updatePassword(memberId, newPassword) {
        try {
            const passwordHash = await this.hashPassword(newPassword);
            await db.collection('members').doc(memberId).update({
                passwordHash: passwordHash,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Update password error:', error);
            throw error;
        }
    },

    /**
     * Add a new member (admin function)
     * 
     * @param {object} memberData - Member data
     * @returns {Promise<string>} New member ID
     */
    async addMember(memberData) {
        try {
            const normalizedPhone = memberData.phone.replace(/[\s-]/g, '');
            const memberRef = this.generateMemberRef();

            const docRef = await db.collection('members').add({
                name: memberData.name.trim(),
                surname: memberData.surname?.trim() || '',
                fullName: `${memberData.name.trim()} ${memberData.surname?.trim() || ''}`.trim(),
                phone: normalizedPhone,
                email: memberData.email?.trim().toLowerCase() || '',
                memberRef: memberRef,
                
                // Initialize all financial stats
                totalSavings: 0,
                totalFines: 0,
                submissionCount: 0,
                verifiedCount: 0,
                pendingCount: 0,
                rejectedCount: 0,
                
                status: 'active',
                skippedMonths: 0,
                qualifiesForInterest: false,
                
                registrationComplete: false,
                registrationSource: 'admin_added',
                notes: memberData.notes || '',
                
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Log admin action
            await Auth.logAdminAction('member_added', {
                memberId: docRef.id,
                memberName: memberData.name,
                memberRef: memberRef
            });
            
            return docRef.id;
        } catch (error) {
            console.error('Add member error:', error);
            throw error;
        }
    },

    /**
     * Update a member
     * 
     * @param {string} memberId - Member ID
     * @param {object} updates - Fields to update
     */
    async updateMember(memberId, updates) {
        try {
            // Recalculate interest eligibility if savings changed
            if (updates.totalSavings !== undefined) {
                updates.qualifiesForInterest = updates.totalSavings >= (APP_SETTINGS?.interestEligibilityMin || 10000);
            }

            await db.collection('members').doc(memberId).update({
                ...updates,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await Auth.logAdminAction('member_updated', {
                memberId,
                updates: Object.keys(updates)
            });
        } catch (error) {
            console.error('Update member error:', error);
            throw error;
        }
    },

    /**
     * ==========================================
     * SUBMISSIONS OPERATIONS (UPDATED)
     * ==========================================
     */

    /**
     * Submit proof of payment
     * Now includes SMS confirmation
     * 
     * @param {object} submissionData - Submission data
     * @returns {Promise<string>} Reference code
     */
    async submitPOP(submissionData) {
        try {
            const reference = Utils.generateReference();
            const normalizedPhone = submissionData.phone.replace(/[\s-]/g, '');
            
            // Check if payment is late (after 7th of month)
            const paymentDate = new Date(submissionData.paymentDate);
            const isLate = Utils.isPaymentLate(paymentDate);
            const fineAmount = isLate ? (APP_SETTINGS?.lateFineAmount || 50) : 0;
            
            // Find linked member (if exists)
            const member = await this.getMemberByPhone(normalizedPhone);
            
            // Create submission document
            const docRef = await db.collection('submissions').add({
                // Submitter info
                name: submissionData.name.trim(),
                phone: normalizedPhone,
                
                // Payment details
                amount: Number(submissionData.amount),
                paymentDate: firebase.firestore.Timestamp.fromDate(paymentDate),
                paymentMonth: submissionData.paymentMonth,
                paymentMethod: submissionData.paymentMethod,
                
                // Proof file (base64)
                proofURL: submissionData.proofURL,
                
                // Reference and status
                reference: reference,
                status: 'pending',
                
                // Late fee calculation
                isLate: isLate,
                fineAmount: fineAmount,
                
                // Linked member (if found)
                memberId: member?.id || null,
                memberRef: member?.memberRef || null,
                
                // Notes
                notes: submissionData.notes || '',
                
                // Timestamps
                submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update member's pending count if linked
            if (member?.id) {
                await db.collection('members').doc(member.id).update({
                    pendingCount: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Send SMS confirmation
            try {
                await SMS.sendPOPConfirmation(normalizedPhone, {
                    name: submissionData.name,
                    amount: submissionData.amount,
                    reference: reference,
                    paymentMonth: submissionData.paymentMonth
                });
            } catch (smsError) {
                console.warn('SMS confirmation failed:', smsError);
                // Don't fail submission if SMS fails
            }

            console.log('✅ POP submitted:', reference);
            return reference;

        } catch (error) {
            console.error('❌ Submit POP error:', error);
            throw error;
        }
    },

    /**
     * Get pending submissions
     * 
     * @returns {Promise<Array>} Array of pending submissions
     */
    async getPendingSubmissions() {
        try {
            // Simple query without orderBy (avoids needing composite index)
            const snapshot = await db.collection('submissions')
                .where('status', '==', 'pending')
                .get();
            
            // Sort in JavaScript
            const submissions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            submissions.sort((a, b) => {
                const dateA = a.submittedAt?.toDate?.() || new Date(a.submittedAt) || new Date(0);
                const dateB = b.submittedAt?.toDate?.() || new Date(b.submittedAt) || new Date(0);
                return dateB - dateA;
            });
            
            return submissions;
        } catch (error) {
            console.error('Get pending submissions error:', error);
            throw error;
        }
    },

    /**
     * Get verified submissions with optional filters
     * 
     * @param {object} filters - Optional filters (month, memberId)
     * @returns {Promise<Array>} Array of verified submissions
     */
    async getVerifiedSubmissions(filters = {}) {
        try {
            let query = db.collection('submissions')
                .where('status', '==', 'verified');
            
            if (filters.month) {
                query = query.where('paymentMonth', '==', filters.month);
            }
            
            if (filters.memberId) {
                query = query.where('memberId', '==', filters.memberId);
            }
            
            // Simple query without orderBy (avoids needing composite index)
            const snapshot = await query.get();
            
            // Sort in JavaScript
            const submissions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            submissions.sort((a, b) => {
                const dateA = a.verifiedAt?.toDate?.() || new Date(a.verifiedAt) || new Date(0);
                const dateB = b.verifiedAt?.toDate?.() || new Date(b.verifiedAt) || new Date(0);
                return dateB - dateA;
            });
            
            return submissions;
        } catch (error) {
            console.error('Get verified submissions error:', error);
            throw error;
        }
    },

    /**
     * Get submissions for a specific member by phone
     * 
     * @param {string} phone - Member phone number
     * @returns {Promise<Array>} Array of submissions
     */
    async getMemberSubmissions(phone) {
        try {
            const normalizedPhone = phone.replace(/[\s-]/g, '');
            
            // Simple query without orderBy (avoids needing composite index)
            const snapshot = await db.collection('submissions')
                .where('phone', '==', normalizedPhone)
                .get();
            
            // Sort in JavaScript instead (most recent first)
            const submissions = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Sort by submittedAt descending
            submissions.sort((a, b) => {
                const dateA = a.submittedAt?.toDate?.() || new Date(a.submittedAt) || new Date(0);
                const dateB = b.submittedAt?.toDate?.() || new Date(b.submittedAt) || new Date(0);
                return dateB - dateA;
            });
            
            return submissions;
        } catch (error) {
            console.error('Get member submissions error:', error);
            throw error;
        }
    },

    /**
     * Get a single submission by ID
     * 
     * @param {string} submissionId - Submission document ID
     * @returns {Promise<object|null>} Submission data or null
     */
    async getSubmission(submissionId) {
        try {
            const doc = await db.collection('submissions').doc(submissionId).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (error) {
            console.error('Get submission error:', error);
            throw error;
        }
    },

    /**
     * Approve a submission (FIXED)
     * Now correctly updates submissionCount and uses payment year for interest pool
     * 
     * @param {string} submissionId - Submission ID
     * @param {string} memberId - Linked member ID
     */
    async approveSubmission(submissionId, memberId = null) {
        try {
            const batch = db.batch();
            
            // Get submission data
            const submission = await this.getSubmission(submissionId);
            if (!submission) {
                throw new Error('Submission not found');
            }

            const submissionRef = db.collection('submissions').doc(submissionId);
            
            // Update submission status
            batch.update(submissionRef, {
                status: 'verified',
                memberId: memberId,
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                verifiedBy: Auth.currentUser?.uid || 'admin',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // If member linked, update their stats
            if (memberId) {
                const memberRef = db.collection('members').doc(memberId);
                const member = await this.getMember(memberId);
                
                // Calculate new totals for interest eligibility check
                const newTotalSavings = (member?.totalSavings || 0) + submission.amount;
                const qualifiesForInterest = newTotalSavings >= (APP_SETTINGS?.interestEligibilityMin || 10000);
                
                batch.update(memberRef, {
                    // Financial updates
                    totalSavings: firebase.firestore.FieldValue.increment(submission.amount),
                    totalFines: firebase.firestore.FieldValue.increment(submission.fineAmount || 0),
                    
                    // Count updates (FIXED: now updating submissionCount)
                    submissionCount: firebase.firestore.FieldValue.increment(1),
                    verifiedCount: firebase.firestore.FieldValue.increment(1),
                    pendingCount: firebase.firestore.FieldValue.increment(-1), // Decrease pending
                    
                    // Status updates
                    lastPaymentDate: firebase.firestore.FieldValue.serverTimestamp(),
                    lastPaymentMonth: submission.paymentMonth,
                    skippedMonths: 0,
                    
                    // Interest eligibility (recalculated)
                    qualifiesForInterest: qualifiesForInterest,
                    
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // If late payment, add fine to interest pool (FIXED: use payment year)
            if (submission.fineAmount > 0) {
                // Extract year from payment month (e.g., "December 2024" -> 2024)
                const monthParts = submission.paymentMonth.split(' ');
                const paymentYear = monthParts.length > 1 
                    ? parseInt(monthParts[1]) 
                    : new Date().getFullYear();
                
                const interestRef = db.collection('interestPool').doc(paymentYear.toString());
                batch.set(interestRef, {
                    year: paymentYear,
                    totalFines: firebase.firestore.FieldValue.increment(submission.fineAmount),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            // Commit all updates atomically
            await batch.commit();
            
            // Log admin action
            await Auth.logAdminAction('submission_approved', {
                submissionId,
                reference: submission.reference,
                amount: submission.amount,
                fineAmount: submission.fineAmount,
                memberId
            });

            // Send approval SMS
            try {
                const member = memberId ? await this.getMember(memberId) : null;
                await SMS.sendApprovalNotification(submission.phone, {
                    name: submission.name,
                    amount: submission.amount,
                    month: submission.paymentMonth,
                    totalSaved: member?.totalSavings || submission.amount
                });
            } catch (smsError) {
                console.warn('Approval SMS failed:', smsError);
            }

            console.log('✅ Submission approved:', submission.reference);

        } catch (error) {
            console.error('❌ Approve submission error:', error);
            throw error;
        }
    },

    /**
     * Reject a submission
     * 
     * @param {string} submissionId - Submission ID
     * @param {string} reason - Rejection reason
     */
    async rejectSubmission(submissionId, reason = '') {
        try {
            const submission = await this.getSubmission(submissionId);
            if (!submission) {
                throw new Error('Submission not found');
            }

            const batch = db.batch();
            
            // Update submission
            const submissionRef = db.collection('submissions').doc(submissionId);
            batch.update(submissionRef, {
                status: 'rejected',
                rejectionReason: reason,
                rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                rejectedBy: Auth.currentUser?.uid || 'admin',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update member counts if linked
            if (submission.memberId) {
                const memberRef = db.collection('members').doc(submission.memberId);
                batch.update(memberRef, {
                    pendingCount: firebase.firestore.FieldValue.increment(-1),
                    rejectedCount: firebase.firestore.FieldValue.increment(1),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            await batch.commit();
            
            // Log action
            await Auth.logAdminAction('submission_rejected', {
                submissionId,
                reference: submission?.reference,
                reason
            });

            // Send rejection SMS
            try {
                await SMS.send(submission.phone, 'paymentRejected', {
                    name: submission.name,
                    amount: submission.amount,
                    reason: reason || 'Please contact admin for details'
                });
            } catch (smsError) {
                console.warn('Rejection SMS failed:', smsError);
            }

            console.log('⛔ Submission rejected:', submission.reference);

        } catch (error) {
            console.error('❌ Reject submission error:', error);
            throw error;
        }
    },

    /**
     * ==========================================
     * STATISTICS & REPORTS (FIXED)
     * ==========================================
     */

    /**
     * Get dashboard statistics (FIXED)
     * Now includes totalSubmissions and interestPool
     * 
     * @returns {Promise<object>} Statistics object
     */
    async getDashboardStats() {
        try {
            // Fetch all data in parallel
            const [
                membersSnapshot,
                pendingSnapshot,
                verifiedSnapshot,
                allSubmissionsSnapshot
            ] = await Promise.all([
                db.collection('members').get(),
                db.collection('submissions').where('status', '==', 'pending').get(),
                db.collection('submissions').where('status', '==', 'verified').get(),
                db.collection('submissions').get()
            ]);

            const members = membersSnapshot.docs.map(doc => doc.data());
            
            // Calculate totals from members
            const totalSavings = members.reduce((sum, m) => sum + (m.totalSavings || 0), 0);
            const totalFines = members.reduce((sum, m) => sum + (m.totalFines || 0), 0);
            
            // Get interest pool for current year
            const currentYear = new Date().getFullYear();
            let interestPool = 0;
            try {
                const interestDoc = await db.collection('interestPool').doc(currentYear.toString()).get();
                if (interestDoc.exists) {
                    const data = interestDoc.data();
                    interestPool = (data.totalFines || 0) + (data.bankInterest || 0);
                }
            } catch (e) {
                console.warn('Could not fetch interest pool:', e);
            }
            
            return {
                // Member stats
                memberCount: members.length,
                totalMembers: members.length, // Alias for compatibility
                activeMembers: members.filter(m => m.status === 'active').length,
                
                // Submission stats (FIXED: totalSubmissions now included)
                pendingCount: pendingSnapshot.size,
                verifiedCount: verifiedSnapshot.size,
                totalSubmissions: allSubmissionsSnapshot.size,
                
                // Financial stats
                totalSavings: totalSavings,
                totalFines: totalFines,
                interestPool: interestPool, // FIXED: now included
                
                // Calculated stats
                averageSavings: members.length > 0 ? Math.round(totalSavings / members.length) : 0,
                qualifyingMembers: members.filter(m => (m.totalSavings || 0) >= (APP_SETTINGS?.interestEligibilityMin || 10000)).length
            };
        } catch (error) {
            console.error('Get dashboard stats error:', error);
            throw error;
        }
    },

    /**
     * Get member statistics for account view (FIXED)
     * Uses consistent data source
     * 
     * @param {string} phone - Member phone number
     * @returns {Promise<object>} Member statistics
     */
    async getMemberStats(phone) {
        try {
            const normalizedPhone = phone.replace(/[\s-]/g, '');
            
            // Get member data
            const member = await this.getMemberByPhone(normalizedPhone);
            
            if (!member) {
                return null;
            }
            
            // Get submissions for verification
            const submissions = await this.getMemberSubmissions(phone);
            
            // Calculate from both sources and use member document as source of truth
            const verified = submissions.filter(s => s.status === 'verified');
            const pending = submissions.filter(s => s.status === 'pending');
            const rejected = submissions.filter(s => s.status === 'rejected');
            
            // Verify data consistency (log warning if mismatch)
            if (member.verifiedCount !== verified.length) {
                console.warn(`Data inconsistency: member.verifiedCount (${member.verifiedCount}) != verified submissions (${verified.length})`);
            }
            
            return {
                member,
                
                // Use member document values (source of truth)
                totalSavings: member.totalSavings || 0,
                totalFines: member.totalFines || 0,
                
                // Submission counts (use higher value in case of sync issues)
                totalSubmissions: Math.max(member.submissionCount || 0, submissions.length),
                submissionCount: Math.max(member.submissionCount || 0, submissions.length),
                verifiedCount: Math.max(member.verifiedCount || 0, verified.length),
                pendingCount: Math.max(member.pendingCount || 0, pending.length),
                rejectedCount: Math.max(member.rejectedCount || 0, rejected.length),
                
                // Interest eligibility
                qualifiesForInterest: member.qualifiesForInterest || 
                    (member.totalSavings || 0) >= (APP_SETTINGS?.interestEligibilityMin || 10000),
                interestThreshold: APP_SETTINGS?.interestEligibilityMin || 10000,
                interestProgress: Math.min(100, ((member.totalSavings || 0) / (APP_SETTINGS?.interestEligibilityMin || 10000)) * 100),
                
                // Recent submissions
                submissions: submissions.slice(0, 20) // Limit to 20 most recent
            };
        } catch (error) {
            console.error('Get member stats error:', error);
            throw error;
        }
    },

    /**
     * Get stokvel total (all members combined)
     * 
     * @returns {Promise<number>} Total savings in Rands
     */
    async getStokvelTotal() {
        try {
            const snapshot = await db.collection('members').get();
            return snapshot.docs.reduce((sum, doc) => {
                return sum + (doc.data().totalSavings || 0);
            }, 0);
        } catch (error) {
            console.error('Get stokvel total error:', error);
            throw error;
        }
    },

    /**
     * Generate monthly report data
     * 
     * @param {number} month - Month number (1-12)
     * @param {number} year - Year
     * @returns {Promise<object>} Report data
     */
    async generateMonthlyReport(month, year) {
        try {
            const monthName = Utils.getMonthName(month);
            const paymentMonth = `${monthName} ${year}`;
            
            // Get all submissions for this month
            const submissionsSnapshot = await db.collection('submissions')
                .where('paymentMonth', '==', paymentMonth)
                .get();
            
            const submissions = submissionsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            const verified = submissions.filter(s => s.status === 'verified');
            const pending = submissions.filter(s => s.status === 'pending');
            const rejected = submissions.filter(s => s.status === 'rejected');
            
            const totalAmount = verified.reduce((sum, s) => sum + (s.amount || 0), 0);
            const totalFines = verified.reduce((sum, s) => sum + (s.fineAmount || 0), 0);
            const latePayments = verified.filter(s => s.isLate).length;
            
            const members = await this.getMembers();
            const compliantMembers = verified.length;
            const complianceRate = members.length > 0 
                ? Math.round((compliantMembers / members.length) * 100) 
                : 0;
            
            return {
                period: paymentMonth,
                totalMembers: members.length,
                members: members, // Include for detailed reports
                
                submissions: {
                    total: submissions.length,
                    list: submissions,
                    verified: verified.length,
                    pending: pending.length,
                    rejected: rejected.length
                },
                
                financials: {
                    totalAmount: totalAmount,
                    totalFines: totalFines,
                    latePayments: latePayments,
                    averagePayment: verified.length > 0 ? Math.round(totalAmount / verified.length) : 0
                },
                
                compliance: {
                    compliantMembers: compliantMembers,
                    rate: complianceRate,
                    nonCompliant: members.length - compliantMembers
                },
                
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('Generate report error:', error);
            throw error;
        }
    },

    /**
     * ==========================================
     * INTEREST POOL OPERATIONS
     * ==========================================
     */

    /**
     * Get interest pool for a year
     * 
     * @param {number} year - Year
     * @returns {Promise<object>} Interest pool data
     */
    async getInterestPool(year) {
        try {
            const doc = await db.collection('interestPool').doc(year.toString()).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return { year, totalFines: 0, bankInterest: 0 };
        } catch (error) {
            console.error('Get interest pool error:', error);
            throw error;
        }
    },

    /**
     * Add bank interest to pool
     * 
     * @param {number} year - Year
     * @param {number} amount - Interest amount in Rands
     */
    async addBankInterest(year, amount) {
        try {
            const interestRef = db.collection('interestPool').doc(year.toString());
            await interestRef.set({
                year: year,
                bankInterest: firebase.firestore.FieldValue.increment(amount),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            await Auth.logAdminAction('bank_interest_added', {
                year: year,
                amount: amount
            });
        } catch (error) {
            console.error('Add bank interest error:', error);
            throw error;
        }
    },

    /**
     * Calculate interest distribution
     * Members with R10,000+ savings split the pool equally
     * 
     * @param {number} year - Year for distribution
     * @returns {Promise<object>} Distribution details
     */
    async calculateInterestDistribution(year) {
        try {
            const pool = await this.getInterestPool(year);
            const members = await this.getMembers();
            
            // Find qualifying members (R10,000+ saved, active status)
            const threshold = APP_SETTINGS?.interestEligibilityMin || 10000;
            const qualifyingMembers = members.filter(m => 
                m.status === 'active' && 
                (m.totalSavings || 0) >= threshold
            );
            
            const totalPool = (pool.totalFines || 0) + (pool.bankInterest || 0);
            const perMember = qualifyingMembers.length > 0 
                ? Math.floor(totalPool / qualifyingMembers.length) 
                : 0;
            
            return {
                year,
                totalPool,
                totalPoolFormatted: Utils.formatCurrency(totalPool),
                
                breakdown: {
                    totalFines: pool.totalFines || 0,
                    bankInterest: pool.bankInterest || 0
                },
                
                eligibility: {
                    threshold: threshold,
                    thresholdFormatted: Utils.formatCurrency(threshold)
                },
                
                distribution: {
                    qualifyingMembersCount: qualifyingMembers.length,
                    totalMembersCount: members.length,
                    perMemberAmount: perMember,
                    perMemberFormatted: Utils.formatCurrency(perMember)
                },
                
                qualifyingMembers: qualifyingMembers.map(m => ({
                    id: m.id,
                    name: m.name,
                    phone: m.phone,
                    totalSavings: m.totalSavings,
                    totalSavingsFormatted: Utils.formatCurrency(m.totalSavings),
                    shareAmount: perMember,
                    shareFormatted: Utils.formatCurrency(perMember)
                }))
            };
        } catch (error) {
            console.error('Calculate distribution error:', error);
            throw error;
        }
    },

    /**
     * ==========================================
     * DATA INTEGRITY UTILITIES
     * ==========================================
     */

    /**
     * Recalculate member stats from submissions
     * Use this to fix data inconsistencies
     * 
     * @param {string} memberId - Member ID to recalculate
     * @returns {Promise<object>} Updated stats
     */
    async recalculateMemberStats(memberId) {
        try {
            const member = await this.getMember(memberId);
            if (!member) throw new Error('Member not found');

            const submissions = await db.collection('submissions')
                .where('memberId', '==', memberId)
                .get();

            let totalSavings = 0;
            let totalFines = 0;
            let verifiedCount = 0;
            let pendingCount = 0;
            let rejectedCount = 0;

            submissions.docs.forEach(doc => {
                const data = doc.data();
                if (data.status === 'verified') {
                    totalSavings += data.amount || 0;
                    totalFines += data.fineAmount || 0;
                    verifiedCount++;
                } else if (data.status === 'pending') {
                    pendingCount++;
                } else if (data.status === 'rejected') {
                    rejectedCount++;
                }
            });

            const qualifiesForInterest = totalSavings >= (APP_SETTINGS?.interestEligibilityMin || 10000);

            await db.collection('members').doc(memberId).update({
                totalSavings,
                totalFines,
                submissionCount: submissions.size,
                verifiedCount,
                pendingCount,
                rejectedCount,
                qualifiesForInterest,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ Recalculated stats for member:', memberId);

            return {
                totalSavings,
                totalFines,
                submissionCount: submissions.size,
                verifiedCount,
                pendingCount,
                rejectedCount,
                qualifiesForInterest
            };

        } catch (error) {
            console.error('Recalculate stats error:', error);
            throw error;
        }
    },

    /**
     * Recalculate all members' stats
     * Admin utility function
     * 
     * @returns {Promise<number>} Number of members recalculated
     */
    async recalculateAllMemberStats() {
        try {
            const members = await this.getMembers();
            let count = 0;

            for (const member of members) {
                await this.recalculateMemberStats(member.id);
                count++;
            }

            await Auth.logAdminAction('stats_recalculated', {
                membersCount: count
            });

            return count;
        } catch (error) {
            console.error('Recalculate all stats error:', error);
            throw error;
        }
    }
};

// Export for use
window.Database = Database;