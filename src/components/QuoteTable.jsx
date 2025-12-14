import React, { useState, useMemo } from 'react';
import { Check, ChevronUp, ChevronDown, Edit2, Trash2 } from 'lucide-react';
import { Tag } from './Tag';
import { formatDate, parsePrice } from '../utils/helpers';

function QuoteTable({
  quotes,
  selectedQuotes = [],
  onToggleSelect,
  onEdit,
  onDelete,
  selectable = true,
  sortable = true
}) {
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  // Get all unique field names across quotes
  const allFields = useMemo(() => {
    const fields = new Set();
    quotes.forEach(q => {
      Object.keys(q.fields || {}).forEach(k => fields.add(k));
    });
    return Array.from(fields);
  }, [quotes]);

  // Sort quotes
  const sortedQuotes = useMemo(() => {
    const sorted = [...quotes];
    sorted.sort((a, b) => {
      let aVal, bVal;
      
      if (sortConfig.key === 'supplierName') {
        aVal = a.supplier_name || a.supplierName || '';
        bVal = b.supplier_name || b.supplierName || '';
      } else if (sortConfig.key === 'createdAt') {
        aVal = new Date(a.created_at || a.createdAt);
        bVal = new Date(b.created_at || b.createdAt);
      } else {
        // Sort by field value
        aVal = parsePrice(a.fields?.[sortConfig.key]);
        bVal = parsePrice(b.fields?.[sortConfig.key]);
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [quotes, sortConfig]);

  const handleSort = (key) => {
    if (!sortable) return;
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ columnKey }) => {
    if (!sortable) return null;
    if (sortConfig.key !== columnKey) {
      return <ChevronUp size={14} style={{ opacity: 0.3 }} />;
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp size={14} /> 
      : <ChevronDown size={14} />;
  };

  if (quotes.length === 0) {
    return (
      <div className="empty-state">
        <h3>No quotes yet</h3>
        <p>Add your first quote to get started</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead>
          <tr>
            {selectable && <th style={{ width: '40px' }}></th>}
            <th onClick={() => handleSort('supplierName')} style={{ cursor: sortable ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Supplier <SortIcon columnKey="supplierName" />
              </div>
            </th>
            {allFields.map(field => (
              <th key={field} onClick={() => handleSort(field)} style={{ cursor: sortable ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {field} <SortIcon columnKey={field} />
                </div>
              </th>
            ))}
            <th>Tags</th>
            <th onClick={() => handleSort('createdAt')} style={{ cursor: sortable ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Date <SortIcon columnKey="createdAt" />
              </div>
            </th>
            {(onEdit || onDelete) && <th style={{ width: '100px' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {sortedQuotes.map(quote => {
            const isSelected = selectedQuotes.includes(quote.id);
            return (
              <tr key={quote.id}>
                {selectable && (
                  <td>
                    <div
                      className={`checkbox ${isSelected ? 'checked' : ''}`}
                      onClick={() => onToggleSelect?.(quote.id)}
                    >
                      {isSelected && <Check size={14} />}
                    </div>
                  </td>
                )}
                <td style={{ fontWeight: 500 }}>{quote.supplier_name || quote.supplierName}</td>
                {allFields.map(field => (
                  <td key={field}>{quote.fields?.[field] || '-'}</td>
                ))}
                <td>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {(quote.tags || []).map(tag => (
                      <Tag key={tag} type={tag} />
                    ))}
                  </div>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>
                  {formatDate(quote.created_at || quote.createdAt)}
                </td>
                {(onEdit || onDelete) && (
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {onEdit && (
                        <button className="icon-btn" onClick={() => onEdit(quote)}>
                          <Edit2 size={16} />
                        </button>
                      )}
                      {onDelete && (
                        <button className="icon-btn" onClick={() => onDelete(quote.id)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default QuoteTable;
