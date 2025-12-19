import React from 'react';
import { Package, FileText, Edit2, Trash2, Ruler, Weight } from 'lucide-react';

function ProductCard({ product, quoteCount = 0, onClick, onEdit, onDelete }) {
  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(product);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(product.id);
  };

  const hasQuotes = quoteCount > 0;

  return (
    <div
      className="product-card"
      onClick={() => onClick?.(product)}
      style={{
        border: `2px solid ${hasQuotes ? '#10b981' : '#ef4444'}`,
        background: hasQuotes ? '#f0fdf4' : '#fef2f2',
      }}
    >
      <div className="product-card-header">
        <div>
          <div className="product-name">{product.name}</div>
          {product.category && (
            <div className="product-category">{product.category}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onEdit && (
            <button className="icon-btn" onClick={handleEdit}>
              <Edit2 size={16} />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn" onClick={handleDelete}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginTop: '12px',
        padding: '8px 12px',
        background: hasQuotes ? '#d1fae5' : '#fee2e2',
        borderRadius: '6px',
      }}>
        <FileText size={14} style={{ color: hasQuotes ? '#065f46' : '#991b1b' }} />
        <span style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: hasQuotes ? '#065f46' : '#991b1b',
        }}>
          {quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'}
        </span>
      </div>

      {/* Specs */}
      {(product.dimensions || product.weight_g) && (
        <div style={{
          marginTop: '12px',
          padding: '10px',
          background: 'white',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {product.dimensions && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.875rem',
            }}>
              <Ruler size={14} style={{ color: '#64748b' }} />
              <span style={{ color: '#64748b', fontWeight: 500 }}>Dimensions:</span>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>{product.dimensions}</span>
            </div>
          )}
          {product.weight_g && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.875rem',
            }}>
              <Weight size={14} style={{ color: '#64748b' }} />
              <span style={{ color: '#64748b', fontWeight: 500 }}>Weight:</span>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>{product.weight_g}g</span>
            </div>
          )}
        </div>
      )}

      {product.description && (
        <p style={{
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          marginTop: '12px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical'
        }}>
          {product.description}
        </p>
      )}
    </div>
  );
}

export default ProductCard;
