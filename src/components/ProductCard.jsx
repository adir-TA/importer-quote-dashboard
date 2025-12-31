import React from 'react';
import { FileText, Edit2, Trash2, Package, Copy } from 'lucide-react';

// Helper to get primary specs for grid view (max 2: Weight + one dimension)
function getPrimarySpecs(specs) {
  if (!specs || specs.length === 0) return { primary: [], remaining: 0 };

  const primary = [];
  const seen = new Set();

  // First, try to add Weight
  const weight = specs.find(s => s.key.toLowerCase() === 'weight' && s.value);
  if (weight) {
    primary.push(weight);
    seen.add(weight.key.toLowerCase());
  }

  // Second, add one dimension (prefer Length, then Height, then Width)
  const dimensionOrder = ['Length', 'Height', 'Width'];
  for (const dimKey of dimensionOrder) {
    const dim = specs.find(s => s.key.toLowerCase() === dimKey.toLowerCase() && s.value);
    if (dim && primary.length < 2) {
      primary.push(dim);
      seen.add(dim.key.toLowerCase());
      break;
    }
  }

  // Count remaining specs
  const remaining = specs.filter(s => !seen.has(s.key.toLowerCase()) && s.value).length;

  return { primary, remaining };
}

function ProductCard({ product, quoteCount = 0, onClick, onEdit, onDuplicate, onDelete, isSelected, onToggleSelect }) {
  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(product);
  };

  const handleDuplicate = (e) => {
    e.stopPropagation();
    onDuplicate?.(product);
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
          ? '1px solid #93c5fd'
          : '1px solid #e5e7eb',
        background: isSelected
          ? '#f0f9ff'
          : 'white',
        padding: '12px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = '#f9fafb';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = 'white';
        }
      }}
    >
      {/* Header with checkbox, name, and actions */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        {/* Forgiving checkbox click area */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onToggleSelect?.(product.id);
          }}
          style={{
            width: '36px',
            height: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            paddingTop: '2px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <input
            type="checkbox"
            checked={isSelected || false}
            onChange={handleCheckbox}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '16px',
              height: '16px',
              cursor: 'pointer',
              pointerEvents: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            fontSize: '0.875rem',
            color: '#1e293b',
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
                borderRadius: '3px',
                fontSize: '0.6rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap',
              }}>
                Draft
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2px', flexShrink: 0, opacity: 0.6 }}>
          {onEdit && (
            <button className="icon-btn" onClick={handleEdit} style={{ padding: '4px' }} title="Edit">
              <Edit2 size={12} />
            </button>
          )}
          {onDuplicate && (
            <button className="icon-btn" onClick={handleDuplicate} style={{ padding: '4px' }} title="Duplicate">
              <Copy size={12} />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn" onClick={handleDelete} style={{ padding: '4px' }} title="Delete">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Quote count badge */}
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        background: hasQuotes ? '#d1fae5' : '#fee2e2',
        borderRadius: '4px',
        alignSelf: 'flex-start',
      }}>
        <FileText size={11} style={{ color: hasQuotes ? '#065f46' : '#991b1b' }} />
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: hasQuotes ? '#065f46' : '#991b1b',
        }}>
          {quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'}
        </span>
      </div>

      {/* Thumbnail and Specs Section */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        {/* Thumbnail */}
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{
              width: '40px',
              height: '40px',
              objectFit: 'cover',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f1f5f9',
            borderRadius: '6px',
            border: '1px solid #e2e8f0',
            flexShrink: 0,
          }}>
            <Package size={18} style={{ color: '#94a3b8' }} />
          </div>
        )}

        {/* Specs (max 2 lines) */}
        {primary.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            {primary.map((spec, index) => (
              <div key={index} style={{
                fontSize: '0.7rem',
                color: '#64748b',
                marginBottom: '1px',
                display: 'flex',
                gap: '4px',
              }}>
                <span style={{ fontWeight: 600, color: '#475569' }}>{spec.key}:</span>
                <span>{spec.value}</span>
              </div>
            ))}
            {remaining > 0 && (
              <div style={{
                fontSize: '0.65rem',
                color: '#94a3b8',
                marginTop: '2px',
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
