import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Package, FileText, Calculator, GitCompare, Plus, ArrowRight, TrendingDown, CheckCircle,
  ChevronDown, Search, X, Check
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// Formatting helper (display only)
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (num) => {
  return new Intl.NumberFormat('en-US').format(num);
};

// ============================================
// PRODUCT SELECTOR (same style as comparison flow)
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

  const productsWithCounts = useMemo(() => {
    return products.map(product => ({
      ...product,
      quoteCount: quotes.filter(q => q.product_id === product.id).length,
    }));
  }, [products, quotes]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return productsWithCounts;
    const term = searchTerm.toLowerCase();
    return productsWithCounts.filter(p => p.name.toLowerCase().includes(term));
  }, [productsWithCounts, searchTerm]);

  const selectedProduct = productsWithCounts.find(p => p.id === selectedProductId);

  return (
    <div className="product-selector" ref={dropdownRef} style={{ maxWidth: '100%' }}>
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
            <span style={{ color: 'var(--text-muted)' }}>Select a buying intent...</span>
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
// MAIN DASHBOARD
// ============================================
function Dashboard() {
  const navigate = useNavigate();
  const { state, computed } = useAppContext();
  const { products, quotes } = state;

  // Product selection for best price
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [quoteCounts, setQuoteCounts] = React.useState({});
  const [loadingCounts, setLoadingCounts] = React.useState(true);

  // Load quote counts for all products
  React.useEffect(() => {
    const loadQuoteCounts = async () => {
      setLoadingCounts(true);
      const counts = {};
      for (const product of products) {
        // Count both old quotes AND new line items
        const oldQuotes = computed.getProductQuotes(product.id);
        const newLineItems = await computed.getLineItemsForBuyingIntent(product.id);
        counts[product.id] = oldQuotes.length + newLineItems.length;
      }
      setQuoteCounts(counts);
      setLoadingCounts(false);
    };
    if (products.length > 0) {
      loadQuoteCounts();
    } else {
      setLoadingCounts(false);
    }
  }, [products, computed]);

  // Get selected product
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // Calculate best quote (lowest price) for SELECTED product only
  const bestQuoteForProduct = useMemo(() => {
    if (!selectedProductId) return null;

    const productQuotes = quotes.filter(q => q.product_id === selectedProductId);
    if (productQuotes.length === 0) return null;

    let bestQuote = null;
    let lowestPrice = Infinity;

    productQuotes.forEach(quote => {
      const unit_price = parseFloat(quote.unitPrice) || 0;
      const quantity = parseInt(quote.moq) || 1;

      if (unit_price <= 0 || quantity <= 0) return;

      if (unit_price < lowestPrice) {
        lowestPrice = unit_price;
        bestQuote = {
          ...quote,
          unit_price,
          quantity,
        };
      }
    });

    return bestQuote;
  }, [selectedProductId, quotes]);

  // Quote count for selected product
  const productQuoteCount = useMemo(() => {
    if (!selectedProductId) return 0;
    return quoteCounts[selectedProductId] || 0;
  }, [selectedProductId, quoteCounts]);

  const stats = [
    { label: 'Buying Intents', value: products.length, icon: Package, color: '#7c5cfc', bgColor: 'rgba(124, 92, 252, 0.1)' },
    { label: 'Quotes', value: quotes.length, icon: FileText, color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)' },
  ];

  return (
    <div className="page">
      <div className="header">
        <div>
          <h2>Decision Dashboard</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Make confident sourcing decisions by comparing supplier prices
          </p>
        </div>
      </div>

      <div className="content">
        {/* Stats - Prominent at top */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '28px' }}>
          {stats.map(stat => (
            <div key={stat.label} className="stat-card" style={{ '--stat-color': stat.color, '--stat-bg': stat.bgColor }}>
              <div className="stat-icon-wrapper" style={{ background: stat.bgColor }}>
                <stat.icon size={22} color={stat.color} />
              </div>
              <div className="stat-content">
                <div className="stat-label">{stat.label}</div>
                <div className="stat-value">{stat.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Two-column layout: Workflow on left, Best Price on right */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>
          {/* Left: Workflow Steps */}
          <div style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              marginBottom: '20px'
            }}>
              Your Workflow
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                className="workflow-step"
                onClick={() => navigate('/products')}
                style={{ cursor: 'pointer', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s' }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  flexShrink: 0
                }}>1</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>Buying Intents</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Define what you want to buy</p>
                </div>
              </div>
              <div
                className="workflow-step"
                onClick={() => navigate('/products')}
                style={{ cursor: 'pointer', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s' }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  flexShrink: 0
                }}>2</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>Quotes</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Upload supplier quotes</p>
                </div>
              </div>
              <div
                className="workflow-step active"
                onClick={() => navigate('/comparison')}
                style={{ cursor: 'pointer', padding: '16px', background: 'var(--accent-light)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.2s', border: '1px solid var(--accent)' }}
              >
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  flexShrink: 0
                }}>3</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '4px', color: 'var(--text-primary)' }}>Compare</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Find the best price</p>
                </div>
                <CheckCircle size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              </div>
            </div>
          </div>

          {/* Right: Best Price Finder */}
          <div style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
          <div className="best-quote-header" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '16px', marginBottom: '16px' }}>
            <TrendingDown size={20} color="var(--success)" />
            <span>Best Price</span>
          </div>
          
          {/* Product Selector */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '0.75rem', 
              fontWeight: 600, 
              color: 'var(--text-muted)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em',
              marginBottom: '8px'
            }}>
              Select Buying Intent
            </label>
            <ProductSelector
              products={products}
              quotes={quotes}
              selectedProductId={selectedProductId}
              onSelect={setSelectedProductId}
            />
          </div>

          {/* Best Quote Display */}
          {selectedProductId ? (
            bestQuoteForProduct ? (
              <>
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  marginBottom: '12px',
                  fontWeight: 500
                }}>
                  Best price for <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct?.name}</strong>
                </div>
                <div className="best-quote-content">
                  <div className="best-quote-supplier">
                    <strong>{bestQuoteForProduct.supplierName}</strong>
                    <span className="best-quote-product">{bestQuoteForProduct.incoterm || 'FOB'}</span>
                  </div>
                  <div className="best-quote-price landed">
                    <div className="best-quote-unit">{formatCurrency(bestQuoteForProduct.unit_price)}/unit</div>
                    <div className="best-quote-label">Unit Price</div>
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={() => navigate('/comparison', { state: { productId: selectedProductId } })}>
                  <GitCompare size={16} />
                  Compare {productQuoteCount} Quotes
                </button>
              </>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '24px',
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)'
              }}>
                <Package size={32} style={{ opacity: 0.4, marginBottom: '12px' }} />
                <p style={{ margin: 0 }}>No quotes for {selectedProduct?.name} yet</p>
                <button
                  className="btn btn-ghost"
                  style={{ marginTop: '12px' }}
                  onClick={() => navigate(`/products/${selectedProductId}`)}
                >
                  Add Quotes
                </button>
              </div>
            )
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '24px',
              color: 'var(--text-muted)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)'
            }}>
              <Package size={32} style={{ opacity: 0.4, marginBottom: '12px' }} />
              <p style={{ margin: 0 }}>Select a buying intent above to see best price</p>
            </div>
          )}
          </div>
          {/* End right panel */}
        </div>
        {/* End two-column layout */}

        {/* Quick Actions */}
        <div className="quick-actions-grid">
          <button className="quick-action-card" onClick={() => navigate('/products')}>
            <Package size={24} />
            <span>Buying Intents</span>
          </button>
          <button className="quick-action-card" onClick={() => navigate('/comparison')}>
            <GitCompare size={24} />
            <span>Compare Quotes</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
