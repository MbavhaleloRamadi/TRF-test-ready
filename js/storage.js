/**
 * =====================================================
 * TSHIKOTA RO FARANA - STORAGE MODULE (UPDATED)
 * =====================================================
 *
 * Handles file uploads by converting to base64 and storing in Firestore.
 * Updated to support larger files up to 15MB with aggressive compression.
 *
 * STORAGE STRATEGY:
 * - Files are compressed and converted to base64
 * - Stored directly in Firestore document (no Firebase Storage needed)
 * - Works with Firebase free Spark plan
 *
 * LIMITATIONS:
 * - Firestore document limit is 1MB
 * - We target 800KB max base64 after compression
 * - Very large images will be resized to fit
 *
 * =====================================================
 */

const Storage = {
  /**
   * ==========================================
   * CONFIGURATION
   * ==========================================
   */

  /**
   * Maximum input file size (15MB as requested)
   * Note: Files will be compressed to fit Firestore limits
   */
  MAX_FILE_SIZE: 15 * 1024 * 1024, // 15MB

  /**
   * Maximum base64 size to store in Firestore
   * Keeping under 800KB to leave room for other document fields
   */
  MAX_BASE64_SIZE: 800 * 1024, // 800KB

  /**
   * Target compressed image width
   * Will be reduced progressively if file still too large
   */
  TARGET_WIDTH: 1200,

  /**
   * Minimum compressed image width (won't go below this)
   */
  MIN_WIDTH: 400,

  /**
   * Allowed file types
   * Images only - PDFs don't compress well for base64 storage
   */
  ALLOWED_TYPES: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf", // PDF support
  ],

  /**
   * Allowed extensions (for validation)
   */
  ALLOWED_EXTENSIONS: [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".pdf",
  ],

  /**
   * ==========================================
   * MAIN UPLOAD FUNCTION
   * ==========================================
   */

  /**
   * Upload proof of payment file
   * Handles both images (with compression) and PDFs (direct)
   *
   * @param {File} file - File to upload
   * @param {string} reference - Payment reference (for logging)
   * @param {Function} onProgress - Progress callback (0-100)
   * @returns {Promise<string>} Base64 data URL
   */
  async uploadProof(file, reference, onProgress = null) {
    try {
      // Step 1: Validate file (10%)
      if (onProgress) onProgress(5);

      const validation = this.validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      if (onProgress) onProgress(10);
      console.log(
        `📁 Storage: Processing ${file.name} (${this.formatFileSize(file.size)})`,
      );

      // Check if it's a PDF
      const isPDF =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");

      if (isPDF) {
        // PDFs: Convert directly to base64 (no compression)
        if (onProgress) onProgress(30);
        console.log("   📄 Processing PDF file...");

        const base64 = await this.fileToBase64(file);

        // Check if PDF is too large for Firestore
        if (base64.length > this.MAX_BASE64_SIZE) {
          throw new Error(
            `PDF file is too large (${this.formatFileSize(base64.length)}). ` +
              `Maximum is ${this.formatFileSize(this.MAX_BASE64_SIZE)}. ` +
              `Please use a smaller PDF or upload a screenshot/photo instead.`,
          );
        }

        if (onProgress) onProgress(100);
        console.log(
          `   ✅ PDF processed: ${this.formatFileSize(base64.length)}`,
        );
        return base64;
      }

      // Images: Compress progressively until it fits (10-70%)
      let processedFile = file;
      let quality = 0.8;
      let maxWidth = this.TARGET_WIDTH;
      let attempt = 0;
      const maxAttempts = 5;

      while (attempt < maxAttempts) {
        attempt++;

        if (onProgress) {
          onProgress(10 + attempt * 12);
        }

        try {
          processedFile = await this.compressImage(file, maxWidth, quality);
          console.log(
            `   Attempt ${attempt}: ${maxWidth}px @ ${Math.round(quality * 100)}% = ${this.formatFileSize(processedFile.size)}`,
          );

          const base64 = await this.fileToBase64(processedFile);

          if (base64.length <= this.MAX_BASE64_SIZE) {
            if (onProgress) onProgress(90);
            console.log(
              `   ✅ Final size: ${this.formatFileSize(base64.length)} base64`,
            );

            if (onProgress) onProgress(100);
            return base64;
          }

          if (quality > 0.3) {
            quality -= 0.15;
          } else if (maxWidth > this.MIN_WIDTH) {
            maxWidth = Math.max(this.MIN_WIDTH, Math.round(maxWidth * 0.7));
            quality = 0.6;
          } else {
            break;
          }
        } catch (compressError) {
          console.warn(
            `   Compression attempt ${attempt} failed:`,
            compressError.message,
          );
          quality = Math.max(0.3, quality - 0.2);
          maxWidth = Math.max(this.MIN_WIDTH, maxWidth - 200);
        }
      }

      throw new Error(
        "Image could not be compressed to fit storage limits. " +
          "Please try a smaller image or take a clearer photo of just the receipt.",
      );
    } catch (error) {
      console.error("❌ Storage upload error:", error);
      throw error;
    }
  },

  /**
   * ==========================================
   * COMPRESSION FUNCTIONS
   * ==========================================
   */

  /**
   * Compress an image file using canvas
   * Handles HEIC/HEIF conversion for iPhone photos
   *
   * @param {File|Blob} file - Image file to compress
   * @param {number} maxWidth - Maximum width in pixels
   * @param {number} quality - JPEG quality (0-1)
   * @returns {Promise<Blob>} Compressed image blob
   */
  compressImage(file, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();

        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions maintaining aspect ratio
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            // Also limit height (for very tall images)
            const maxHeight = maxWidth * 1.5;
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");

            // White background (for transparent PNGs)
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);

            // Draw image with smoothing
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to JPEG blob
            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  reject(new Error("Canvas toBlob failed"));
                }
              },
              "image/jpeg",
              quality,
            );
          } catch (err) {
            reject(new Error("Image processing failed: " + err.message));
          }
        };

        img.onerror = () => {
          reject(new Error("Failed to load image. File may be corrupted."));
        };

        img.src = e.target.result;
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      reader.readAsDataURL(file);
    });
  },

  /**
   * Convert file/blob to base64 data URL
   *
   * @param {File|Blob} file - File to convert
   * @returns {Promise<string>} Base64 data URL
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error("Failed to convert file to base64"));
      reader.readAsDataURL(file);
    });
  },

  /**
   * ==========================================
   * VALIDATION FUNCTIONS
   * ==========================================
   */

  /**
   * Validate file before upload
   * Checks size, type, and basic integrity
   *
   * @param {File} file - File to validate
   * @returns {{valid: boolean, error?: string}} Validation result
   */
  validateFile(file) {
    // Check if file exists
    if (!file) {
      return { valid: false, error: "No file provided" };
    }

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error:
          `File too large. Maximum size is ${this.formatFileSize(this.MAX_FILE_SIZE)}. ` +
          `Your file is ${this.formatFileSize(file.size)}.`,
      };
    }

    // Check file size minimum (likely corrupt if too small)
    if (file.size < 1024) {
      // Less than 1KB
      return {
        valid: false,
        error: "File appears to be empty or corrupted. Please try again.",
      };
    }

    // Check file type
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    const extension = "." + fileName.split(".").pop();

    // Check MIME type
    if (fileType && !this.ALLOWED_TYPES.includes(fileType)) {
      return {
        valid: false,
        error:
          `Invalid file type "${fileType}". ` +
          `Please upload an image (JPG, PNG, GIF, WebP) or PDF.`,
      };
    }

    // Check extension as fallback
    if (!fileType && !this.ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        valid: false,
        error:
          `Invalid file extension "${extension}". ` +
          `Please upload an image (JPG, PNG, GIF, WebP) or PDF.`,
      };
    }

    return { valid: true };
  },

  /**
   * Quick check if file type is allowed (for UI feedback)
   *
   * @param {File} file - File to check
   * @returns {boolean} Whether file type is allowed
   */
  isAllowedType(file) {
    if (!file) return false;
    const fileType = file.type.toLowerCase();
    const extension = "." + file.name.toLowerCase().split(".").pop();
    return (
      this.ALLOWED_TYPES.includes(fileType) ||
      this.ALLOWED_EXTENSIONS.includes(extension)
    );
  },

  /**
   * ==========================================
   * UTILITY FUNCTIONS
   * ==========================================
   */

  /**
   * Format file size for display
   *
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size (e.g., "2.5 MB")
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },

  /**
   * Get human-readable error message
   *
   * @param {Error|object} error - Error object
   * @returns {string} User-friendly error message
   */
  getErrorMessage(error) {
    if (typeof error === "string") return error;
    if (error.message) return error.message;
    return "Upload failed. Please try again.";
  },

  /**
   * Create a preview URL for local file display
   *
   * @param {File} file - File to preview
   * @returns {string} Object URL for preview
   */
  createPreviewURL(file) {
    return URL.createObjectURL(file);
  },

  /**
   * Revoke a preview URL to free memory
   *
   * @param {string} url - Object URL to revoke
   */
  revokePreviewURL(url) {
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  },

  /**
   * Check if a string is a base64 data URL
   *
   * @param {string} str - String to check
   * @returns {boolean} Whether it's a base64 data URL
   */
  isBase64DataURL(str) {
    return typeof str === "string" && str.startsWith("data:");
  },

  /**
   * Check if a string is a Firebase Storage URL (for migration)
   *
   * @param {string} str - String to check
   * @returns {boolean} Whether it's a Firebase Storage URL
   */
  isFirebaseStorageURL(str) {
    return (
      typeof str === "string" &&
      (str.includes("firebasestorage.googleapis.com") ||
        str.includes("storage.googleapis.com"))
    );
  },

  /**
   * Get metadata from base64 data URL
   *
   * @param {string} base64 - Base64 data URL
   * @returns {object|null} Metadata object or null
   */
  getMetadata(base64) {
    if (!base64 || !this.isBase64DataURL(base64)) {
      return null;
    }

    const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return null;

    // Calculate approximate original size from base64
    const base64Data = matches[2];
    const padding = (base64Data.match(/=+$/) || [""])[0].length;
    const size = Math.round((base64Data.length * 3) / 4) - padding;

    return {
      contentType: matches[1],
      size: size,
      sizeFormatted: this.formatFileSize(size),
      isBase64: true,
    };
  },

  /**
   * Delete a file reference (no-op for base64, kept for API compatibility)
   *
   * @param {string} url - File URL or base64 string
   * @returns {Promise<void>}
   */
  async deleteFile(url) {
    // No action needed for base64 strings stored in Firestore
    // The data is deleted when the document is deleted
    console.log("Storage.deleteFile: No action needed for base64 storage");
    return Promise.resolve();
  },

  /**
   * Get storage configuration info (for admin/debug)
   *
   * @returns {object} Configuration info
   */
  getConfig() {
    return {
      maxFileSize: this.MAX_FILE_SIZE,
      maxFileSizeFormatted: this.formatFileSize(this.MAX_FILE_SIZE),
      maxBase64Size: this.MAX_BASE64_SIZE,
      maxBase64SizeFormatted: this.formatFileSize(this.MAX_BASE64_SIZE),
      allowedTypes: this.ALLOWED_TYPES,
      allowedExtensions: this.ALLOWED_EXTENSIONS,
      targetWidth: this.TARGET_WIDTH,
      minWidth: this.MIN_WIDTH,
    };
  },
};

// Export for use
window.Storage = Storage;
