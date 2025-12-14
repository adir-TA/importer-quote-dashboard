import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, ArrowRight } from 'lucide-react';

function PriceAlerts({ quotes, products }) {
  const alerts = useMemo(() => {
    const alertsList = [];
    
    // Group quotes by product and supplier
    const grouped = {};
    quotes.forEach(quote => {
      const productId = quote.product_id || quote.productId;
      const supplierName = quote.supplier_name || quote.supplierName;
      const key = `${productId}-${supplierName}`;
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(quote);
    });

    // Check each group for price changes
    Object.entries(grouped).forEach(([key, quoteList]) => {
      if (quoteList.length < 2) return;

      // Sort by date descending
      const sorted = [...quoteList].sort((a, b) => 
        new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt)
      );

      const latest = sorted[0];
      const previous = sorted[1];

      // Find price fields
      const getPriceFromQuote = (quote) => {
        const priceField = Object.keys(quote.fields || {}).find(k => 
          k.toLowerCase().includes('price')
        );
        if (!priceField) return null;
        return parseFloat(String(quote.fields[priceField]).replace(/[^0-9.]/g, ''));
      };

      const latestPrice = getPriceFromQuote(latest);
      const previousPrice = getPriceFromQuote(previous);

      if (latestPrice === null || previousPrice === null) return;
      if (latestPrice === previousPrice) return;

      const productId = latest.product_id || latest.productId;
      const product = products.find(p => p.id === productId);
      const percentChange = ((latestPrice - previousPrice) / previousPrice) * 100;

      alertsList.push({
        id: key,
        type: latestPrice > previousPrice ? 'increase' : 'decrease',
        productName: product?.name || 'Unknown Product',
        supplierName: latest.supplier_name || latest.supplierName,
        previousPrice,
        latestPrice,
        percentChange,
        date: latest.created_at || latest.createdAt,
      });
    });

    // Sort by absolute percent change (biggest changes first)
    return alertsList.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
  }, [quotes, products]);

  if (alerts.length === 0) {
    return (
      <div className="price-alerts empty">
        <AlertTriangle size={24} color="var(--text-muted)" />
        <p>No price changes detected yet</p>
        <span>Add more quotes to track price trends</span>
      </div>
    );
  }

  return (
    <div className="price-alerts">
      {alerts.slice(0, 5).map(alert => (
        <div key={alert.id} className={`alert-item ${alert.type}`}>
          <div className="alert-icon">
            {alert.type === 'increase' ? (
              <TrendingUp size={20} />
            ) : (
              <TrendingDown size={20} />
            )}
          </div>
          <div className="alert-content">
            <div className="alert-title">{alert.productName}</div>
            <div className="alert-supplier">{alert.supplierName}</div>
          </div>
          <div className="alert-prices">
            <span className="price-old">${alert.previousPrice.toFixed(2)}</span>
            <ArrowRight size={14} />
            <span className="price-new">${alert.latestPrice.toFixed(2)}</span>
          </div>
          <div className={`alert-badge ${alert.type}`}>
            {alert.type === 'increase' ? '+' : ''}{alert.percentChange.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  );
}

export default PriceAlerts;
