import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Calculator, DollarSign, Plus, Trash2, RotateCcw, ArrowRight, Check,
  Package, ChevronDown, Search, X, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// ============================================
// FORMATTING HELPERS (Display only - never in calculations)
// ============================================
const formatCurrency = (amount) => {
  // DISPLAY ONLY: Format number as USD currency
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (num) => {
  // DISPLAY ONLY: Format number with thousand separators
  return new Intl.NumberFormat('en-US').format(num);
};

// ============================================
// SEARCHABLE PRODUCT SELECTOR COMPONENT
// ============================================
function ProductSelector({ products, quotes, selectedProductId, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Count quotes per product
  const productsWithCounts = useMemo(() => {
    return products.map(product => ({
      ...product,
      quoteCount: quotes.filter(q => q.product_id === product.id).length,
    }));
  }, [products, quotes]);

  // Filter by search (case-insensitive)
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return productsWithCounts;
    const term = searchTerm.toLowerCase();
    return productsWithCounts.filter(p => p.name.toLowerCase().includes(term));
  }, [productsWithCounts, searchTerm]);

  const selectedProduct = productsWithCounts.find(p => p.id === selectedProductId);

  return (
    <div className="product-selector" ref={dropdownRef}>
      <button 
        className="product-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Package size={18} className="trigger-icon" />
        <span className="trigger-text">
          {selectedProduct ? (
            <>
              {selectedProduct.name}
              <span className={`quote-count ${selectedProduct.quoteCount === 0 ? 'muted' : ''}`}>
                ({selectedProduct.quoteCount} {selectedProduct.quoteCount === 1 ? 'quote' : 'quotes'})
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Select a product...</span>
          )}
        </span>
        <ChevronDown size={18} className={`trigger-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="product-selector-dropdown">
          <div className="product-selector-search">
            <Search size={16} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => setSearchTerm('')} type="button">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="product-selector-options">
            {filteredProducts.length === 0 ? (
              <div className="product-selector-empty">No products match "{searchTerm}"</div>
            ) : (
              filteredProducts.map(product => (
                <button
                  key={product.id}
                  className={`product-option ${product.id === selectedProductId ? 'selected' : ''}`}
                  onClick={() => { onSelect(product.id); setIsOpen(false); setSearchTerm(''); }}
                  type="button"
                >
                  <span className="option-name">{product.name}</span>
                  <span className={`option-count ${product.quoteCount === 0 ? 'muted' : ''}`}>
                    ({product.quoteCount} {product.quoteCount === 1 ? 'quote' : 'quotes'})
                  </span>
                  {product.id === selectedProductId && <Check size={16} className="option-check" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// SEARCHABLE QUOTE SELECTOR COMPONENT
// ============================================
function QuoteSelector({ quotes, selectedQuoteId, onSelect, productName }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter quotes by search (supplier name)
  const filteredQuotes = useMemo(() => {
    if (!searchTerm.trim()) return quotes;
    const term = searchTerm.toLowerCase();
    return quotes.filter(q => q.supplierName?.toLowerCase().includes(term));
  }, [quotes, searchTerm]);

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId);

  if (quotes.length === 0) {
    return (
      <div className="empty-state-inline">
        <p>No quotes for this product yet.</p>
      </div>
    );
  }

  return (
    <div className="quote-selector" ref={dropdownRef}>
      <button 
        className="quote-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="trigger-text">
          {selectedQuote ? (
            <>
              <strong>{selectedQuote.supplierName}</strong>
              <span className="quote-details">
                {formatCurrency(selectedQuote.unitPrice)}/unit • {selectedQuote.incoterm || 'FOB'}
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>-- Select a quote --</span>
          )}
        </span>
        <ChevronDown size={18} className={`trigger-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="quote-selector-dropdown">
          <div className="quote-selector-header">
            Quotes for {productName}
          </div>
          <div className="product-selector-search">
            <Search size={16} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => setSearchTerm('')} type="button">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="quote-selector-options">
            {filteredQuotes.length === 0 ? (
              <div className="product-selector-empty">No quotes match "{searchTerm}"</div>
            ) : (
              filteredQuotes.map(quote => {
                const unitPrice = parseFloat(quote.unitPrice) || 0;
                return (
                  <button
                    key={quote.id}
                    className={`quote-option ${quote.id === selectedQuoteId ? 'selected' : ''}`}
                    onClick={() => { onSelect(quote.id); setIsOpen(false); setSearchTerm(''); }}
                    type="button"
                  >
                    <div className="quote-option-main">
                      <span className="quote-supplier">{quote.supplierName}</span>
                      <span className="quote-incoterm">{quote.incoterm || 'FOB'}</span>
                    </div>
                    <div className="quote-option-price">
                      {formatCurrency(unitPrice)}/unit
                    </div>
                    {quote.id === selectedQuoteId && <Check size={16} className="option-check" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// MAIN LANDED COST PAGE
// ============================================
function LandedCost() {
  const navigate = useNavigate();
  const { state, actions } = useAppContext();
  const { fees, quotes, products } = state;

  // State
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [customQuantity, setCustomQuantity] = useState('');

  // Derived: Selected product
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Derived: Quotes for selected product ONLY
  const productQuotes = useMemo(() => {
    if (!selectedProductId) return [];
    return quotes.filter(q => q.product_id === selectedProductId);
  }, [quotes, selectedProductId]);

  // Derived: Selected quote
  const selectedQuote = useMemo(() => {
    return productQuotes.find(q => q.id === selectedQuoteId);
  }, [productQuotes, selectedQuoteId]);

  // ============================================
  // INPUT VALIDATION
  // ============================================
  const validation = useMemo(() => {
    if (!selectedQuote) return { valid: false, errors: [], warnings: [] };
    
    const errors = [];
    const warnings = [];
    const unitPrice = parseFloat(selectedQuote.unitPrice);
    const moq = parseInt(selectedQuote.moq) || 1;
    const qty = customQuantity ? parseInt(customQuantity) : moq;
    
    // Safety check: unit_price must be > 0
    if (isNaN(unitPrice) || unitPrice <= 0) {
      errors.push('Unit price must be greater than $0');
    }
    
    // Safety check: quantity must be > 0
    if (isNaN(qty) || qty <= 0) {
      errors.push('Quantity must be greater than 0 units');
    }
    
    // Soft validation: warn if quantity < MOQ
    if (customQuantity && qty > 0 && qty < moq) {
      warnings.push(`Quantity is below MOQ (${formatNumber(moq)} units) — supplier pricing may not be valid`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
      quantity: isNaN(qty) || qty <= 0 ? 1 : qty,
      moq,
    };
  }, [selectedQuote, customQuantity]);

  // ============================================
  // LANDED COST CALCULATION
  // ============================================
  // FORMULA (strict separation of money vs units):
  //   unit_price     = price per unit ($/unit) - MONEY
  //   quantity       = number of units ordered - UNITS  
  //   FOB_total      = unit_price × quantity - MONEY ($ total)
  //   total_fees     = fixed fees + (percentage fees × FOB_total) - MONEY
  //   total_landed   = FOB_total + total_fees - MONEY ($ total)
  //   landed_per_unit = total_landed ÷ quantity - MONEY ($/unit)
  // ============================================
  const calculation = useMemo(() => {
    if (!selectedQuote || !validation.valid) return null;

    // Step 1: Extract unit_price ($/unit) - this is MONEY
    const unit_price = validation.unitPrice;
    
    // Step 2: Determine quantity (units) - this is UNITS, not money
    const quantity = validation.quantity;
    
    // Step 3: Calculate FOB_total ($ total) = unit_price × quantity
    // This converts $/unit × units = $ (money total)
    const FOB_total = unit_price * quantity;

    // Step 4: Calculate fees (all in $ money)
    let total_fixed_fees = 0;    // Fixed $ per shipment
    let total_percent_fees = 0;  // Percentage of FOB_total
    
    const fee_breakdown = fees.map(fee => {
      const fee_value = parseFloat(fee.value) || 0;
      let fee_amount = 0;  // Always in $ (money)
      
      if (fee.type === 'percentage') {
        // Percentage fee: (FOB_total × percentage) / 100 = $ amount
        fee_amount = (FOB_total * fee_value) / 100;
        total_percent_fees += fee_amount;
      } else {
        // Fixed fee: Already in $ (added once per shipment)
        fee_amount = fee_value;
        total_fixed_fees += fee_amount;
      }
      
      return { ...fee, amount: fee_amount };
    });

    // Step 5: Sum all fees ($ total)
    const total_fees = total_fixed_fees + total_percent_fees;
    
    // Step 6: Calculate total landed cost ($ total)
    // total_landed = FOB_total + total_fees
    const total_landed = FOB_total + total_fees;
    
    // Step 7: Calculate landed cost per unit ($/unit)
    // landed_per_unit = total_landed ÷ quantity
    // This converts $ ÷ units = $/unit
    const landed_per_unit = total_landed / quantity;
    
    // Step 8: Calculate fee markup as percentage of FOB
    const fee_markup_percent = FOB_total > 0 ? (total_fees / FOB_total) * 100 : 0;

    // ============================================
    // VERIFICATION (math check)
    // ============================================
    // landed_per_unit should equal:
    // (unit_price × quantity + total_fees) / quantity
    // = unit_price + (total_fees / quantity)
    // ============================================
    const expected_landed = unit_price + (total_fees / quantity);
    const math_verified = Math.abs(landed_per_unit - expected_landed) < 0.001;

    return {
      // Input values (with types)
      unit_price,           // $/unit (money)
      quantity,             // units (count)
      
      // Calculated values (all money)
      FOB_total,            // $ total
      total_fixed_fees,     // $ total
      total_percent_fees,   // $ total
      total_fees,           // $ total
      total_landed,         // $ total
      landed_per_unit,      // $/unit (money)
      fee_markup_percent,   // % (ratio)
      fee_breakdown,        // Array with amounts in $
      
      // Verification
      math_verified,
    };
  }, [selectedQuote, validation, fees]);

  // Handlers
  const handleProductChange = (productId) => {
    setSelectedProductId(productId);
    setSelectedQuoteId('');
    setCustomQuantity('');
  };

  const handleFeeChange = (feeId, field, value) => {
    actions.updateFee(feeId, { [field]: field === 'value' ? parseFloat(value) || 0 : value });
  };

  const handleAddFee = () => {
    actions.addFee({ name: 'New Fee', type: 'fixed', value: 0 });
  };

  const handleDeleteFee = (feeId) => {
    actions.deleteFee(feeId);
  };

  const handleResetFees = () => {
    actions.resetFees();
  };

  return (
    <div className="page">
      <div className="header">
        <div>
          <h2>Landed Cost Calculator</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Configure import fees (global) and preview landed cost for a specific quote
          </p>
        </div>
      </div>

      <div className="content">
        {/* STEP 1: Product Selection */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span className="card-title">
              <Package size={18} /> Step 1: Select Product
            </span>
          </div>
          <div className="card-body">
            <ProductSelector
              products={products}
              quotes={quotes}
              selectedProductId={selectedProductId}
              onSelect={handleProductChange}
            />
            {!selectedProductId && (
              <div className="info-message" style={{ marginTop: '12px' }}>
                <AlertCircle size={16} />
                <span>Select a product to calculate landed costs for its quotes</span>
              </div>
            )}
          </div>
        </div>

        {selectedProductId ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px' }}>
            {/* LEFT: Fee Configuration (Global) */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <DollarSign size={18} /> Import Fees (Global)
                </span>
                <button className="btn btn-ghost" onClick={handleResetFees}>
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
              <div className="card-body">
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                  These fees apply to all landed cost calculations. <strong>Fixed ($)</strong> fees are per shipment. 
                  <strong> Percentage (%)</strong> fees apply to FOB total.
                </p>

                <div className="fees-list">
                  {fees.map((fee) => (
                    <div key={fee.id} className="fee-row">
                      <input
                        type="text"
                        className="form-input"
                        value={fee.name}
                        onChange={(e) => handleFeeChange(fee.id, 'name', e.target.value)}
                        placeholder="Fee name"
                        style={{ flex: 2 }}
                      />
                      <select
                        className="form-select"
                        value={fee.type}
                        onChange={(e) => handleFeeChange(fee.id, 'type', e.target.value)}
                        style={{ width: '140px' }}
                      >
                        <option value="fixed">Fixed ($)</option>
                        <option value="percentage">% of FOB</option>
                      </select>
                      <div className="input-with-prefix" style={{ width: '110px' }}>
                        <span className="input-prefix">
                          {fee.type === 'percentage' ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          className="form-input"
                          value={fee.value}
                          onChange={(e) => handleFeeChange(fee.id, 'value', e.target.value)}
                          step={fee.type === 'percentage' ? '0.1' : '1'}
                          min="0"
                        />
                      </div>
                      <button
                        className="icon-btn"
                        onClick={() => handleDeleteFee(fee.id)}
                        title="Remove fee"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-ghost"
                  onClick={handleAddFee}
                  style={{ marginTop: '12px' }}
                >
                  <Plus size={16} /> Add Fee
                </button>
              </div>
            </div>

            {/* RIGHT: Quote Preview */}
            <div>
              {/* Quote Selection */}
              <div className="card" style={{ marginBottom: '16px' }}>
                <div className="card-header">
                  <span className="card-title">Step 2: Preview Quote</span>
                </div>
                <div className="card-body">
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">
                      Select quote for <strong>{selectedProduct?.name}</strong>
                    </label>
                    <QuoteSelector
                      quotes={productQuotes}
                      selectedQuoteId={selectedQuoteId}
                      onSelect={setSelectedQuoteId}
                      productName={selectedProduct?.name}
                    />
                  </div>

                  {selectedQuote && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Order Quantity
                      </label>
                      <div className="input-with-suffix">
                        <input
                          type="number"
                          className="form-input"
                          placeholder={selectedQuote.moq || 1}
                          value={customQuantity}
                          onChange={(e) => setCustomQuantity(e.target.value)}
                          min="1"
                        />
                        <span className="input-suffix">units</span>
                      </div>
                      <p className="form-hint">
                        Default: {formatNumber(selectedQuote.moq || 1)} units (MOQ)
                      </p>
                    </div>
                  )}

                  {/* Validation Errors */}
                  {selectedQuote && !validation.valid && (
                    <div className="validation-errors" style={{ marginTop: '12px' }}>
                      {validation.errors.map((error, i) => (
                        <div key={i} className="validation-error">
                          <AlertTriangle size={14} />
                          <span>{error}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* MOQ Warnings (soft validation) */}
                  {selectedQuote && validation.valid && validation.warnings?.length > 0 && (
                    <div className="validation-warnings" style={{ marginTop: '12px' }}>
                      {validation.warnings.map((warning, i) => (
                        <div key={i} className="validation-warning">
                          <AlertCircle size={14} />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Calculation Results */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">
                    📊 Landed Cost Breakdown
                    {selectedQuote && (
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px' }}>
                        — {selectedQuote.supplierName}
                      </span>
                    )}
                  </span>
                </div>
                <div className="card-body">
                  {selectedQuote && calculation ? (
                    <>
                      {/* Hero Result - Emphasis on $/unit */}
                      <div className="result-hero">
                        <div className="result-label">Landed Cost</div>
                        <div className="result-value">
                          {formatCurrency(calculation.landed_per_unit)}<span className="result-unit">/unit</span>
                        </div>
                        <div className="result-subtext">
                          vs {formatCurrency(calculation.unit_price)}/unit FOB
                          {calculation.fee_markup_percent > 0 && (
                            <span className="result-badge">
                              +{calculation.fee_markup_percent.toFixed(1)}% fees
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Detailed Breakdown */}
                      <div className="result-breakdown" style={{ marginTop: '20px' }}>
                        <div className="breakdown-section-title">Order Summary</div>
                        <div className="breakdown-row">
                          <span>Unit Price (FOB)</span>
                          <span>{formatCurrency(calculation.unit_price)}/unit</span>
                        </div>
                        <div className="breakdown-row">
                          <span>Quantity</span>
                          <span>{formatNumber(calculation.quantity)} units</span>
                        </div>
                        <div className="breakdown-row highlight">
                          <span>FOB Total</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(calculation.FOB_total)}</span>
                        </div>

                        <div className="breakdown-section-title" style={{ marginTop: '16px' }}>
                          Import Fees
                        </div>
                        {calculation.fee_breakdown.map((fee) => (
                          <div key={fee.id} className="breakdown-row">
                            <span>
                              {fee.name}
                              <span className="fee-type-label">
                                {fee.type === 'percentage' ? `(${fee.value}% of FOB)` : '(fixed $)'}
                              </span>
                            </span>
                            <span>{formatCurrency(fee.amount)}</span>
                          </div>
                        ))}
                        <div className="breakdown-row highlight">
                          <span>Total Import Fees</span>
                          <span style={{ color: 'var(--text-secondary)' }}>{formatCurrency(calculation.total_fees)}</span>
                        </div>

                        {/* Total section - visually secondary, $/unit emphasized */}
                        <div className="breakdown-row total" style={{ marginTop: '12px' }}>
                          <span>Total Landed Cost</span>
                          <span style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>{formatCurrency(calculation.total_landed)}</span>
                        </div>
                        <div className="breakdown-row total-unit">
                          <span>Landed Cost Per Unit</span>
                          <span style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(calculation.landed_per_unit)}/unit</span>
                        </div>

                        {/* Large order info text */}
                        {calculation.total_landed > 10000 && (
                          <div className="large-order-info" style={{
                            marginTop: '16px',
                            padding: '10px 12px',
                            background: 'var(--bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <AlertCircle size={14} />
                            <span>Large quantities increase total order value. Per-unit cost ({formatCurrency(calculation.landed_per_unit)}/unit) is the key comparison metric.</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : selectedQuote && !validation.valid ? (
                    <div className="empty-state" style={{ padding: '32px 16px' }}>
                      <AlertTriangle size={32} style={{ opacity: 0.5, marginBottom: '12px', color: 'var(--warning)' }} />
                      <p>Fix validation errors above to see calculation</p>
                    </div>
                  ) : (
                    <div className="empty-state" style={{ padding: '32px 16px' }}>
                      <Calculator size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                      <p>Select a quote above to preview landed cost</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Compare Button */}
              {productQuotes.length >= 2 && (
                <div className="card" style={{ marginTop: '16px' }}>
                  <div className="card-body">
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      onClick={() => navigate('/comparison')}
                    >
                      <Check size={16} /> Compare {productQuotes.length} Quotes <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="disabled-overlay">
            <div className="disabled-content">
              <Package size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <h3>Select a Product to Continue</h3>
              <p>Choose a product above to configure fees and preview landed costs.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LandedCost;
