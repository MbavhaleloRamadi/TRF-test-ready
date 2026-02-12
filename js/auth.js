/**
 * =====================================================
 * TSHIKOTA RO FARANA - AUTHENTICATION MODULE (UPDATED)
 * =====================================================
 *
 * Handles authentication and session management.
 *
 * AUTHENTICATION TYPES:
 * - Anonymous auth for Firebase access
 * - Admin code verification for admin panel
 * - Phone + Password for member login
 *
 * SESSION MANAGEMENT:
 * - Admin session: 24 hours
 * - Member session: 30 minutes (auto-extend on activity)
 *
 * =====================================================
 */

const Auth = {
  /**
   * ==========================================
   * CONFIGURATION
   * ==========================================
   */

  // Session duration constants (in milliseconds)
  ADMIN_SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
  MEMBER_SESSION_DURATION: 30 * 60 * 1000, // 30 minutes

  // Storage keys
  STORAGE_KEYS: {
    ADMIN_SESSION: "tshikota_admin_session",
    MEMBER_SESSION: "tshikota_member_session",
  },

  /**
   * Admin codes for different roles
   * Each role has specific access levels
   */
  ADMIN_CODES: {
    VIC2026: { role: "chairperson", name: "Chairperson", level: 3 },
    KAT2026: { role: "secretary", name: "Secretary", level: 2 },
    MBA2026: { role: "treasurer", name: "Treasurer", level: 2 },
  },

  // Current Firebase user reference
  currentUser: null,

  /**
   * ==========================================
   * INITIALIZATION
   * ==========================================
   */

  /**
   * Initialize authentication
   * Called when app starts
   */
  async init() {
    try {
      // Listen for auth state changes
      firebase.auth().onAuthStateChanged((user) => {
        this.currentUser = user;
        console.log("Auth state:", user ? "Signed in" : "Signed out");
      });

      // Sign in anonymously if not already signed in
      if (!firebase.auth().currentUser) {
        await this.signInAnonymously();
      } else {
        this.currentUser = firebase.auth().currentUser;
      }

      return true;
    } catch (error) {
      console.error("Auth init error:", error);
      return false;
    }
  },

  /**
   * Sign in anonymously
   * Required for Firestore access
   */
  async signInAnonymously() {
    try {
      const result = await firebase.auth().signInAnonymously();
      this.currentUser = result.user;
      console.log("✅ Anonymous auth successful");
      return result.user;
    } catch (error) {
      console.error("❌ Anonymous auth failed:", error);
      throw error;
    }
  },

  /**
   * ==========================================
   * ADMIN AUTHENTICATION
   * ==========================================
   */

  /**
   * Verify admin code
   *
   * @param {string} code - Admin code to verify
   * @returns {Promise<boolean>} Whether code is valid
   */
  async verifyAdminCode(code) {
    try {
      if (!code) return false;

      // Normalize code (uppercase, trim whitespace)
      const normalizedCode = code.toUpperCase().trim();

      // Check against hardcoded admin codes
      const adminInfo = this.ADMIN_CODES[normalizedCode];

      if (adminInfo) {
        // Valid admin code - create session
        this.setAdminSession(adminInfo);

        // Log successful login
        await this.logAdminAction("admin_login", {
          role: adminInfo.role,
          name: adminInfo.name,
          success: true,
        });

        console.log(`✅ Admin login: ${adminInfo.name}`);
        return adminInfo;
      }

      // Invalid code - log failed attempt
      await this.logAdminAction("admin_login_failed", {
        success: false,
      });

      return false;
    } catch (error) {
      console.error("Admin verification error:", error);
      return false;
    }
  },

  /**
   * Check if admin session is valid
   *
   * @returns {Promise<boolean>} Whether admin session is valid
   */
  async checkAdminSession() {
    try {
      const session = Utils.storage.get(this.STORAGE_KEYS.ADMIN_SESSION);

      if (!session) return false;

      // Check if session has expired
      const now = Date.now();
      if (now - session.timestamp > this.ADMIN_SESSION_DURATION) {
        this.clearAdminSession();
        return false;
      }

      return true;
    } catch (error) {
      console.error("Check admin session error:", error);
      return false;
    }
  },

  /**
   * Set admin session with role information
   * @param {object} adminInfo - Admin role info
   */
  setAdminSession(adminInfo = {}) {
    Utils.storage.set(this.STORAGE_KEYS.ADMIN_SESSION, {
      authenticated: true,
      role: adminInfo.role || "admin",
      roleName: adminInfo.name || "Admin",
      level: adminInfo.level || 1,
      timestamp: Date.now(),
      userId: this.currentUser?.uid,
    });
  },

  /**
   * Get current admin session
   * @returns {object|null} Admin session data or null
   */
  getAdminSession() {
    try {
      const session = Utils.storage.get(this.STORAGE_KEYS.ADMIN_SESSION);

      if (!session) return null;

      // Check if session has expired
      const now = Date.now();
      if (now - session.timestamp > this.ADMIN_SESSION_DURATION) {
        this.clearAdminSession();
        return null;
      }

      return session;
    } catch (error) {
      console.error("Get admin session error:", error);
      return null;
    }
  },

  /**
   * Clear admin session
   */
  clearAdminSession() {
    Utils.storage.remove(this.STORAGE_KEYS.ADMIN_SESSION);
  },

  /**
   * Sign out admin
   */
  async signOutAdmin() {
    await this.logAdminAction("admin_logout", {});
    this.clearAdminSession();
  },

  /**
   * Update admin code
   *
   * @param {string} newCode - New admin code
   * @returns {Promise<boolean>} Success status
   */
  async updateAdminCode(newCode) {
    try {
      if (!newCode || newCode.length < 6) {
        throw new Error("Admin code must be at least 6 characters");
      }

      await db.collection("settings").doc("admin").update({
        adminCode: newCode,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      await this.logAdminAction("admin_code_changed", {});
      return true;
    } catch (error) {
      console.error("Update admin code error:", error);
      throw error;
    }
  },

  

  /**
   * ==========================================
   * MEMBER AUTHENTICATION
   * ==========================================
   */

  /**
   * Look up member by phone
   * Used for various member operations
   *
   * @param {string} name - Member name (optional, for fuzzy matching)
   * @param {string} phone - Phone number
   * @returns {Promise<object|null>} Member data or null
   */
  async lookupMember(name, phone) {
    try {
      const normalizedPhone = phone.replace(/[\s-]/g, "");

      const snapshot = await db
        .collection("members")
        .where("phone", "==", normalizedPhone)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      const memberDoc = snapshot.docs[0];
      const memberData = memberDoc.data();

      // If name provided, do fuzzy matching
      if (name) {
        const normalizedName = name.toLowerCase().trim();
        const storedName = (memberData.fullName || memberData.name || "")
          .toLowerCase()
          .trim();

        // Check if names are similar enough
        if (
          !storedName.includes(normalizedName) &&
          !normalizedName.includes(storedName)
        ) {
          // Names don't match - could be different person with same phone
          // For now, trust phone number as primary identifier
          console.warn("Name mismatch for phone:", normalizedPhone);
        }
      }

      return {
        id: memberDoc.id,
        ...memberData,
      };
    } catch (error) {
      console.error("Lookup member error:", error);
      return null;
    }
  },

  /**
   * Get member session
   *
   * @returns {object|null} Member session data or null
   */
  getMemberSession() {
    try {
      const session = Utils.storage.get(this.STORAGE_KEYS.MEMBER_SESSION);

      if (!session) return null;

      // Check if session has expired
      const now = Date.now();
      if (now - session.timestamp > this.MEMBER_SESSION_DURATION) {
        this.clearMemberSession();
        return null;
      }

      return session;
    } catch (error) {
      console.error("Get member session error:", error);
      return null;
    }
  },

  /**
   * Set member session
   *
   * @param {object} memberData - Member data to store in session
   */
  setMemberSession(memberData) {
    Utils.storage.set(this.STORAGE_KEYS.MEMBER_SESSION, {
      ...memberData,
      timestamp: Date.now(),
    });
  },

  /**
   * Extend member session (on activity)
   */
  extendMemberSession() {
    const session = this.getMemberSession();
    if (session) {
      session.timestamp = Date.now();
      Utils.storage.set(this.STORAGE_KEYS.MEMBER_SESSION, session);
    }
  },

  /**
   * Clear member session
   */
  clearMemberSession() {
    Utils.storage.remove(this.STORAGE_KEYS.MEMBER_SESSION);
  },

  /**
   * ==========================================
   * AUDIT LOGGING
   * ==========================================
   */

  /**
   * Log admin action for audit trail
   *
   * @param {string} action - Action type
   * @param {object} details - Action details
   */
  async logAdminAction(action, details = {}) {
    try {
      await db.collection("auditLogs").add({
        action,
        details,
        userId: this.currentUser?.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userAgent: navigator.userAgent,
        // Don't store IP - privacy concern
      });
    } catch (error) {
      console.error("Audit log error:", error);
      // Don't throw - logging failure shouldn't break the app
    }
  },

  /**
   * ==========================================
   * UTILITY FUNCTIONS
   * ==========================================
   */

  /**
   * Check if user is currently authenticated
   *
   * @returns {boolean} Whether user is authenticated
   */
  isAuthenticated() {
    return !!this.currentUser;
  },

  /**
   * Get current user ID
   *
   * @returns {string|null} User ID or null
   */
  getUserId() {
    return this.currentUser?.uid || null;
  },

  /**
   * Clear all sessions (for debugging/testing)
   */
  clearAllSessions() {
    this.clearAdminSession();
    this.clearMemberSession();
    console.log("All sessions cleared");
  },

  /**
   * Reset admin code to default (console utility)
   * Usage: Auth.resetAdminCode()
   */
  async resetAdminCode() {
    try {
      const defaultCode = APP_SETTINGS?.defaultAdminCode || "TSHIKOTA2024";
      await db.collection("settings").doc("admin").set({
        adminCode: defaultCode,
        resetAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      console.log("Admin code reset to default");
      return true;
    } catch (error) {
      console.error("Reset admin code error:", error);
      return false;
    }
  },
};

// Export for use
window.Auth = Auth;

// Initialize auth when Firebase is ready
document.addEventListener("DOMContentLoaded", () => {
  // Wait a tick for Firebase to initialize
  setTimeout(() => {
    if (typeof firebase !== "undefined" && firebase.auth) {
      Auth.init();
    }
  }, 100);
});
