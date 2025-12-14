import React, { useMemo, useState } from 'react';
import { parsePrice } from '../utils/helpers';

function QuoteComparisonTable({ quotes }) {
  const [sortBy, setSortBy] = useState(null);
  const [filterField, setFilterField] = useState('');

  // Get all unique fields
  const allFields = useMemo(() => {
    const fields = new Set();
    quotes.forEach(q => {
      Object.keys(q.fields || {}).forEach(k => fields.add(k));
    });
    return Array.from(fields);
  }, [quotes]);

  // Find best prices for each field
  const bestPrices = useMemo(() => {
    const best = {};
    allFields.forEach(field => {
      if (field.toLowerCase().includes('price')) {
        let lowestValue = Infinity;
        let lowestIdx = -1;
        
        quotes.forEach((q, idx) => {
          const val = q.fields?.[field];
          if (val) {
            const numVal = parsePrice(val);
            if (!isNaN(numVal) && numVal > 0 && numVal < lowestValue) {
              lowestValue = numVal;
              lowestIdx = idx;
            }
          }
        });
        
        if (lowestIdx !== -1) {
          best[field] = lowestIdx;
        }
      }
    });
    return best;
  }, [quotes, allFields]);

  // Filter fields
  const filteredFields = useMemo(() => {
    if (!filterField) return allFields;
    return allFields.filter(f => 
      f.toLowerCase().includes(filterField.toLowerCase())
    );
  }, [allFields, filterField]);

  // Find overall best supplier
  const bestSupplier = useMemo(() => {
    const scores = {};
    quotes.forEach((q, idx) => {
      scores[idx] = 0;
    });
    
    Object.values(bestPrices).forEach(idx => {
      scores[idx] = (scores[idx] || 0) + 1;
    });

    let maxScore = 0;
    let bestIdx = 0;
    Object.entries(scores).forEach(([idx, score]) => {
      if (score > maxScore) {
        maxScore = score;
        bestIdx = parseInt(idx);
      }
    });

    return quotes[bestIdx]?.supplier_name || quotes[bestIdx]?.supplierName;
  }, [quotes, bestPrices]);

  if (quotes.length < 2) {
    return (
      <div className="empty-state">
        <h3>Select quotes to compare</h3>
        <p>Choose 2 or more quotes from a product to see comparison</p>
      </div>
    );
  }

  return (
    <div>
      {/* Quick Analysis Box */}
      {bestSupplier && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '1.5rem' }}>💡</span>
          <div>
            <strong style={{ color: 'var(--accent)' }}>Best Overall: {bestSupplier}</strong>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Based on lowest prices across {Object.keys(bestPrices).length} price fields
            </p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ marginBottom: '16px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Filter fields..."
          value={filterField}
          onChange={(e) => setFilterField(e.target.value)}
          style={{ maxWidth: '300px' }}
        />
      </div>

      {/* Comparison Table */}
      <div className="comparison-container">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Field</th>
              {quotes.map((q, idx) => (
                <th key={q.id}>
                  {q.supplier_name || q.supplierName}
                  {bestPrices && Object.values(bestPrices).filter(i => i === idx).length > 0 && (
                    <span style={{
                      display: 'inline-block',
                      marginLeft: '8px',
                      background: 'var(--accent)',
                      color: 'white',
                      fontSize: '0.65rem',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      ⭐ {Object.values(bestPrices).filter(i => i === idx).length} best
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredFields.map(field => (
              <tr key={field}>
                <td>{field}</td>
                {quotes.map((q, idx) => {
                  const value = q.fields?.[field] || '-';
                  const isBest = bestPrices[field] === idx;
                  
                  return (
                    <td
                      key={q.id}
                      className={isBest ? 'best-price' : ''}
                    >
                      {value}
                      {isBest && <span className="best-badge">✓ BEST</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td>Tags</td>
              {quotes.map(q => (
                <td key={q.id}>
                  {(q.tags || []).join(', ') || '-'}
                </td>
              ))}
            </tr>
            <tr>
              <td>Notes</td>
              {quotes.map(q => (
                <td key={q.id} style={{ maxWidth: '200px' }}>
                  {q.notes || '-'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default QuoteComparisonTable;
