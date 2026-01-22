/**
 * =====================================================
 * TSHIKOTA RO FARANA - FIREBASE CONFIGURATION
 * =====================================================
 * 
 * Firebase project configuration and app settings.
 * 
 * DUAL DATABASE ARCHITECTURE:
 * - Firestore: Individual records, audit trails, complex queries
 * - Realtime Database: Live totals, real-time sync to frontend
 * 
 * IMPORTANT: 
 * - This uses Firebase Spark (free) plan
 * - No Firebase Storage (images stored as base64 in Firestore)
 * - Anonymous auth for member/submission access
 * 
 * =====================================================
 */

// Firebase configuration
// ⚠️ UPDATE THESE VALUES with your actual Firebase project config
const firebaseConfig = {
    apiKey: "AIzaSyC1lP0F8d4A5M0hOlr-dKw5V9Y8Z6X7W2U",
    authDomain: "tahikota-stockvel.firebaseapp.com",
    projectId: "tahikota-stockvel",
    storageBucket: "tahikota-stockvel.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456789012",
    // REALTIME DATABASE URL - Required for real-time totals
    databaseURL: "https://tahikota-stockvel-default-rtdb.firebaseio.com"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// ==========================================
// FIRESTORE (Individual Records + Audit)
// ==========================================
const db = firebase.firestore();

// Enable offline persistence (helps with slow connections)
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code === 'unimplemented') {
            console.warn('Persistence not supported by browser');
        }
    });

// ==========================================
// REALTIME DATABASE (Live Totals + Stats)
// ==========================================
const rtdb = firebase.database();

// ==========================================
// AUTHENTICATION
// ==========================================
const auth = firebase.auth();

/**
 * ==========================================
 * APP SETTINGS
 * ==========================================
 * 
 * Business rules and configuration for the stokvel.
 * All monetary values in South African Rands (ZAR).
 */
const APP_SETTINGS = {
    // Stokvel name
    stokvelName: "Tshikota Ro Farana",
    
    // Payment rules
    minimumDeposit: 300,            // Minimum R300 per month
    lateFineAmount: 50,             // R50 late fee
    paymentDueDay: 7,               // Due by 7th of each month
    
    // Interest eligibility
    interestEligibilityMin: 10000,  // R10,000 minimum to qualify for interest
    
    // Member rules
    maxSkippedMonths: 3,            // Suspend after 3 missed months
    
    // Banking details (for display)
    bankingDetails: {
        bankName: "FNB",
        accountName: "Tshikota Ro Farana",
        accountNumber: "63190192880",
        branchCode: "250655",
        reference: "Name + Month"
    },
    
    // File upload limits
    maxFileSize: 15 * 1024 * 1024,  // 15MB max upload
    maxBase64Size: 800 * 1024,      // 800KB max after compression
    
    // Session timeouts
    adminSessionTimeout: 24 * 60 * 60 * 1000,    // 24 hours
    memberSessionTimeout: 30 * 60 * 1000,         // 30 minutes
    
    // Reference code prefix
    referencePrefix: "TRF-",
    memberRefPrefix: "TRF-M",
    
    // South African specific
    currency: "ZAR",
    currencySymbol: "R",
    locale: "en-ZA",
    timezone: "Africa/Johannesburg",
    
    // SA phone format
    phoneCountryCode: "+27",
    phoneFormat: "0XX XXX XXXX",
    
    // Interest rates (South African Prime Rate reference)
    // Note: Actual interest comes from fines + bank interest on savings
    saPrimeRate: 11.75,  // As of 2024, for reference
    
    // Admin settings
    defaultAdminCode: "TSHIKOTA2024"  // Change this in production!
};

/**
 * ==========================================
 * SOUTH AFRICAN FINANCIAL HELPERS
 * ==========================================
 */

const SAFinance = {
    /**
     * Format amount as South African Rands
     * 
     * @param {number} amount - Amount in cents or rands
     * @param {boolean} includeSymbol - Whether to include R symbol
     * @returns {string} Formatted amount
     */
    formatRands(amount, includeSymbol = true) {
        const formatter = new Intl.NumberFormat('en-ZA', {
            style: includeSymbol ? 'currency' : 'decimal',
            currency: 'ZAR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return formatter.format(amount);
    },
    
    /**
     * Calculate late fee based on payment date
     * 
     * @param {Date} paymentDate - Date of payment
     * @returns {number} Fine amount (0 or R50)
     */
    calculateLateFee(paymentDate) {
        const day = paymentDate.getDate();
        return day > APP_SETTINGS.paymentDueDay ? APP_SETTINGS.lateFineAmount : 0;
    },
    
    /**
     * Check if member qualifies for interest
     * 
     * @param {number} totalSavings - Member's total savings
     * @returns {boolean} Whether member qualifies
     */
    qualifiesForInterest(totalSavings) {
        return totalSavings >= APP_SETTINGS.interestEligibilityMin;
    },
    
    /**
     * Calculate interest share for a member
     * 
     * @param {number} totalPool - Total interest pool amount
     * @param {number} qualifyingMembers - Number of qualifying members
     * @returns {number} Share per member
     */
    calculateInterestShare(totalPool, qualifyingMembers) {
        if (qualifyingMembers === 0) return 0;
        return Math.floor(totalPool / qualifyingMembers);
    },
    
    /**
     * Validate South African ID number
     * Uses Luhn algorithm for checksum
     * 
     * @param {string} idNumber - 13-digit SA ID
     * @returns {boolean} Whether ID is valid
     */
    validateSAID(idNumber) {
        if (!/^\d{13}$/.test(idNumber)) return false;
        
        // Luhn algorithm
        let sum = 0;
        for (let i = 0; i < 13; i++) {
            let digit = parseInt(idNumber[i]);
            if (i % 2 === 1) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            sum += digit;
        }
        
        return sum % 10 === 0;
    },
    
    /**
     * Extract date of birth from SA ID number
     * 
     * @param {string} idNumber - 13-digit SA ID
     * @returns {Date|null} Date of birth or null if invalid
     */
    getDOBFromID(idNumber) {
        if (!this.validateSAID(idNumber)) return null;
        
        const year = parseInt(idNumber.substring(0, 2));
        const month = parseInt(idNumber.substring(2, 4)) - 1;
        const day = parseInt(idNumber.substring(4, 6));
        
        // Determine century (assume 2000s if year <= current year, else 1900s)
        const currentYear = new Date().getFullYear() % 100;
        const fullYear = year <= currentYear ? 2000 + year : 1900 + year;
        
        return new Date(fullYear, month, day);
    },
    
    /**
     * Get gender from SA ID number
     * 
     * @param {string} idNumber - 13-digit SA ID
     * @returns {string} 'male', 'female', or 'unknown'
     */
    getGenderFromID(idNumber) {
        if (!/^\d{13}$/.test(idNumber)) return 'unknown';
        
        const genderDigits = parseInt(idNumber.substring(6, 10));
        return genderDigits >= 5000 ? 'male' : 'female';
    }
};

// Export settings, databases and helpers
window.APP_SETTINGS = APP_SETTINGS;
window.SAFinance = SAFinance;
window.db = db;
window.rtdb = rtdb;
window.auth = auth;

console.log('🔥 Firebase initialized for', APP_SETTINGS.stokvelName);
console.log('   ├─ Firestore: ✅ Individual records + Audit');
console.log('   ├─ Realtime DB: ✅ Live totals + Stats');
console.log('   └─ Auth: ✅ Anonymous authentication');