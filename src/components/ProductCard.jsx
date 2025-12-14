import React from 'react';
import { Package, FileText, Edit2, Trash2 } from 'lucide-react';

function ProductCard({ product, quoteCount = 0, onClick, onEdit, onDelete }) {
  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(product);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(product.id);
  };

  return (
    <div className="product-card" onClick={() => onClick?.(product)}>
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
      
      <div className="product-quotes">
        <FileText size={14} style={{ marginRight: '6px' }} />
        {quoteCount} {quoteCount === 1 ? 'quote' : 'quotes'}
      </div>

      {product.description && (
        <p style={{ 
          fontSize: '0.85rem', 
          color: 'var(--text-muted)', 
          marginTop: '8px',
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
