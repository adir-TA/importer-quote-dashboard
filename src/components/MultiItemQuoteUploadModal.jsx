import React, { useRef, useState } from 'react';
import {
  X, Upload, FileText, Image, AlertCircle, CheckCircle, Loader,
  Trash2, Plus
} from 'lucide-react';
import { useMultiItemQuoteExtraction } from '../hooks/useMultiItemQuoteExtraction';
import { useAppContext } from '../context/AppContext';

// ============================================
// MULTI-ITEM QUOTE UPLOAD MODAL
// ============================================
//
// NEW FLOW:
// 1. Upload quote file
// 2. Review supplier info + ALL line items in table
// 3. Edit any field inline
// 4. One "Confirm & Save Quote" button
// 5. Saves SupplierQuote + all QuoteLineItems to DB
//
// NO MORE:
// - "Select one item" flow
// - Product linking (not MVP)
// ============================================

const ACCEPTED_FILES = '.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp';

function MultiItemQuoteUploadModal({ isOpen, onClose, onSuccess }) {
  const { state, actions } = useAppContext();
  const { settings } = state;
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    step,
    progress,
    error,
    supplierFields,
    editableLineItems,
    missingSupplierFields,
    invalidLineItems,
    canSave,
    processFile,
    updateSupplierField,
    updateLineItem,
    deleteLineItem,
    getQuoteData,
    reset,
  } = useMultiItemQuoteExtraction(settings.apiKey);

  if (!isOpen) return null;

  // ============================================
  // HANDLERS
  // ============================================

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleSave = async () => {
    const data = getQuoteData();
    if (!data) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      console.log('[Modal] Saving quote data:', data);
      const result = await actions.addSupplierQuote(data.supplierQuote, data.lineItems);
      console.log('✅ [Modal] Saved supplier quote:', result);

      if (onSuccess) onSuccess(result);
      handleClose();
    } catch (err) {
      console.error('❌ [Modal] Save failed:', err);
      alert(`Failed to save quote:\n\n${err.message}\n\nCheck console for details.`);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Upload Supplier Quote</h2>
          <button onClick={handleClose} style={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* IDLE: Upload */}
          {step === 'idle' && (
            <div
              style={{ ...styles.dropzone, ...(dragActive ? styles.dropzoneActive : {}) }}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={48} color="#94a3b8" />
              <p style={styles.dropzoneText}>
                Drop quote file here or <span style={styles.link}>browse</span>
              </p>
              <p style={styles.dropzoneHint}>
                Supports: PDF, Excel, Images
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILES}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {/* EXTRACTING */}
          {step === 'extracting' && (
            <div style={styles.loading}>
              <Loader size={48} color="#3b82f6" style={styles.spinner} />
              <p style={styles.loadingText}>{progress}</p>
            </div>
          )}

          {/* ERROR */}
          {step === 'error' && (
            <div style={styles.error}>
              <AlertCircle size={48} color="#ef4444" />
              <p style={styles.errorText}>{error}</p>
              <button onClick={reset} style={styles.retryButton}>
                Try Again
              </button>
            </div>
          )}

          {/* REVIEW */}
          {step === 'review' && (
            <div style={styles.review}>
              {/* Supplier Info Section */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Supplier Information</h3>
                <div style={styles.grid}>
                  <div style={styles.field}>
                    <label style={styles.label}>
                      Supplier Name <span style={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={supplierFields.supplierName}
                      onChange={(e) => updateSupplierField('supplierName', e.target.value)}
                      style={styles.input}
                      placeholder="Required"
                    />
                    {missingSupplierFields.includes('supplierName') && (
                      <span style={styles.errorHint}>Required field</span>
                    )}
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Contact Person</label>
                    <input
                      type="text"
                      value={supplierFields.supplierContact}
                      onChange={(e) => updateSupplierField('supplierContact', e.target.value)}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Email</label>
                    <input
                      type="email"
                      value={supplierFields.supplierEmail}
                      onChange={(e) => updateSupplierField('supplierEmail', e.target.value)}
                      style={styles.input}
                    />
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Currency</label>
                    <select
                      value={supplierFields.currency}
                      onChange={(e) => updateSupplierField('currency', e.target.value)}
                      style={styles.input}
                    >
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="CNY">CNY</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>
                      Incoterm <span style={styles.required}>*</span>
                    </label>
                    <input
                      type="text"
                      value={supplierFields.incoterm}
                      onChange={(e) => updateSupplierField('incoterm', e.target.value)}
                      style={styles.input}
                      placeholder="e.g., FOB Shanghai"
                    />
                    {missingSupplierFields.includes('incoterm') && (
                      <span style={styles.errorHint}>Required field</span>
                    )}
                  </div>

                  <div style={styles.field}>
                    <label style={styles.label}>Valid Until</label>
                    <input
                      type="date"
                      value={supplierFields.validUntil}
                      onChange={(e) => updateSupplierField('validUntil', e.target.value)}
                      style={styles.input}
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  Line Items ({editableLineItems.length})
                </h3>

                {editableLineItems.length === 0 ? (
                  <div style={styles.noItems}>
                    <AlertCircle size={32} color="#94a3b8" />
                    <p>No line items extracted</p>
                  </div>
                ) : (
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Product Name</th>
                          <th style={styles.th}>SKU</th>
                          <th style={styles.th}>Unit Price</th>
                          <th style={styles.th}>MOQ</th>
                          <th style={styles.th}>Dimensions</th>
                          <th style={styles.th}>Weight (g)</th>
                          <th style={styles.th}>Packing (pcs/ctn)</th>
                          <th style={styles.th}>CBM</th>
                          <th style={styles.thActions}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableLineItems.map((item, index) => (
                          <tr key={item.id} style={styles.tr}>
                            <td style={styles.td}>
                              <input
                                type="text"
                                value={item.productName}
                                onChange={(e) => updateLineItem(index, 'productName', e.target.value)}
                                style={styles.tableInput}
                                placeholder="Required"
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                type="text"
                                value={item.sku}
                                onChange={(e) => updateLineItem(index, 'sku', e.target.value)}
                                style={styles.tableInput}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                type="number"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                                style={{...styles.tableInput, width: '80px'}}
                                placeholder="Required"
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                type="number"
                                value={item.moq}
                                onChange={(e) => updateLineItem(index, 'moq', e.target.value)}
                                style={{...styles.tableInput, width: '70px'}}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                type="text"
                                value={item.dimensions}
                                onChange={(e) => updateLineItem(index, 'dimensions', e.target.value)}
                                style={styles.tableInput}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                type="number"
                                value={item.weight_g}
                                onChange={(e) => updateLineItem(index, 'weight_g', e.target.value)}
                                style={{...styles.tableInput, width: '70px'}}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                type="number"
                                value={item.packing_pcs_per_ctn}
                                onChange={(e) => updateLineItem(index, 'packing_pcs_per_ctn', e.target.value)}
                                style={{...styles.tableInput, width: '70px'}}
                              />
                            </td>
                            <td style={styles.td}>
                              <input
                                type="number"
                                step="0.001"
                                value={item.cbm_per_carton}
                                onChange={(e) => updateLineItem(index, 'cbm_per_carton', e.target.value)}
                                style={{...styles.tableInput, width: '70px'}}
                              />
                            </td>
                            <td style={styles.tdActions}>
                              <button
                                onClick={() => deleteLineItem(index)}
                                style={styles.deleteButton}
                                title="Delete line item"
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Validation Errors */}
              {!canSave && (
                <div style={styles.validationError}>
                  <AlertCircle size={20} />
                  <div>
                    {missingSupplierFields.length > 0 && (
                      <p>Missing supplier fields: {missingSupplierFields.join(', ')}</p>
                    )}
                    {invalidLineItems.length > 0 && (
                      <p>Invalid line items: rows {invalidLineItems.map(i => i.index + 1).join(', ')}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div style={styles.footer}>
            <button onClick={handleClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                ...styles.saveButton,
                ...((!canSave || saving) ? styles.saveButtonDisabled : {})
              }}
            >
              {saving ? (
                <>
                  <Loader size={16} style={styles.spinner} />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Confirm & Save Quote
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// STYLES
// ============================================

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    maxWidth: '1400px',
    width: '95vw',
    maxHeight: '90vh',
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
    overflowY: 'auto',
    flex: 1,
  },
  dropzone: {
    border: '2px dashed #cbd5e1',
    borderRadius: '8px',
    padding: '60px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dropzoneActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  dropzoneText: {
    marginTop: '16px',
    fontSize: '16px',
    color: '#475569',
  },
  link: {
    color: '#3b82f6',
    textDecoration: 'underline',
  },
  dropzoneHint: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#94a3b8',
  },
  loading: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    color: '#64748b',
  },
  error: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  errorText: {
    marginTop: '16px',
    color: '#ef4444',
    fontSize: '16px',
  },
  retryButton: {
    marginTop: '24px',
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  review: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    backgroundColor: '#f8fafc',
    borderRadius: '8px',
    padding: '20px',
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#1e293b',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#475569',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    fontSize: '14px',
  },
  errorHint: {
    fontSize: '12px',
    color: '#ef4444',
  },
  tableContainer: {
    overflowX: 'auto',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '12px 8px',
    backgroundColor: '#f1f5f9',
    borderBottom: '2px solid #e5e7eb',
    textAlign: 'left',
    fontWeight: 600,
    color: '#475569',
    whiteSpace: 'nowrap',
  },
  thActions: {
    padding: '12px 8px',
    backgroundColor: '#f1f5f9',
    borderBottom: '2px solid #e5e7eb',
    width: '40px',
  },
  tr: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '8px',
  },
  tdActions: {
    padding: '8px',
    textAlign: 'center',
  },
  tableInput: {
    padding: '6px 8px',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    fontSize: '13px',
    width: '100%',
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#ef4444',
    padding: '4px',
  },
  noItems: {
    textAlign: 'center',
    padding: '40px',
    color: '#94a3b8',
  },
  validationError: {
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#dc2626',
    display: 'flex',
    gap: '12px',
    fontSize: '14px',
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
    backgroundColor: 'white',
    color: '#64748b',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  saveButton: {
    padding: '10px 20px',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  saveButtonDisabled: {
    backgroundColor: '#cbd5e1',
    cursor: 'not-allowed',
  },
};

export default MultiItemQuoteUploadModal;
