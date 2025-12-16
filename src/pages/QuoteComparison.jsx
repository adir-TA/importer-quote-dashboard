import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, FileSpreadsheet, FileText, Sparkles, 
  TrendingDown, MessageSquare, Trophy, X, Check, CheckCircle2,
  FileDown, Calculator, Package, ChevronDown, Search, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// ============================================
// FORMATTING HELPERS (Display only - never in calculations)
// ============================================
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (num) => {
  return new Intl.NumberFormat('en-US').format(num);
};

// ============================================
// MOCKED AI RESPONSES
// ============================================
const MOCK_AI_RESPONSES = {
  explain: (best, others, product) => `
**Why ${best.supplierName} is the best option for ${product}:**

1. **Lowest Landed Cost**: At ${formatCurrency(best.landed_per_unit)}/unit landed, this is the most cost-effective choice.

2. **FOB Price**: ${formatCurrency(best.unit_price)}/unit is competitive for this product category.

3. **Import Fee Impact**: Fees add ${best.fee_markup_percent.toFixed(1)}% to your FOB cost, resulting in ${formatCurrency(best.landed_per_unit - best.unit_price)} additional cost per unit.

${others.length > 0 ? `4. **Savings**: You save ${formatCurrency(others[0].landed_per_unit - best.landed_per_unit)}/unit compared to the next option (${others[0].supplierName}).` : ''}

**Recommendation**: Verify quality with samples before placing a large order.
  `.trim(),
  
  negotiate: (quote, product) => {
    const targetPrice = quote.unit_price * 0.9;
    return `
**Negotiation Message for ${quote.supplierName}:**

---

Dear ${quote.supplierName} Team,

Thank you for your quotation for ${product} at ${formatCurrency(quote.unit_price)}/unit (${quote.incoterm || 'FOB'}).

After reviewing our options, we're interested in establishing a long-term partnership. To proceed:

• **Target Price**: ${formatCurrency(targetPrice)}/unit for orders of ${formatNumber(quote.quantity * 2)}+ units
• **Payment Terms**: 30% deposit, 70% before shipment

Please let us know what adjustments are possible.

Best regards,
[Your Name]

---
    `.trim();
  },
};

// ============================================
// SEARCHABLE PRODUCT SELECTOR
// ============================================
function ProductSelector({ products, quotes, selectedProductId, onSelect, quoteCounts }) {
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

  const productsWithCounts = useMemo(() => {
    return products.map(product => ({
      ...product,
      quoteCount: quoteCounts[product.id] || 0,
    }));
  }, [products, quoteCounts]);

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
            <span style={{ color: 'var(--text-muted)' }}>Select a buying intent to compare...</span>
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
              placeholder="Search buying intents..."
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
              <div className="product-selector-empty">No buying intents found</div>
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
// LANDED COST CALCULATION FUNCTION
// ============================================
// FORMULA (strict separation of money vs units):
//   unit_price     = $/unit (money per unit)
//   quantity       = units (count)
//   FOB_total      = unit_price × quantity ($ total)
//   total_fees     = fixed$ + (percent × FOB_total) ($ total)
//   total_landed   = FOB_total + total_fees ($ total)
//   landed_per_unit = total_landed ÷ quantity ($/unit)
// ============================================
function calculateLandedCost(quote, fees) {
  // Step 1: Extract and validate unit_price ($/unit)
  const unit_price = parseFloat(quote.unitPrice) || 0;
  
  // Step 2: Extract and validate quantity (units)
  const quantity = parseInt(quote.moq) || 1;
  
  // Safety checks
  const isValid = unit_price > 0 && quantity > 0;
  
  if (!isValid) {
    return {
      isValid: false,
      unit_price,
      quantity,
      FOB_total: 0,
      total_fees: 0,
      total_landed: 0,
      landed_per_unit: 0,
      fee_markup_percent: 0,
      fee_breakdown: [],
      errors: [
        unit_price <= 0 ? 'Unit price must be > $0' : null,
        quantity <= 0 ? 'Quantity must be > 0 units' : null,
      ].filter(Boolean),
    };
  }
  
  // Step 3: Calculate FOB_total ($ total)
  // FOB_total = unit_price × quantity
  const FOB_total = unit_price * quantity;

  // Step 4: Calculate fees
  let total_fees = 0;
  const fee_breakdown = fees.map(fee => {
    const fee_value = parseFloat(fee.value) || 0;
    let fee_amount = 0;
    
    if (fee.type === 'percentage') {
      // Percentage: (FOB_total × percentage) / 100 = $
      fee_amount = (FOB_total * fee_value) / 100;
    } else {
      // Fixed: Already in $ (per shipment)
      fee_amount = fee_value;
    }
    total_fees += fee_amount;
    return { ...fee, amount: fee_amount };
  });

  // Step 5: Calculate total_landed ($ total)
  const total_landed = FOB_total + total_fees;
  
  // Step 6: Calculate landed_per_unit ($/unit)
  // landed_per_unit = total_landed ÷ quantity
  const landed_per_unit = total_landed / quantity;
  
  // Step 7: Fee markup percentage
  const fee_markup_percent = FOB_total > 0 ? (total_fees / FOB_total) * 100 : 0;

  return {
    isValid: true,
    unit_price,        // $/unit
    quantity,          // units
    FOB_total,         // $ total
    total_fees,        // $ total
    total_landed,      // $ total
    landed_per_unit,   // $/unit
    fee_markup_percent,// %
    fee_breakdown,
    errors: [],
  };
}

// ============================================
// MAIN QUOTE COMPARISON PAGE
// ============================================
function QuoteComparison() {
  const navigate = useNavigate();
  const { state, computed } = useAppContext();
  const { products, fees } = state;
  const [lineItems, setLineItems] = React.useState([]);
  const [quoteCounts, setQuoteCounts] = React.useState({});

  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [isSelectionLocked, setIsSelectionLocked] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState('');

  // Load quote counts for all products
  React.useEffect(() => {
    const loadQuoteCounts = async () => {
      const counts = {};
      for (const product of products) {
        const items = await computed.getLineItemsForBuyingIntent(product.id);
        counts[product.id] = items.length;
      }
      setQuoteCounts(counts);
    };
    if (products.length > 0) {
      loadQuoteCounts();
    }
  }, [products, computed]);

  // Load line items when product changes
  React.useEffect(() => {
    const loadLineItems = async () => {
      if (!selectedProductId) {
        setLineItems([]);
        return;
      }
      const items = await computed.getLineItemsForBuyingIntent(selectedProductId);
      setLineItems(items);
    };
    loadLineItems();
  }, [selectedProductId, computed]);

  // Selected product
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // ============================================
  // CALCULATE LANDED COSTS FOR ALL LINE ITEMS
  // ============================================
  const quotesWithLanded = useMemo(() => {
    if (!selectedProductId || lineItems.length === 0) return [];

    // Transform line items to quote format for landed cost calculation
    const calculated = lineItems.map(item => {
      const quoteFormat = {
        id: item.id,
        supplierName: item.supplierName || item.supplier?.supplier_name,
        unitPrice: item.unit_price,
        currency: item.currency || 'USD',
        moq: item.moq || 1,
        incoterm: item.incoterm || 'FOB',
      };
      const calc = calculateLandedCost(quoteFormat, fees);
      return {
        ...item,
        ...calc,
        supplierName: quoteFormat.supplierName,
        incoterm: quoteFormat.incoterm,
        unitPrice: item.unit_price,
      };
    });

    // Filter out invalid quotes and sort by landed_per_unit (lowest first = best)
    return calculated
      .filter(q => q.isValid)
      .sort((a, b) => a.landed_per_unit - b.landed_per_unit);
  }, [lineItems, selectedProductId, fees]);

  // Invalid quotes (for warning)
  const invalidQuotes = useMemo(() => {
    if (!selectedProductId || lineItems.length === 0) return [];
    return lineItems
      .map(item => {
        const quoteFormat = {
          unitPrice: item.unit_price,
          moq: item.moq || 1,
        };
        return { ...item, ...calculateLandedCost(quoteFormat, fees) };
      })
      .filter(q => !q.isValid);
  }, [lineItems, selectedProductId, fees]);

  // Best quote = lowest landed_per_unit
  const bestQuote = quotesWithLanded[0];
  const otherQuotes = quotesWithLanded.slice(1);
  const isSupplierSelected = selectedSupplierId === bestQuote?.id;

  // Handlers
  const handleProductChange = (productId) => {
    setSelectedProductId(productId);
    setSelectedSupplierId(null);
    setIsSelectionLocked(false);
    setAiResponse('');
    setAiAction('');
  };

  const handleSelectSupplier = (quoteId) => {
    setSelectedSupplierId(quoteId);
    setIsSelectionLocked(true);
  };

  const handleExportDecision = () => {
    alert('PDF export: Your supplier selection would be exported.');
  };

  const handleExportExcel = () => {
    alert('Excel export: Comparison data would be downloaded.');
  };

  const handleExportPDF = () => {
    alert('PDF export: Comparison report would be generated.');
  };

  const handleGoToLandedCost = () => {
    navigate('/landed-cost');
  };

  const handleAIExplain = () => {
    if (!bestQuote || !selectedProduct) return;
    setAiLoading(true);
    setAiAction('explain');
    setTimeout(() => {
      setAiResponse(MOCK_AI_RESPONSES.explain(bestQuote, otherQuotes, selectedProduct.name));
      setAiLoading(false);
    }, 800);
  };

  const handleAINegotiate = (quote) => {
    if (!selectedProduct) return;
    setAiLoading(true);
    setAiAction('negotiate');
    setTimeout(() => {
      setAiResponse(MOCK_AI_RESPONSES.negotiate(quote, selectedProduct.name));
      setAiLoading(false);
    }, 800);
  };

  const clearAI = () => {
    setAiResponse('');
    setAiAction('');
  };

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>Item-Level Comparison</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
              Compare suppliers for one buying intent and select the best landed cost
            </p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn"
            onClick={handleExportExcel}
            style={{ background: '#217346', color: 'white' }}
            disabled={quotesWithLanded.length === 0}
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button
            className="btn"
            onClick={handleExportPDF}
            style={{ background: '#dc2626', color: 'white' }}
            disabled={quotesWithLanded.length === 0}
          >
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="content">
        {/* Product Selector */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span className="card-title">
              <Package size={18} /> Select Buying Intent to Compare
            </span>
          </div>
          <div className="card-body">
            <ProductSelector
              products={products}
              quotes={[]}
              selectedProductId={selectedProductId}
              onSelect={handleProductChange}
              quoteCounts={quoteCounts}
            />
            {!selectedProductId && (
              <div className="info-message" style={{ marginTop: '12px' }}>
                <AlertCircle size={16} />
                <span>Select a buying intent to compare supplier quotes</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        {selectedProductId ? (
          <>
            {/* Invalid Quotes Warning */}
            {invalidQuotes.length > 0 && (
              <div className="validation-warning" style={{ marginBottom: '16px' }}>
                <AlertTriangle size={16} />
                <span>
                  {invalidQuotes.length} quote(s) excluded due to invalid data (price ≤ $0 or quantity ≤ 0)
                </span>
              </div>
            )}

            {quotesWithLanded.length === 0 ? (
              <div className="empty-state">
                <TrendingDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3>No valid quotes for {selectedProduct?.name}</h3>
                <p>Add quotes with valid prices and quantities</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => navigate(`/products/${selectedProductId}`)}
                >
                  Add Quotes
                </button>
              </div>
            ) : (
              <>
                {/* Best Option Card */}
                {bestQuote && (
                  <div 
                    className="best-quote-card" 
                    style={{ 
                      marginBottom: '24px',
                      borderColor: isSupplierSelected ? 'var(--success)' : undefined,
                      background: isSupplierSelected 
                        ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)' 
                        : undefined,
                    }}
                  >
                    {isSupplierSelected ? (
                      <div className="selection-complete">
                        <div className="best-quote-selected">
                          <div className="selected-icon">
                            <CheckCircle2 size={48} />
                          </div>
                          <div className="selected-content">
                            <h3>Supplier Selected</h3>
                            <p>{bestQuote.supplierName} — {formatCurrency(bestQuote.landed_per_unit)}/unit landed</p>
                          </div>
                        </div>
                        
                        <div className="next-actions-section">
                          <p className="next-actions-helper">
                            You've selected the best option for {selectedProduct?.name}. What's next?
                          </p>
                          <div className="next-actions-title">Next Actions</div>
                          <div className="next-actions-buttons">
                            <button className="btn btn-secondary" onClick={handleExportDecision}>
                              <FileDown size={18} /> Export Decision
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleAINegotiate(bestQuote)}>
                              <MessageSquare size={18} /> Negotiation Message
                            </button>
                            <button className="btn btn-secondary" onClick={handleGoToLandedCost}>
                              <Calculator size={18} /> Cost Breakdown
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="best-quote-header">
                          <Trophy size={24} color="#f59e0b" />
                          <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0 }}>Best: {bestQuote.supplierName}</h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              Fees add +{bestQuote.fee_markup_percent.toFixed(1)}% to FOB
                            </p>
                          </div>
                          <div className="best-quote-price">
                            <span className="price-label">Landed Cost</span>
                            <span className="price-value">{formatCurrency(bestQuote.landed_per_unit)}/unit</span>
                          </div>
                        </div>
                        
                        <div className="best-quote-cta">
                          <button 
                            className="btn btn-select-supplier"
                            onClick={() => handleSelectSupplier(bestQuote.id)}
                          >
                            <Check size={20} /> Select This Supplier
                          </button>
                        </div>

                        {/* Secondary Actions - Grouped and less prominent */}
                        <div className="secondary-actions" style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'center',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border-light)',
                          marginTop: '16px'
                        }}>
                          <button className="btn btn-ghost btn-sm" onClick={handleAIExplain} title="Explain why this is best">
                            <Sparkles size={14} /> Why Best?
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleAINegotiate(bestQuote)} title="Generate negotiation message">
                            <MessageSquare size={14} /> Negotiate
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={handleGoToLandedCost} title="View detailed cost breakdown">
                            <Calculator size={14} /> Breakdown
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Comparison Table */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">
                      <TrendingDown size={18} /> {quotesWithLanded.length} Quotes for {selectedProduct?.name}
                    </span>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="table comparison-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>#</th>
                          <th>Supplier</th>
                          <th>FOB Price</th>
                          <th>Quantity</th>
                          <th>FOB Total</th>
                          <th>Import Fees</th>
                          <th>Landed Cost</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotesWithLanded.map((quote, index) => {
                          const isBest = index === 0;
                          const isSelected = selectedSupplierId === quote.id;
                          const savingsVsNext = index < quotesWithLanded.length - 1
                            ? quotesWithLanded[index + 1].landed_per_unit - quote.landed_per_unit
                            : 0;

                          return (
                            <tr
                              key={quote.id}
                              className={`${isBest ? 'row-highlight' : ''} ${isSelected ? 'row-selected' : ''}`}
                            >
                              <td>
                                {isSelected ? (
                                  <span className="rank-badge selected"><Check size={14} /></span>
                                ) : isBest ? (
                                  <span className="rank-badge best"><Trophy size={14} /></span>
                                ) : (
                                  <span className="rank-badge">{index + 1}</span>
                                )}
                              </td>
                              <td style={{ fontWeight: 500 }}>
                                {quote.supplierName}
                                {isSelected && <span className="selected-label">Selected</span>}
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {quote.incoterm}
                                </div>
                              </td>
                              <td>{formatCurrency(quote.unit_price)}/unit</td>
                              <td>{formatNumber(quote.quantity)} units</td>
                              <td style={{ color: 'var(--text-secondary)' }}>
                                {formatCurrency(quote.FOB_total)}
                              </td>
                              <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {formatCurrency(quote.total_fees)}
                                <div style={{ fontSize: '0.7rem' }}>+{quote.fee_markup_percent.toFixed(1)}%</div>
                              </td>
                              <td>
                                <span style={{
                                  fontWeight: 700,
                                  color: isBest ? 'var(--success)' : 'var(--text-primary)',
                                }}>
                                  {formatCurrency(quote.landed_per_unit)}/unit
                                </span>
                                {isBest && savingsVsNext > 0 && (
                                  <span style={{
                                    display: 'block',
                                    fontSize: '0.7rem',
                                    color: 'var(--success)',
                                  }}>
                                    Saves {formatCurrency(savingsVsNext)}/unit
                                  </span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleAINegotiate(quote)}
                                  title="Generate negotiation message"
                                >
                                  <MessageSquare size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* AI Response Panel */}
                {(aiResponse || aiLoading) && (
                  <div className="card" style={{ marginTop: '24px' }}>
                    <div className="card-header">
                      <span className="card-title">
                        <Sparkles size={18} color="var(--accent)" />
                        {aiAction === 'explain' ? 'AI Analysis' : 'Generated Message'}
                      </span>
                      <button className="icon-btn" onClick={clearAI}>
                        <X size={18} />
                      </button>
                    </div>
                    <div className="card-body">
                      {aiLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px' }}>
                          <div className="spinner" />
                          <span>Generating...</span>
                        </div>
                      ) : (
                        <div className="ai-response-content">
                          {aiResponse.split('\n').map((line, i) => {
                            if (line.startsWith('**') && line.endsWith('**')) {
                              return <h4 key={i} style={{ marginTop: i > 0 ? '16px' : 0 }}>{line.replace(/\*\*/g, '')}</h4>;
                            }
                            if (line.startsWith('• ')) {
                              return <li key={i} style={{ marginLeft: '20px' }}>{line.substring(2)}</li>;
                            }
                            if (line.startsWith('---')) {
                              return <hr key={i} style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />;
                            }
                            if (line.trim() === '') return <br key={i} />;
                            return <p key={i} style={{ margin: '8px 0' }}>{line}</p>;
                          })}
                          {aiAction === 'negotiate' && (
                            <button
                              className="btn btn-primary"
                              style={{ marginTop: '16px' }}
                              onClick={() => {
                                navigator.clipboard.writeText(aiResponse.replace(/\*\*/g, ''));
                                alert('Copied to clipboard!');
                              }}
                            >
                              Copy Message
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="disabled-overlay">
            <div className="disabled-content">
              <Package size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <h3>Select a Buying Intent to Compare</h3>
              <p>Choose a buying intent above to see and compare supplier quotes.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default QuoteComparison;
