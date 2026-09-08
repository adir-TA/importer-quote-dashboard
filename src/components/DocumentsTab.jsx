import React, { useState, useEffect } from 'react';
import {
  Upload, FileText, Image, Eye, Download, Trash2, Plus, AlertCircle, File
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { getDocumentSignedUrl } from '../utils/storageUpload';
import { useModal } from '../context/ModalContext';

// Document type badges
const TYPE_BADGES = {
  PI: { label: 'Proforma Invoice', color: 'var(--accent)', bg: 'var(--accent-light)' },
  QUOTE: { label: 'Quote', color: 'var(--success)', bg: 'var(--success-light)' },
  SPEC: { label: 'Specification', color: 'var(--warning)', bg: 'var(--warning-light)' },
  OTHER: { label: 'Other', color: 'var(--text-secondary)', bg: 'var(--grey-25)' },
};

function DocumentsTab({ buyingIntentId, onUploadClick }) {
  const { computed, actions } = useAppContext();
  const { confirm } = useModal();
  const [documents, setDocuments] = useState([]);
  const [actionError, setActionError] = useState('');
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
    const confirmed = await confirm({
      title: 'Delete document',
      message: 'Delete this document? This cannot be undone.',
      type: 'danger',
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    setActionError('');
    try {
      await actions.deleteDocument(docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err) {
      setActionError(`Failed to delete document: ${err.message}`);
    }
  };

  const handlePreview = async (doc) => {
    setActionError('');
    try {
      const signedUrl = await getSignedUrl(doc.file_path);
      setPreviewDoc({ ...doc, signedUrl });
    } catch (err) {
      setActionError(`Failed to preview document: ${err.message}`);
    }
  };

  const handleDownload = async (doc) => {
    // window.open() after an await is outside the user-gesture window, so
    // popup blockers silently swallowed it and "Download" appeared to do
    // nothing. Open the tab synchronously, then point it at the signed URL.
    //
    // NOTE: no 'noopener' feature here - it makes window.open() return null,
    // which would leave nothing to navigate. We sever the reference manually
    // below instead.
    const tab = window.open('', '_blank');

    try {
      const signedUrl = await getDocumentSignedUrl(doc.file_path);
      if (tab) {
        // Cut the opener link before navigating, so the storage origin cannot
        // reach back into this window.
        try { tab.opener = null; } catch { /* cross-origin, already severed */ }
        tab.location.replace(signedUrl);
      } else {
        // Popup blocked entirely - tell the user rather than navigating the
        // app away and losing their place.
        setActionError('Your browser blocked the download tab. Allow popups for this site, or use Preview.');
      }
    } catch (err) {
      tab?.close();
      setActionError(`Failed to download document: ${err.message}`);
    }
  };

  const getSignedUrl = async (filePath) => {
    return getDocumentSignedUrl(filePath);
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

      {actionError && (
        <div style={styles.actionError} role="alert">
          <AlertCircle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Document List */}
      {documents.length === 0 ? (
        <div style={styles.emptyState}>
          <FileText size={48} color="var(--text-subtle)" />
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
                        <Image size={20} color="var(--text-secondary)" />
                      ) : (
                        <FileText size={20} color="var(--text-secondary)" />
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
                        style={{...styles.actionButton, color: 'var(--error)'}}
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
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}

// Preview Modal Component
// The prop was named `document`, shadowing the global inside this component.
function DocumentPreviewModal({ doc, onClose }) {
  const isImage = doc.file_type?.startsWith('image/');
  const isPDF = doc.file_type === 'application/pdf';

  return (
    <div style={styles.modal}>
      <div style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{doc.file_name}</h3>
          <button style={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div style={styles.modalBody}>
          {isImage ? (
            <img
              src={doc.signedUrl}
              alt={doc.file_name}
              style={styles.previewImage}
            />
          ) : isPDF ? (
            <iframe
              src={doc.signedUrl}
              style={styles.previewPDF}
              title={doc.file_name}
            />
          ) : (
            <div style={styles.noPreview}>
              <File size={48} color="var(--text-subtle)" />
              <p>Preview not available for this file type</p>
              <a
                href={doc.signedUrl}
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
  actionError: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    marginBottom: '16px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--error-light)',
    color: 'var(--error)',
    fontSize: 'var(--text-base)',
  },
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
    fontSize: 'var(--text-xl)',
    fontWeight: 600,
  },
  subtitle: {
    margin: '4px 0 0 0',
    fontSize: 'var(--text-base)',
    color: 'var(--text-secondary)',
  },
  uploadButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-base)',
    fontWeight: 500,
    cursor: 'pointer',
  },
  uploadButtonPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-base)',
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
    color: 'var(--text-secondary)',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    background: 'var(--grey-25)',
    borderRadius: 'var(--radius-md)',
    border: '1px dashed var(--border-strong)',
  },
  emptyText: {
    marginTop: '16px',
    fontSize: 'var(--text-md)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  emptyHint: {
    marginTop: '8px',
    fontSize: 'var(--text-base)',
    color: 'var(--text-subtle)',
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  group: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '20px',
    background: 'var(--bg-primary)',
  },
  groupTitle: {
    margin: '0 0 16px 0',
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
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
    background: 'var(--grey-50)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
  },
  docIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    background: 'var(--bg-primary)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
  },
  docInfo: {
    flex: 1,
    minWidth: 0,
  },
  docName: {
    fontSize: 'var(--text-base)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  docMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
  },
  typeBadge: {
    padding: '2px 8px',
    borderRadius: 'var(--radius-xs)',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
  },
  docDate: {
    fontSize: 'var(--text-xs)',
  },
  docSize: {
    fontSize: 'var(--text-xs)',
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
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-xs)',
    transition: 'background 0.2s',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'var(--overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'var(--bg-primary)',
    borderRadius: 'var(--radius-lg)',
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
    borderBottom: '1px solid var(--border)',
  },
  modalTitle: {
    margin: 0,
    fontSize: 'var(--text-lg)',
    fontWeight: 600,
  },
  modalClose: {
    background: 'none',
    border: 'none',
    fontSize: 'var(--text-3xl)',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
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
    color: 'var(--text-secondary)',
  },
  downloadLink: {
    marginTop: '16px',
    color: 'var(--accent)',
    textDecoration: 'none',
    fontWeight: 500,
  },
};

export default DocumentsTab;
