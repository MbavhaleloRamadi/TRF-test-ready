/**
 * =====================================================
 * TSHIKOTA RO FARANA - MEMBER REGISTRATION (Step 1)
 * =====================================================
 * 
 * Handles the first step of member registration:
 * - Personal details (name, DOB, ID number)
 * - Contact details (phone, email)
 * - Password creation
 * 
 * After successful submission, redirects to next-of-kin form.
 * 
 * =====================================================
 */

const Register = (() => {
    // DOM Elements
    let form;
    let submitBtn;

    /**
     * Initialize the registration page
     */
    function init() {
        console.log('🚀 Initializing registration page...');
        
        // Cache DOM elements
        form = document.getElementById('registerForm');
        submitBtn = document.getElementById('submitBtn');

        // Check if already in registration flow (redirect if so)
        checkExistingRegistration();

        // Set up event listeners
        setupEventListeners();

        // Set max date for DOB (must be 18+)
        setDOBConstraints();

        // Initialize anonymous auth for Firestore access
        initAuth();
    }

    /**
     * Initialize Firebase anonymous auth
     */
    async function initAuth() {
        try {
            if (!Auth.currentUser) {
                await Auth.signInAnonymously();
                console.log('✅ Anonymous auth initialized');
            }
        } catch (error) {
            console.error('Auth init error:', error);
        }
    }

    /**
     * Check if user is already in registration flow
     */
    function checkExistingRegistration() {
        const pendingRegistration = Utils.storage.get('pendingRegistration');
        if (pendingRegistration && pendingRegistration.memberId) {
            // User has completed step 1, redirect to step 2
            console.log('Existing registration found, redirecting to step 2...');
            window.location.href = 'register-kin.html';
        }
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Form submission
        form.addEventListener('submit', handleSubmit);

        // ID number validation and formatting
        const idInput = document.getElementById('idNumber');
        idInput.addEventListener('input', (e) => {
            // Only allow digits
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 13);
            
            // Validate on input
            if (e.target.value.length === 13) {
                validateSAIdNumber(e.target.value) 
                    ? clearFieldError(idInput)
                    : showFieldError(idInput, 'Invalid SA ID number');
            }
        });

        // Phone number formatting
        const phoneInput = document.getElementById('phone');
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        });

        // Password strength check
        const passwordInput = document.getElementById('password');
        passwordInput.addEventListener('input', (e) => {
            validatePasswordStrength(e.target.value);
        });

        // Confirm password match
        const confirmInput = document.getElementById('confirmPassword');
        confirmInput.addEventListener('input', () => {
            const password = passwordInput.value;
            const confirm = confirmInput.value;
            
            if (confirm && password !== confirm) {
                showFieldError(confirmInput, 'Passwords do not match');
            } else {
                clearFieldError(confirmInput);
            }
        });

        // Relationship option selection styling
        document.querySelectorAll('.relationship-option').forEach(option => {
            option.addEventListener('click', function() {
                const name = this.querySelector('input').name;
                document.querySelectorAll(`[name="${name}"]`).forEach(input => {
                    input.closest('.relationship-option').classList.remove('selected');
                });
                this.classList.add('selected');
            });
        });

        // Real-time validation on blur
        form.querySelectorAll('.form-input').forEach(input => {
            input.addEventListener('blur', () => validateField(input));
        });
    }

    /**
     * Set DOB constraints (must be 18+)
     */
    function setDOBConstraints() {
        const dobInput = document.getElementById('dateOfBirth');
        
        // Calculate date 18 years ago
        const today = new Date();
        const minAge = 18;
        const maxDate = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
        
        // Format as YYYY-MM-DD
        dobInput.max = maxDate.toISOString().split('T')[0];
        
        // Set reasonable minimum (100 years ago)
        const minDate = new Date(today.getFullYear() - 100, 0, 1);
        dobInput.min = minDate.toISOString().split('T')[0];
    }

    /**
     * Handle form submission
     */
    async function handleSubmit(e) {
        e.preventDefault();

        // Validate all fields
        if (!validateForm()) {
            showToast('Please fix the errors above', 'error');
            return;
        }

        // Start loading
        setButtonLoading(submitBtn, true);

        try {
            // Collect form data
            const formData = new FormData(form);
            const registrationData = {
                name: formData.get('firstName').trim(),
                surname: formData.get('surname').trim(),
                dateOfBirth: formData.get('dateOfBirth'),
                idNumber: formData.get('idNumber'),
                phone: formData.get('phone').replace(/\D/g, ''),
                email: formData.get('email')?.trim() || '',
                password: formData.get('password')
            };

            console.log('📝 Submitting registration...');

            // Register member in Firestore
            const result = await Database.registerMember(registrationData);

            console.log('✅ Registration successful:', result.memberRef);

            // Store registration info for step 2
            Utils.storage.set('pendingRegistration', {
                memberId: result.memberId,
                memberRef: result.memberRef,
                name: `${registrationData.name} ${registrationData.surname}`,
                phone: registrationData.phone,
                timestamp: Date.now()
            });

            // Show success and redirect
            showToast('Details saved! Proceeding to next step...', 'success');
            
            setTimeout(() => {
                window.location.href = 'register-kin.html';
            }, 1000);

        } catch (error) {
            console.error('❌ Registration error:', error);
            showToast(error.message || 'Registration failed. Please try again.', 'error');
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

        // First name
        const firstName = document.getElementById('firstName');
        if (!firstName.value.trim()) {
            showFieldError(firstName, 'First name is required');
            isValid = false;
        } else if (firstName.value.trim().length < 2) {
            showFieldError(firstName, 'First name too short');
            isValid = false;
        } else {
            clearFieldError(firstName);
        }

        // Surname
        const surname = document.getElementById('surname');
        if (!surname.value.trim()) {
            showFieldError(surname, 'Surname is required');
            isValid = false;
        } else if (surname.value.trim().length < 2) {
            showFieldError(surname, 'Surname too short');
            isValid = false;
        } else {
            clearFieldError(surname);
        }

        // Date of birth
        const dob = document.getElementById('dateOfBirth');
        if (!dob.value) {
            showFieldError(dob, 'Date of birth is required');
            isValid = false;
        } else if (!isOver18(dob.value)) {
            showFieldError(dob, 'You must be 18 years or older');
            isValid = false;
        } else {
            clearFieldError(dob);
        }

        // ID number
        const idNumber = document.getElementById('idNumber');
        if (!idNumber.value) {
            showFieldError(idNumber, 'ID number is required');
            isValid = false;
        } else if (!validateSAIdNumber(idNumber.value)) {
            showFieldError(idNumber, 'Invalid SA ID number');
            isValid = false;
        } else {
            clearFieldError(idNumber);
        }

        // Phone
        const phone = document.getElementById('phone');
        if (!phone.value) {
            showFieldError(phone, 'Phone number is required');
            isValid = false;
        } else if (!Utils.isValidPhone(phone.value)) {
            showFieldError(phone, 'Invalid phone number (10 digits required)');
            isValid = false;
        } else {
            clearFieldError(phone);
        }

        // Email (optional but validate format if provided)
        const email = document.getElementById('email');
        if (email.value && !Utils.isValidEmail(email.value)) {
            showFieldError(email, 'Invalid email format');
            isValid = false;
        } else {
            clearFieldError(email);
        }

        // Password
        const password = document.getElementById('password');
        const passwordValid = validatePasswordStrength(password.value);
        if (!password.value) {
            showFieldError(password, 'Password is required');
            isValid = false;
        } else if (!passwordValid.valid) {
            showFieldError(password, passwordValid.error);
            isValid = false;
        } else {
            clearFieldError(password);
        }

        // Confirm password
        const confirmPassword = document.getElementById('confirmPassword');
        if (!confirmPassword.value) {
            showFieldError(confirmPassword, 'Please confirm your password');
            isValid = false;
        } else if (confirmPassword.value !== password.value) {
            showFieldError(confirmPassword, 'Passwords do not match');
            isValid = false;
        } else {
            clearFieldError(confirmPassword);
        }

        // Terms acceptance
        const acceptTerms = document.getElementById('acceptTerms');
        if (!acceptTerms.checked) {
            showToast('Please accept the stokvel rules to continue', 'warning');
            isValid = false;
        }

        return isValid;
    }

    /**
     * Validate a single field
     */
    function validateField(field) {
        const value = field.value.trim();
        const name = field.name;

        switch (name) {
            case 'firstName':
            case 'surname':
                if (value && value.length < 2) {
                    showFieldError(field, 'Too short');
                } else {
                    clearFieldError(field);
                }
                break;
            case 'idNumber':
                if (value && !validateSAIdNumber(value)) {
                    showFieldError(field, 'Invalid ID number');
                } else {
                    clearFieldError(field);
                }
                break;
            case 'phone':
                if (value && !Utils.isValidPhone(value)) {
                    showFieldError(field, 'Invalid phone number');
                } else {
                    clearFieldError(field);
                }
                break;
            case 'email':
                if (value && !Utils.isValidEmail(value)) {
                    showFieldError(field, 'Invalid email');
                } else {
                    clearFieldError(field);
                }
                break;
        }
    }

    /**
     * Validate South African ID number
     * Uses Luhn algorithm for checksum validation
     * 
     * @param {string} idNumber - 13-digit SA ID number
     * @returns {boolean} Whether ID is valid
     */
    function validateSAIdNumber(idNumber) {
        // Must be exactly 13 digits
        if (!/^\d{13}$/.test(idNumber)) {
            return false;
        }

        // Extract date components
        const year = parseInt(idNumber.substring(0, 2));
        const month = parseInt(idNumber.substring(2, 4));
        const day = parseInt(idNumber.substring(4, 6));

        // Validate month (01-12)
        if (month < 1 || month > 12) {
            return false;
        }

        // Validate day (01-31)
        if (day < 1 || day > 31) {
            return false;
        }

        // Luhn algorithm checksum validation
        let sum = 0;
        for (let i = 0; i < 13; i++) {
            let digit = parseInt(idNumber[i]);
            if (i % 2 === 1) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }
            sum += digit;
        }

        return sum % 10 === 0;
    }

    /**
     * Check if date of birth indicates person is 18+
     * 
     * @param {string} dob - Date of birth (YYYY-MM-DD)
     * @returns {boolean} Whether person is 18+
     */
    function isOver18(dob) {
        const birthDate = new Date(dob);
        const today = new Date();
        
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        
        return age >= 18;
    }

    /**
     * Validate password strength
     * 
     * @param {string} password - Password to validate
     * @returns {{valid: boolean, error?: string}} Validation result
     */
    function validatePasswordStrength(password) {
        if (!password) {
            return { valid: false, error: 'Password is required' };
        }

        if (password.length < 6) {
            return { valid: false, error: 'Password must be at least 6 characters' };
        }

        if (!/\d/.test(password)) {
            return { valid: false, error: 'Password must contain at least one number' };
        }

        // Check if password contains ID or phone (if filled)
        const idNumber = document.getElementById('idNumber')?.value || '';
        const phone = document.getElementById('phone')?.value || '';
        
        if (idNumber && password.includes(idNumber.substring(0, 6))) {
            return { valid: false, error: 'Password should not contain your ID number' };
        }

        if (phone && password.includes(phone.substring(0, 6))) {
            return { valid: false, error: 'Password should not contain your phone number' };
        }

        return { valid: true };
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
        init,
        validateSAIdNumber
    };
})();
