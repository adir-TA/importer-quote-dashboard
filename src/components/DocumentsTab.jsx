import React, { useState, useEffect } from 'react';
import {
  Upload, FileText, Image, Eye, Download, Trash2, Plus, AlertCircle, File
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import API_BASE_URL from '../config/api';

// Document type badges
const TYPE_BADGES = {
  PI: { label: 'Proforma Invoice', color: '#3b82f6', bg: '#eff6ff' },
  QUOTE: { label: 'Quote', color: '#10b981', bg: '#f0fdf4' },
  SPEC: { label: 'Specification', color: '#f59e0b', bg: '#fef3c7' },
  OTHER: { label: 'Other', color: '#64748b', bg: '#f8fafc' },
};

function DocumentsTab({ buyingIntentId, onUploadClick }) {
  const { computed, actions } = useAppContext();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);

  useEffect(() => {
    loadDocuments();
  }, [buyingIntentId]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await computed.getDocumentsForBuyingIntent(buyingIntentId);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Delete this document? This cannot be undone.')) return;

    try {
      await actions.deleteDocument(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      alert('Failed to delete document: ' + err.message);
    }
  };

  const handlePreview = async (doc) => {
    try {
      const signedUrl = await getSignedUrl(doc.file_path);
      setPreviewDoc({ ...doc, signedUrl });
    } catch (err) {
      alert('Failed to preview document: ' + err.message);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const signedUrl = await getSignedUrl(doc.file_path);
      window.open(signedUrl, '_blank');
    } catch (err) {
      alert('Failed to download document: ' + err.message);
    }
  };

  const getSignedUrl = async (filePath) => {
    const response = await fetch(`${API_BASE_URL}/api/documents/signed-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to get signed URL');
    }

    const { signedUrl } = await response.json();
    return signedUrl;
  };

  // Group documents - general docs first, then by supplier
  const groupedDocs = documents.reduce((acc, doc) => {
    const supplierName = doc.supplier_quote?.supplier_name || 'General';
    if (!acc[supplierName]) {
      acc[supplierName] = [];
    }
    acc[supplierName].push(doc);
    return acc;
  }, {});

  if (loading) {
    return (
      <div style={styles.loading}>
        <div className="spinner" />
        <p>Loading documents...</p>
      </div>
    );
  }

  return (
    <div style={styles.container} className="docs-tab-container">
      <style>{`
        @media (max-width: 768px) {
          .docs-tab-container { padding: 16px; }
          .docs-tab-header { flex-wrap: wrap; gap: 12px; }
          .docs-tab-header > button { width: 100%; justify-content: center; }
          .docs-tab-meta { flex-wrap: wrap; }
          .docs-tab-actions { flex-shrink: 0; }
        }
      `}</style>
      {/* Header */}
      <div style={styles.header} className="docs-tab-header">
        <div>
          <h3 style={styles.title}>Documents</h3>
          <p style={styles.subtitle}>
            Store and manage Proforma Invoices, quotes, and specifications
          </p>
        </div>
        <button style={styles.uploadButton} onClick={onUploadClick}>
          <Plus size={16} />
          Upload Document
        </button>
      </div>

      {/* Document List */}
      {documents.length === 0 ? (
        <div style={styles.emptyState}>
          <FileText size={48} color="#94a3b8" />
          <p style={styles.emptyText}>No documents uploaded yet</p>
          <p style={styles.emptyHint}>
            Upload Proforma Invoices, quotes, or specs to keep everything organized
          </p>
          <button style={styles.uploadButtonPrimary} onClick={onUploadClick}>
            <Upload size={16} />
            Upload First Document
          </button>
        </div>
      ) : (
        <div style={styles.groups}>
          {Object.entries(groupedDocs).map(([supplierName, docs]) => (
            <div key={supplierName} style={styles.group}>
              <h4 style={styles.groupTitle}>{supplierName}</h4>
              <div style={styles.docList}>
                {docs.map(doc => (
                  <div key={doc.id} style={styles.docCard}>
                    <div style={styles.docIcon}>
                      {doc.file_type?.startsWith('image/') ? (
                        <Image size={20} color="#64748b" />
                      ) : (
                        <FileText size={20} color="#64748b" />
                      )}
                    </div>

                    <div style={styles.docInfo}>
                      <div style={styles.docName}>{doc.file_name}</div>
                      <div style={styles.docMeta} className="docs-tab-meta">
                        <span style={{
                          ...styles.typeBadge,
                          color: TYPE_BADGES[doc.type]?.color,
                          background: TYPE_BADGES[doc.type]?.bg,
                        }}>
                          {TYPE_BADGES[doc.type]?.label || doc.type}
                        </span>
                        <span style={styles.docDate}>
                          {new Date(doc.created_at).toLocaleDateString()}
                        </span>
                        {doc.file_size && (
                          <span style={styles.docSize}>
                            {(doc.file_size / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={styles.docActions} className="docs-tab-actions">
                      <button
                        style={styles.actionButton}
                        onClick={() => handlePreview(doc)}
                        title="Preview"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        style={styles.actionButton}
                        onClick={() => handleDownload(doc)}
                        title="Download"
                      >
                        <Download size={16} />
                      </button>
                      <button
                        style={{...styles.actionButton, color: '#ef4444'}}
                        onClick={() => handleDelete(doc.id)}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

// Preview Modal Component
function DocumentPreviewModal({ document, onClose }) {
  const isImage = document.file_type?.startsWith('image/');
  const isPDF = document.file_type === 'application/pdf';

  return (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{document.file_name}</h3>
          <button style={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div style={styles.modalBody}>
          {isImage ? (
            <img
              src={document.signedUrl}
              alt={document.file_name}
              style={styles.previewImage}
            />
          ) : isPDF ? (
            <iframe
              src={document.signedUrl}
              style={styles.previewPDF}
              title={document.file_name}
            />
          ) : (
            <div style={styles.noPreview}>
              <File size={48} color="#94a3b8" />
              <p>Preview not available for this file type</p>
              <a
                href={document.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.downloadLink}
              >
                Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '24px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: '14px',
    color: '#64748b',
  },
  uploadButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  uploadButtonPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: '16px',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    color: '#64748b',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    background: '#f8fafc',
    borderRadius: '8px',
    border: '1px dashed #cbd5e1',
  },
  emptyText: {
    marginTop: '16px',
    fontSize: '16px',
    fontWeight: 500,
    color: '#475569',
  },
  emptyHint: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#94a3b8',
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  group: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '20px',
    background: 'white',
  },
  groupTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#374151',
  },
  docList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  docCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: '#f9fafb',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  },
  docIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    background: 'white',
    borderRadius: '6px',
    border: '1px solid #e5e7eb',
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  docMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
    fontSize: '12px',
    color: '#64748b',
  },
  typeBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
  },
  docDate: {
    fontSize: '12px',
  },
  docSize: {
    fontSize: '12px',
  },
  docActions: {
    display: 'flex',
    gap: '8px',
  },
  actionButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    color: '#64748b',
    borderRadius: '4px',
    transition: 'background 0.2s',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'white',
    borderRadius: '12px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #e5e7eb',
  },
  modalTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
  },
  modalClose: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#64748b',
    lineHeight: 1,
    padding: '4px',
  },
  modalBody: {
    flex: 1,
    overflow: 'auto',
    padding: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain',
  },
  previewPDF: {
    width: '80vw',
    height: '70vh',
    border: 'none',
  },
  noPreview: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px',
    color: '#64748b',
  },
  downloadLink: {
    marginTop: '16px',
    color: '#3b82f6',
    textDecoration: 'none',
    fontWeight: 500,
  },
};

export default DocumentsTab;
