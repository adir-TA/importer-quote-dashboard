import React, { useRef, useState } from 'react';
import { 
  X, Upload, FileText, FileSpreadsheet, Image, 
  AlertCircle, CheckCircle, Loader, ChevronDown, ChevronRight,
  Check, Package, User, DollarSign, Truck
} from 'lucide-react';
import { useQuoteExtraction } from '../hooks/useQuoteExtraction';

// ============================================
// QUOTE UPLOAD MODAL - FIXED VERSION
// ============================================
// 
// FIXES APPLIED:
// 1. Proper modal header with aligned X button
// 2. Clear sections: Supplier → Line Items → Core Fields → Additional
// 3. Per-field status badges ("Extracted" / "Not found")
// 4. Multi-item selection with "Use this item" button
// 5. Required fields clearly marked
// 6. Missing fields show "Not found" not empty
// 7. No global "good extraction" - per-field confidence
//
// DATA MODEL:
// - Core fields (supplier, price, currency, moq, incoterm) → used for landed cost
// - Metadata (dimensions, weight, packing, etc.) → stored but not for calculations
// ============================================

const ACCEPTED_FILES = '.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp';

function QuoteUploadModal({ isOpen, onClose, onSave, productId, productName }) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  
  const {
    step,
    progress,
    error,
    extraction,
    selectedIndex,
    selectedItem,
    formValues,
    hasMultipleItems,
    needsItemSelection,
    missingFields,
    canSave,
    processFile,
    selectItem,
    updateField,
    getQuoteData,
    reset,
    wasFound,
  } = useQuoteExtraction(productId);

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

  const handleSave = () => {
    const data = getQuoteData();
    if (data) {
      onSave(data);
      handleClose();
    }
  };

  const handleClose = () => {
    reset();
    setShowAdditional(false);
    onClose();
  };

  // ============================================
  // RENDER HELPERS
  // ============================================

  const FieldStatus = ({ field }) => {
    if (wasFound(field)) {
      return (
        <span className="field-status extracted">
          <CheckCircle size={10} /> Extracted
        </span>
      );
    }
    return (
      <span className="field-status not-found">
        Not found in document
      </span>
    );
  };

  const FieldValue = ({ field, fallback = 'Not found in document' }) => {
    if (wasFound(field)) {
      return <span className="extracted-value">{field.value}</span>;
    }
    return <span className="missing-value">{fallback}</span>;
  };

  // ============================================
  // STEP: UPLOAD
  // ============================================

  const renderUpload = () => (
    <div className="upload-container">
      <p className="upload-instruction">
        Upload a supplier quote file. We'll extract the data for you to review and confirm.
      </p>
      
      <div 
        className={`drop-zone ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILES}
          onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
          hidden
        />
        <Upload size={32} />
        <p className="drop-text">Drop file here or click to browse</p>
        <div className="file-types">
          <span><FileText size={14} /> PDF</span>
          <span><FileSpreadsheet size={14} /> Excel</span>
          <span><Image size={14} /> Image</span>
        </div>
      </div>
    </div>
  );

  // ============================================
  // STEP: EXTRACTING
  // ============================================

  const renderExtracting = () => (
    <div className="loading-container">
      <Loader size={36} className="spinner" />
      <p>{progress || 'Processing file...'}</p>
    </div>
  );

  // ============================================
  // STEP: ERROR
  // ============================================

  const renderError = () => (
    <div className="error-container">
      <AlertCircle size={36} />
      <p className="error-message">{error}</p>
      <button className="btn btn-secondary" onClick={reset}>Try Again</button>
    </div>
  );

  // ============================================
  // STEP: REVIEW
  // ============================================

  const renderReview = () => (
    <div className="review-container">
      {/* File Info Bar */}
      <div className="file-info">
        <FileText size={16} />
        <span className="filename">{extraction?.fileName}</span>
        <span className="stats">
          {extraction?.meta?.found || 0} of {extraction?.meta?.total || 0} fields extracted
        </span>
      </div>

      {/* SECTION 1: Supplier Information */}
      <section className="review-section">
        <h4 className="section-heading">
          <User size={16} /> Supplier Information
        </h4>
        <div className="info-grid">
          <div className="info-row">
            <label>Supplier Name</label>
            <div className="info-content">
              <FieldValue field={extraction?.supplierName} />
              <FieldStatus field={extraction?.supplierName} />
            </div>
          </div>
          <div className="info-row">
            <label>Contact</label>
            <FieldValue field={extraction?.supplierContact} />
          </div>
          <div className="info-row">
            <label>Currency</label>
            <div className="info-content">
              <FieldValue field={extraction?.currency} fallback="USD (default)" />
              <FieldStatus field={extraction?.currency} />
            </div>
          </div>
          <div className="info-row">
            <label>Incoterm</label>
            <div className="info-content">
              <FieldValue field={extraction?.incoterm} />
              <FieldStatus field={extraction?.incoterm} />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Line Items */}
      <section className="review-section">
        <h4 className="section-heading">
          <Package size={16} /> Line Items
          {hasMultipleItems && (
            <span className="heading-note">— Select one to quote</span>
          )}
        </h4>
        
        {hasMultipleItems && needsItemSelection && (
          <div className="selection-alert">
            <AlertCircle size={14} />
            Multiple items found. Select which one you want to create a quote for.
          </div>
        )}

        <div className="items-table-wrapper">
          <table className="items-table">
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th>Unit Price</th>
                <th>MOQ</th>
                <th>Dimensions</th>
                <th>Packing</th>
                {hasMultipleItems && <th></th>}
              </tr>
            </thead>
            <tbody>
              {extraction?.lineItems?.map((item, idx) => (
                <tr key={item.id} className={selectedIndex === idx ? 'selected' : ''}>
                  <td>
                    <div className="product-info">
                      <span className="product-name">
                        {wasFound(item.productName) ? item.productName.value : 'Unknown product'}
                      </span>
                      {wasFound(item.sku) && (
                        <span className="product-sku">{item.sku.value}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {wasFound(item.unitPrice) ? (
                      <span className="price-value">
                        {wasFound(extraction.currency) ? extraction.currency.value : '$'}
                        {typeof item.unitPrice.value === 'number' 
                          ? item.unitPrice.value.toLocaleString() 
                          : item.unitPrice.value}
                      </span>
                    ) : (
                      <span className="missing-value">—</span>
                    )}
                  </td>
                  <td>
                    {wasFound(item.moq) ? (
                      item.moq.value.toLocaleString()
                    ) : (
                      <span className="missing-value">Not found</span>
                    )}
                  </td>
                  <td>
                    {wasFound(item.dimensions) ? item.dimensions.value : '—'}
                  </td>
                  <td>
                    {wasFound(item.packing) ? item.packing.value : '—'}
                  </td>
                  {hasMultipleItems && (
                    <td>
                      <button 
                        className={`item-select-btn ${selectedIndex === idx ? 'selected' : ''}`}
                        onClick={() => selectItem(idx)}
                      >
                        {selectedIndex === idx ? (
                          <><Check size={14} /> Selected</>
                        ) : (
                          'Use this item'
                        )}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3: Core Quote Fields */}
      <section className="review-section">
        <h4 className="section-heading">
          <DollarSign size={16} /> Quote Details
          <span className="heading-note required">— Required for landed cost calculation</span>
        </h4>
        
        <div className="form-fields">
          {/* Supplier Name */}
          <div className={`form-row ${missingFields.includes('supplierName') ? 'has-error' : ''}`}>
            <label>Supplier Name <span className="required-mark">*</span></label>
            <input
              type="text"
              value={formValues.supplierName}
              onChange={(e) => updateField('supplierName', e.target.value)}
              placeholder="Enter supplier name"
            />
            {missingFields.includes('supplierName') && (
              <span className="error-hint">Required field</span>
            )}
          </div>

          {/* Unit Price */}
          <div className={`form-row ${missingFields.includes('unitPrice') ? 'has-error' : ''}`}>
            <label>Unit Price <span className="required-mark">*</span></label>
            <div className="input-with-prefix">
              <span className="input-prefix">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formValues.unitPrice}
                onChange={(e) => updateField('unitPrice', e.target.value)}
                placeholder="0.00"
              />
            </div>
            {missingFields.includes('unitPrice') && (
              <span className="error-hint">Required field</span>
            )}
          </div>

          {/* Currency */}
          <div className="form-row">
            <label>Currency</label>
            <select
              value={formValues.currency}
              onChange={(e) => updateField('currency', e.target.value)}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CNY">CNY</option>
            </select>
          </div>

          {/* MOQ */}
          <div className={`form-row ${missingFields.includes('moq') ? 'has-error' : ''}`}>
            <label>MOQ <span className="required-mark">*</span></label>
            <input
              type="number"
              min="1"
              value={formValues.moq}
              onChange={(e) => updateField('moq', e.target.value)}
              placeholder="Enter minimum order quantity"
            />
            {missingFields.includes('moq') && (
              <span className="error-hint">Not found in document — enter manually</span>
            )}
          </div>

          {/* Incoterm */}
          <div className={`form-row ${missingFields.includes('incoterm') ? 'has-error' : ''}`}>
            <label>Incoterm <span className="required-mark">*</span></label>
            <input
              type="text"
              value={formValues.incoterm}
              onChange={(e) => updateField('incoterm', e.target.value)}
              placeholder="e.g., FOB Shanghai, CIF LA"
            />
            {missingFields.includes('incoterm') && (
              <span className="error-hint">Not found in document — enter manually</span>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 4: Additional Info (Collapsible) */}
      <section className="review-section collapsible-section">
        <button 
          className="collapse-toggle"
          onClick={() => setShowAdditional(!showAdditional)}
        >
          {showAdditional ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Truck size={16} />
          Additional Extracted Info
          <span className="toggle-note">(view only — not used in calculations)</span>
        </button>
        
        {showAdditional && (
          <div className="additional-info">
            <div className="info-grid compact">
              <div className="info-row">
                <label>Lead Time</label>
                <FieldValue field={extraction?.leadTime} />
              </div>
              <div className="info-row">
                <label>Valid Until</label>
                <FieldValue field={extraction?.validUntil} />
              </div>
              <div className="info-row">
                <label>Payment Terms</label>
                <FieldValue field={extraction?.paymentTerms} />
              </div>
              <div className="info-row">
                <label>Notes</label>
                <FieldValue field={extraction?.notes} />
              </div>
              {selectedItem && (
                <>
                  <div className="info-row">
                    <label>Weight</label>
                    <FieldValue field={selectedItem.weight} />
                  </div>
                  <div className="info-row">
                    <label>Carton Size</label>
                    <FieldValue field={selectedItem.cartonSize} />
                  </div>
                  <div className="info-row">
                    <label>CBM</label>
                    {wasFound(selectedItem.cbm) ? (
                      <span className="extracted-value">{selectedItem.cbm.value} m³</span>
                    ) : (
                      <span className="missing-value">Not found</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="quote-upload-modal" onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <header className="modal-header">
          <div className="header-text">
            <h2>Review Extracted Quote</h2>
            <p>for <strong>{productName}</strong></p>
          </div>
          <button className="close-button" onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        {/* BODY */}
        <main className="modal-main">
          {step === 'idle' && renderUpload()}
          {step === 'extracting' && renderExtracting()}
          {step === 'error' && renderError()}
          {step === 'review' && renderReview()}
        </main>

        {/* FOOTER */}
        <footer className="modal-footer">
          <button className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          {step === 'review' && (
            <button 
              className="btn btn-primary" 
              onClick={handleSave}
              disabled={!canSave}
            >
              <Check size={16} /> Confirm & Save Quote
            </button>
          )}
        </footer>
      </div>

      <style>{`
        /* ========== MODAL STRUCTURE ========== */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .quote-upload-modal {
          background: var(--bg-primary, #fff);
          border-radius: 12px;
          width: 100%;
          max-width: 820px;
          max-height: calc(100vh - 40px);
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }

        /* ========== HEADER ========== */
        .modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--border, #e5e7eb);
          background: var(--bg-primary, #fff);
        }

        .header-text h2 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--text-primary, #111);
        }

        .header-text p {
          margin: 4px 0 0;
          font-size: 0.875rem;
          color: var(--text-muted, #6b7280);
        }

        .close-button {
          padding: 8px;
          margin: -4px -8px 0 0;
          background: none;
          border: none;
          border-radius: 8px;
          color: var(--text-muted, #6b7280);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .close-button:hover {
          background: var(--bg-secondary, #f3f4f6);
          color: var(--text-primary, #111);
        }

        /* ========== BODY ========== */
        .modal-main {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        /* ========== FOOTER ========== */
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid var(--border, #e5e7eb);
          background: var(--bg-primary, #fff);
        }

        .modal-footer .btn {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .modal-footer .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ========== UPLOAD STEP ========== */
        .upload-container {
          text-align: center;
        }

        .upload-instruction {
          margin-bottom: 20px;
          color: var(--text-secondary, #4b5563);
        }

        .drop-zone {
          border: 2px dashed var(--border, #d1d5db);
          border-radius: 12px;
          padding: 48px 24px;
          cursor: pointer;
          transition: all 0.2s;
          background: var(--bg-secondary, #f9fafb);
        }

        .drop-zone:hover,
        .drop-zone.active {
          border-color: var(--accent, #7c5cfc);
          background: rgba(124, 92, 252, 0.05);
        }

        .drop-zone svg {
          color: var(--text-muted, #9ca3af);
          margin-bottom: 12px;
        }

        .drop-text {
          font-weight: 500;
          margin: 0 0 16px;
          color: var(--text-primary, #111);
        }

        .file-types {
          display: flex;
          gap: 20px;
          justify-content: center;
          font-size: 0.8rem;
          color: var(--text-muted, #6b7280);
        }

        .file-types span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* ========== LOADING STEP ========== */
        .loading-container {
          text-align: center;
          padding: 60px 24px;
        }

        .spinner {
          color: var(--accent, #7c5cfc);
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ========== ERROR STEP ========== */
        .error-container {
          text-align: center;
          padding: 48px;
        }

        .error-container svg {
          color: #dc2626;
          margin-bottom: 16px;
        }

        .error-message {
          color: #dc2626;
          margin-bottom: 24px;
        }

        /* ========== REVIEW STEP ========== */
        .review-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .file-info {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: var(--bg-secondary, #f3f4f6);
          border-radius: 8px;
          font-size: 0.875rem;
        }

        .filename {
          font-weight: 500;
          flex: 1;
        }

        .stats {
          color: var(--text-muted, #6b7280);
        }

        /* ========== SECTIONS ========== */
        .review-section {
          background: var(--bg-secondary, #f9fafb);
          border-radius: 10px;
          padding: 20px;
        }

        .section-heading {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          margin: 0 0 16px;
          color: var(--text-primary, #111);
        }

        .heading-note {
          font-weight: 400;
          font-size: 0.8rem;
          color: var(--text-muted, #6b7280);
        }

        .heading-note.required {
          color: #dc2626;
        }

        /* ========== INFO GRID ========== */
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 24px;
        }

        .info-grid.compact {
          font-size: 0.875rem;
        }

        .info-row label {
          display: block;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted, #6b7280);
          margin-bottom: 4px;
        }

        .info-content {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .extracted-value {
          font-weight: 500;
          color: var(--text-primary, #111);
        }

        .missing-value {
          color: var(--text-muted, #9ca3af);
          font-style: italic;
        }

        /* ========== FIELD STATUS ========== */
        .field-status {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.65rem;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 99px;
        }

        .field-status.extracted {
          background: #dcfce7;
          color: #166534;
        }

        .field-status.not-found {
          background: #f3f4f6;
          color: #6b7280;
        }

        /* ========== SELECTION ALERT ========== */
        .selection-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: #fef9c3;
          border: 1px solid #fde047;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #854d0e;
          margin-bottom: 16px;
        }

        /* ========== LINE ITEMS TABLE ========== */
        .items-table-wrapper {
          overflow-x: auto;
          margin: 0 -20px;
          padding: 0 20px;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .items-table th {
          text-align: left;
          padding: 10px 12px;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted, #6b7280);
          border-bottom: 1px solid var(--border, #e5e7eb);
          font-weight: 600;
        }

        .items-table td {
          padding: 14px 12px;
          border-bottom: 1px solid var(--border-light, #f3f4f6);
          vertical-align: top;
        }

        .items-table tr.selected {
          background: rgba(124, 92, 252, 0.08);
        }

        .product-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .product-name {
          font-weight: 500;
        }

        .product-sku {
          font-size: 0.75rem;
          color: var(--text-muted, #6b7280);
        }

        .price-value {
          font-weight: 600;
        }

        .item-select-btn {
          padding: 6px 12px;
          font-size: 0.8rem;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 6px;
          background: var(--bg-primary, #fff);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          transition: all 0.15s;
        }

        .item-select-btn:hover {
          border-color: var(--accent, #7c5cfc);
          color: var(--accent, #7c5cfc);
        }

        .item-select-btn.selected {
          background: var(--accent, #7c5cfc);
          border-color: var(--accent, #7c5cfc);
          color: white;
        }

        /* ========== FORM FIELDS ========== */
        .form-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .form-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-row label {
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--text-secondary, #374151);
        }

        .required-mark {
          color: #dc2626;
        }

        .form-row input,
        .form-row select {
          padding: 10px 12px;
          border: 1px solid var(--border, #d1d5db);
          border-radius: 8px;
          font-size: 0.9rem;
          background: var(--bg-primary, #fff);
          transition: border-color 0.15s;
        }

        .form-row input:focus,
        .form-row select:focus {
          outline: none;
          border-color: var(--accent, #7c5cfc);
        }

        .form-row.has-error input,
        .form-row.has-error select {
          border-color: #f59e0b;
          background: rgba(245, 158, 11, 0.05);
        }

        .error-hint {
          font-size: 0.75rem;
          color: #d97706;
        }

        .input-with-prefix {
          display: flex;
        }

        .input-prefix {
          padding: 10px 12px;
          background: var(--bg-secondary, #f3f4f6);
          border: 1px solid var(--border, #d1d5db);
          border-right: none;
          border-radius: 8px 0 0 8px;
          color: var(--text-muted, #6b7280);
          font-size: 0.9rem;
        }

        .input-with-prefix input {
          flex: 1;
          border-radius: 0 8px 8px 0;
        }

        /* ========== COLLAPSIBLE SECTION ========== */
        .collapsible-section {
          padding: 0;
          background: none;
        }

        .collapse-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 14px 16px;
          background: var(--bg-secondary, #f9fafb);
          border: 1px solid var(--border, #e5e7eb);
          border-radius: 8px;
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-secondary, #374151);
          cursor: pointer;
          transition: border-color 0.15s;
        }

        .collapse-toggle:hover {
          border-color: var(--accent, #7c5cfc);
        }

        .toggle-note {
          margin-left: auto;
          font-weight: 400;
          font-size: 0.8rem;
          color: var(--text-muted, #6b7280);
        }

        .additional-info {
          padding: 16px;
          background: var(--bg-secondary, #f9fafb);
          border: 1px solid var(--border, #e5e7eb);
          border-top: none;
          border-radius: 0 0 8px 8px;
        }
      `}</style>
    </div>
  );
}

export default QuoteUploadModal;
