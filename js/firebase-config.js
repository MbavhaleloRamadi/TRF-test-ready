/**
 * TSHIKOTA RO FARANA - FIREBASE CONFIGURATION
 * Using Firebase Compat SDK (works with the app code)
 */

// Firebase configuration - YOUR REAL CREDENTIALS
const firebaseConfig = {
    apiKey: "AIzaSyBCZvf-MS1TYvVYUlDM5oP0plB3uMVf8w4",
    authDomain: "tahikota-stockvel.firebaseapp.com",
    databaseURL: "https://tahikota-stockvel-default-rtdb.firebaseio.com",
    projectId: "tahikota-stockvel",
    storageBucket: "tahikota-stockvel.firebasestorage.app",
    messagingSenderId: "347024813982",
    appId: "1:347024813982:web:3f9d03b20e58dbfd15308f",
    measurementId: "G-1PFRPQXZ9P"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Initialize Realtime Database
const rtdb = firebase.database();

// Initialize Auth
const auth = firebase.auth();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        console.warn('Persistence:', err.code);
    });

// App Settings
const APP_SETTINGS = {
    stokvelName: "Tshikota Ro Farana",
    minimumDeposit: 300,
    lateFineAmount: 50,
    paymentDueDay: 7,
    interestEligibilityMin: 10000,
    bankingDetails: {
        bankName: "FNB",
        accountName: "Tshikota Ro Farana",
        accountNumber: "63190192880",
        branchCode: "250655",
        reference: "Name + Month"
    },
    currency: "ZAR",
    currencySymbol: "R"
};

// Export to window
window.APP_SETTINGS = APP_SETTINGS;
window.db = db;
window.rtdb = rtdb;
window.auth = auth;

console.log('🔥 Firebase initialized for', APP_SETTINGS.stokvelName);