import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, CheckSquare, Square, TrendingDown, Award } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// ============================================
// PORTFOLIO COMPARISON PAGE
// ============================================
// Shows supplier metrics across multiple buying intents
// NO auto-matching - all data is human-linked
// Fully transparent - drill down to raw line items
// ============================================

function PortfolioComparison() {
  const navigate = useNavigate();
  const { state, computed } = useAppContext();
  const { products } = state;

  const [selectedIntents, setSelectedIntents] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [allLineItems, setAllLineItems] = useState([]);
  const [expandedSuppliers, setExpandedSuppliers] = useState(new Set());

  // Load all line items on mount
  useEffect(() => {
    const loadAllLineItems = async () => {
      const allItems = [];
      for (const product of products) {
        const items = await computed.getLineItemsForBuyingIntent(product.id);
        allItems.push(...items.map(item => ({
          ...item,
          buyingIntentId: product.id,
          buyingIntentName: product.name,
        })));
      }
      setAllLineItems(allItems);
    };
    loadAllLineItems();
  }, [products, computed]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return ['all', ...Array.from(cats)];
  }, [products]);

  // Filter intents by category
  const filteredIntents = useMemo(() => {
    if (selectedCategory === 'all') return products;
    return products.filter(p => p.category === selectedCategory);
  }, [products, selectedCategory]);

  // Handle category selection
  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
    // Auto-select all intents in this category
    if (category === 'all') {
      setSelectedIntents(products.map(p => p.id));
    } else {
      setSelectedIntents(products.filter(p => p.category === category).map(p => p.id));
    }
  };

  // Handle individual intent toggle
  const toggleIntent = (intentId) => {
    setSelectedIntents(prev =>
      prev.includes(intentId)
        ? prev.filter(id => id !== intentId)
        : [...prev, intentId]
    );
  };

  // Get selected intent objects
  const selectedIntentsData = useMemo(() => {
    return products.filter(p => selectedIntents.includes(p.id));
  }, [products, selectedIntents]);

  // ============================================
  // CALCULATE SUPPLIER METRICS
  // ============================================
  const supplierMetrics = useMemo(() => {
    if (selectedIntents.length === 0) return [];

    // Get line items only for selected intents
    const relevantItems = allLineItems.filter(item =>
      selectedIntents.includes(item.buyingIntentId)
    );

    // Group line items by supplier
    const bySupplier = {};
    relevantItems.forEach(item => {
      const supplierName = item.supplierName || item.supplier?.supplier_name || 'Unknown Supplier';
      if (!bySupplier[supplierName]) {
        bySupplier[supplierName] = [];
      }
      bySupplier[supplierName].push(item);
    });

    // For each buying intent, find the best (lowest) price
    const bestPrices = {};
    selectedIntents.forEach(intentId => {
      const itemsForIntent = relevantItems.filter(item => item.buyingIntentId === intentId);
      if (itemsForIntent.length > 0) {
        bestPrices[intentId] = Math.min(...itemsForIntent.map(item => parseFloat(item.unit_price)));
      }
    });

    // Calculate metrics for each supplier
    const metrics = Object.entries(bySupplier).map(([supplierName, items]) => {
      // Coverage: how many of the selected intents did this supplier quote?
      const quotedIntents = new Set(items.map(item => item.buyingIntentId));
      const coverage = quotedIntents.size;
      const coveragePercent = (coverage / selectedIntents.length) * 100;

      // Missing intents
      const missingIntents = selectedIntents.filter(id => !quotedIntents.has(id));
      const missingIntentNames = missingIntents
        .map(id => products.find(p => p.id === id)?.name)
        .filter(Boolean);

      // Best Price Count: for how many intents is this supplier the cheapest?
      let bestPriceCount = 0;
      selectedIntents.forEach(intentId => {
        const supplierItemsForIntent = items.filter(item => item.buyingIntentId === intentId);
        if (supplierItemsForIntent.length > 0) {
          const supplierPrice = Math.min(...supplierItemsForIntent.map(item => parseFloat(item.unit_price)));
          if (supplierPrice === bestPrices[intentId]) {
            bestPriceCount++;
          }
        }
      });

      // Avg Delta: average % difference from best price (only for quoted intents)
      let totalDelta = 0;
      let deltaCount = 0;
      selectedIntents.forEach(intentId => {
        if (quotedIntents.has(intentId)) {
          const supplierItemsForIntent = items.filter(item => item.buyingIntentId === intentId);
          const supplierPrice = Math.min(...supplierItemsForIntent.map(item => parseFloat(item.unit_price)));
          const bestPrice = bestPrices[intentId];
          if (bestPrice && bestPrice > 0) {
            const delta = ((supplierPrice - bestPrice) / bestPrice) * 100;
            totalDelta += delta;
            deltaCount++;
          }
        }
      });
      const avgDelta = deltaCount > 0 ? totalDelta / deltaCount : 0;

      return {
        supplierName,
        coverage,
        coveragePercent,
        coverageDisplay: `${coverage}/${selectedIntents.length}`,
        bestPriceCount,
        avgDelta,
        missingIntents: missingIntentNames,
        items, // All line items from this supplier for selected intents
      };
    });

    // Sort by coverage (descending), then by best price count (descending)
    return metrics.sort((a, b) => {
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return b.bestPriceCount - a.bestPriceCount;
    });
  }, [selectedIntents, allLineItems, products]);

  // Toggle supplier expansion
  const toggleSupplier = (supplierName) => {
    setExpandedSuppliers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(supplierName)) {
        newSet.delete(supplierName);
      } else {
        newSet.add(supplierName);
      }
      return newSet;
    });
  };

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>Portfolio Comparison</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
              Compare suppliers across multiple buying intents - fully transparent metrics
            </p>
          </div>
        </div>
      </div>

      <div className="content">
        {/* Stats Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '28px',
        }}>
          <div className="stat-card" style={{ '--stat-color': '#6366F1', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
              <Package size={22} color="#6366F1" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Intents</div>
              <div className="stat-value">{products.length}</div>
            </div>
          </div>
          <div className="stat-card" style={{ '--stat-color': '#10b981', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
              <CheckSquare size={22} color="#10b981" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Selected</div>
              <div className="stat-value">{selectedIntents.length}</div>
            </div>
          </div>
          <div className="stat-card" style={{ '--stat-color': '#f59e0b', '--stat-bg': 'rgba(245, 158, 11, 0.1)' }}>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
              <Award size={22} color="#f59e0b" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Suppliers</div>
              <div className="stat-value">{supplierMetrics.length}</div>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-body">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              Filter by Category
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`btn ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleCategoryChange(cat)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Basket Selection */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span className="card-title">Select Buying Intents for Comparison</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {selectedIntents.length} selected
            </span>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
              {filteredIntents.map(intent => {
                const isSelected = selectedIntents.includes(intent.id);
                return (
                  <button
                    key={intent.id}
                    onClick={() => toggleIntent(intent.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px',
                      border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isSelected ? 'var(--accent-light)' : 'white',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s',
                    }}
                  >
                    {isSelected ? (
                      <CheckSquare size={20} color="var(--primary)" />
                    ) : (
                      <Square size={20} color="var(--text-muted)" />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{intent.name}</div>
                      {intent.category && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {intent.category}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Supplier Metrics Table */}
        {selectedIntents.length === 0 ? (
          <div className="empty-state">
            <TrendingDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>Select Buying Intents</h3>
            <p>Choose one or more buying intents above to compare supplier metrics</p>
          </div>
        ) : supplierMetrics.length === 0 ? (
          <div className="empty-state">
            <TrendingDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>No Quotes Yet</h3>
            <p>Upload quotes for the selected buying intents to see supplier metrics</p>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <Award size={18} /> Supplier Metrics ({supplierMetrics.length} suppliers)
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Supplier</th>
                    <th>Coverage</th>
                    <th>Best Price Count</th>
                    <th>Avg Delta</th>
                    <th>Missing Intents</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierMetrics.map((metric, index) => {
                    const isExpanded = expandedSuppliers.has(metric.supplierName);
                    const isBest = index === 0;

                    return (
                      <React.Fragment key={metric.supplierName}>
                        <tr
                          onClick={() => toggleSupplier(metric.supplierName)}
                          style={{
                            cursor: 'pointer',
                            background: isBest ? '#f0fdf4' : undefined,
                          }}
                        >
                          <td>
                            {isExpanded ? (
                              <ChevronDown size={18} />
                            ) : (
                              <ChevronRight size={18} />
                            )}
                          </td>
                          <td style={{ fontWeight: 500 }}>
                            {metric.supplierName}
                            {isBest && (
                              <span style={{
                                marginLeft: '8px',
                                padding: '2px 6px',
                                background: 'var(--success)',
                                color: 'white',
                                fontSize: '0.7rem',
                                borderRadius: '4px',
                                fontWeight: 600
                              }}>
                                BEST
                              </span>
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{metric.coverageDisplay}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {metric.coveragePercent.toFixed(0)}%
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            {metric.bestPriceCount}
                          </td>
                          <td>
                            <span style={{
                              color: metric.avgDelta <= 0 ? 'var(--success)' : metric.avgDelta < 10 ? 'var(--warning)' : 'var(--error)',
                              fontWeight: 600
                            }}>
                              {metric.avgDelta > 0 ? '+' : ''}{metric.avgDelta.toFixed(1)}%
                            </span>
                          </td>
                          <td>
                            {metric.missingIntents.length === 0 ? (
                              <span style={{ color: 'var(--success)', fontSize: '0.85rem' }}>None</span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                {metric.missingIntents.length} missing
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Row - Show Per-Intent Breakdown */}
                        {isExpanded && (
                          <tr>
                            <td colSpan="6" style={{ background: '#f9fafb', padding: '16px' }}>
                              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>
                                Per-Intent Breakdown for {metric.supplierName}
                              </h4>
                              <table className="table" style={{ fontSize: '0.85rem' }}>
                                <thead>
                                  <tr>
                                    <th>Buying Intent</th>
                                    <th>Raw Item Name</th>
                                    <th>SKU</th>
                                    <th>Unit Price</th>
                                    <th>MOQ</th>
                                    <th>Packing</th>
                                    <th>CBM</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {metric.items.map(item => (
                                    <tr key={item.id}>
                                      <td style={{ fontWeight: 500 }}>{item.buyingIntentName}</td>
                                      <td>{item.product_name}</td>
                                      <td>{item.sku || '-'}</td>
                                      <td style={{ fontWeight: 600 }}>
                                        {item.currency || 'USD'} {parseFloat(item.unit_price).toFixed(2)}
                                      </td>
                                      <td>{item.moq ? parseInt(item.moq).toLocaleString() : '-'}</td>
                                      <td>{item.packing_pcs_per_ctn ? `${item.packing_pcs_per_ctn} pcs/ctn` : '-'}</td>
                                      <td>{item.cbm_per_carton ? parseFloat(item.cbm_per_carton).toFixed(3) : '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* Missing Intents */}
                              {metric.missingIntents.length > 0 && (
                                <div style={{ marginTop: '12px', padding: '12px', background: '#fef3c7', borderRadius: '6px' }}>
                                  <strong style={{ fontSize: '0.85rem' }}>Missing Quotes:</strong>
                                  <div style={{ marginTop: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {metric.missingIntents.join(', ')}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Metrics Explanation */}
        {selectedIntents.length > 0 && supplierMetrics.length > 0 && (
          <div className="card" style={{ marginTop: '16px', background: '#f0f9ff', border: '1px solid #0ea5e9' }}>
            <div className="card-body">
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>Metrics Explained</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', lineHeight: '1.8' }}>
                <li><strong>Coverage:</strong> How many of the selected buying intents this supplier quoted (e.g., "7/10" = quoted 7 out of 10)</li>
                <li><strong>Best Price Count:</strong> Number of intents where this supplier offers the lowest price</li>
                <li><strong>Avg Delta:</strong> Average % difference from the best price across all quoted intents (lower is better)</li>
                <li><strong>Missing Intents:</strong> Buying intents this supplier didn't provide quotes for</li>
              </ul>
              <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <strong>Tip:</strong> Click any supplier row to see the raw line-item data. All metrics are calculated transparently - no black boxes!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PortfolioComparison;
