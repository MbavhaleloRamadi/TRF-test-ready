/**
 * =====================================================
 * TSHIKOTA RO FARANA - POP SUBMISSION PAGE (UPDATED)
 * =====================================================
 * 
 * Proof of Payment submission form.
 * 
 * CHANGES:
 * - File size limit increased to 15MB
 * - SMS confirmation sent on successful submission
 * - Improved compression for large files
 * - Better error handling
 * 
 * =====================================================
 */

const SubmitPOP = (() => {
    // ==========================================
    // DOM Elements
    // ==========================================
    let form;
    let fileInput;
    let fileUpload;
    let filePreview;
    let previewImage;
    let submitBtn;
    let lateWarning;
    let successModal;

    // ==========================================
    // State
    // ==========================================
    let selectedFile = null;
    let previewURL = null;
    let isSubmitting = false;

    /**
     * Initialize the page
     */
    function init() {
        console.log('🚀 Initializing POP Submission page...');
        
        // Cache DOM elements
        form = document.getElementById('pop-form');
        fileInput = document.getElementById('proofFile');
        fileUpload = document.getElementById('fileUpload');
        filePreview = document.getElementById('filePreview');
        previewImage = document.getElementById('previewImage');
        submitBtn = document.getElementById('submitBtn');
        lateWarning = document.getElementById('lateWarning');
        successModal = document.getElementById('successModal');

        // Initialize app
        App.init();

        // Set up event listeners
        setupEventListeners();

        // Populate month dropdown
        populateMonthOptions();

        // Set default date to today
        setDefaultDate();

        // Load banking details from config
        loadBankingDetails();

        // Check for existing session (pre-fill name/phone)
        checkExistingSession();
        
        // Display file size limit
        updateFileSizeDisplay();
    }

    /**
     * Set up all event listeners
     */
    function setupEventListeners() {
        // Form submission
        form.addEventListener('submit', handleSubmit);

        // File upload
        fileInput.addEventListener('change', handleFileSelect);
        
        // Drag and drop
        fileUpload.addEventListener('dragover', handleDragOver);
        fileUpload.addEventListener('dragleave', handleDragLeave);
        fileUpload.addEventListener('drop', handleDrop);
        
        // Click to upload
        fileUpload.addEventListener('click', (e) => {
            if (e.target === fileUpload || e.target.closest('.file-upload-content')) {
                fileInput.click();
            }
        });

        // Remove file button
        document.getElementById('removeFile')?.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile();
        });

        // Payment date change - check for late payment
        document.getElementById('paymentDate').addEventListener('change', checkLatePayment);

        // Success modal done button
        document.getElementById('doneBtn')?.addEventListener('click', () => {
            App.closeModal('successModal');
            resetForm();
        });
        
        // View account button in success modal
        document.getElementById('viewAccountBtn')?.addEventListener('click', () => {
            window.location.href = 'view-account.html';
        });

        // Copy banking details
        document.querySelectorAll('.copyable').forEach(el => {
            el.addEventListener('click', () => {
                const text = el.dataset.copy || el.textContent.trim();
                Utils.copyToClipboard(text).then(() => {
                    App.showToast('Copied to clipboard!', 'success');
                });
            });
        });

        // Phone number formatting (SA format)
        document.getElementById('phone').addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        });

        // Amount validation (minimum R300)
        document.getElementById('amount').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            const minDeposit = APP_SETTINGS?.minMonthlyDeposit || 300;
            
            if (value && value < minDeposit) {
                showFieldWarning(e.target, `Minimum deposit is ${Utils.formatCurrency(minDeposit)}`);
            } else {
                clearFieldWarning(e.target);
            }
        });
        
        // Real-time validation
        form.querySelectorAll('.form-input, .form-select').forEach(field => {
            field.addEventListener('blur', () => validateField(field));
        });
    }

    /**
     * Update file size limit display
     */
    function updateFileSizeDisplay() {
        const sizeDisplay = document.getElementById('fileSizeLimit');
        if (sizeDisplay) {
            const maxSize = Storage.MAX_FILE_SIZE || 15 * 1024 * 1024;
            sizeDisplay.textContent = `Max file size: ${Storage.formatFileSize(maxSize)}`;
        }
    }

    /**
     * Populate month dropdown with options
     */
    function populateMonthOptions() {
        const select = document.getElementById('paymentMonth');
        const options = Utils.generateMonthOptions(12);
        
        // Clear existing options (except placeholder)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        // Select current month by default
        const currentMonth = Utils.getCurrentPaymentMonth();
        select.value = currentMonth;
    }

    /**
     * Set default date to today
     */
    function setDefaultDate() {
        const dateInput = document.getElementById('paymentDate');
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        dateInput.max = today; // Can't select future dates
        
        // Check if today is late
        checkLatePayment();
    }

    /**
     * Load banking details from config
     */
    function loadBankingDetails() {
        const banking = APP_SETTINGS?.bankingDetails || {
            bankName: 'FNB',
            accountName: 'Tshikota Ro Farana Stokvel',
            accountNumber: '63190192880',
            branchCode: '250655'
        };
        
        document.getElementById('bankName').textContent = banking.bankName;
        document.getElementById('accountName').textContent = banking.accountName;
        document.getElementById('accountNumber').textContent = banking.accountNumber;
        document.getElementById('accountNumber').dataset.copy = banking.accountNumber;
        document.getElementById('branchCode').textContent = banking.branchCode;
    }

    /**
     * Check for existing member session and pre-fill form
     */
    function checkExistingSession() {
        const session = Auth.getMemberSession();
        if (session) {
            if (session.name) {
                document.getElementById('fullName').value = session.name;
            }
            if (session.phone) {
                document.getElementById('phone').value = session.phone;
            }
        }
    }

    /**
     * Handle file selection
     */
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    }

    /**
     * Handle drag over
     */
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        fileUpload.classList.add('dragover');
    }

    /**
     * Handle drag leave
     */
    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        fileUpload.classList.remove('dragover');
    }

    /**
     * Handle file drop
     */
    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        fileUpload.classList.remove('dragover');

        const file = e.dataTransfer.files[0];
        if (file) {
            processFile(file);
        }
    }

    /**
     * Process selected file
     */
    function processFile(file) {
        // Validate file using Storage module (now 15MB limit)
        const validation = Storage.validateFile(file);
        if (!validation.valid) {
            showFileError(validation.error);
            return;
        }

        clearFileError();
        selectedFile = file;

        // Show preview
        showFilePreview(file);
        
        console.log(`📁 File selected: ${file.name} (${Storage.formatFileSize(file.size)})`);
    }

    /**
     * Show file preview
     */
    function showFilePreview(file) {
        // Revoke previous preview URL
        if (previewURL) {
            Storage.revokePreviewURL(previewURL);
        }

        // Create preview URL
        previewURL = Storage.createPreviewURL(file);

        // Update preview UI
        if (file.type.startsWith('image/')) {
            previewImage.src = previewURL;
            previewImage.style.display = 'block';
        } else {
            // Non-image file - show icon
            previewImage.src = 'data:image/svg+xml,' + encodeURIComponent(`
                <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <text x="12" y="16" font-size="4" fill="#666" text-anchor="middle">FILE</text>
                </svg>
            `);
            previewImage.style.display = 'block';
        }

        // Update file info
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = Storage.formatFileSize(file.size);

        // Show preview, hide upload area
        document.querySelector('.file-upload-content').style.display = 'none';
        filePreview.style.display = 'flex';
        fileUpload.classList.add('has-file');
    }

    /**
     * Remove selected file
     */
    function removeFile() {
        selectedFile = null;
        fileInput.value = '';

        if (previewURL) {
            Storage.revokePreviewURL(previewURL);
            previewURL = null;
        }

        // Reset UI
        previewImage.src = '';
        document.querySelector('.file-upload-content').style.display = 'flex';
        filePreview.style.display = 'none';
        fileUpload.classList.remove('has-file');
        clearFileError();
    }

    /**
     * Check if payment is late (after 7th of the month)
     */
    function checkLatePayment() {
        const dateInput = document.getElementById('paymentDate');
        const date = new Date(dateInput.value);
        
        if (Utils.isPaymentLate(date)) {
            lateWarning.style.display = 'flex';
            const fineAmount = APP_SETTINGS?.lateFineAmount || 50;
            const fineText = lateWarning.querySelector('.late-fine-amount');
            if (fineText) {
                fineText.textContent = Utils.formatCurrency(fineAmount);
            }
        } else {
            lateWarning.style.display = 'none';
        }
    }

    /**
     * Handle form submission
     */
    async function handleSubmit(e) {
        e.preventDefault();

        if (isSubmitting) return;

        // Validate form
        if (!validateForm()) {
            App.showToast('Please fix the errors above', 'error');
            return;
        }

        // Check file
        if (!selectedFile) {
            showFileError('Please upload proof of payment');
            return;
        }

        // Start loading
        isSubmitting = true;
        Utils.setButtonLoading(submitBtn, true);
        updateSubmitProgress(0, 'Preparing submission...');

        try {
            // Step 1: Compress and upload file (0-60%)
            updateSubmitProgress(5, 'Processing image...');
            
            const proofURL = await Storage.uploadProof(selectedFile, 'temp', (progress) => {
                // Map 0-100 to 5-60
                const mappedProgress = 5 + (progress * 0.55);
                updateSubmitProgress(mappedProgress, `Compressing image... ${Math.round(progress)}%`);
            });

            updateSubmitProgress(65, 'Saving submission...');

            // Step 2: Collect form data
            const formData = new FormData(form);
            const submissionData = {
                name: formData.get('fullName').trim(),
                phone: formData.get('phone').trim(),
                amount: parseFloat(formData.get('amount')),
                paymentDate: formData.get('paymentDate'),
                paymentMonth: formData.get('paymentMonth'),
                paymentMethod: formData.get('paymentMethod'),
                proofURL: proofURL,
                notes: formData.get('notes')?.trim() || ''
            };

            // Step 3: Submit to database (includes SMS)
            updateSubmitProgress(75, 'Submitting...');
            const reference = await Database.submitPOP(submissionData);

            updateSubmitProgress(90, 'Sending confirmation...');

            // Step 4: Save member session for convenience
            Auth.setMemberSession({
                name: submissionData.name,
                phone: submissionData.phone,
                timestamp: Date.now()
            });

            updateSubmitProgress(100, 'Complete!');

            // Step 5: Show success modal
            document.getElementById('referenceNumber').textContent = reference;
            
            // Show SMS confirmation message
            const smsNote = document.getElementById('smsConfirmation');
            if (smsNote) {
                smsNote.style.display = 'block';
                smsNote.textContent = `A confirmation SMS has been sent to ${Utils.formatPhone(submissionData.phone)}`;
            }
            
            App.openModal('successModal');

            console.log('✅ Submission successful:', reference);

        } catch (error) {
            console.error('❌ Submission error:', error);
            App.showToast(error.message || 'Failed to submit. Please try again.', 'error');
        } finally {
            isSubmitting = false;
            Utils.setButtonLoading(submitBtn, false);
            hideSubmitProgress();
        }
    }

    /**
     * Update submit progress indicator
     */
    function updateSubmitProgress(percent, message) {
        const progressContainer = document.getElementById('submitProgress');
        if (!progressContainer) return;
        
        progressContainer.style.display = 'block';
        
        const progressBar = progressContainer.querySelector('.progress-fill');
        const progressText = progressContainer.querySelector('.progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        if (progressText) {
            progressText.textContent = message;
        }
    }

    /**
     * Hide submit progress indicator
     */
    function hideSubmitProgress() {
        const progressContainer = document.getElementById('submitProgress');
        if (progressContainer) {
            progressContainer.style.display = 'none';
        }
    }

    /**
     * Validate form fields
     * @returns {boolean} Whether form is valid
     */
    function validateForm() {
        let isValid = true;

        // Full name
        const nameInput = document.getElementById('fullName');
        if (!nameInput.value.trim()) {
            showFieldError(nameInput, 'Please enter your full name');
            isValid = false;
        } else if (nameInput.value.trim().length < 2) {
            showFieldError(nameInput, 'Name must be at least 2 characters');
            isValid = false;
        } else {
            clearFieldError(nameInput);
        }

        // Phone number (SA format)
        const phoneInput = document.getElementById('phone');
        if (!phoneInput.value.trim()) {
            showFieldError(phoneInput, 'Please enter your phone number');
            isValid = false;
        } else if (!Utils.isValidPhone(phoneInput.value)) {
            showFieldError(phoneInput, 'Please enter a valid 10-digit phone number');
            isValid = false;
        } else {
            clearFieldError(phoneInput);
        }

        // Amount (minimum R300 warning, but allow any positive amount)
        const amountInput = document.getElementById('amount');
        const amount = parseFloat(amountInput.value);
        if (!amountInput.value || isNaN(amount)) {
            showFieldError(amountInput, 'Please enter the amount paid');
            isValid = false;
        } else if (amount <= 0) {
            showFieldError(amountInput, 'Amount must be greater than 0');
            isValid = false;
        } else {
            clearFieldError(amountInput);
            
            // Show warning but don't block submission
            const minDeposit = APP_SETTINGS?.minMonthlyDeposit || 300;
            if (amount < minDeposit) {
                showFieldWarning(amountInput, `Note: Minimum recommended is ${Utils.formatCurrency(minDeposit)}`);
            }
        }

        // Payment date
        const dateInput = document.getElementById('paymentDate');
        if (!dateInput.value) {
            showFieldError(dateInput, 'Please select the payment date');
            isValid = false;
        } else {
            clearFieldError(dateInput);
        }

        // Payment month
        const monthSelect = document.getElementById('paymentMonth');
        if (!monthSelect.value) {
            showFieldError(monthSelect, 'Please select the payment month');
            isValid = false;
        } else {
            clearFieldError(monthSelect);
        }

        // Payment method
        const methodSelect = document.getElementById('paymentMethod');
        if (!methodSelect.value) {
            showFieldError(methodSelect, 'Please select payment method');
            isValid = false;
        } else {
            clearFieldError(methodSelect);
        }

        return isValid;
    }

    /**
     * Validate a single field
     */
    function validateField(field) {
        const value = field.value?.trim() || '';
        const name = field.name || field.id;

        switch (name) {
            case 'fullName':
                if (value && value.length < 2) {
                    showFieldError(field, 'Name too short');
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
            case 'amount':
                if (value && (isNaN(parseFloat(value)) || parseFloat(value) <= 0)) {
                    showFieldError(field, 'Invalid amount');
                } else {
                    clearFieldError(field);
                }
                break;
        }
    }

    /**
     * Show field error
     */
    function showFieldError(field, message) {
        field.classList.add('error');
        const errorEl = field.parentElement.querySelector('.form-error');
        if (errorEl) {
            errorEl.textContent = message;
        }
    }

    /**
     * Clear field error
     */
    function clearFieldError(field) {
        field.classList.remove('error');
        const errorEl = field.parentElement.querySelector('.form-error');
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    /**
     * Show field warning (non-blocking)
     */
    function showFieldWarning(field, message) {
        const hint = field.parentElement.querySelector('.form-hint');
        if (hint) {
            hint.textContent = message;
            hint.classList.add('warning');
        }
    }

    /**
     * Clear field warning
     */
    function clearFieldWarning(field) {
        const hint = field.parentElement.querySelector('.form-hint');
        if (hint) {
            hint.classList.remove('warning');
            // Restore original hint
            if (field.id === 'amount') {
                const minDeposit = APP_SETTINGS?.minMonthlyDeposit || 300;
                hint.textContent = `Minimum ${Utils.formatCurrency(minDeposit)} per month`;
            }
        }
    }

    /**
     * Show file error
     */
    function showFileError(message) {
        const errorEl = document.getElementById('fileError');
        if (errorEl) {
            errorEl.textContent = message;
        }
        fileUpload.classList.add('error');
    }

    /**
     * Clear file error
     */
    function clearFileError() {
        const errorEl = document.getElementById('fileError');
        if (errorEl) {
            errorEl.textContent = '';
        }
        fileUpload.classList.remove('error');
    }

    /**
     * Reset form to initial state
     */
    function resetForm() {
        form.reset();
        removeFile();
        clearFileError();
        
        // Clear all field errors
        form.querySelectorAll('.form-input, .form-select').forEach(field => {
            clearFieldError(field);
        });

        // Reset defaults
        setDefaultDate();
        populateMonthOptions();
        checkExistingSession();
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        init,
        resetForm
    };
})();
