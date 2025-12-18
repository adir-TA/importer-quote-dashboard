import React, { useRef, useState } from 'react';
import {
  X, Upload, FileText, Image, AlertCircle, CheckCircle, Loader,
  Trash2, Plus, Info, ChevronDown, ChevronRight, Lock, Check
} from 'lucide-react';
import { useMultiItemQuoteExtraction } from '../hooks/useMultiItemQuoteExtraction';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { calculateMatchConfidence } from '../utils/buyingIntentMatcher';
import API_BASE_URL from '../config/api';

// ============================================
// MULTI-ITEM QUOTE UPLOAD MODAL
// ============================================
//
// Trust-First UX Principles:
// 1. Hide percentages - use human-readable labels
// 2. Auto-lock high confidence (no dropdown)
// 3. Trust-building copy in match details
// 4. Inline expandable match details (not floating)
// 5. Directive auto-match summary
// 6. Dropdowns only close on selection or Escape
// ============================================

const ACCEPTED_FILES = '.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp';

// Confidence Badge Component - Suggestions Only
function ConfidenceBadge({ level, confidence }) {
  const badges = {
    high: {
      label: 'Strong Suggestion',
      icon: Info,
      bg: '#eff6ff',
      text: '#1e40af',
      border: '#bfdbfe',
    },
    medium: {
      label: 'Suggested',
      icon: Info,
      bg: '#fef3c7',
      text: '#a16207',
      border: '#fcd34d',
    },
    low: {
      label: 'Weak Suggestion',
      icon: AlertCircle,
      bg: '#f3f4f6',
      text: '#6b7280',
      border: '#d1d5db',
    },
  };

  const badge = badges[level] || badges.low;
  const Icon = badge.icon;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 10px',
      fontSize: '0.75rem',
      fontWeight: 600,
      borderRadius: '4px',
      background: badge.bg,
      color: badge.text,
      border: `1px solid ${badge.border}`,
      marginLeft: '6px',
    }}>
      <Icon size={12} />
      <span>{badge.label}</span>
    </div>
  );
}

// Inline Match Details Component
function InlineMatchDetails({ item, buyingIntent, matchBreakdown, confidence, confidenceLevel, onClose }) {
  if (!buyingIntent || !matchBreakdown) return null;

  // Match explanation (factual, not confident)
  const getMatchExplanation = () => {
    if (confidenceLevel === 'high') {
      return "Dimensions and weight match. Any other differences are labeling only.";
    } else if (confidenceLevel === 'medium') {
      return "Physical specs are similar. Review the breakdown below to confirm.";
    } else {
      return "Some specs differ. Check the breakdown before accepting this suggestion.";
    }
  };

  return (
    <tr>
      <td colSpan="8" style={{ padding: 0, background: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
        <div style={{ padding: '16px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: '#64748b' }}>
                Suggested: {buyingIntent.name}
              </div>
              {buyingIntent.category && (
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Category: {buyingIntent.category}
                </div>
              )}
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: '#f3f4f6',
                borderLeft: '3px solid #9ca3af',
                borderRadius: '4px',
                fontSize: '0.8rem',
                color: '#374151',
              }}>
                {getMatchExplanation()}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: '#64748b',
              }}
              title="Close details"
            >
              <X size={16} />
            </button>
          </div>

          {/* Match Breakdown - Grouped by Priority */}
          <div style={{ marginTop: '16px' }}>
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              marginBottom: '8px',
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Match Breakdown
            </div>

            {/* Physical Specs Section */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                marginBottom: '6px',
                color: '#374151',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                Physical Specifications
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {['dimensions', 'weight'].map(key => {
                  const data = matchBreakdown[key];
                  if (!data) return null;
                  const scorePercent = data.score;
                  const barColor = scorePercent >= 80 ? '#10b981' : scorePercent >= 50 ? '#f59e0b' : '#ef4444';

                  return (
                    <div key={key} style={{
                      background: 'white',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{
                          textTransform: 'capitalize',
                          fontWeight: 500,
                          fontSize: '0.8rem',
                        }}>
                          {key}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          color: '#64748b',
                        }}>
                          {data.weight}% weight
                        </span>
                      </div>
                      <div style={{
                        height: '8px',
                        background: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '4px',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${scorePercent}%`,
                          background: barColor,
                          transition: 'width 0.3s',
                          borderRadius: '4px',
                        }} />
                      </div>
                      {data.detail && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {data.detail.explanation || JSON.stringify(data.detail)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Other Attributes Section */}
            <div>
              <div style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                marginBottom: '6px',
                color: '#374151',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                Material & Naming
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {['material', 'name'].map(key => {
                  const data = matchBreakdown[key];
                  if (!data) return null;
                  const scorePercent = data.score;

                  // Name mismatch uses neutral/amber, never red
                  let barColor;
                  if (key === 'name') {
                    barColor = scorePercent >= 80 ? '#10b981' : '#f59e0b'; // Green or amber only
                  } else {
                    barColor = scorePercent >= 80 ? '#10b981' : scorePercent >= 50 ? '#f59e0b' : '#ef4444';
                  }

                  // Special label for name differences
                  const label = key === 'name' && scorePercent < 50
                    ? 'Supplier naming differs (common in quotes)'
                    : key;

                  return (
                    <div key={key} style={{
                      background: 'white',
                      padding: '10px',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{
                          textTransform: key === 'name' && scorePercent < 50 ? 'none' : 'capitalize',
                          fontWeight: 500,
                          fontSize: '0.8rem',
                        }}>
                          {label}
                        </span>
                        <span style={{
                          fontSize: '0.75rem',
                          color: '#64748b',
                        }}>
                          {data.weight}% weight
                        </span>
                      </div>
                      <div style={{
                        height: '8px',
                        background: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginBottom: '4px',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${scorePercent}%`,
                          background: barColor,
                          transition: 'width 0.3s',
                          borderRadius: '4px',
                        }} />
                      </div>
                      {data.detail && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {data.detail.explanation || JSON.stringify(data.detail)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function MultiItemQuoteUploadModal({ isOpen, onClose, onSuccess, preselectedBuyingIntentId = null }) {
  const { state, actions } = useAppContext();
  const { settings, products } = state;
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedMatchDetails, setExpandedMatchDetails] = useState({});
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [showCreateIntent, setShowCreateIntent] = useState(null); // index of line item creating intent for
  const [newIntentName, setNewIntentName] = useState('');
  const [newIntentCategory, setNewIntentCategory] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]); // for filtering buying intents

  const {
    step,
    progress,
    error,
    supplierFields,
    editableLineItems,
    uploadedFile,
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

  // Get unique categories from products
  const categories = React.useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  // Filter categories by search
  const filteredCategories = React.useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter(cat =>
      cat.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categories, categorySearch]);

  // Filter products by selected categories
  const filteredProducts = React.useMemo(() => {
    if (selectedCategories.length === 0) return products;
    return products.filter(p => selectedCategories.includes(p.category));
  }, [products, selectedCategories]);

  // Toggle category selection
  const toggleCategory = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Handle category selection in create intent form
  const handleSelectCategory = (category) => {
    setNewIntentCategory(category);
    setShowCategoryDropdown(false);
    setCategorySearch('');
  };

  // Handle create new category
  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      alert('Please enter a category name');
      return;
    }
    setNewIntentCategory(newCategoryName.trim());
    setShowCreateCategory(false);
    setShowCategoryDropdown(false);
    setNewCategoryName('');
    setCategorySearch('');
  };

  // Create preview URL when uploadedFile changes
  React.useEffect(() => {
    if (uploadedFile) {
      const url = URL.createObjectURL(uploadedFile);
      setFilePreviewUrl(url);
      console.log('[Modal] Created preview URL for uploaded file:', uploadedFile.name);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreviewUrl(null);
    }
  }, [uploadedFile]);

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

    // Validate that all line items have a linked buying intent
    const unlinkedItems = editableLineItems.filter(item => !item.linkedBuyingIntentId);
    if (unlinkedItems.length > 0) {
      alert(`All line items must be linked to a Buying Intent.\n\n${unlinkedItems.length} item(s) are not linked yet.`);
      return;
    }

    setSaving(true);
    try {
      console.log('[Modal] Saving quote data:', data);
      console.log('[Modal] Uploaded file:', uploadedFile);
      const result = await actions.addSupplierQuote(data.supplierQuote, data.lineItems);
      console.log('✅ [Modal] Saved supplier quote:', result);

      // Auto-upload the quote file as a document
      console.log('[Modal] Checking auto-upload conditions:', {
        hasUploadedFile: !!uploadedFile,
        uploadedFileName: uploadedFile?.name,
        supplierQuoteId: result?.id,
        resultStructure: result
      });

      if (uploadedFile && result?.id) {
        console.log('[Modal] Auto-uploading quote as document...');

        // Get unique buying intent IDs from line items
        const uniqueBuyingIntentIds = [...new Set(
          data.lineItems
            .filter(item => item.linkedBuyingIntentId)
            .map(item => item.linkedBuyingIntentId)
        )];

        console.log('[Modal] Unique buying intent IDs:', uniqueBuyingIntentIds);

        // Upload document for each unique buying intent
        for (const buyingIntentId of uniqueBuyingIntentIds) {
          try {
            console.log(`[Modal] Starting upload for buying intent: ${buyingIntentId}`);

            // Step 1: Upload file to backend
            const formData = new FormData();
            formData.append('file', uploadedFile);
            formData.append('userId', user.id);
            formData.append('buyingIntentId', buyingIntentId);
            formData.append('supplierQuoteId', result.id);

            console.log('[Modal] FormData prepared:', {
              fileName: uploadedFile.name,
              fileType: uploadedFile.type,
              fileSize: uploadedFile.size,
              userId: user.id,
              buyingIntentId,
              supplierQuoteId: result.id
            });

            const uploadResponse = await fetch(`${API_BASE_URL}/api/documents/upload`, {
              method: 'POST',
              body: formData,
            });

            console.log('[Modal] Upload response status:', uploadResponse.status);

            if (!uploadResponse.ok) {
              const errorText = await uploadResponse.text();
              console.error('[Modal] Upload failed with response:', errorText);
              throw new Error('Failed to upload file to server: ' + errorText);
            }

            const uploadResult = await uploadResponse.json();
            console.log('[Modal] Upload result:', uploadResult);
            const { file: uploadedFileData } = uploadResult;

            // Step 2: Save document metadata to database
            const docData = {
              type: 'quote',
              buyingIntentId,
              supplierQuoteId: result.id,
              filePath: uploadedFileData.path,
              fileName: uploadedFile.name,
              fileType: uploadedFile.type,
              fileSize: uploadedFile.size,
            };
            console.log('[Modal] Saving document metadata:', docData);

            await actions.addDocument(docData);

            console.log(`✅ [Modal] Document uploaded for buying intent: ${buyingIntentId}`);
          } catch (docError) {
            console.error(`❌ [Modal] Failed to upload document for buying intent ${buyingIntentId}:`, docError);
            console.error('[Modal] Error stack:', docError.stack);
            // Don't block the main flow if document upload fails
          }
        }
      } else {
        console.log('[Modal] Skipping auto-upload - conditions not met');
      }

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
    setExpandedMatchDetails({});
    setShowCreateIntent(null);
    setNewIntentName('');
    setNewIntentCategory('');
    setShowCategoryDropdown(false);
    setCategorySearch('');
    setShowCreateCategory(false);
    setNewCategoryName('');
    setSelectedCategories([]);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    onClose();
  };

  const handleCreateNewIntent = async (lineItemIndex) => {
    if (!newIntentName.trim()) {
      alert('Please enter a name for the new Buying Intent');
      return;
    }

    if (!newIntentCategory.trim()) {
      alert('Please select or create a category');
      return;
    }

    try {
      const lineItem = editableLineItems[lineItemIndex];

      // Populate weight and dimensions from the line item
      const newIntentData = {
        name: newIntentName.trim(),
        category: newIntentCategory.trim(),
        dimensions: lineItem.dimensions || null,
        weight_g: lineItem.weight_g ? parseInt(lineItem.weight_g) : null,
      };

      console.log('Creating new buying intent with specs:', newIntentData);

      const newIntent = await actions.addProduct(newIntentData);

      console.log('✅ Created new buying intent with specs:', newIntent);

      // Link the new intent to this line item
      handleBuyingIntentChange(lineItemIndex, newIntent.id);

      // Close the create form and reset states
      setShowCreateIntent(null);
      setNewIntentName('');
      setNewIntentCategory('');
      setShowCategoryDropdown(false);
      setCategorySearch('');
      setShowCreateCategory(false);
      setNewCategoryName('');
    } catch (err) {
      console.error('❌ Failed to create buying intent:', err);
      alert('Failed to create buying intent: ' + err.message);
    }
  };

  const toggleMatchDetails = (index) => {
    setExpandedMatchDetails(prev => ({
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

  // Count suggestions and selections
  const suggestionStats = {
    high: editableLineItems.filter(i => i.suggestedBuyingIntentId && i.matchConfidenceLevel === 'high').length,
    medium: editableLineItems.filter(i => i.suggestedBuyingIntentId && i.matchConfidenceLevel === 'medium').length,
    low: editableLineItems.filter(i => i.suggestedBuyingIntentId && i.matchConfidenceLevel === 'low').length,
    totalSuggestions: editableLineItems.filter(i => i.suggestedBuyingIntentId).length,
    totalSelected: editableLineItems.filter(i => i.linkedBuyingIntentId).length,
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
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
              {/* File Preview Section */}
              {filePreviewUrl && uploadedFile && (
                <div style={styles.previewSection}>
                  <h3 style={styles.sectionTitle}>Quote Preview</h3>
                  <div style={styles.previewContainer}>
                    {uploadedFile.type.startsWith('image/') ? (
                      <img
                        src={filePreviewUrl}
                        alt="Quote preview"
                        style={styles.previewImage}
                      />
                    ) : uploadedFile.type === 'application/pdf' ? (
                      <iframe
                        src={filePreviewUrl}
                        style={styles.previewPdf}
                        title="Quote preview"
                      />
                    ) : (
                      <div style={styles.previewFallback}>
                        <FileText size={48} color="#94a3b8" />
                        <p style={{ marginTop: '12px', color: '#64748b' }}>
                          {uploadedFile.name}
                        </p>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                          Preview not available for this file type
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                          <th style={styles.th}>Buying Intent</th>
                          <th style={styles.thActions}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableLineItems.map((item, index) => {
                          const selectedIntent = products.find(p => p.id === item.linkedBuyingIntentId);
                          const suggestedIntent = products.find(p => p.id === item.suggestedBuyingIntentId);
                          const showDetails = expandedMatchDetails[index];

                          return (
                            <React.Fragment key={item.id}>
                              <tr style={styles.tr}>
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
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {/* Suggestion with Apply button (if available) */}
                                    {suggestedIntent && !selectedIntent && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 8px',
                                        background: '#f9fafb',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '4px',
                                      }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', flex: 1 }}>
                                          Suggested: {suggestedIntent.name}
                                        </span>
                                        <button
                                          onClick={() => handleBuyingIntentChange(index, suggestedIntent.id)}
                                          style={{
                                            padding: '4px 8px',
                                            fontSize: '0.7rem',
                                            background: '#3b82f6',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '3px',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                          }}
                                          title="Apply this suggestion"
                                        >
                                          Apply
                                        </button>
                                      </div>
                                    )}

                                    {/* Create new intent form */}
                                    {showCreateIntent === index ? (
                                      <div style={{
                                        padding: '12px',
                                        background: '#f0f9ff',
                                        border: '1px solid #3b82f6',
                                        borderRadius: '6px',
                                      }}>
                                        {/* Name input */}
                                        <input
                                          type="text"
                                          value={newIntentName}
                                          onChange={(e) => setNewIntentName(e.target.value)}
                                          placeholder="Buying Intent Name *"
                                          style={{
                                            ...styles.tableInput,
                                            width: '100%',
                                            marginBottom: '8px',
                                          }}
                                          autoFocus
                                        />

                                        {/* Category dropdown */}
                                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                                          {showCreateCategory ? (
                                            /* Create new category form */
                                            <div style={{
                                              display: 'flex',
                                              gap: '6px',
                                              marginBottom: '6px',
                                            }}>
                                              <input
                                                type="text"
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                placeholder="New category name"
                                                style={{
                                                  ...styles.tableInput,
                                                  flex: 1,
                                                }}
                                                autoFocus
                                              />
                                              <button
                                                onClick={handleCreateCategory}
                                                style={{
                                                  padding: '6px 12px',
                                                  fontSize: '0.7rem',
                                                  background: '#10b981',
                                                  color: 'white',
                                                  border: 'none',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                }}
                                              >
                                                Add
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setShowCreateCategory(false);
                                                  setNewCategoryName('');
                                                }}
                                                style={{
                                                  padding: '6px 12px',
                                                  fontSize: '0.7rem',
                                                  background: '#ef4444',
                                                  color: 'white',
                                                  border: 'none',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                }}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ) : (
                                            /* Category selection button */
                                            <button
                                              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                                              style={{
                                                ...styles.tableInput,
                                                width: '100%',
                                                textAlign: 'left',
                                                cursor: 'pointer',
                                                background: 'white',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                              }}
                                            >
                                              <span style={{ color: newIntentCategory ? '#374151' : '#9ca3af' }}>
                                                {newIntentCategory || 'Select Category *'}
                                              </span>
                                              <ChevronDown size={14} />
                                            </button>
                                          )}

                                          {/* Category dropdown list */}
                                          {showCategoryDropdown && !showCreateCategory && (
                                            <div style={{
                                              position: 'absolute',
                                              top: '100%',
                                              left: 0,
                                              right: 0,
                                              background: 'white',
                                              border: '1px solid #e5e7eb',
                                              borderRadius: '4px',
                                              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                              maxHeight: '200px',
                                              overflowY: 'auto',
                                              zIndex: 1000,
                                              marginTop: '4px',
                                            }}>
                                              {/* Search input */}
                                              <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '8px',
                                                borderBottom: '1px solid #e5e7eb'
                                              }}>
                                                <Search size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                                                <input
                                                  type="text"
                                                  value={categorySearch}
                                                  onChange={(e) => setCategorySearch(e.target.value)}
                                                  placeholder="Search categories..."
                                                  style={{
                                                    ...styles.tableInput,
                                                    width: '100%',
                                                    fontSize: '0.75rem',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    padding: 0,
                                                    flex: 1,
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                              </div>

                                              {/* Category list */}
                                              {filteredCategories.length > 0 ? (
                                                filteredCategories.map(cat => (
                                                  <button
                                                    key={cat}
                                                    onClick={() => handleSelectCategory(cat)}
                                                    style={{
                                                      width: '100%',
                                                      padding: '8px 12px',
                                                      textAlign: 'left',
                                                      border: 'none',
                                                      background: newIntentCategory === cat ? '#eff6ff' : 'white',
                                                      cursor: 'pointer',
                                                      fontSize: '0.75rem',
                                                      borderBottom: '1px solid #f3f4f6',
                                                    }}
                                                    onMouseEnter={(e) => e.target.style.background = '#f9fafb'}
                                                    onMouseLeave={(e) => e.target.style.background = newIntentCategory === cat ? '#eff6ff' : 'white'}
                                                  >
                                                    {cat}
                                                  </button>
                                                ))
                                              ) : (
                                                <div style={{
                                                  padding: '12px',
                                                  textAlign: 'center',
                                                  color: '#9ca3af',
                                                  fontSize: '0.75rem',
                                                }}>
                                                  No categories found
                                                </div>
                                              )}

                                              {/* Create new category button */}
                                              <button
                                                onClick={() => {
                                                  setShowCreateCategory(true);
                                                  setShowCategoryDropdown(false);
                                                }}
                                                style={{
                                                  width: '100%',
                                                  padding: '10px 12px',
                                                  textAlign: 'left',
                                                  border: 'none',
                                                  background: '#f0fdf4',
                                                  color: '#10b981',
                                                  cursor: 'pointer',
                                                  fontSize: '0.75rem',
                                                  fontWeight: 600,
                                                  borderTop: '2px solid #e5e7eb',
                                                }}
                                              >
                                                + Create New Category
                                              </button>
                                            </div>
                                          )}
                                        </div>

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => handleCreateNewIntent(index)}
                                            style={{
                                              flex: 1,
                                              padding: '8px 12px',
                                              fontSize: '0.75rem',
                                              background: '#3b82f6',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                              fontWeight: 500,
                                            }}
                                          >
                                            Create Buying Intent
                                          </button>
                                          <button
                                            onClick={() => {
                                              setShowCreateIntent(null);
                                              setNewIntentName('');
                                              setNewIntentCategory('');
                                              setShowCategoryDropdown(false);
                                              setCategorySearch('');
                                              setShowCreateCategory(false);
                                              setNewCategoryName('');
                                            }}
                                            style={{
                                              flex: 1,
                                              padding: '8px 12px',
                                              fontSize: '0.75rem',
                                              background: 'white',
                                              color: '#64748b',
                                              border: '1px solid #e5e7eb',
                                              borderRadius: '4px',
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        {/* Category filter buttons */}
                                        {categories.length > 0 && (
                                          <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '4px',
                                            marginBottom: '6px',
                                          }}>
                                            {categories.map(category => (
                                              <button
                                                key={category}
                                                onClick={() => toggleCategory(category)}
                                                style={{
                                                  padding: '4px 10px',
                                                  fontSize: '0.7rem',
                                                  background: selectedCategories.includes(category) ? '#3b82f6' : '#f3f4f6',
                                                  color: selectedCategories.includes(category) ? 'white' : '#374151',
                                                  border: 'none',
                                                  borderRadius: '12px',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                  transition: 'all 0.2s',
                                                }}
                                                title={`Filter by ${category}`}
                                              >
                                                {category}
                                              </button>
                                            ))}
                                            {selectedCategories.length > 0 && (
                                              <button
                                                onClick={() => setSelectedCategories([])}
                                                style={{
                                                  padding: '4px 10px',
                                                  fontSize: '0.7rem',
                                                  background: '#fef2f2',
                                                  color: '#ef4444',
                                                  border: 'none',
                                                  borderRadius: '12px',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                }}
                                                title="Clear filters"
                                              >
                                                Clear
                                              </button>
                                            )}
                                          </div>
                                        )}

                                        {/* Always-editable dropdown */}
                                        <select
                                          value={item.linkedBuyingIntentId || ''}
                                          onChange={(e) => {
                                            if (e.target.value === '__CREATE_NEW__') {
                                              setShowCreateIntent(index);
                                              setNewIntentName('');
                                            } else {
                                              handleBuyingIntentChange(index, e.target.value);
                                            }
                                          }}
                                          style={{
                                            ...styles.tableInput,
                                            width: '100%',
                                            borderColor: !item.linkedBuyingIntentId ? '#f59e0b' : undefined,
                                            borderWidth: !item.linkedBuyingIntentId ? '2px' : '1px',
                                          }}
                                        >
                                          <option value="">
                                            -- Select Buying Intent (Required) --
                                            {selectedCategories.length > 0 && ` (${filteredProducts.length} filtered)`}
                                          </option>
                                          {filteredProducts.map(product => (
                                            <option key={product.id} value={product.id}>
                                              {product.name} {product.category ? `(${product.category})` : ''}
                                            </option>
                                          ))}
                                          <option value="__CREATE_NEW__" style={{ fontWeight: 'bold', color: '#3b82f6' }}>
                                            + Create New Buying Intent
                                          </option>
                                        </select>
                                      </div>
                                    )}

                                    {/* Suggestion badge + Details button */}
                                    {suggestedIntent && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <ConfidenceBadge
                                          level={item.matchConfidenceLevel}
                                          confidence={item.matchConfidence}
                                        />
                                        <button
                                          onClick={() => toggleMatchDetails(index)}
                                          style={{
                                            background: 'none',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            padding: '4px 8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.75rem',
                                            color: '#64748b',
                                          }}
                                          title={showDetails ? "Hide details" : "Why suggested?"}
                                        >
                                          {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                          <span>Why?</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
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

                              {/* Inline Match Details */}
                              {showDetails && suggestedIntent && (
                                <InlineMatchDetails
                                  item={item}
                                  buyingIntent={suggestedIntent}
                                  matchBreakdown={item.matchBreakdown}
                                  confidence={item.matchConfidence}
                                  confidenceLevel={item.matchConfidenceLevel}
                                  onClose={() => toggleMatchDetails(index)}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Suggestion Summary - Informational */}
              {editableLineItems.length > 0 && suggestionStats.totalSuggestions > 0 && (
                <div style={{
                  background: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '14px 18px',
                  fontSize: '0.85rem',
                  marginTop: '16px',
                }}>
                  <div style={{
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <Info size={16} />
                    <span>
                      Found {suggestionStats.totalSuggestions} possible {suggestionStats.totalSuggestions === 1 ? 'match' : 'matches'}.
                      {suggestionStats.totalSelected > 0 && ` ${suggestionStats.totalSelected} selected.`}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    marginTop: '4px',
                  }}>
                    Click "Why?" to see how each suggestion was calculated. Apply suggestions manually or select from the dropdown.
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
  previewSection: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
    background: '#f9fafb',
  },
  previewContainer: {
    width: '100%',
    height: '400px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
    overflow: 'hidden',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  previewPdf: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  previewFallback: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8',
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
