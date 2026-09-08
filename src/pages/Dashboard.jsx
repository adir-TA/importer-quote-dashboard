import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, FileText, Calculator, GitCompare, Plus, ArrowRight, TrendingDown, CheckCircle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { BuyingIntentCommandSelect } from '../components';

// Display only. These hardcoded 'USD', so a CNY quote showed a dollar sign.
import { formatCurrency, formatNumber, convertAmount, normalizeCurrency } from '../utils/currency';

// ProductSelector removed - now using BuyingIntentCommandSelect

// ============================================
// MAIN DASHBOARD
// ============================================
function Dashboard() {
  const navigate = useNavigate();
  const { state, computed } = useAppContext();
  const { products, quotes, settings } = state;
  const { t } = useLanguage();
  // Base currency for cross-quote comparison, from Settings
  const baseCurrency = normalizeCurrency(settings?.currency);
  const fxRates = settings?.fxRates;

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
    let lowestComparable = Infinity;

    productQuotes.forEach(quote => {
      const unit_price = parseFloat(quote.unitPrice) || 0;
      const quantity = parseInt(quote.moq) || 1;

      // Only validate unit_price - MOQ has no influence on best price
      if (unit_price <= 0) return;

      // Compare in the base currency. Comparing raw unit_price treated a
      // CNY figure as if it were the same magnitude as a USD one.
      const currency = normalizeCurrency(quote.currency);
      const comparablePrice = convertAmount(unit_price, currency, baseCurrency, fxRates);
      if (comparablePrice === null) return; // no rate: cannot rank it

      if (comparablePrice < lowestComparable) {
        lowestComparable = comparablePrice;
        bestQuote = {
          ...quote,
          unit_price,
          currency,
          comparablePrice,
          isConverted: currency !== baseCurrency,
          quantity,
        };
      }
    });

    return bestQuote;
  }, [selectedProductId, quotes, baseCurrency, fxRates]);

  // Quote count for selected product
  const productQuoteCount = useMemo(() => {
    if (!selectedProductId) return 0;
    return quoteCounts[selectedProductId] || 0;
  }, [selectedProductId, quoteCounts]);

  const stats = [
    { label: t('dashboard.buyingIntents'), value: products.length, icon: Package, color: '#7c5cfc', bgColor: 'rgba(124, 92, 252, 0.1)' },
    { label: t('dashboard.quotes'), value: quotes.length, icon: FileText, color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)' },
  ];

  return (
    <div className="page">
      <div className="header">
        <div>
          <h2>{t('dashboard.title')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
            {t('dashboard.subtitle')}
          </p>
        </div>
      </div>

      <div className="content">
        {/* Section: Overview */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '2px solid var(--border)'
          }}>
            {t('dashboard.overview')}
          </h3>
          <div className="stats-grid">
            {stats.map(stat => (
              <div key={stat.label} className="stat-card">
                <div className="stat-icon-wrapper">
                  <stat.icon size={18} color="var(--text-secondary)" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-value">{stat.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section: Workflow & Best Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Workflow Steps */}
          <div style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '2px solid var(--border)',
              background: 'var(--bg-secondary)'
            }}>
              <h3 style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0
              }}>
                {t('dashboard.workflow')}
              </h3>
            </div>
            <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                className="workflow-step"
                onClick={() => navigate('/products')}
                style={{ cursor: 'pointer', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s', border: '1px solid var(--border-light)' }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--text-secondary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  flexShrink: 0
                }}>1</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '2px', color: 'var(--text-primary)' }}>{t('dashboard.step1Title')}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{t('dashboard.step1Desc')}</p>
                </div>
              </div>
              <div
                className="workflow-step"
                onClick={() => navigate('/products')}
                style={{ cursor: 'pointer', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s', border: '1px solid var(--border-light)' }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--text-secondary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  flexShrink: 0
                }}>2</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '2px', color: 'var(--text-primary)' }}>{t('dashboard.step2Title')}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{t('dashboard.step2Desc')}</p>
                </div>
              </div>
              <div
                className="workflow-step active"
                onClick={() => navigate('/comparison')}
                style={{ cursor: 'pointer', padding: '12px', background: 'var(--accent-light)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s', border: '1px solid var(--accent)' }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  flexShrink: 0
                }}>3</div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '2px', color: 'var(--text-primary)' }}>{t('dashboard.step3Title')}</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>{t('dashboard.step3Desc')}</p>
                </div>
                <CheckCircle size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              </div>
            </div>
            </div>
          </div>

          {/* Best Price Finder */}
          <div style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '2px solid var(--border)',
              background: 'var(--bg-secondary)'
            }}>
              <h3 style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <TrendingDown size={16} />
                {t('dashboard.bestPriceFinder')}
              </h3>
            </div>
            <div style={{ padding: '16px' }}>
          
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
              {t('dashboard.selectBuyingIntent')}
            </label>
            <BuyingIntentCommandSelect
              buyingIntents={products}
              value={selectedProductId}
              onChange={setSelectedProductId}
              quoteCounts={quoteCounts}
              placeholder={t('dashboard.selectBuyingIntentPlaceholder')}
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
                  {t('dashboard.bestPriceFor')} <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct?.name}</strong>
                </div>
                <div className="best-quote-content">
                  <div className="best-quote-supplier">
                    <strong>{bestQuoteForProduct.supplierName}</strong>
                    <span className="best-quote-product">{bestQuoteForProduct.incoterm || 'FOB'}</span>
                  </div>
                  <div className="best-quote-price landed">
                    <div className="best-quote-unit">
                      {formatCurrency(bestQuoteForProduct.unit_price, bestQuoteForProduct.currency)}/unit
                      {bestQuoteForProduct.isConverted && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                          ≈ {formatCurrency(bestQuoteForProduct.comparablePrice, baseCurrency)}/unit
                        </span>
                      )}
                    </div>
                    <div className="best-quote-label">{t('dashboard.unitPrice')}</div>
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={() => navigate('/comparison', { state: { productId: selectedProductId } })}>
                  <GitCompare size={16} />
                  {t('dashboard.compareQuotes').replace('{count}', productQuoteCount)}
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
                <p style={{ margin: 0 }}>{t('dashboard.noQuotesFor').replace('{name}', selectedProduct?.name)}</p>
                <button
                  className="btn btn-ghost"
                  style={{ marginTop: '12px' }}
                  onClick={() => navigate(`/products/${selectedProductId}`)}
                >
                  {t('dashboard.addQuotes')}
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
              <p style={{ margin: 0 }}>{t('dashboard.selectAbove')}</p>
            </div>
          )}
            </div>
          </div>
        </div>

        {/* Section: Quick Actions */}
        <div style={{ marginTop: '24px' }}>
          <h3 style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: '12px',
            paddingBottom: '8px',
            borderBottom: '2px solid var(--border)'
          }}>
            {t('dashboard.quickActions')}
          </h3>
          <div className="quick-actions-grid">
            <button className="quick-action-card" onClick={() => navigate('/products')}>
              <Package size={20} />
              <span>{t('dashboard.buyingIntents')}</span>
            </button>
            <button className="quick-action-card" onClick={() => navigate('/comparison')}>
              <GitCompare size={20} />
              <span>{t('sidebar.compareQuotes')}</span>
            </button>
            <button className="quick-action-card" onClick={() => navigate('/quote-capture')}>
              <Plus size={20} />
              <span>{t('dashboard.uploadQuote')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
