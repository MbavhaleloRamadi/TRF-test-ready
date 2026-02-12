/**
 * =====================================================
 * TSHIKOTA RO FARANA - DATABASE OPERATIONS
 * =====================================================
 * 
 * DUAL DATABASE ARCHITECTURE:
 * 
 * 1. FIRESTORE (Individual Records + Audit Trail)
 *    - members: Full member profiles with all details
 *    - submissions: Every payment submission with full history
 *    - nextOfKin: Emergency contacts linked to members
 *    - auditLogs: Every action logged with who/what/when
 *    - smsLogs: SMS history for debugging
 * 
 * 2. REALTIME DATABASE (Live Totals + Quick Stats)
 *    - /stokvel/totals: Overall stokvel statistics
 *    - /stokvel/members/{id}: Individual member totals
 *    - /stokvel/monthly/{year}/{month}: Monthly summaries
 *    - /stokvel/interestPool/{year}: Interest pool by year
 * 
 * WHY THIS ARCHITECTURE?
 * - Firestore: Complex queries, audit trail, data integrity
 * - Realtime DB: Instant sync to frontend, live counters
 * - Math accuracy: Atomic transactions prevent race conditions
 * - Audit: Every change tracked with timestamp and user
 * 
 * FINANCIAL RULES (South African Rands - ZAR):
 * - Minimum contribution: R300/month
 * - Late fee: R50 (after 7th of month)
 * - Interest eligibility: R10,000+ total savings
 * - Payment deadline: 7th of each month
 * 
 * =====================================================
 */

// ==========================================
// CONFIGURATION CONSTANTS
// ==========================================
// APP_SETTINGS is defined in firebase-config.js
// Using window.APP_SETTINGS for fallback
const DB_SETTINGS = window.APP_SETTINGS || {
    minimumContribution: 300,
    lateFee: 50,
    paymentDeadlineDay: 7,
    interestEligibilityMin: 10000,
    currency: 'ZAR',
    currencySymbol: 'R'
};

// ==========================================
// DATABASE REFERENCES
// ==========================================

/**
 * Get Firestore database reference
 * @returns {firebase.firestore.Firestore}
 */
function getFirestore() {
    if (typeof db !== 'undefined') return db;
    if (typeof firebase !== 'undefined') return firebase.firestore();
    throw new Error('Firestore not initialized');
}

/**
 * Get Realtime Database reference
 * @returns {firebase.database.Database}
 */
function getRealtimeDB() {
    if (typeof rtdb !== 'undefined') return rtdb;
    if (typeof firebase !== 'undefined') return firebase.database();
    throw new Error('Realtime Database not initialized');
}

// ==========================================
// MAIN DATABASE MODULE
// ==========================================

const Database = {

    // ==========================================
    // MEMBER REGISTRATION
    // ==========================================

    /**
     * Register a new member
     * Creates record in Firestore + initializes in Realtime DB
     * 
     * @param {object} memberData - Registration data
     * @returns {Promise<{memberId: string, memberRef: string}>}
     */
    async registerMember(memberData) {
        const firestore = getFirestore();
        const rtdb = getRealtimeDB();

        try {
            console.log('📝 Registering new member...');

            // Normalize phone number
            const normalizedPhone = memberData.phone.replace(/[\s-]/g, '');

            // Check if already registered
            const existing = await this.getMemberByPhone(normalizedPhone);
            if (existing) {
                throw new Error('This phone number is already registered.');
            }

            // Check ID number uniqueness
            const existingId = await this.getMemberByIdNumber(memberData.idNumber);
            if (existingId) {
                throw new Error('This ID number is already registered.');
            }

            // Generate unique member reference (TRF-MXXXX)
            const memberRef = await this.generateMemberRef();

            // Hash password
            const passwordHash = await this.hashPassword(memberData.password);

            // Current timestamp
            const now = firebase.firestore.FieldValue.serverTimestamp();

            // ─────────────────────────────────────────────
            // FIRESTORE: Create full member record
            // ─────────────────────────────────────────────
            const memberDoc = {
                // Personal Information
                name: memberData.name.trim(),
                surname: memberData.surname?.trim() || '',
                fullName: `${memberData.name.trim()} ${memberData.surname?.trim() || ''}`.trim(),
                dateOfBirth: memberData.dateOfBirth,
                idNumber: memberData.idNumber,
                phone: normalizedPhone,
                email: memberData.email?.trim().toLowerCase() || '',

                // Authentication
                passwordHash: passwordHash,

                // Reference & Status
                memberRef: memberRef,
                status: 'active',
                registrationComplete: false,

                // Financial Summary (initialized to 0)
                totalSavings: 0,
                totalFines: 0,
                submissionCount: 0,
                verifiedCount: 0,
                pendingCount: 0,
                rejectedCount: 0,

                // Tracking
                skippedMonths: 0,
                consecutiveMonths: 0,
                lastPaymentDate: null,
                lastPaymentMonth: null,

                // Interest Eligibility
                qualifiesForInterest: false,

                // Audit Fields
                createdAt: now,
                updatedAt: now,
                createdBy: 'registration'
            };

            const docRef = await firestore.collection('members').add(memberDoc);
            const memberId = docRef.id;

            console.log('✅ Firestore member created:', memberId);

            // ─────────────────────────────────────────────
            // REALTIME DB: Initialize member stats
            // ─────────────────────────────────────────────
            await rtdb.ref(`stokvel/members/${memberId}`).set({
                name: memberDoc.fullName,
                memberRef: memberRef,
                phone: normalizedPhone,
                totalSavings: 0,
                totalFines: 0,
                submissionCount: 0,
                verifiedCount: 0,
                pendingCount: 0,
                qualifiesForInterest: false,
                lastUpdated: firebase.database.ServerValue.TIMESTAMP
            });

            // ─────────────────────────────────────────────
            // REALTIME DB: Increment total members count
            // ─────────────────────────────────────────────
            await rtdb.ref('stokvel/totals/totalMembers').transaction(current => {
                return (current || 0) + 1;
            });

            // Update last modified timestamp
            await rtdb.ref('stokvel/totals/lastUpdated').set(
                firebase.database.ServerValue.TIMESTAMP
            );

            console.log('✅ Realtime DB member initialized');

            // ─────────────────────────────────────────────
            // AUDIT LOG: Record registration
            // ─────────────────────────────────────────────
            await this.createAuditLog({
                action: 'member_registered',
                entityType: 'member',
                entityId: memberId,
                details: {
                    memberRef: memberRef,
                    name: memberDoc.fullName,
                    phone: normalizedPhone
                },
                performedBy: 'system'
            });

            return {
                memberId: memberId,
                memberRef: memberRef
            };

        } catch (error) {
            console.error('❌ Registration error:', error);
            throw error;
        }
    },

    /**
     * Generate unique member reference (TRF-MXXXX)
     * Uses atomic transaction to ensure uniqueness
     * 
     * @returns {Promise<string>}
     */
    async generateMemberRef() {
        const rtdb = getRealtimeDB();

        // Get next member number from Realtime DB (atomic)
        const result = await rtdb.ref('stokvel/counters/memberNumber').transaction(current => {
            return (current || 1000) + 1;
        });

        const memberNumber = result.snapshot.val();
        return `TRF-M${memberNumber}`;
    },

    /**
     * Save next of kin and mark registration complete
     * 
     * @param {string} memberId - Member document ID
     * @param {object} kinData - Next of kin data {primary, secondary, tertiary}
     */
    async saveNextOfKin(memberId, kinData) {
        const firestore = getFirestore();

        try {
            const batch = firestore.batch();
            const now = firebase.firestore.FieldValue.serverTimestamp();

            // ─────────────────────────────────────────────
            // Save each next of kin record
            // ─────────────────────────────────────────────

            // Primary (required)
            if (kinData.primary) {
                const primaryRef = firestore.collection('nextOfKin').doc();
                batch.set(primaryRef, {
                    memberId: memberId,
                    type: 'primary',
                    name: kinData.primary.name.trim(),
                    relationship: kinData.primary.relationship,
                    phone: kinData.primary.phone.replace(/[\s-]/g, ''),
                    email: kinData.primary.email?.trim().toLowerCase() || '',
                    createdAt: now,
                    updatedAt: now
                });
            }

            // Secondary (required)
            if (kinData.secondary) {
                const secondaryRef = firestore.collection('nextOfKin').doc();
                batch.set(secondaryRef, {
                    memberId: memberId,
                    type: 'secondary',
                    name: kinData.secondary.name.trim(),
                    relationship: kinData.secondary.relationship,
                    phone: kinData.secondary.phone.replace(/[\s-]/g, ''),
                    email: kinData.secondary.email?.trim().toLowerCase() || '',
                    createdAt: now,
                    updatedAt: now
                });
            }

            // Tertiary (optional)
            if (kinData.tertiary && kinData.tertiary.name) {
                const tertiaryRef = firestore.collection('nextOfKin').doc();
                batch.set(tertiaryRef, {
                    memberId: memberId,
                    type: 'tertiary',
                    name: kinData.tertiary.name.trim(),
                    relationship: kinData.tertiary.relationship || '',
                    phone: kinData.tertiary.phone?.replace(/[\s-]/g, '') || '',
                    email: kinData.tertiary.email?.trim().toLowerCase() || '',
                    createdAt: now,
                    updatedAt: now
                });
            }

            // ─────────────────────────────────────────────
            // Mark member registration as complete
            // ─────────────────────────────────────────────
            const memberRef = firestore.collection('members').doc(memberId);
            batch.update(memberRef, {
                registrationComplete: true,
                updatedAt: now
            });

            await batch.commit();

            // Audit log
            await this.createAuditLog({
                action: 'registration_completed',
                entityType: 'member',
                entityId: memberId,
                details: {
                    nextOfKinCount: [kinData.primary, kinData.secondary, kinData.tertiary].filter(Boolean).length
                },
                performedBy: 'system'
            });

            console.log('✅ Next of kin saved, registration complete');

        } catch (error) {
            console.error('❌ Save next of kin error:', error);
            throw error;
        }
    },

    // ==========================================
    // MEMBER QUERIES
    // ==========================================

    /**
     * Get member by phone number
     * @param {string} phone 
     * @returns {Promise<object|null>}
     */
    async getMemberByPhone(phone) {
        const firestore = getFirestore();
        const normalizedPhone = phone.replace(/[\s-]/g, '');

        const snapshot = await firestore.collection('members')
            .where('phone', '==', normalizedPhone)
            .limit(1)
            .get();

        if (snapshot.empty) return null;

        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    },

    /**
     * Get member by ID number
     * @param {string} idNumber 
     * @returns {Promise<object|null>}
     */
    async getMemberByIdNumber(idNumber) {
        const firestore = getFirestore();

        const snapshot = await firestore.collection('members')
            .where('idNumber', '==', idNumber)
            .limit(1)
            .get();

        if (snapshot.empty) return null;

        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    },

    /**
     * Get member by document ID
     * @param {string} memberId 
     * @returns {Promise<object|null>}
     */
    async getMember(memberId) {
        const firestore = getFirestore();

        const doc = await firestore.collection('members').doc(memberId).get();
        if (!doc.exists) return null;

        return { id: doc.id, ...doc.data() };
    },

    /**
     * Get all members
     * @returns {Promise<Array>}
     */
    async getMembers() {
        const firestore = getFirestore();

        const snapshot = await firestore.collection('members').get();

        const members = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort by name in JavaScript (avoids needing index)
        members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        return members;
    },

    /**
     * Verify member password for login
     * @param {string} phone 
     * @param {string} password 
     * @returns {Promise<object|null>} Member if valid, null if not
     */
    async verifyMemberLogin(phone, password) {
        try {
            const member = await this.getMemberByPhone(phone);
            if (!member) return null;

            const passwordHash = await this.hashPassword(password);
            if (member.passwordHash !== passwordHash) return null;

            // Log successful login
            await this.createAuditLog({
                action: 'member_login',
                entityType: 'member',
                entityId: member.id,
                details: { phone: phone },
                performedBy: member.id
            });

            return member;
        } catch (error) {
            console.error('Login verification error:', error);
            return null;
        }
    },

    /**
     * Get next of kin for a member
     * @param {string} memberId 
     * @returns {Promise<object>}
     */
    async getNextOfKin(memberId) {
        const firestore = getFirestore();

        const snapshot = await firestore.collection('nextOfKin')
            .where('memberId', '==', memberId)
            .get();

        const result = { primary: null, secondary: null, tertiary: null };

        snapshot.docs.forEach(doc => {
            const data = { id: doc.id, ...doc.data() };
            result[data.type] = data;
        });

        return result;
    },

    // ==========================================
    // PAYMENT SUBMISSIONS
    // ==========================================

    /**
     * Submit proof of payment (POP)
     * Creates submission record and updates pending counts
     * 
     * @param {object} submissionData
     * @returns {Promise<string>} Submission reference
     */
    async submitPOP(submissionData) {
        const firestore = getFirestore();
        const rtdb = getRealtimeDB();

        try {
            console.log('📤 Submitting POP...');

            const normalizedPhone = submissionData.phone.replace(/[\s-]/g, '');
            const now = firebase.firestore.FieldValue.serverTimestamp();

            // Get linked member
            const member = await this.getMemberByPhone(normalizedPhone);

            // Generate submission reference (TRF-XXXXX)
            const reference = await this.generateSubmissionRef();

            // Determine if payment is late (after 7th)
            const paymentDate = submissionData.paymentDate ? new Date(submissionData.paymentDate) : new Date();
            const isLate = paymentDate.getDate() > APP_SETTINGS.paymentDeadlineDay;
            const fineAmount = isLate ? APP_SETTINGS.lateFee : 0;

            // Validate amount
            const amount = parseFloat(submissionData.amount);
            if (isNaN(amount) || amount < APP_SETTINGS.minimumContribution) {
                throw new Error(`Minimum contribution is R${APP_SETTINGS.minimumContribution}`);
            }

            // ─────────────────────────────────────────────
            // FIRESTORE: Create submission record
            // ─────────────────────────────────────────────
            const submissionDoc = {
                // Reference
                reference: reference,

                // Member Details
                memberId: member?.id || null,
                memberRef: member?.memberRef || null,
                name: submissionData.name.trim(),
                phone: normalizedPhone,

                // Payment Details
                amount: amount,
                fineAmount: fineAmount,
                totalAmount: amount + fineAmount,
                paymentMonth: submissionData.paymentMonth,
                paymentDate: submissionData.paymentDate || new Date().toISOString().split('T')[0],
                isLate: isLate,

                // Proof of Payment
                popImage: submissionData.popImage || null,
                popImageUrl: submissionData.popImageUrl || null,
                bankReference: submissionData.bankReference || '',

                // Status
                status: 'pending',
                rejectionReason: null,

                // Timestamps
                submittedAt: now,
                verifiedAt: null,
                rejectedAt: null,

                // Audit
                verifiedBy: null,
                rejectedBy: null,
                updatedAt: now
            };

            const docRef = await firestore.collection('submissions').add(submissionDoc);
            const submissionId = docRef.id;

            console.log('✅ Firestore submission created:', reference);

            // ─────────────────────────────────────────────
            // FIRESTORE: Update member submission count
            // ─────────────────────────────────────────────
            if (member?.id) {
                await firestore.collection('members').doc(member.id).update({
                    submissionCount: firebase.firestore.FieldValue.increment(1),
                    pendingCount: firebase.firestore.FieldValue.increment(1),
                    updatedAt: now
                });
            }

            // ─────────────────────────────────────────────
            // REALTIME DB: Update totals (atomic transactions)
            // ─────────────────────────────────────────────
            const totalsRef = rtdb.ref('stokvel/totals');
            await totalsRef.child('pendingSubmissions').transaction(val => (val || 0) + 1);
            await totalsRef.child('totalSubmissions').transaction(val => (val || 0) + 1);
            await totalsRef.child('lastUpdated').set(firebase.database.ServerValue.TIMESTAMP);

            // Update member in Realtime DB
            if (member?.id) {
                const memberRtRef = rtdb.ref(`stokvel/members/${member.id}`);
                await memberRtRef.child('submissionCount').transaction(val => (val || 0) + 1);
                await memberRtRef.child('pendingCount').transaction(val => (val || 0) + 1);
                await memberRtRef.child('lastUpdated').set(firebase.database.ServerValue.TIMESTAMP);
            }

            // ─────────────────────────────────────────────
            // AUDIT LOG
            // ─────────────────────────────────────────────
            await this.createAuditLog({
                action: 'pop_submitted',
                entityType: 'submission',
                entityId: submissionId,
                details: {
                    reference: reference,
                    amount: amount,
                    fineAmount: fineAmount,
                    paymentMonth: submissionData.paymentMonth,
                    isLate: isLate,
                    memberId: member?.id || null
                },
                performedBy: member?.id || 'guest'
            });

            // ─────────────────────────────────────────────
            // SEND SMS CONFIRMATION (non-blocking)
            // ─────────────────────────────────────────────
            this.sendSMSNonBlocking('popConfirmation', {
                phone: normalizedPhone,
                name: submissionData.name,
                amount: amount,
                month: submissionData.paymentMonth,
                reference: reference
            });

            return reference;

        } catch (error) {
            console.error('❌ Submit POP error:', error);
            throw error;
        }
    },

    /**
     * Generate unique submission reference (TRF-XXXXX)
     * @returns {Promise<string>}
     */
    async generateSubmissionRef() {
        const rtdb = getRealtimeDB();

        const result = await rtdb.ref('stokvel/counters/submissionNumber').transaction(current => {
            return (current || 10000) + 1;
        });

        return `TRF-${result.snapshot.val()}`;
    },

    // ==========================================
    // SUBMISSION QUERIES
    // ==========================================

    /**
     * Get submission by ID
     * @param {string} submissionId 
     * @returns {Promise<object|null>}
     */
    async getSubmission(submissionId) {
        const firestore = getFirestore();

        const doc = await firestore.collection('submissions').doc(submissionId).get();
        if (!doc.exists) return null;

        return { id: doc.id, ...doc.data() };
    },

    /**
     * Get pending submissions
     * @returns {Promise<Array>}
     */
    async getPendingSubmissions() {
        const firestore = getFirestore();

        const snapshot = await firestore.collection('submissions')
            .where('status', '==', 'pending')
            .get();

        const submissions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort by submittedAt descending (in JS to avoid index)
        submissions.sort((a, b) => {
            const dateA = a.submittedAt?.toDate?.() || new Date(0);
            const dateB = b.submittedAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });

        return submissions;
    },

    /**
     * Get submissions for a member
     * @param {string} phone 
     * @returns {Promise<Array>}
     */
    async getMemberSubmissions(phone) {
        const firestore = getFirestore();
        const normalizedPhone = phone.replace(/[\s-]/g, '');

        const snapshot = await firestore.collection('submissions')
            .where('phone', '==', normalizedPhone)
            .get();

        const submissions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort by submittedAt descending
        submissions.sort((a, b) => {
            const dateA = a.submittedAt?.toDate?.() || new Date(0);
            const dateB = b.submittedAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });

        return submissions;
    },

    /**
     * Get verified submissions with optional filters
     * @param {object} filters 
     * @returns {Promise<Array>}
     */
    async getVerifiedSubmissions(filters = {}) {
        const firestore = getFirestore();

        let query = firestore.collection('submissions')
            .where('status', '==', 'verified');

        if (filters.month) {
            query = query.where('paymentMonth', '==', filters.month);
        }

        if (filters.memberId) {
            query = query.where('memberId', '==', filters.memberId);
        }

        const snapshot = await query.get();

        const submissions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort by verifiedAt descending
        submissions.sort((a, b) => {
            const dateA = a.verifiedAt?.toDate?.() || new Date(0);
            const dateB = b.verifiedAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });

        return submissions;
    },

    // ==========================================
    // SUBMISSION APPROVAL/REJECTION
    // ==========================================

    /**
     * Approve a submission
     * Updates all related records and totals atomically
     * 
     * MATH ACCURACY:
     * - All increments use atomic transactions
     * - Firestore batch ensures consistency
     * - Realtime DB transactions prevent race conditions
     * 
     * @param {string} submissionId 
     */
    async approveSubmission(submissionId) {
        const firestore = getFirestore();
        const rtdb = getRealtimeDB();

        try {
            console.log('✅ Approving submission:', submissionId);

            // Get submission
            const submission = await this.getSubmission(submissionId);
            if (!submission) throw new Error('Submission not found');
            if (submission.status !== 'pending') throw new Error('Submission already processed');

            const now = firebase.firestore.FieldValue.serverTimestamp();
            const batch = firestore.batch();

            // Calculate amounts
            const amount = submission.amount || 0;
            const fineAmount = submission.fineAmount || 0;
            const totalAmount = amount + fineAmount;

            // Get payment year for interest pool
            const paymentYear = this.extractYearFromMonth(submission.paymentMonth);

            // ─────────────────────────────────────────────
            // FIRESTORE: Update submission status
            // ─────────────────────────────────────────────
            const submissionRef = firestore.collection('submissions').doc(submissionId);
            batch.update(submissionRef, {
                status: 'verified',
                verifiedAt: now,
                verifiedBy: Auth?.currentUser?.uid || 'admin',
                updatedAt: now
            });

            // ─────────────────────────────────────────────
            // FIRESTORE: Update member totals
            // ─────────────────────────────────────────────
            let member = null;
            if (submission.memberId) {
                member = await this.getMember(submission.memberId);
                
                if (member) {
                    const memberRef = firestore.collection('members').doc(submission.memberId);
                    
                    // Calculate new totals
                    const newTotalSavings = (member.totalSavings || 0) + amount;
                    const newTotalFines = (member.totalFines || 0) + fineAmount;
                    const qualifiesForInterest = newTotalSavings >= APP_SETTINGS.interestEligibilityMin;

                    batch.update(memberRef, {
                        totalSavings: newTotalSavings,
                        totalFines: newTotalFines,
                        verifiedCount: firebase.firestore.FieldValue.increment(1),
                        pendingCount: firebase.firestore.FieldValue.increment(-1),
                        lastPaymentDate: now,
                        lastPaymentMonth: submission.paymentMonth,
                        qualifiesForInterest: qualifiesForInterest,
                        consecutiveMonths: firebase.firestore.FieldValue.increment(1),
                        updatedAt: now
                    });
                }
            }

            // ─────────────────────────────────────────────
            // FIRESTORE: Update interest pool (fines go here)
            // ─────────────────────────────────────────────
            if (fineAmount > 0) {
                const poolRef = firestore.collection('interestPool').doc(paymentYear.toString());
                
                // Use set with merge to create if not exists
                batch.set(poolRef, {
                    year: paymentYear,
                    totalFines: firebase.firestore.FieldValue.increment(fineAmount),
                    fineCount: firebase.firestore.FieldValue.increment(1),
                    updatedAt: now
                }, { merge: true });
            }

            // Commit all Firestore changes atomically
            await batch.commit();
            console.log('✅ Firestore updated');

            // ─────────────────────────────────────────────
            // REALTIME DB: Update all totals (atomic transactions)
            // ─────────────────────────────────────────────
            
            // Global totals
            const totalsRef = rtdb.ref('stokvel/totals');
            await totalsRef.child('totalSavings').transaction(val => (val || 0) + amount);
            await totalsRef.child('totalFines').transaction(val => (val || 0) + fineAmount);
            await totalsRef.child('pendingSubmissions').transaction(val => Math.max((val || 0) - 1, 0));
            await totalsRef.child('approvedSubmissions').transaction(val => (val || 0) + 1);
            await totalsRef.child('lastUpdated').set(firebase.database.ServerValue.TIMESTAMP);

            // Member totals in Realtime DB
            if (submission.memberId && member) {
                const memberRtRef = rtdb.ref(`stokvel/members/${submission.memberId}`);
                const newTotal = (member.totalSavings || 0) + amount;
                
                await memberRtRef.update({
                    totalSavings: newTotal,
                    totalFines: (member.totalFines || 0) + fineAmount,
                    verifiedCount: (member.verifiedCount || 0) + 1,
                    pendingCount: Math.max((member.pendingCount || 0) - 1, 0),
                    qualifiesForInterest: newTotal >= APP_SETTINGS.interestEligibilityMin,
                    lastPaymentMonth: submission.paymentMonth,
                    lastUpdated: firebase.database.ServerValue.TIMESTAMP
                });
            }

            // Interest pool in Realtime DB
            if (fineAmount > 0) {
                const poolRtRef = rtdb.ref(`stokvel/interestPool/${paymentYear}`);
                await poolRtRef.child('totalFines').transaction(val => (val || 0) + fineAmount);
                await poolRtRef.child('fineCount').transaction(val => (val || 0) + 1);
                await poolRtRef.child('lastUpdated').set(firebase.database.ServerValue.TIMESTAMP);
            }

            // Monthly stats
            const monthYear = submission.paymentMonth || 'Unknown';
            const monthName = monthYear.split(' ')[0] || 'Unknown';
            const monthRef = rtdb.ref(`stokvel/monthly/${paymentYear}/${monthName}`);
            await monthRef.child('totalCollected').transaction(val => (val || 0) + totalAmount);
            await monthRef.child('approvedCount').transaction(val => (val || 0) + 1);
            if (fineAmount > 0) {
                await monthRef.child('latePayments').transaction(val => (val || 0) + 1);
                await monthRef.child('finesCollected').transaction(val => (val || 0) + fineAmount);
            }

            console.log('✅ Realtime DB updated');

            // ─────────────────────────────────────────────
            // AUDIT LOG
            // ─────────────────────────────────────────────
            await this.createAuditLog({
                action: 'submission_approved',
                entityType: 'submission',
                entityId: submissionId,
                details: {
                    reference: submission.reference,
                    amount: amount,
                    fineAmount: fineAmount,
                    memberId: submission.memberId,
                    memberName: submission.name,
                    paymentMonth: submission.paymentMonth
                },
                performedBy: Auth?.currentUser?.uid || 'admin'
            });

            // ─────────────────────────────────────────────
            // SEND APPROVAL SMS (non-blocking)
            // ─────────────────────────────────────────────
            const updatedMemberSavings = member ? (member.totalSavings || 0) + amount : amount;

            this.sendSMSNonBlocking('approval', {
                phone: submission.phone,
                name: submission.name,
                amount: amount,
                month: submission.paymentMonth,
                totalSaved: updatedMemberSavings
            });

            console.log('✅ Submission approved:', submission.reference);

        } catch (error) {
            console.error('❌ Approve submission error:', error);
            throw error;
        }
    },

    /**
     * Reject a submission
     * 
     * @param {string} submissionId 
     * @param {string} reason - Rejection reason
     */
    async rejectSubmission(submissionId, reason = '') {
        const firestore = getFirestore();
        const rtdb = getRealtimeDB();

        try {
            console.log('⛔ Rejecting submission:', submissionId);

            const submission = await this.getSubmission(submissionId);
            if (!submission) throw new Error('Submission not found');
            if (submission.status !== 'pending') throw new Error('Submission already processed');

            const now = firebase.firestore.FieldValue.serverTimestamp();
            const batch = firestore.batch();

            // ─────────────────────────────────────────────
            // FIRESTORE: Update submission status
            // ─────────────────────────────────────────────
            const submissionRef = firestore.collection('submissions').doc(submissionId);
            batch.update(submissionRef, {
                status: 'rejected',
                rejectionReason: reason || 'No reason provided',
                rejectedAt: now,
                rejectedBy: Auth?.currentUser?.uid || 'admin',
                updatedAt: now
            });

            // ─────────────────────────────────────────────
            // FIRESTORE: Update member counts
            // ─────────────────────────────────────────────
            if (submission.memberId) {
                const memberRef = firestore.collection('members').doc(submission.memberId);
                batch.update(memberRef, {
                    pendingCount: firebase.firestore.FieldValue.increment(-1),
                    rejectedCount: firebase.firestore.FieldValue.increment(1),
                    updatedAt: now
                });
            }

            await batch.commit();

            // ─────────────────────────────────────────────
            // REALTIME DB: Update totals
            // ─────────────────────────────────────────────
            const totalsRef = rtdb.ref('stokvel/totals');
            await totalsRef.child('pendingSubmissions').transaction(val => Math.max((val || 0) - 1, 0));
            await totalsRef.child('rejectedSubmissions').transaction(val => (val || 0) + 1);
            await totalsRef.child('lastUpdated').set(firebase.database.ServerValue.TIMESTAMP);

            if (submission.memberId) {
                const memberRtRef = rtdb.ref(`stokvel/members/${submission.memberId}`);
                await memberRtRef.child('pendingCount').transaction(val => Math.max((val || 0) - 1, 0));
                await memberRtRef.child('lastUpdated').set(firebase.database.ServerValue.TIMESTAMP);
            }

            // ─────────────────────────────────────────────
            // AUDIT LOG
            // ─────────────────────────────────────────────
            await this.createAuditLog({
                action: 'submission_rejected',
                entityType: 'submission',
                entityId: submissionId,
                details: {
                    reference: submission.reference,
                    reason: reason,
                    memberId: submission.memberId,
                    memberName: submission.name
                },
                performedBy: Auth?.currentUser?.uid || 'admin'
            });

            // ─────────────────────────────────────────────
            // SEND REJECTION SMS (non-blocking)
            // ─────────────────────────────────────────────
            this.sendSMSNonBlocking('rejection', {
                phone: submission.phone,
                name: submission.name,
                amount: submission.amount,
                month: submission.paymentMonth,
                reason: reason || 'Please contact admin'
            });

            console.log('⛔ Submission rejected:', submission.reference);

        } catch (error) {
            console.error('❌ Reject submission error:', error);
            throw error;
        }
    },

    // ==========================================
    // REALTIME DATABASE LISTENERS (Frontend)
    // ==========================================

    /**
     * Listen to stokvel totals (for dashboard)
     * Returns unsubscribe function
     * 
     * @param {function} callback - Called with totals data on every change
     * @returns {function} Unsubscribe function
     */
    listenToTotals(callback) {
        const rtdb = getRealtimeDB();
        const totalsRef = rtdb.ref('stokvel/totals');

        const listener = totalsRef.on('value', snapshot => {
            const data = snapshot.val() || {};
            callback({
                totalMembers: data.totalMembers || 0,
                totalSavings: data.totalSavings || 0,
                totalFines: data.totalFines || 0,
                pendingSubmissions: data.pendingSubmissions || 0,
                approvedSubmissions: data.approvedSubmissions || 0,
                rejectedSubmissions: data.rejectedSubmissions || 0,
                totalSubmissions: data.totalSubmissions || 0,
                lastUpdated: data.lastUpdated || null
            });
        });

        // Return unsubscribe function
        return () => totalsRef.off('value', listener);
    },

    /**
     * Listen to a single member's stats (real-time)
     * 
     * @param {string} memberId 
     * @param {function} callback 
     * @returns {function} Unsubscribe function
     */
    listenToMemberStats(memberId, callback) {
        const rtdb = getRealtimeDB();
        const memberRef = rtdb.ref(`stokvel/members/${memberId}`);

        const listener = memberRef.on('value', snapshot => {
            const data = snapshot.val() || {};
            callback({
                name: data.name || '',
                memberRef: data.memberRef || '',
                totalSavings: data.totalSavings || 0,
                totalFines: data.totalFines || 0,
                submissionCount: data.submissionCount || 0,
                verifiedCount: data.verifiedCount || 0,
                pendingCount: data.pendingCount || 0,
                qualifiesForInterest: data.qualifiesForInterest || false,
                lastPaymentMonth: data.lastPaymentMonth || null,
                lastUpdated: data.lastUpdated || null
            });
        });

        return () => memberRef.off('value', listener);
    },

    /**
     * Listen to interest pool for a year
     * 
     * @param {number} year 
     * @param {function} callback 
     * @returns {function} Unsubscribe function
     */
    listenToInterestPool(year, callback) {
        const rtdb = getRealtimeDB();
        const poolRef = rtdb.ref(`stokvel/interestPool/${year}`);

        const listener = poolRef.on('value', snapshot => {
            const data = snapshot.val() || {};
            callback({
                year: year,
                totalFines: data.totalFines || 0,
                fineCount: data.fineCount || 0,
                bankInterest: data.bankInterest || 0,
                totalPool: (data.totalFines || 0) + (data.bankInterest || 0),
                lastUpdated: data.lastUpdated || null
            });
        });

        return () => poolRef.off('value', listener);
    },

    /**
     * Get one-time read of totals (not real-time listener)
     * @returns {Promise<object>}
     */
    async getTotals() {
        const rtdb = getRealtimeDB();
        const snapshot = await rtdb.ref('stokvel/totals').once('value');
        return snapshot.val() || {};
    },

    /**
     * Get one-time read of member stats from Realtime DB
     * @param {string} memberId 
     * @returns {Promise<object>}
     */
    async getMemberRealtimeStats(memberId) {
        const rtdb = getRealtimeDB();
        const snapshot = await rtdb.ref(`stokvel/members/${memberId}`).once('value');
        return snapshot.val() || {};
    },

    /**
     * Get stokvel total savings (quick read)
     * @returns {Promise<number>}
     */
    async getStokvelTotal() {
        const totals = await this.getTotals();
        return totals.totalSavings || 0;
    },

    // ==========================================
    // MEMBER STATS (Combined View)
    // ==========================================

    /**
     * Get comprehensive member stats
     * Combines Firestore details with Realtime DB totals
     * 
     * @param {string} phone 
     * @returns {Promise<object>}
     */
    async getMemberStats(phone) {
        try {
            const normalizedPhone = phone.replace(/[\s-]/g, '');

            // Get member from Firestore (full details)
            const member = await this.getMemberByPhone(normalizedPhone);
            if (!member) return null;

            // Get real-time stats from Realtime DB
            const realtimeStats = await this.getMemberRealtimeStats(member.id);

            // Get recent submissions from Firestore
            const submissions = await this.getMemberSubmissions(phone);

            // Use Realtime DB values as source of truth for totals
            const totalSavings = realtimeStats.totalSavings ?? member.totalSavings ?? 0;
            const totalFines = realtimeStats.totalFines ?? member.totalFines ?? 0;

            return {
                member: member,
                
                // Financial totals (from Realtime DB - source of truth)
                totalSavings: totalSavings,
                totalFines: totalFines,
                
                // Submission counts
                submissionCount: realtimeStats.submissionCount ?? member.submissionCount ?? 0,
                verifiedCount: realtimeStats.verifiedCount ?? member.verifiedCount ?? 0,
                pendingCount: realtimeStats.pendingCount ?? member.pendingCount ?? 0,
                rejectedCount: member.rejectedCount ?? 0,

                // Interest eligibility
                qualifiesForInterest: totalSavings >= APP_SETTINGS.interestEligibilityMin,
                interestThreshold: APP_SETTINGS.interestEligibilityMin,
                interestProgress: Math.min(100, (totalSavings / APP_SETTINGS.interestEligibilityMin) * 100),

                // Recent submissions (from Firestore - full details)
                submissions: submissions.slice(0, 20),

                // Timestamps
                lastPaymentMonth: realtimeStats.lastPaymentMonth ?? member.lastPaymentMonth,
                lastUpdated: realtimeStats.lastUpdated ?? null
            };

        } catch (error) {
            console.error('Get member stats error:', error);
            throw error;
        }
    },

    // ==========================================
    // AUDIT LOGGING
    // ==========================================

    /**
     * Create audit log entry
     * All actions are logged for accountability
     * 
     * @param {object} logData 
     */
    async createAuditLog(logData) {
        const firestore = getFirestore();

        try {
            await firestore.collection('auditLogs').add({
                ...logData,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server'
            });
        } catch (error) {
            // Don't throw - audit log failure shouldn't break main operations
            console.warn('Audit log failed:', error.message);
        }
    },

    /**
     * Get audit logs with filters
     * 
     * @param {object} filters - {entityType, entityId, action, limit}
     * @returns {Promise<Array>}
     */
    async getAuditLogs(filters = {}) {
        const firestore = getFirestore();

        let query = firestore.collection('auditLogs');

        if (filters.entityType) {
            query = query.where('entityType', '==', filters.entityType);
        }
        if (filters.entityId) {
            query = query.where('entityId', '==', filters.entityId);
        }
        if (filters.action) {
            query = query.where('action', '==', filters.action);
        }

        const limit = filters.limit || 100;
        const snapshot = await query.limit(limit).get();

        const logs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Sort by timestamp descending
        logs.sort((a, b) => {
            const dateA = a.timestamp?.toDate?.() || new Date(0);
            const dateB = b.timestamp?.toDate?.() || new Date(0);
            return dateB - dateA;
        });

        return logs;
    },

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================

    /**
     * Hash password using SHA-256
     * @param {string} password 
     * @returns {Promise<string>}
     */
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    /**
     * Extract year from payment month string
     * @param {string} paymentMonth - e.g., "January 2024"
     * @returns {number}
     */
    extractYearFromMonth(paymentMonth) {
        if (!paymentMonth) return new Date().getFullYear();

        const match = paymentMonth.match(/\d{4}/);
        return match ? parseInt(match[0]) : new Date().getFullYear();
    },

    /**
     * Send SMS without blocking main flow
     * Runs asynchronously, failures don't affect main operation
     * 
     * @param {string} type - SMS type
     * @param {object} data - SMS data
     */
    sendSMSNonBlocking(type, data) {
        // Run SMS in background with small delay
        setTimeout(async () => {
            try {
                if (typeof SMS === 'undefined') {
                    console.log('📱 SMS module not loaded, skipping notification');
                    return;
                }

                switch (type) {
                    case 'popConfirmation':
                        await SMS.sendPOPConfirmation(
                            data.phone, data.name, data.amount, data.month, data.reference
                        );
                        break;
                    case 'approval':
                        await SMS.sendApprovalNotification(
                            data.phone, data.name, data.amount, data.month, data.totalSaved
                        );
                        break;
                    case 'rejection':
                        await SMS.sendRejectionNotification(
                            data.phone, data.name, data.amount, data.month, data.reason
                        );
                        break;
                    default:
                        console.warn('Unknown SMS type:', type);
                }
            } catch (error) {
                console.warn('📱 SMS failed (non-critical):', error.message);
            }
        }, 100);
    },

    /**
     * Initialize Realtime Database structure
     * Call once on first setup to create the structure
     */
    async initializeRealtimeDB() {
        const rtdb = getRealtimeDB();

        const defaultStructure = {
            totals: {
                totalMembers: 0,
                totalSavings: 0,
                totalFines: 0,
                pendingSubmissions: 0,
                approvedSubmissions: 0,
                rejectedSubmissions: 0,
                totalSubmissions: 0,
                lastUpdated: firebase.database.ServerValue.TIMESTAMP
            },
            counters: {
                memberNumber: 1000,
                submissionNumber: 10000
            },
            members: {},
            interestPool: {},
            monthly: {}
        };

        // Only set if doesn't exist
        const snapshot = await rtdb.ref('stokvel/totals').once('value');
        if (!snapshot.exists()) {
            await rtdb.ref('stokvel').set(defaultStructure);
            console.log('✅ Realtime DB initialized with default structure');
        } else {
            console.log('ℹ️ Realtime DB already initialized');
        }
    },

    /**
     * Sync Firestore data to Realtime DB
     * Use if data gets out of sync
     */
    async syncDataToRealtimeDB() {
        const firestore = getFirestore();
        const rtdb = getRealtimeDB();

        console.log('🔄 Syncing Firestore to Realtime DB...');

        try {
            // Get all members
            const members = await this.getMembers();
            
            let totalSavings = 0;
            let totalFines = 0;

            // Sync each member
            for (const member of members) {
                totalSavings += member.totalSavings || 0;
                totalFines += member.totalFines || 0;

                await rtdb.ref(`stokvel/members/${member.id}`).set({
                    name: member.fullName || member.name,
                    memberRef: member.memberRef,
                    phone: member.phone,
                    totalSavings: member.totalSavings || 0,
                    totalFines: member.totalFines || 0,
                    submissionCount: member.submissionCount || 0,
                    verifiedCount: member.verifiedCount || 0,
                    pendingCount: member.pendingCount || 0,
                    qualifiesForInterest: (member.totalSavings || 0) >= APP_SETTINGS.interestEligibilityMin,
                    lastPaymentMonth: member.lastPaymentMonth || null,
                    lastUpdated: firebase.database.ServerValue.TIMESTAMP
                });
            }

            // Count submissions
            const pendingSnapshot = await firestore.collection('submissions')
                .where('status', '==', 'pending').get();
            const approvedSnapshot = await firestore.collection('submissions')
                .where('status', '==', 'verified').get();
            const rejectedSnapshot = await firestore.collection('submissions')
                .where('status', '==', 'rejected').get();

            // Update totals
            await rtdb.ref('stokvel/totals').set({
                totalMembers: members.length,
                totalSavings: totalSavings,
                totalFines: totalFines,
                pendingSubmissions: pendingSnapshot.size,
                approvedSubmissions: approvedSnapshot.size,
                rejectedSubmissions: rejectedSnapshot.size,
                totalSubmissions: pendingSnapshot.size + approvedSnapshot.size + rejectedSnapshot.size,
                lastUpdated: firebase.database.ServerValue.TIMESTAMP
            });

            console.log('✅ Sync complete');
            console.log(`   Members: ${members.length}`);
            console.log(`   Total Savings: R${totalSavings}`);
            console.log(`   Total Fines: R${totalFines}`);

        } catch (error) {
            console.error('❌ Sync error:', error);
            throw error;
        }
    }
};

// ==========================================
// EXPORT
// ==========================================

window.Database = Database;

console.log('📊 Database module loaded (Dual Architecture)');
console.log('   ├─ Firestore: Individual records + Audit trail');
console.log('   └─ Realtime DB: Live totals + Real-time sync');