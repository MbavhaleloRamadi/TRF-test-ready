# 🏦 Tshikota Ro Farana Stokvel - Updated Application

A South African stokvel (savings club) management web application with member registration, payment tracking, and SMS notifications.

## 📋 What's New in This Update

### New Features
1. **Separate Registration System** (`register.html` + `register-kin.html`)
   - Self-service member registration via shareable link
   - Personal details: Name, Surname, DOB, ID Number, Phone, Email
   - Next of kin form: Primary (required), Secondary (required), Tertiary (optional)
   - SA ID validation using Luhn algorithm
   - SMS confirmation on successful registration

2. **SMS Notifications** (`js/sms.js`)
   - Registration confirmation
   - POP submission confirmation
   - Payment approval/rejection notifications
   - Password reset OTP
   - Supports multiple SA SMS providers (BulkSMS, Clickatell, Africa's Talking)

3. **Password-Based Login** (`view-account.html`)
   - Phone + password authentication (replaces name + phone lookup)
   - Forgot password with SMS OTP
   - Secure password hashing

4. **15MB File Upload Support** (`js/storage.js`)
   - Increased from 2MB to 15MB input
   - Aggressive compression to fit Firestore limits
   - Progressive quality reduction for large images

### Bug Fixes
- ✅ `submissionCount` now properly increments on approval
- ✅ `totalSubmissions` included in dashboard stats
- ✅ `interestPool` uses payment year (not current year)
- ✅ Dashboard stats include interest pool amount
- ✅ Member data consistency improvements

---

## 📁 File Structure

```
tshikota-update/
├── css/
│   ├── styles.css          # Main styles
│   └── components.css      # UI components
├── js/
│   ├── firebase-config.js  # Firebase setup + APP_SETTINGS
│   ├── auth.js             # Authentication module
│   ├── database.js         # Firestore CRUD operations
│   ├── storage.js          # File upload (15MB support)
│   ├── sms.js              # SMS notifications
│   ├── utils.js            # Utility functions
│   ├── app.js              # Core app functionality
│   ├── register.js         # Registration step 1
│   ├── register-kin.js     # Registration step 2
│   ├── submit-pop.js       # POP submission
│   └── view-account.js     # Member dashboard
├── register.html           # Member registration (step 1)
├── register-kin.html       # Next of kin form (step 2)
├── submit-pop.html         # Payment proof submission
├── view-account.html       # Member account dashboard
├── firestore.rules         # Firestore security rules
└── README.md               # This file
```

---

## 🚀 Setup Instructions

### 1. Update Firebase Config
Edit `js/firebase-config.js` with your Firebase project credentials:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};
```

### 2. Configure SMS Provider
Edit `js/sms.js` to set up your SMS provider:

```javascript
config: {
    // Change from 'mock' to your provider
    provider: 'bulksms',  // or 'clickatell', 'africastalking'
    
    bulksms: {
        username: 'YOUR_USERNAME',
        password: 'YOUR_PASSWORD'
    }
}
```

**SA SMS Providers:**
- [BulkSMS](https://www.bulksms.com) - ~R0.29/SMS
- [Clickatell](https://www.clickatell.com) - ~R0.35/SMS
- [Africa's Talking](https://africastalking.com) - ~R0.25/SMS

### 3. Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 4. Create Firestore Indexes
The following indexes are needed (create in Firebase Console):

**Collection: submissions**
- `status` (Ascending) + `submittedAt` (Descending)
- `phone` (Ascending) + `submittedAt` (Descending)
- `status` (Ascending) + `paymentMonth` (Ascending) + `verifiedAt` (Descending)

**Collection: members**
- `phone` (Ascending)
- `idNumber` (Ascending)

### 5. Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

---

## 🔗 Registration Flow

Share this link with new members:
```
https://your-app.web.app/register.html
```

### Flow:
1. **Step 1** - Personal Details
   - Name & Surname
   - Date of Birth (must be 18+)
   - SA ID Number (validated)
   - Phone Number (10 digits)
   - Email (optional)
   - Password

2. **Step 2** - Next of Kin
   - Primary contact (required)
   - Secondary contact (required)
   - Third contact (optional)

3. **Completion**
   - Data saved to Firestore
   - SMS confirmation sent
   - Member reference generated (TRF-MXXXX)

---

## 💰 Business Rules (South African)

| Rule | Value |
|------|-------|
| Minimum Monthly Deposit | R300 |
| Late Fee (after 7th) | R50 |
| Interest Eligibility | R10,000+ savings |
| Max Skipped Months | 3 (then suspended) |
| Currency | South African Rand (ZAR) |

---

## 🔐 Security

### Authentication
- Anonymous Firebase Auth for basic access
- Admin code for admin panel
- Phone + password for member login
- OTP via SMS for password reset

### Data Protection
- SA ID numbers encrypted in transit (HTTPS)
- Password hashing (SHA-256 with salt)
- Firestore security rules enforce access control
- Audit logging for admin actions

---

## 📱 SMS Templates

All SMS messages are under 160 characters for single-SMS billing:

| Template | Use Case |
|----------|----------|
| `registration` | Welcome message after registration |
| `popSubmitted` | Confirmation when POP is submitted |
| `paymentApproved` | Notification when payment verified |
| `paymentRejected` | Notification when payment rejected |
| `passwordReset` | OTP for password reset |

---

## 🛠 Development

### Testing SMS (Mock Mode)
By default, SMS is in mock mode (logs to console). Set `provider: 'mock'` in sms.js.

### Console Helpers
```javascript
// Reset admin code (if forgotten)
Auth.resetAdminCode('NEW_CODE');

// Clear member session
Auth.clearMemberSession();

// Recalculate all member stats
Database.recalculateAllMemberStats();
```

### Data Integrity
Run this to fix any sync issues:
```javascript
// Recalculate single member
await Database.recalculateMemberStats('MEMBER_ID');

// Recalculate all members
await Database.recalculateAllMemberStats();
```

---

## 📊 Firestore Collections

| Collection | Purpose |
|------------|---------|
| `members` | Member profiles, savings, status |
| `submissions` | Payment proofs (POP) |
| `nextOfKin` | Emergency contacts |
| `settings` | Admin code, app config |
| `interestPool` | Fines + bank interest per year |
| `auditLogs` | Admin action history |
| `smsLogs` | SMS sending history |
| `otpCodes` | Password reset OTPs |

---

## ⚠️ Important Notes

1. **Firebase Free Tier**: This app uses Firebase Spark (free) plan. No Firebase Storage - images are compressed and stored as base64 in Firestore.

2. **SMS Costs**: SMS sending requires a paid account with an SMS provider. Budget ~R0.30 per SMS.

3. **Admin Code**: Change the default admin code (`TSHIKOTA2024`) in production!

4. **HTTPS Required**: SMS sending and password operations require HTTPS for security.

---

## 📞 Support

For issues or questions about this stokvel system, contact the developer.

---

**Built for South African Stokvels** 🇿🇦
