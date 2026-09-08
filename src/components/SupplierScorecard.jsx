import React, { useMemo } from 'react';
import { Star, Clock, ThumbsUp, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';

function SupplierScorecard({ supplier, quotes, orders }) {
  const metrics = useMemo(() => {
    // Get quotes for this supplier
    const supplierQuotes = quotes.filter(q => 
      q.supplier_id === supplier.id || q.supplierId === supplier.id
    );
    
    // Get orders for this supplier
    const supplierOrders = orders.filter(o => 
      o.supplier === supplier.company
    );

    // Calculate metrics
    const totalQuotes = supplierQuotes.length;
    
    // On-time delivery rate (based on order status)
    const completedOrders = supplierOrders.filter(o => o.status === 'delivered');
    const onTimeOrders = completedOrders.filter(o => !o.wasLate); // You'd track this
    const onTimeRate = completedOrders.length > 0 
      ? (onTimeOrders.length / completedOrders.length) * 100 
      : null;

    // Price competitiveness (compare to average across all suppliers for same products)
    const priceScores = [];
    supplierQuotes.forEach(quote => {
      const priceField = Object.keys(quote.fields || {}).find(k => 
        k.toLowerCase().includes('price')
      );
      if (priceField) {
        const price = parseFloat(String(quote.fields[priceField]).replace(/[^0-9.]/g, ''));
        if (!isNaN(price)) priceScores.push(price);
      }
    });
    const avgPrice = priceScores.length > 0 
      ? priceScores.reduce((a, b) => a + b, 0) / priceScores.length 
      : null;

    // Response time (mock - you'd track this in real app)
    const avgResponseDays = 2; // Placeholder

    // Quality score (based on issues - you'd track this)
    const qualityIssues = 0; // Placeholder
    const qualityRate = completedOrders.length > 0
      ? ((completedOrders.length - qualityIssues) / completedOrders.length) * 100
      : null;

    // Overall score
    let overallScore = 0;
    let scoreFactors = 0;
    if (onTimeRate !== null) { overallScore += onTimeRate; scoreFactors++; }
    if (qualityRate !== null) { overallScore += qualityRate; scoreFactors++; }
    overallScore = scoreFactors > 0 ? overallScore / scoreFactors : null;

    return {
      totalQuotes,
      totalOrders: supplierOrders.length,
      completedOrders: completedOrders.length,
      onTimeRate,
      qualityRate,
      avgPrice,
      avgResponseDays,
      overallScore,
    };
  }, [supplier, quotes, orders]);

  const getScoreColor = (score) => {
    if (score === null) return 'var(--text-muted)';
    if (score >= 90) return 'var(--success)';
    if (score >= 70) return 'var(--warning)';
    return 'var(--error)';
  };

  const getScoreLabel = (score) => {
    if (score === null) return 'No data';
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  };

  return (
    <div className="scorecard">
      <div className="scorecard-header">
        <h4>Supplier Scorecard</h4>
        {metrics.overallScore !== null && (
          <div className="overall-score" style={{ color: getScoreColor(metrics.overallScore) }}>
            <Star size={16} fill="currentColor" />
            {metrics.overallScore.toFixed(0)}%
          </div>
        )}
      </div>

      <div className="scorecard-metrics">
        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--success-tint)' }}>
            <Clock size={18} color="var(--success)" />
          </div>
          <div className="metric-content">
            <div className="metric-label">On-Time Delivery</div>
            <div className="metric-value" style={{ color: getScoreColor(metrics.onTimeRate) }}>
              {metrics.onTimeRate !== null ? `${metrics.onTimeRate.toFixed(0)}%` : 'N/A'}
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--accent-tint)' }}>
            <ThumbsUp size={18} color="var(--info)" />
          </div>
          <div className="metric-content">
            <div className="metric-label">Quality Rate</div>
            <div className="metric-value" style={{ color: getScoreColor(metrics.qualityRate) }}>
              {metrics.qualityRate !== null ? `${metrics.qualityRate.toFixed(0)}%` : 'N/A'}
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--accent-tint)' }}>
            <TrendingDown size={18} color="var(--accent)" />
          </div>
          <div className="metric-content">
            <div className="metric-label">Avg Response</div>
            <div className="metric-value">
              {metrics.avgResponseDays} days
            </div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon" style={{ background: 'var(--warning-tint)' }}>
            <TrendingUp size={18} color="var(--warning)" />
          </div>
          <div className="metric-content">
            <div className="metric-label">Total Quotes</div>
            <div className="metric-value">{metrics.totalQuotes}</div>
          </div>
        </div>
      </div>

      <div className="scorecard-summary">
        <div className="summary-item">
          <span>Orders Completed</span>
          <span>{metrics.completedOrders} / {metrics.totalOrders}</span>
        </div>
        <div className="summary-item">
          <span>Overall Rating</span>
          <span style={{ color: getScoreColor(metrics.overallScore), fontWeight: 600 }}>
            {getScoreLabel(metrics.overallScore)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default SupplierScorecard;
