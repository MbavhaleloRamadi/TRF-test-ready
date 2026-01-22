/**
 * =====================================================
 * TSHIKOTA RO FARANA - NEXT OF KIN REGISTRATION (Step 2)
 * =====================================================
 * 
 * Handles the second step of member registration:
 * - Primary next of kin (required)
 * - Secondary next of kin (required)
 * - Tertiary next of kin (optional)
 * 
 * After successful submission:
 * - Saves next of kin to Firestore
 * - Sends SMS confirmation to member
 * - Shows success modal
 * - Redirects to account page
 * 
 * =====================================================
 */

const RegisterKin = (() => {
    // DOM Elements
    let form;
    let submitBtn;
    let backBtn;
    let successModal;

    // State
    let pendingRegistration = null;

    /**
     * Initialize the next of kin page
     */
    function init() {
        console.log('🚀 Initializing next of kin page...');
        
        // Cache DOM elements
        form = document.getElementById('kinForm');
        submitBtn = document.getElementById('submitBtn');
        backBtn = document.getElementById('backBtn');
        successModal = document.getElementById('successModal');

        // Check for pending registration from step 1
        pendingRegistration = Utils.storage.get('pendingRegistration');
        
        if (!pendingRegistration || !pendingRegistration.memberId) {
            // No registration in progress, redirect to step 1
            console.log('No pending registration, redirecting to step 1...');
            window.location.href = 'register.html';
            return;
        }

        // Check if registration is not expired (24 hours)
        const registrationAge = Date.now() - pendingRegistration.timestamp;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (registrationAge > maxAge) {
            console.log('Registration expired, redirecting to step 1...');
            Utils.storage.remove('pendingRegistration');
            window.location.href = 'register.html';
            return;
        }

        // Display member info
        displayMemberInfo();

        // Set up event listeners
        setupEventListeners();

        // Initialize auth
        initAuth();
    }

    /**
     * Initialize Firebase anonymous auth
     */
    async function initAuth() {
        try {
            if (!Auth.currentUser) {
                await Auth.signInAnonymously();
            }
        } catch (error) {
            console.error('Auth init error:', error);
        }
    }

    /**
     * Display member info from step 1
     */
    function displayMemberInfo() {
        if (!pendingRegistration) return;

        // Avatar initials
        document.getElementById('memberAvatar').textContent = 
            Utils.getInitials(pendingRegistration.name);

        // Name and reference
        document.getElementById('memberName').textContent = pendingRegistration.name;
        document.getElementById('memberPhone').textContent = 
            `Ref: ${pendingRegistration.memberRef}`;
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Form submission
        form.addEventListener('submit', handleSubmit);

        // Back button
        backBtn.addEventListener('click', handleBack);

        // Phone number formatting for all phone inputs
        form.querySelectorAll('input[type="tel"]').forEach(input => {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
            });
        });

        // Relationship option selection styling
        document.querySelectorAll('.relationship-option').forEach(option => {
            option.addEventListener('click', function() {
                const input = this.querySelector('input');
                const name = input.name;
                
                // Deselect others in same group
                document.querySelectorAll(`[name="${name}"]`).forEach(radio => {
                    radio.closest('.relationship-option').classList.remove('selected');
                });
                
                // Select this one
                this.classList.add('selected');
                input.checked = true;
            });
        });

        // Success modal button
        document.getElementById('goToAccountBtn').addEventListener('click', () => {
            // Set up member session for auto-login
            Auth.setMemberSession({
                id: pendingRegistration.memberId,
                name: pendingRegistration.name,
                phone: pendingRegistration.phone
            });
            
            // Clear pending registration
            Utils.storage.remove('pendingRegistration');
            
            // Redirect to account page
            window.location.href = 'view-account.html';
        });

        // Real-time validation on blur
        form.querySelectorAll('.form-input').forEach(input => {
            input.addEventListener('blur', () => validateField(input));
        });
    }

    /**
     * Handle back button click
     */
    function handleBack() {
        if (confirm('Go back to personal details? Your next of kin information will not be saved.')) {
            window.location.href = 'register.html';
        }
    }

    /**
     * Handle form submission
     */
    async function handleSubmit(e) {
        e.preventDefault();

        // Validate form
        if (!validateForm()) {
            showToast('Please fix the errors above', 'error');
            return;
        }

        // Start loading
        setButtonLoading(submitBtn, true);

        try {
            // Collect form data
            const formData = new FormData(form);
            
            const kinData = {
                primary: {
                    name: formData.get('primary_name').trim(),
                    relationship: formData.get('primary_relationship'),
                    phone: formData.get('primary_phone').replace(/\D/g, ''),
                    email: formData.get('primary_email')?.trim() || ''
                },
                secondary: {
                    name: formData.get('secondary_name').trim(),
                    relationship: formData.get('secondary_relationship'),
                    phone: formData.get('secondary_phone').replace(/\D/g, ''),
                    email: formData.get('secondary_email')?.trim() || ''
                }
            };

            // Add tertiary if provided
            const tertiaryName = formData.get('tertiary_name')?.trim();
            if (tertiaryName) {
                kinData.tertiary = {
                    name: tertiaryName,
                    relationship: formData.get('tertiary_relationship') || '',
                    phone: formData.get('tertiary_phone')?.replace(/\D/g, '') || '',
                    email: formData.get('tertiary_email')?.trim() || ''
                };
            }

            console.log('📝 Saving next of kin...');

            // Save to Firestore
            await Database.saveNextOfKin(pendingRegistration.memberId, kinData);

            console.log('✅ Next of kin saved');

            // Send registration confirmation SMS
            try {
                console.log('📱 Sending confirmation SMS...');
                await SMS.sendRegistrationConfirmation(
                    pendingRegistration.phone,
                    pendingRegistration.name.split(' ')[0], // First name only
                    pendingRegistration.memberRef
                );
                console.log('✅ SMS sent');
            } catch (smsError) {
                console.warn('SMS failed:', smsError);
                // Don't fail registration if SMS fails
            }

            // Show success modal
            document.getElementById('memberRefDisplay').textContent = pendingRegistration.memberRef;
            openModal('successModal');

        } catch (error) {
            console.error('❌ Save error:', error);
            showToast(error.message || 'Failed to save. Please try again.', 'error');
        } finally {
            setButtonLoading(submitBtn, false);
        }
    }

    /**
     * Validate entire form
     * @returns {boolean} Whether form is valid
     */
    function validateForm() {
        let isValid = true;

        // Primary contact validation
        isValid = validateContactSection('primary', true) && isValid;
        
        // Secondary contact validation
        isValid = validateContactSection('secondary', true) && isValid;
        
        // Tertiary contact validation (only if name is provided)
        const tertiaryName = document.getElementById('tertiary_name').value.trim();
        if (tertiaryName) {
            isValid = validateContactSection('tertiary', false) && isValid;
        }

        return isValid;
    }

    /**
     * Validate a contact section
     * 
     * @param {string} prefix - Section prefix (primary, secondary, tertiary)
     * @param {boolean} required - Whether section is required
     * @returns {boolean} Whether section is valid
     */
    function validateContactSection(prefix, required) {
        let isValid = true;

        // Name
        const nameInput = document.getElementById(`${prefix}_name`);
        if (required && !nameInput.value.trim()) {
            showFieldError(nameInput, 'Name is required');
            isValid = false;
        } else if (nameInput.value.trim() && nameInput.value.trim().length < 2) {
            showFieldError(nameInput, 'Name too short');
            isValid = false;
        } else {
            clearFieldError(nameInput);
        }

        // Relationship
        const relationshipSelected = document.querySelector(`input[name="${prefix}_relationship"]:checked`);
        const relationshipError = document.getElementById(`${prefix}_relationship_error`);
        if (required && !relationshipSelected) {
            if (relationshipError) relationshipError.textContent = 'Please select a relationship';
            isValid = false;
        } else if (relationshipError) {
            relationshipError.textContent = '';
        }

        // Phone
        const phoneInput = document.getElementById(`${prefix}_phone`);
        if (required && !phoneInput.value.trim()) {
            showFieldError(phoneInput, 'Phone number is required');
            isValid = false;
        } else if (phoneInput.value.trim() && !Utils.isValidPhone(phoneInput.value)) {
            showFieldError(phoneInput, 'Invalid phone number');
            isValid = false;
        } else {
            clearFieldError(phoneInput);
        }

        // Check phone is not same as member's phone
        if (phoneInput.value.trim() === pendingRegistration?.phone) {
            showFieldError(phoneInput, 'Cannot use your own phone number');
            isValid = false;
        }

        // Email (optional validation)
        const emailInput = document.getElementById(`${prefix}_email`);
        if (emailInput.value.trim() && !Utils.isValidEmail(emailInput.value)) {
            showFieldError(emailInput, 'Invalid email');
            isValid = false;
        } else {
            clearFieldError(emailInput);
        }

        return isValid;
    }

    /**
     * Validate a single field
     */
    function validateField(field) {
        const value = field.value.trim();
        const id = field.id;

        if (id.includes('phone') && value) {
            if (!Utils.isValidPhone(value)) {
                showFieldError(field, 'Invalid phone number');
            } else if (value === pendingRegistration?.phone) {
                showFieldError(field, 'Cannot use your own phone');
            } else {
                clearFieldError(field);
            }
        } else if (id.includes('email') && value) {
            if (!Utils.isValidEmail(value)) {
                showFieldError(field, 'Invalid email');
            } else {
                clearFieldError(field);
            }
        }
    }

    /**
     * Show field error message
     */
    function showFieldError(field, message) {
        field.classList.add('error');
        const errorEl = field.parentElement.querySelector('.form-error');
        if (errorEl) {
            errorEl.textContent = message;
        }
    }

    /**
     * Clear field error message
     */
    function clearFieldError(field) {
        field.classList.remove('error');
        const errorEl = field.parentElement.querySelector('.form-error');
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        if (window.App && App.showToast) {
            App.showToast(message, type);
        } else {
            alert(message);
        }
    }

    /**
     * Open modal
     */
    function openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    /**
     * Close modal
     */
    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    /**
     * Set button loading state
     */
    function setButtonLoading(button, loading) {
        if (loading) {
            button.disabled = true;
            button.querySelector('.btn-text').style.display = 'none';
            button.querySelector('.btn-loading').style.display = 'inline-flex';
        } else {
            button.disabled = false;
            button.querySelector('.btn-text').style.display = 'inline';
            button.querySelector('.btn-loading').style.display = 'none';
        }
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        init
    };
})();
