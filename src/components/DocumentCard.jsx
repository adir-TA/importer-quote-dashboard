import React from 'react';
import { FileText, Download, Trash2, Edit2 } from 'lucide-react';
import { getFileIcon, formatDate, formatFileSize } from '../utils/helpers';

function DocumentCard({ document, onEdit, onDelete, onDownload }) {
  const fileIcon = getFileIcon(document.name);

  const handleEdit = (e) => {
    e.stopPropagation();
    onEdit?.(document);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    onDelete?.(document.id);
  };

  const handleDownload = (e) => {
    e.stopPropagation();
    onDownload?.(document);
  };

  return (
    <div className="card" style={{ padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '8px',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          flexShrink: 0
        }}>
          {fileIcon}
        </div>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {document.name}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            {document.category && <span>{document.category} • </span>}
            {formatDate(document.createdAt)}
            {document.size && <span> • {formatFileSize(document.size)}</span>}
          </div>
          {document.notes && (
            <div style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              marginTop: '8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical'
            }}>
              {document.notes}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {onDownload && document.data && (
            <button className="icon-btn" onClick={handleDownload} title="Download">
              <Download size={16} />
            </button>
          )}
          {onEdit && (
            <button className="icon-btn" onClick={handleEdit} title="Edit">
              <Edit2 size={16} />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn" onClick={handleDelete} title="Delete">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentCard;
