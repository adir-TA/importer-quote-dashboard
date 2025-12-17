import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, FileText, AlertCircle, Check, Copy, Eye } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

const DOCUMENT_TYPES = [
  { value: 'PI', label: 'Proforma Invoice' },
  { value: 'QUOTE', label: 'Quote' },
  { value: 'SPEC', label: 'Specification' },
  { value: 'OTHER', label: 'Other' },
];

const ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function UploadDocumentModal({ isOpen, onClose, buyingIntentId }) {
  const { actions, computed } = useAppContext();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [type, setType] = useState('PI');
  const [selectedSupplierQuoteId, setSelectedSupplierQuoteId] = useState('');
  const [customFileName, setCustomFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const [supplierQuotes, setSupplierQuotes] = useState([]);

  // Load supplier quotes for this buying intent
  useEffect(() => {
    if (isOpen && buyingIntentId) {
      loadSupplierQuotes();
    }
  }, [isOpen, buyingIntentId]);

  const loadSupplierQuotes = async () => {
    try {
      const lineItems = await computed.getLineItemsForBuyingIntent(buyingIntentId);

      // Get unique supplier quotes
      const uniqueQuotes = {};
      lineItems.forEach(item => {
        if (item.supplier_quote && item.supplier_quote.id) {
          uniqueQuotes[item.supplier_quote.id] = item.supplier_quote;
        }
      });

      setSupplierQuotes(Object.values(uniqueQuotes));
    } catch (err) {
      console.error('Failed to load supplier quotes:', err);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    // Validate file type
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError('Only PDF and image files (PNG, JPG) are allowed');
      return;
    }

    // Validate file size
    if (selectedFile.size > MAX_SIZE) {
      setError(`File size must be less than ${MAX_SIZE / 1024 / 1024}MB`);
      return;
    }

    // Validate supplier selected
    if (!selectedSupplierQuoteId) {
      setError('Please select a supplier first');
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(selectedFile);

    // Set default custom name (remove extension)
    const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');

    setFile(selectedFile);
    setFilePreviewUrl(previewUrl);
    setCustomFileName(nameWithoutExt);
    setShowPreview(true);
    setError('');
  };

  // Clean up preview URL when modal closes
  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const handleCopyImage = async () => {
    if (!file || !file.type.startsWith('image/')) return;

    try {
      // Read file as blob
      const blob = new Blob([file], { type: file.type });

      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({
          [file.type]: blob
        })
      ]);

      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy image:', err);
      setError('Failed to copy image to clipboard');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file');
      return;
    }

    if (!selectedSupplierQuoteId) {
      setError('Please select a supplier');
      return;
    }

    if (!customFileName.trim()) {
      setError('Please enter a document name');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // Step 1: Upload file to backend (Supabase Storage)
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user.id);
      formData.append('buyingIntentId', buyingIntentId);
      formData.append('supplierQuoteId', selectedSupplierQuoteId);

      const uploadResponse = await fetch('http://localhost:3001/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const { file: uploadedFile } = await uploadResponse.json();

      // Get file extension
      const fileExtension = file.name.split('.').pop();
      const finalFileName = `${customFileName}.${fileExtension}`;

      // Step 2: Save document metadata to database
      const doc = {
        type,
        buyingIntentId,
        supplierQuoteId: selectedSupplierQuoteId,
        filePath: uploadedFile.path,
        fileName: finalFileName,
        fileType: uploadedFile.type,
        fileSize: uploadedFile.size,
      };

      await actions.addDocument(doc);

      // Success - close modal
      onClose();
      resetForm();
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFile(null);
    setFilePreviewUrl(null);
    setType('PI');
    setSelectedSupplierQuoteId('');
    setCustomFileName('');
    setShowPreview(false);
    setCopySuccess(false);
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleBackFromPreview = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFile(null);
    setFilePreviewUrl(null);
    setCustomFileName('');
    setShowPreview(false);
    setCopySuccess(false);
    setError('');
  };

  if (!isOpen) return null;

  const isImage = file && file.type.startsWith('image/');
  const isPDF = file && file.type === 'application/pdf';

  return (
    <div style={styles.overlay}>
      <div style={{...styles.modal, ...(showPreview ? styles.modalLarge : {})}}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>{showPreview ? 'Preview Document' : 'Upload Document'}</h2>
          <button onClick={handleClose} style={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {/* Content - File Selection Form */}
        {!showPreview && (
        <div style={styles.content}>
          {/* Document Type */}
          <div style={styles.field}>
            <label style={styles.label}>
              Document Type <span style={styles.required}>*</span>
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={styles.select}
            >
              {DOCUMENT_TYPES.map(dt => (
                <option key={dt.value} value={dt.value}>
                  {dt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Supplier */}
          <div style={styles.field}>
            <label style={styles.label}>
              Supplier <span style={styles.required}>*</span>
            </label>
            {supplierQuotes.length === 0 ? (
              <div style={styles.noSuppliers}>
                <AlertCircle size={16} />
                <span>No suppliers found. Upload a quote first.</span>
              </div>
            ) : (
              <select
                value={selectedSupplierQuoteId}
                onChange={(e) => setSelectedSupplierQuoteId(e.target.value)}
                style={styles.select}
              >
                <option value="">-- Select Supplier --</option>
                {supplierQuotes.map(sq => (
                  <option key={sq.id} value={sq.id}>
                    {sq.supplier_name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* File Upload */}
          <div style={styles.field}>
            <label style={styles.label}>
              File <span style={styles.required}>*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <div
              style={styles.dropzone}
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div style={styles.fileInfo}>
                  <FileText size={24} color="#3b82f6" />
                  <div>
                    <div style={styles.fileName}>{file.name}</div>
                    <div style={styles.fileSize}>
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <Check size={20} color="#10b981" />
                </div>
              ) : (
                <div style={styles.dropzoneEmpty}>
                  <Upload size={32} color="#94a3b8" />
                  <p>Click to select file</p>
                  <p style={styles.hint}>PDF or Image (PNG, JPG) • Max 10MB</p>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={styles.error}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Info */}
          <div style={styles.info}>
            <AlertCircle size={16} />
            <div>
              <strong>Note:</strong> This document will be linked to the selected supplier
              and can be accessed from this Buying Intent.
            </div>
          </div>
        </div>
        )}

        {/* Content - Preview & Finalize */}
        {showPreview && (
        <div style={styles.previewContent}>
          {/* Custom Name Input */}
          <div style={styles.field}>
            <label style={styles.label}>
              Document Name <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              placeholder="Enter document name"
              style={styles.input}
            />
            <p style={styles.hint}>Name without file extension</p>
          </div>

          {/* File Preview */}
          <div style={styles.previewSection}>
            <div style={styles.previewHeader}>
              <span style={styles.label}>Preview</span>
              {isImage && (
                <button
                  onClick={handleCopyImage}
                  style={styles.copyButton}
                  title="Copy image to clipboard"
                >
                  {copySuccess ? (
                    <>
                      <Check size={16} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy Image
                    </>
                  )}
                </button>
              )}
            </div>

            <div style={styles.previewBox}>
              {isImage ? (
                <img
                  src={filePreviewUrl}
                  alt="Preview"
                  style={styles.previewImage}
                />
              ) : isPDF ? (
                <iframe
                  src={filePreviewUrl}
                  style={styles.previewPDF}
                  title="PDF Preview"
                />
              ) : (
                <div style={styles.noPreview}>
                  <FileText size={48} color="#94a3b8" />
                  <p>Preview not available</p>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={styles.error}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* File Info */}
          <div style={styles.fileMetadata}>
            <div><strong>File:</strong> {file?.name}</div>
            <div><strong>Size:</strong> {(file?.size / 1024).toFixed(1)} KB</div>
            <div><strong>Type:</strong> {file?.type}</div>
          </div>
        </div>
        )}

        {/* Footer - File Selection */}
        {!showPreview && (
        <div style={styles.footer}>
          <button onClick={handleClose} style={styles.cancelButton}>
            Cancel
          </button>
        </div>
        )}

        {/* Footer - Preview & Upload */}
        {showPreview && (
        <div style={styles.footer}>
          <button onClick={handleBackFromPreview} style={styles.cancelButton}>
            Back
          </button>
          <button
            onClick={handleUpload}
            disabled={!customFileName.trim() || uploading}
            style={{
              ...styles.uploadButton,
              ...((!customFileName.trim() || uploading) ? styles.uploadButtonDisabled : {})
            }}
          >
            {uploading ? (
              <>
                <div className="spinner" style={styles.spinner} />
                Uploading...
              </>
            ) : (
              <>
                <Upload size={16} />
                Upload Document
              </>
            )}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    width: '90%',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    color: '#64748b',
  },
  content: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '8px',
    color: '#374151',
  },
  required: {
    color: '#ef4444',
  },
  select: {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
  },
  noSuppliers: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    background: '#fef3c7',
    border: '1px solid #fcd34d',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#92400e',
  },
  dropzone: {
    border: '2px dashed #cbd5e1',
    borderRadius: '8px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dropzoneEmpty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    color: '#64748b',
  },
  hint: {
    fontSize: '12px',
    color: '#94a3b8',
    margin: 0,
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  fileName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  },
  fileSize: {
    fontSize: '12px',
    color: '#64748b',
  },
  error: {
    display: 'flex',
    gap: '8px',
    padding: '12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#b91c1c',
    fontSize: '14px',
  },
  info: {
    display: 'flex',
    gap: '8px',
    padding: '12px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '6px',
    color: '#1e40af',
    fontSize: '13px',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid #e5e7eb',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelButton: {
    padding: '10px 20px',
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    color: '#374151',
  },
  uploadButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  uploadButtonDisabled: {
    background: '#cbd5e1',
    cursor: 'not-allowed',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid white',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
  modalLarge: {
    maxWidth: '800px',
    maxHeight: '90vh',
  },
  previewContent: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    maxHeight: 'calc(90vh - 160px)',
    overflowY: 'auto',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    width: '100%',
  },
  previewSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  copyButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  previewBox: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    background: '#f9fafb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '500px',
    objectFit: 'contain',
  },
  previewPDF: {
    width: '100%',
    height: '500px',
    border: 'none',
  },
  noPreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: '#64748b',
  },
  fileMetadata: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    background: '#f9fafb',
    borderRadius: '8px',
    fontSize: '13px',
    color: '#64748b',
  },
};

export default UploadDocumentModal;
