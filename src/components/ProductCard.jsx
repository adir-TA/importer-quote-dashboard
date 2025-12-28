import React from 'react';
import { FileText, Edit2, Trash2, Package } from 'lucide-react';

// Helper to get primary specs (default order: Weight, Height, Length, Width)
function getPrimarySpecs(specs) {
  if (!specs || specs.length === 0) return { primary: [], remaining: 0 };

  const defaultKeys = ['Weight', 'Height', 'Length', 'Width'];
  const primary = [];
  const seen = new Set();

  // First, add default keys in order
  defaultKeys.forEach(key => {
    const spec = specs.find(s => s.key.toLowerCase() === key.toLowerCase() && s.value);
    if (spec) {
      primary.push(spec);
      seen.add(spec.key.toLowerCase());
    }
  });

  // Then add remaining specs up to 4 total
  const remaining = specs.filter(s => !seen.has(s.key.toLowerCase()) && s.value);
  while (primary.length < 4 && remaining.length > 0) {
    const spec = remaining.shift();
    primary.push(spec);
    seen.add(spec.key.toLowerCase());
  }

  return { primary, remaining: specs.filter(s => !seen.has(s.key.toLowerCase()) && s.value).length };
}

function ProductCard({ product, quoteCount = 0, onClick, onEdit, onDelete, isSelected, onToggleSelect }) {
  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(product);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(product.id);
  };

  const handleCheckbox = (e) => {
    e.stopPropagation();
    onToggleSelect?.(product.id);
  };

  const hasQuotes = quoteCount > 0;
  const { primary, remaining } = getPrimarySpecs(product.specs);

  return (
    <div
      className="product-card"
      onClick={() => onClick?.(product)}
      style={{
        border: isSelected
          ? '2px solid #3b82f6'
          : `2px solid ${hasQuotes ? '#10b981' : '#ef4444'}`,
        background: isSelected
          ? '#eff6ff'
          : hasQuotes ? '#f0fdf4' : '#fef2f2',
        padding: '16px',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Header with checkbox and actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <input
          type="checkbox"
          checked={isSelected || false}
          onChange={handleCheckbox}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '20px',
            height: '20px',
            cursor: 'pointer',
            marginTop: '2px',
            flexShrink: 0,
          }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: '0.95rem',
            color: '#1e293b',
            marginBottom: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}>
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}>
              {product.name}
            </span>
            {product.status === 'draft' && (
              <span style={{
                padding: '2px 6px',
                background: '#fef3c7',
                color: '#92400e',
                borderRadius: '4px',
                fontSize: '0.65rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap',
              }}>
                Draft
              </span>
            )}
          </div>

          {product.category && (
            <div style={{
              fontSize: '0.75rem',
              color: '#64748b',
              marginTop: '2px',
            }}>
              {product.category}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {onEdit && (
            <button className="icon-btn" onClick={handleEdit} style={{ padding: '6px' }}>
              <Edit2 size={14} />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn" onClick={handleDelete} style={{ padding: '6px' }}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Quote count badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        background: hasQuotes ? '#d1fae5' : '#fee2e2',
        borderRadius: '6px',
        alignSelf: 'flex-start',
      }}>
        <FileText size={12} style={{ color: hasQuotes ? '#065f46' : '#991b1b' }} />
        <span style={{
          fontSize: '0.8rem',
          fontWeight: 600,
          color: hasQuotes ? '#065f46' : '#991b1b',
        }}>
          {quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'}
        </span>
      </div>

      {/* Thumbnail and Specs Section */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        {/* Thumbnail */}
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{
              width: '60px',
              height: '60px',
              objectFit: 'cover',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: '60px',
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f1f5f9',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            flexShrink: 0,
          }}>
            <Package size={24} style={{ color: '#94a3b8' }} />
          </div>
        )}

        {/* Specs */}
        {primary.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {primary.map((spec, index) => (
              <div key={index} style={{
                fontSize: '0.75rem',
                color: '#64748b',
                marginBottom: '2px',
                display: 'flex',
                gap: '6px',
              }}>
                <span style={{ fontWeight: 600, color: '#475569' }}>{spec.key}:</span>
                <span>{spec.value}</span>
              </div>
            ))}
            {remaining > 0 && (
              <div style={{
                fontSize: '0.7rem',
                color: '#94a3b8',
                fontStyle: 'italic',
                marginTop: '4px',
              }}>
                +{remaining} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductCard;
