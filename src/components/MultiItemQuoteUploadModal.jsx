import React, { useRef, useState } from 'react';
import {
  X, Upload, FileText, Image, AlertCircle, CheckCircle, Loader,
  Trash2, Plus, Info, ChevronDown, ChevronRight
} from 'lucide-react';
import { useMultiItemQuoteExtraction } from '../hooks/useMultiItemQuoteExtraction';
import { useAppContext } from '../context/AppContext';
import { calculateMatchConfidence } from '../utils/buyingIntentMatcher';

// ============================================
// MULTI-ITEM QUOTE UPLOAD MODAL
// ============================================
//
// Features:
// 1. Auto-matching line items to Buying Intents with confidence scoring
// 2. Confidence badges (High/Medium/Low)
// 3. Match preview/breakdown panel
// 4. No auto-close dropdowns (only close on selection or Escape)
// ============================================

const ACCEPTED_FILES = '.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp';

// Confidence Badge Component
function ConfidenceBadge({ level, confidence }) {
  const colors = {
    high: { bg: '#dcfce7', text: '#15803d', border: '#86efac' },
    medium: { bg: '#fef3c7', text: '#a16207', border: '#fcd34d' },
    low: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  };

  const color = colors[level] || colors.low;

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      fontSize: '0.75rem',
      fontWeight: 600,
      borderRadius: '4px',
      background: color.bg,
      color: color.text,
      border: `1px solid ${color.border}`,
      textTransform: 'uppercase',
      marginLeft: '6px',
    }}>
      {level} ({confidence}%)
    </span>
  );
}

// Match Preview Panel Component
function MatchPreviewPanel({ item, buyingIntent, matchBreakdown, onClose }) {
  if (!buyingIntent || !matchBreakdown) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      marginTop: '4px',
      background: '#f9fafb',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      padding: '12px',
      zIndex: 1000,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong style={{ fontSize: '0.85rem' }}>Match Details</strong>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ fontSize: '0.8rem', marginBottom: '12px' }}>
        <div><strong>Buying Intent:</strong> {buyingIntent.name}</div>
        {buyingIntent.category && <div style={{ color: '#64748b' }}>Category: {buyingIntent.category}</div>}
      </div>

      <div style={{ fontSize: '0.75rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '6px' }}>Match Breakdown:</div>
        {Object.entries(matchBreakdown).map(([key, data]) => {
          const scorePercent = data.score;
          const barColor = scorePercent >= 80 ? '#10b981' : scorePercent >= 50 ? '#f59e0b' : '#ef4444';

          return (
            <div key={key} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ textTransform: 'capitalize' }}>{key}</span>
                <span style={{ color: '#64748b' }}>{data.weight}% weight</span>
              </div>
              <div style={{
                height: '6px',
                background: '#e5e7eb',
                borderRadius: '3px',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${scorePercent}%`,
                  background: barColor,
                  transition: 'width 0.3s',
                }} />
              </div>
              {data.detail && (
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                  {data.detail.explanation || JSON.stringify(data.detail)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MultiItemQuoteUploadModal({ isOpen, onClose, onSuccess, preselectedBuyingIntentId = null }) {
  const { state, actions } = useAppContext();
  const { settings, products } = state;
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedMatchPreviews, setExpandedMatchPreviews] = useState({});

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
  } = useMultiItemQuoteExtraction(settings.apiKey, products);

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
    setExpandedMatchPreviews({});
    onClose();
  };

  const toggleMatchPreview = (index) => {
    setExpandedMatchPreviews(prev => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleBuyingIntentChange = (index, intentId) => {
    updateLineItem(index, 'linkedBuyingIntentId', intentId || null);

    // Recalculate match confidence if a new intent is selected
    if (intentId) {
      const item = editableLineItems[index];
      const intent = products.find(p => p.id === intentId);
      if (intent) {
        const matchResult = calculateMatchConfidence(item, intent);
        updateLineItem(index, 'matchConfidence', matchResult.confidence);
        updateLineItem(index, 'matchConfidenceLevel', matchResult.confidenceLevel);
        updateLineItem(index, 'matchBreakdown', matchResult.breakdown);
        updateLineItem(index, 'autoMatched', false); // Manual override
      }
    } else {
      // Clear match data if deselected
      updateLineItem(index, 'matchConfidence', null);
      updateLineItem(index, 'matchConfidenceLevel', null);
      updateLineItem(index, 'matchBreakdown', null);
      updateLineItem(index, 'autoMatched', false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={styles.overlay} onClick={(e) => {
      // Only close on overlay click, not on dropdown interactions
      if (e.target === e.currentTarget) {
        handleClose();
      }
    }}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            Upload Supplier Quote
            {preselectedBuyingIntentId && (
              <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#64748b', marginLeft: '12px' }}>
                (Auto-linking to selected intent)
              </span>
            )}
          </h2>
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
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#64748b', marginLeft: '12px' }}>
                    {editableLineItems.filter(i => i.autoMatched).length} auto-matched
                  </span>
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
                          <th style={styles.th}>Buying Intent (Auto-matched)</th>
                          <th style={styles.thActions}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableLineItems.map((item, index) => {
                          const selectedIntent = products.find(p => p.id === item.linkedBuyingIntentId);
                          const showMatchPreview = expandedMatchPreviews[index];

                          return (
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
                              <td style={{...styles.td, position: 'relative'}}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <select
                                    value={item.linkedBuyingIntentId || ''}
                                    onChange={(e) => handleBuyingIntentChange(index, e.target.value)}
                                    style={{
                                      ...styles.tableInput,
                                      width: '200px',
                                      background: item.autoMatched ? '#dcfce7' : 'white',
                                      borderColor: item.autoMatched ? '#86efac' : '#e5e7eb',
                                    }}
                                  >
                                    <option value="">-- Select --</option>
                                    {products.map(product => (
                                      <option key={product.id} value={product.id}>
                                        {product.name}
                                      </option>
                                    ))}
                                  </select>
                                  {item.matchConfidence && (
                                    <>
                                      <ConfidenceBadge
                                        level={item.matchConfidenceLevel}
                                        confidence={item.matchConfidence}
                                      />
                                      <button
                                        onClick={() => toggleMatchPreview(index)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '4px',
                                          display: 'flex',
                                          alignItems: 'center',
                                        }}
                                        title="Show match details"
                                      >
                                        {showMatchPreview ? <ChevronDown size={16} /> : <Info size={16} />}
                                      </button>
                                    </>
                                  )}
                                </div>

                                {/* Match Preview Panel */}
                                {showMatchPreview && (
                                  <MatchPreviewPanel
                                    item={item}
                                    buyingIntent={selectedIntent}
                                    matchBreakdown={item.matchBreakdown}
                                    onClose={() => toggleMatchPreview(index)}
                                  />
                                )}
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
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Auto-Match Summary */}
              {editableLineItems.length > 0 && (
                <div style={{
                  background: '#eff6ff',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  fontSize: '0.85rem',
                  marginTop: '16px',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: '4px', color: '#1e40af' }}>
                    ✨ Auto-Matching Summary
                  </div>
                  <div style={{ color: '#1e3a8a' }}>
                    • {editableLineItems.filter(i => i.linkedBuyingIntentId).length} of {editableLineItems.length} items matched
                    • {editableLineItems.filter(i => i.matchConfidenceLevel === 'high').length} high confidence
                    • {editableLineItems.filter(i => i.matchConfidenceLevel === 'medium').length} medium confidence
                    • {editableLineItems.filter(i => i.matchConfidenceLevel === 'low').length} low confidence
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '6px' }}>
                    💡 Review and adjust matches using the dropdowns. Click <Info size={12} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> to see match details.
                  </div>
                </div>
              )}

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
    cursor: 'pointer',
  },
  dropzoneHint: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#94a3b8',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    fontSize: '16px',
    color: '#475569',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  errorText: {
    marginTop: '16px',
    fontSize: '16px',
    color: '#475569',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: '24px',
    padding: '10px 20px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  review: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  section: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: 600,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '6px',
    color: '#374151',
  },
  required: {
    color: '#ef4444',
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
  },
  errorHint: {
    fontSize: '12px',
    color: '#ef4444',
    marginTop: '4px',
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '10px',
    background: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: '12px',
    color: '#374151',
    whiteSpace: 'nowrap',
  },
  thActions: {
    padding: '10px',
    background: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    width: '50px',
  },
  tr: {
    borderBottom: '1px solid #e5e7eb',
  },
  td: {
    padding: '8px',
    verticalAlign: 'middle',
  },
  tdActions: {
    padding: '8px',
    textAlign: 'center',
  },
  tableInput: {
    padding: '6px 8px',
    border: '1px solid #e5e7eb',
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
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px',
    color: '#94a3b8',
  },
  validationError: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#b91c1c',
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
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    color: '#374151',
  },
  saveButton: {
    padding: '10px 20px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  saveButtonDisabled: {
    background: '#cbd5e1',
    cursor: 'not-allowed',
  },
};

export default MultiItemQuoteUploadModal;
