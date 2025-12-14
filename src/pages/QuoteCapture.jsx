import React, { useState, useRef, useEffect } from 'react';
import {
  Upload, Check, AlertCircle, Loader, FileText, X,
  CheckCircle2, AlertTriangle, Package, Clipboard, Image as ImageIcon,
  FileSpreadsheet, File, Info, ChevronDown, ChevronRight
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { extractQuoteFromFile, wasFound, getValue } from '../utils/quoteExtractionService';

// ============================================
// FIELD CONFIDENCE INDICATOR
// ============================================
// Trust indicator: Shows users which fields were actually found vs missing
// This is critical for importer trust - no guessing allowed
function FieldConfidence({ field, label, children }) {
  const found = wasFound(field);

  return (
    <div className="field-with-confidence">
      <div className="field-confidence-header">
        <label className="form-label">{label}</label>
        {found ? (
          <span className="confidence-badge confidence-found" title={`Found in document${field.source ? `: ${field.source}` : ''}`}>
            <CheckCircle2 size={12} />
            Found
          </span>
        ) : (
          <span className="confidence-badge confidence-missing" title="Not found in document">
            <AlertCircle size={12} />
            Not found
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ============================================
// LINE ITEM PREVIEW TABLE
// ============================================
// Shows all extracted line items from multi-SKU quotes
// User MUST select one - never auto-select
function LineItemTable({ lineItems, selectedItemId, onSelectItem }) {
  const [expandedRows, setExpandedRows] = useState({});

  const toggleRow = (itemId) => {
    setExpandedRows(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  if (!lineItems || lineItems.length === 0) {
    return (
      <div className="empty-state-inline">
        <AlertCircle size={16} />
        <span>No line items detected in document</span>
      </div>
    );
  }

  return (
    <div className="line-items-table">
      <div className="line-items-header">
        <AlertTriangle size={16} color="var(--warning)" />
        <span>
          <strong>{lineItems.length} line {lineItems.length === 1 ? 'item' : 'items'} detected.</strong>
          {lineItems.length > 1 && ' Select ONE to create quote.'}
        </span>
      </div>

      <div className="line-items-list">
        {lineItems.map((item, index) => {
          const isSelected = selectedItemId === item.id;
          const isExpanded = expandedRows[item.id];
          const productName = getValue(item.productName) || getValue(item.sku) || `Line ${index + 1}`;
          const unitPrice = getValue(item.unitPrice);
          const quantity = getValue(item.quantity);
          const moq = getValue(item.moq);

          return (
            <div
              key={item.id}
              className={`line-item-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectItem(item.id)}
            >
              {/* Header Row */}
              <div className="line-item-header">
                <div className="line-item-selector">
                  <div className={`custom-radio ${isSelected ? 'checked' : ''}`}>
                    {isSelected && <Check size={12} />}
                  </div>
                  <div className="line-item-summary">
                    <div className="line-item-name">{productName}</div>
                    <div className="line-item-price">
                      {unitPrice !== null ? (
                        <>
                          ${unitPrice.toFixed(2)}/unit
                          {quantity && <span className="quantity-badge">× {quantity} units</span>}
                        </>
                      ) : (
                        <span className="text-muted">Price not found</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  className="icon-btn"
                  onClick={(e) => { e.stopPropagation(); toggleRow(item.id); }}
                  type="button"
                  title={isExpanded ? 'Collapse details' : 'Expand details'}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="line-item-details">
                  <div className="detail-grid">
                    <DetailField field={item.sku} label="SKU" />
                    <DetailField field={item.unitPrice} label="Unit Price" format={(v) => `$${v}`} />
                    <DetailField field={item.moq} label="MOQ" format={(v) => `${v} units`} />
                    <DetailField field={item.quantity} label="Quantity" format={(v) => `${v} units`} />
                    <DetailField field={item.dimensions} label="Dimensions" />
                    <DetailField field={item.weight} label="Weight" />
                    <DetailField field={item.packing} label="Packing" />
                    <DetailField field={item.cartonSize} label="Carton Size" />
                    <DetailField field={item.cbm} label="CBM" format={(v) => `${v} m³`} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Detail field helper
function DetailField({ field, label, format }) {
  const value = getValue(field);
  const found = wasFound(field);

  return (
    <div className="detail-field">
      <span className="detail-label">{label}:</span>
      {found ? (
        <span className="detail-value">{format ? format(value) : value}</span>
      ) : (
        <span className="detail-value-missing">Not found</span>
      )}
    </div>
  );
}

// ============================================
// MAIN QUOTE CAPTURE COMPONENT
// ============================================
function QuoteCapture() {
  const { state, actions } = useAppContext();
  const { products } = state;
  const fileInputRef = useRef(null);

  // File upload state
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [fileType, setFileType] = useState(null);

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [error, setError] = useState('');

  // Form state
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedLineItemId, setSelectedLineItemId] = useState(null);
  const [confirmedValues, setConfirmedValues] = useState({
    supplierName: '',
    unitPrice: '',
    currency: 'USD',
    moq: '',
    incoterm: '',
  });

  // Success state
  const [success, setSuccess] = useState(false);

  // ============================================
  // CLIPBOARD PASTE SUPPORT
  // ============================================
  // CRITICAL FEATURE: Importers often work with screenshots
  // Must support Ctrl+V to paste images directly
  useEffect(() => {
    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            handleFileCapture(blob, 'clipboard-paste.png', item.type);
          }
          break;
        }
      }
    };

    // Only listen when component is mounted and no file is selected
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // ============================================
  // FILE HANDLING
  // ============================================
  const handleFileCapture = (fileObj, fileName, fileTypeStr) => {
    setFile(fileObj);
    setFileType(fileTypeStr);
    setError('');
    setExtraction(null);
    setSuccess(false);
    setSelectedLineItemId(null);

    // Create preview for images
    if (fileTypeStr.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setFilePreview(e.target.result);
      reader.readAsDataURL(fileObj);
    } else {
      setFilePreview(null);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    handleFileCapture(selectedFile, selectedFile.name, selectedFile.type);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileCapture(droppedFile, droppedFile.name, droppedFile.type);
    }
  };

  // ============================================
  // EXTRACTION
  // ============================================
  const extractQuoteData = async () => {
    if (!file) return;

    setExtracting(true);
    setError('');

    try {
      // Call extraction service
      const result = await extractQuoteFromFile(file);

      if (!result.success) {
        throw new Error(result.error);
      }

      setExtraction(result);

      // Pre-fill confirmed values from extraction (user can edit)
      setConfirmedValues({
        supplierName: getValue(result.supplierName) || '',
        unitPrice: '',  // Never auto-fill price - too risky
        currency: getValue(result.currency) || 'USD',
        moq: '',        // Never auto-fill MOQ - must come from selected line item
        incoterm: getValue(result.incoterm) || '',
      });

      // If single item, auto-select it (but still show in table for transparency)
      if (result.lineItems.length === 1) {
        setSelectedLineItemId(result.lineItems[0].id);
      }

    } catch (err) {
      console.error('[QuoteCapture] Extraction error:', err);
      setError(err.message || 'Failed to extract quote data. Please fill manually.');
    }

    setExtracting(false);
  };

  // ============================================
  // LINE ITEM SELECTION
  // ============================================
  // When user selects a line item, populate price/MOQ from that item
  // This is the ONLY way these fields get auto-filled
  const handleSelectLineItem = (itemId) => {
    setSelectedLineItemId(itemId);

    const item = extraction.lineItems.find(i => i.id === itemId);
    if (!item) return;

    // Update confirmed values with line item data (if found)
    setConfirmedValues(prev => ({
      ...prev,
      unitPrice: getValue(item.unitPrice)?.toString() || prev.unitPrice,
      moq: getValue(item.moq)?.toString() || getValue(item.quantity)?.toString() || prev.moq,
    }));
  };

  // ============================================
  // SAVE QUOTE
  // ============================================
  const saveQuote = async () => {
    // Validation
    if (!selectedProduct) {
      setError('Please select a product');
      return;
    }
    if (!confirmedValues.supplierName.trim()) {
      setError('Please enter supplier name');
      return;
    }
    if (!confirmedValues.unitPrice || parseFloat(confirmedValues.unitPrice) <= 0) {
      setError('Please enter a valid unit price > $0');
      return;
    }

    // Build quote object
    const quoteData = {
      productId: selectedProduct,
      supplierName: confirmedValues.supplierName,
      unitPrice: parseFloat(confirmedValues.unitPrice),
      currency: confirmedValues.currency,
      moq: parseInt(confirmedValues.moq) || 0,
      incoterm: confirmedValues.incoterm,
    };

    // Add metadata if available (shipping info, etc.)
    if (extraction && selectedLineItemId) {
      const selectedItem = extraction.lineItems.find(i => i.id === selectedLineItemId);
      if (selectedItem) {
        quoteData.metadata = {
          sourceFile: extraction.fileName,
          productName: getValue(selectedItem.productName),
          sku: getValue(selectedItem.sku),
          dimensions: getValue(selectedItem.dimensions),
          weight: getValue(selectedItem.weight),
          packing: getValue(selectedItem.packing),
          cartonSize: getValue(selectedItem.cartonSize),
          cbm: getValue(selectedItem.cbm),
          validUntil: getValue(extraction.validUntil),
          paymentTerms: getValue(extraction.paymentTerms),
          leadTime: getValue(extraction.leadTime),
          supplierContact: getValue(extraction.supplierContact),
          supplierEmail: getValue(extraction.supplierEmail),
          notes: getValue(extraction.notes),
        };
      }
    }

    try {
      await actions.addQuote(quoteData);
      setSuccess(true);

      // Reset form after delay
      setTimeout(() => {
        resetForm();
      }, 2000);
    } catch (err) {
      console.error('[QuoteCapture] Save error:', err);
      setError('Failed to save quote. Please try again.');
    }
  };

  const resetForm = () => {
    setFile(null);
    setFilePreview(null);
    setFileType(null);
    setExtraction(null);
    setSelectedProduct('');
    setSelectedLineItemId(null);
    setConfirmedValues({
      supplierName: '',
      unitPrice: '',
      currency: 'USD',
      moq: '',
      incoterm: '',
    });
    setError('');
    setSuccess(false);
  };

  // ============================================
  // RENDER
  // ============================================
  // Get file icon
  const getFileIcon = () => {
    if (!fileType) return <File size={48} />;
    if (fileType.startsWith('image/')) return <ImageIcon size={48} />;
    if (fileType.includes('pdf')) return <FileText size={48} />;
    if (fileType.includes('spreadsheet') || fileType.includes('excel')) return <FileSpreadsheet size={48} />;
    return <File size={48} />;
  };

  return (
    <div className="page">
      <div className="header">
        <div>
          <h2>Upload Quote</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Upload a supplier quote or paste a screenshot (Ctrl+V). Extract data to compare.
          </p>
        </div>
      </div>

      <div className="content">
        {success ? (
          <div className="capture-success">
            <div className="success-icon">
              <Check size={48} />
            </div>
            <h3>Quote Saved!</h3>
            <p>Quote added to product for comparison</p>
          </div>
        ) : (
          <div className="capture-layout">
            {/* LEFT: Upload Area */}
            <div className="capture-upload-section">
              <div
                className={`upload-zone ${file ? 'has-file' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => !file && fileInputRef.current?.click()}
              >
                {file ? (
                  <div className="file-preview-container">
                    {filePreview ? (
                      <img src={filePreview} alt="Quote preview" className="image-preview" />
                    ) : (
                      <div className="file-icon-preview">
                        {getFileIcon()}
                        <p className="file-name">{file.name}</p>
                      </div>
                    )}
                    <button className="remove-file-btn" onClick={(e) => { e.stopPropagation(); resetForm(); }}>
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon">
                      <Upload size={48} />
                    </div>
                    <h3>Upload Quote Document</h3>
                    <p>Drag & drop, click to browse, or <strong>press Ctrl+V to paste</strong></p>
                    <div className="upload-hints">
                      <div className="upload-hint-item">
                        <Clipboard size={16} />
                        <span>Paste screenshot</span>
                      </div>
                      <div className="upload-hint-item">
                        <ImageIcon size={16} />
                        <span>Image (PNG, JPG)</span>
                      </div>
                      <div className="upload-hint-item">
                        <FileText size={16} />
                        <span>PDF document</span>
                      </div>
                      <div className="upload-hint-item">
                        <FileSpreadsheet size={16} />
                        <span>Excel spreadsheet</span>
                      </div>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.xlsx,.xls"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              {file && !extraction && (
                <button
                  className="btn btn-primary extract-btn"
                  onClick={extractQuoteData}
                  disabled={extracting}
                >
                  {extracting ? (
                    <>
                      <Loader size={18} className="spinner" />
                      Extracting data...
                    </>
                  ) : (
                    <>
                      <FileText size={18} />
                      Extract Quote Data
                    </>
                  )}
                </button>
              )}

              {error && (
                <div className="capture-error">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              {/* Extraction Info */}
              {extraction && (
                <div className="extraction-info-card">
                  <div className="extraction-info-header">
                    <Info size={16} />
                    <span>Extraction Summary</span>
                  </div>
                  <div className="extraction-stats">
                    <div className="stat-item">
                      <span className="stat-label">File:</span>
                      <span className="stat-value">{extraction.fileName}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Line Items:</span>
                      <span className="stat-value">{extraction.lineItems.length}</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Core Fields Found:</span>
                      <span className="stat-value">
                        {extraction.meta.found} / {extraction.meta.total}
                      </span>
                    </div>
                  </div>
                  <div className="extraction-notice">
                    <AlertTriangle size={14} />
                    <span>Review and confirm all fields below. Only use data explicitly found in the document.</span>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Confirmation Form */}
            {extraction && (
              <div className="capture-form-section">
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      <Package size={18} /> Confirm Quote Details
                    </span>
                  </div>
                  <div className="card-body">
                    {/* Product Selection */}
                    <div className="form-group">
                      <label className="form-label">Product *</label>
                      <select
                        className="form-select"
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                      >
                        <option value="">Select product for this quote...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <p className="form-hint">Which product does this quote apply to?</p>
                    </div>

                    {/* Line Items Table */}
                    {extraction.lineItems.length > 0 && (
                      <div className="form-group">
                        <label className="form-label">
                          Line Items {extraction.lineItems.length > 1 && '(Select One) *'}
                        </label>
                        <LineItemTable
                          lineItems={extraction.lineItems}
                          selectedItemId={selectedLineItemId}
                          onSelectItem={handleSelectLineItem}
                        />
                      </div>
                    )}

                    {/* Core Fields */}
                    <div className="form-section-title">Core Quote Fields</div>

                    <FieldConfidence field={extraction.supplierName} label="Supplier Name *">
                      <input
                        type="text"
                        className="form-input"
                        value={confirmedValues.supplierName}
                        onChange={(e) => setConfirmedValues({ ...confirmedValues, supplierName: e.target.value })}
                        placeholder="Enter supplier name"
                      />
                    </FieldConfidence>

                    <div className="form-group">
                      <label className="form-label">Unit Price (FOB) *</label>
                      <div className="input-with-prefix">
                        <span className="input-prefix">$</span>
                        <input
                          type="number"
                          className="form-input"
                          value={confirmedValues.unitPrice}
                          onChange={(e) => setConfirmedValues({ ...confirmedValues, unitPrice: e.target.value })}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                        />
                        <span className="input-suffix">/ unit</span>
                      </div>
                      <p className="form-hint">
                        {selectedLineItemId
                          ? 'Populated from selected line item. Verify accuracy.'
                          : 'Enter the FOB price per unit from the selected line item.'}
                      </p>
                    </div>

                    <FieldConfidence field={extraction.currency} label="Currency">
                      <select
                        className="form-select"
                        value={confirmedValues.currency}
                        onChange={(e) => setConfirmedValues({ ...confirmedValues, currency: e.target.value })}
                      >
                        <option value="USD">USD ($)</option>
                        <option value="EUR">EUR (€)</option>
                        <option value="GBP">GBP (£)</option>
                        <option value="CNY">CNY (¥)</option>
                      </select>
                    </FieldConfidence>

                    <div className="form-group">
                      <label className="form-label">MOQ (Minimum Order Quantity)</label>
                      <div className="input-with-suffix">
                        <input
                          type="number"
                          className="form-input"
                          value={confirmedValues.moq}
                          onChange={(e) => setConfirmedValues({ ...confirmedValues, moq: e.target.value })}
                          placeholder="0"
                          step="1"
                          min="0"
                        />
                        <span className="input-suffix">units</span>
                      </div>
                      <p className="form-hint">Minimum order quantity for this price</p>
                    </div>

                    <FieldConfidence field={extraction.incoterm} label="Incoterm">
                      <input
                        type="text"
                        className="form-input"
                        value={confirmedValues.incoterm}
                        onChange={(e) => setConfirmedValues({ ...confirmedValues, incoterm: e.target.value })}
                        placeholder="e.g., FOB Shanghai, CIF Los Angeles"
                      />
                      <p className="form-hint">Shipping terms (FOB, CIF, EXW, etc.)</p>
                    </FieldConfidence>

                    {/* Actions */}
                    <div className="form-actions">
                      <button className="btn btn-secondary" onClick={resetForm}>
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={saveQuote}
                        disabled={!selectedProduct || !confirmedValues.supplierName || !confirmedValues.unitPrice}
                      >
                        <Check size={16} /> Save Quote
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuoteCapture;
