import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, Check, X, Trash2, Edit2, DollarSign, Upload, File } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import MultiItemQuoteUploadModal from '../components/MultiItemQuoteUploadModal';
import DocumentsTab from '../components/DocumentsTab';
import UploadDocumentModal from '../components/UploadDocumentModal';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'ILS'];
const INCOTERMS = ['FOB', 'CIF', 'EXW', 'DDP', 'DAP', 'CFR'];

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, actions, computed } = useAppContext();
  const { confirm } = useModal();

  const product = computed.getProductById(id);
  const quotes = computed.getProductQuotes(id); // Old quotes
  const [lineItems, setLineItems] = useState([]); // New line items

  const [activeTab, setActiveTab] = useState('quotes'); // 'quotes' | 'documents'
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [editingQuote, setEditingQuote] = useState(null);
  const [formData, setFormData] = useState({
    supplierName: '',
    unitPrice: '',
    currency: 'USD',
    moq: '',
    incoterm: 'FOB',
  });

  // Load line items for this product
  useEffect(() => {
    const loadLineItems = async () => {
      const items = await computed.getLineItemsForProduct(id);
      setLineItems(items);
      console.log(`[ProductDetail] Loaded ${items.length} line items for product ${id}`);
    };
    if (id) {
      loadLineItems();
    }
  }, [id, computed]);

  const resetForm = () => {
    setFormData({
      supplierName: '',
      unitPrice: '',
      currency: 'USD',
      moq: '',
      incoterm: 'FOB',
    });
    setEditingQuote(null);
  };

  const handleOpenQuoteModal = (quote = null) => {
    if (quote) {
      setEditingQuote(quote);
      setFormData({
        supplierName: quote.supplierName || quote.supplier_name || '',
        unitPrice: quote.unitPrice || '',
        currency: quote.currency || 'USD',
        moq: quote.moq || '',
        incoterm: quote.incoterm || 'FOB',
      });
    } else {
      resetForm();
    }
    setIsQuoteModalOpen(true);
  };

  const handleCloseQuoteModal = () => {
    setIsQuoteModalOpen(false);
    resetForm();
  };

  const handleSaveQuote = async () => {
    if (!formData.supplierName.trim()) {
      alert('Please enter a supplier name');
      return;
    }
    if (!formData.unitPrice || parseFloat(formData.unitPrice) <= 0) {
      alert('Please enter a valid unit price');
      return;
    }

    const quoteData = {
      productId: id,
      product_id: id,
      supplierName: formData.supplierName.trim(),
      unitPrice: parseFloat(formData.unitPrice),
      currency: formData.currency,
      moq: parseInt(formData.moq) || 0,
      incoterm: formData.incoterm,
    };

    try {
      if (editingQuote) {
        await actions.updateQuote({ ...editingQuote, ...quoteData });
      } else {
        await actions.addQuote(quoteData);
      }
      handleCloseQuoteModal();
    } catch (error) {
      alert('Error saving quote: ' + error.message);
    }
  };

  const handleDeleteQuote = async (quoteId) => {
    const confirmed = await confirm({
      title: 'Delete Quote',
      message: 'Are you sure you want to delete this quote?',
      type: 'danger',
      confirmText: 'Delete',
    });
    if (confirmed) {
      await actions.deleteQuote(quoteId);
    }
  };

  const handleCompare = () => {
    navigate('/comparison', { state: { productId: id } });
  };

  // Handle quote save from upload modal (multi-item)
  const handleUploadSuccess = async (result) => {
    console.log('✅ [ProductDetail] Quote saved successfully:', result);
    // Refresh data and reload line items
    await actions.refreshData();
    const items = await computed.getLineItemsForProduct(id);
    setLineItems(items);
  };

  if (!product) {
    return (
      <div className="page">
        <div className="content">
          <div className="empty-state">
            <h3>Buying Intent not found</h3>
            <button className="btn btn-primary" onClick={() => navigate('/products')}>
              Back to Buying Intents
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-btn" onClick={() => navigate('/products')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>{product.name}</h2>
            {product.category && (
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {product.category}
              </span>
            )}
          </div>
        </div>
        <div className="header-actions">
          {(quotes.length + lineItems.length) >= 2 && (
            <button className="btn btn-secondary" onClick={handleCompare}>
              Compare Quotes
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setIsUploadModalOpen(true)}>
            <Upload size={16} /> Upload Quote
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenQuoteModal()}>
            <Plus size={16} /> Add Quote
          </button>
        </div>
      </div>

      <div className="content">
        {/* Stats Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '28px',
        }}>
          <div className="stat-card" style={{ '--stat-color': '#6366F1', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
              <FileText size={22} color="#6366F1" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Quotes</div>
              <div className="stat-value">{quotes.length + lineItems.length}</div>
            </div>
          </div>
          {quotes.length + lineItems.length > 0 && (() => {
            const allPrices = [
              ...quotes.map(q => parseFloat(q.unitPrice)),
              ...lineItems.map(i => parseFloat(i.unit_price))
            ];
            const bestPrice = Math.min(...allPrices);
            return (
              <div className="stat-card" style={{ '--stat-color': '#10b981', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
                <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                  <DollarSign size={22} color="#10b981" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Best Price</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {quotes[0]?.currency || 'USD'} {bestPrice.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Two-column layout: Product Info sidebar + Main content */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Sidebar: Product Info */}
          <div style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            position: 'sticky',
            top: '24px'
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              marginBottom: '20px'
            }}>
              Product Details
            </h3>

            {product.category && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Category
                </div>
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'inline-block'
                }}>
                  {product.category}
                </div>
              </div>
            )}

            {product.description && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Description
                </div>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                  {product.description}
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div style={{
              padding: '16px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              marginTop: '24px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Quick Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(quotes.length + lineItems.length) >= 2 && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleCompare}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.875rem' }}
                  >
                    Compare Quotes
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsDocumentModalOpen(true)}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.875rem' }}
                >
                  <File size={14} />
                  Upload Document
                </button>
              </div>
            </div>
          </div>

          {/* Right: Main Content - Tabs */}
          <div>
        {/* Tabs: Quotes & Documents */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)' }}>
              <button
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'quotes' ? '2px solid var(--primary)' : '2px solid transparent',
                  color: activeTab === 'quotes' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'quotes' ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                }}
                onClick={() => setActiveTab('quotes')}
              >
                <FileText size={16} />
                Quotes ({quotes.length + lineItems.length})
              </button>
              <button
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'documents' ? '2px solid var(--primary)' : '2px solid transparent',
                  color: activeTab === 'documents' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'documents' ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                }}
                onClick={() => setActiveTab('documents')}
              >
                <File size={16} />
                Documents
              </button>
            </div>
          </div>

          {activeTab === 'quotes' ? (
            <div className="card-body" style={{ padding: 0 }}>
            {(quotes.length + lineItems.length) === 0 ? (
              <div className="empty-state" style={{ padding: '48px 24px' }}>
                <DollarSign size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3>No quotes yet</h3>
                <p>Add supplier quotes to compare prices</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => handleOpenQuoteModal()}
                >
                  <Plus size={16} /> Add First Quote
                </button>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Unit Price</th>
                    <th>MOQ</th>
                    <th>Incoterm</th>
                    <th style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Old quotes (from quotes_old table) */}
                  {quotes.map((quote) => {
                    return (
                      <tr key={quote.id}>
                        <td style={{ fontWeight: 500 }}>{quote.supplierName}</td>
                        <td>
                          {quote.currency} {parseFloat(quote.unitPrice).toFixed(2)}
                        </td>
                        <td>{quote.moq?.toLocaleString() || '-'}</td>
                        <td>{quote.incoterm || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="icon-btn"
                              onClick={() => handleOpenQuoteModal(quote)}
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => handleDeleteQuote(quote.id)}
                              title="Delete"
                              style={{ color: 'var(--error)' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* New line items (from supplier_quotes + quote_line_items) */}
                  {lineItems.map((item) => {
                    return (
                      <tr key={item.id} style={{ background: '#f0fdf4' }}>
                        <td style={{ fontWeight: 500 }}>
                          {item.supplierName}
                          <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '2px' }}>
                            {item.product_name}
                          </div>
                        </td>
                        <td>
                          {item.currency} {parseFloat(item.unit_price).toFixed(2)}
                        </td>
                        <td>{item.moq ? parseInt(item.moq).toLocaleString() : '-'}</td>
                        <td>{item.incoterm || '-'}</td>
                        <td>
                          <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 500 }}>
                            From Upload
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          ) : (
            <DocumentsTab
              key={documentsRefreshKey}
              buyingIntentId={id}
              onUploadClick={() => setIsDocumentModalOpen(true)}
            />
          )}
        </div>

          </div>
          {/* End main content */}
        </div>
        {/* End two-column layout */}
      </div>

      {/* Quote Modal */}
      {isQuoteModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">
                📝 {editingQuote ? 'Edit Quote' : 'New Quote'}
              </span>
              <button className="icon-btn" onClick={handleCloseQuoteModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-section-title">
                  <DollarSign size={18} color="var(--accent)" /> Quote Details
                </div>

                <div className="form-group">
                  <label className="form-label">Supplier Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Shenzhen Tech Co."
                    value={formData.supplierName}
                    onChange={(e) =>
                      setFormData({ ...formData, supplierName: e.target.value })
                    }
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Unit Price *</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={formData.unitPrice}
                      onChange={(e) =>
                        setFormData({ ...formData, unitPrice: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select
                      className="form-select"
                      value={formData.currency}
                      onChange={(e) =>
                        setFormData({ ...formData, currency: e.target.value })
                      }
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">MOQ (Minimum Order Qty)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g., 1000"
                      min="0"
                      value={formData.moq}
                      onChange={(e) =>
                        setFormData({ ...formData, moq: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Incoterm</label>
                    <select
                      className="form-select"
                      value={formData.incoterm}
                      onChange={(e) =>
                        setFormData({ ...formData, incoterm: e.target.value })
                      }
                    >
                      {INCOTERMS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseQuoteModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveQuote}>
                <Check size={16} /> {editingQuote ? 'Update' : 'Save Quote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Item Quote Upload Modal - only render when open */}
      {isUploadModalOpen && (
        <MultiItemQuoteUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Upload Document Modal */}
      <UploadDocumentModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        buyingIntentId={id}
        onUploadSuccess={() => setDocumentsRefreshKey(prev => prev + 1)}
      />
    </div>
  );
}

export default ProductDetail;
