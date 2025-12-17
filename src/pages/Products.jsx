import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Package, X, Check } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import { ProductCard, SearchInput } from '../components';
import { filterBySearch } from '../utils/helpers';

function Products() {
  const navigate = useNavigate();
  const { state, actions, computed } = useAppContext();
  const { confirm } = useModal();
  const { products } = state;

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ name: '', category: '', description: '' });
  const [quoteCounts, setQuoteCounts] = useState({});

  // Load quote counts for all products
  useEffect(() => {
    const loadQuoteCounts = async () => {
      const counts = {};
      for (const product of products) {
        const items = await computed.getLineItemsForBuyingIntent(product.id);
        counts[product.id] = items.length;
      }
      setQuoteCounts(counts);
    };

    if (products.length > 0) {
      loadQuoteCounts();
    }
  }, [products, computed]);

  const filteredProducts = useMemo(() => {
    return filterBySearch(products, search, ['name', 'category', 'description']);
  }, [products, search]);

  const handleOpenModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      setFormData({ name: product.name, category: product.category || '', description: product.description || '' });
    } else {
      setEditingProduct(null);
      setFormData({ name: '', category: '', description: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData({ name: '', category: '', description: '' });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { alert('Please enter a buying intent name'); return; }
    try {
      if (editingProduct) {
        await actions.updateProduct({ ...editingProduct, ...formData });
      } else {
        const newProduct = await actions.addProduct(formData);
        if (newProduct?.id) {
          handleCloseModal();
          navigate(`/products/${newProduct.id}`);
          return;
        }
      }
      handleCloseModal();
    } catch (error) {
      console.error('Error saving buying intent:', error);
      alert('Error saving buying intent');
    }
  };

  const handleDelete = async (productId) => {
    const quoteCount = quoteCounts[productId] || 0;
    const confirmed = await confirm({
      title: 'Delete Buying Intent',
      message: `Are you sure you want to delete this buying intent${quoteCount > 0 ? ` and its ${quoteCount} linked quotes` : ''}?`,
      type: 'danger',
      confirmText: 'Delete'
    });
    if (confirmed) actions.deleteProduct(productId);
  };

  return (
    <div className="page">
      <div className="header">
        <h2>Buying Intents</h2>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={16} /> New Buying Intent
          </button>
        </div>
      </div>

      <div className="content">
        <SearchInput value={search} onChange={setSearch} placeholder="Search buying intents..." />

        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Package size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>{search ? 'No buying intents match your search' : 'No buying intents yet'}</h3>
            <p>{search ? 'Try a different search term' : 'Define what you want to buy to start comparing quotes'}</p>
            {!search && (
              <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => handleOpenModal()}>
                <Plus size={16} /> New Buying Intent
              </button>
            )}
          </div>
        ) : (
          <div className="products-grid">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                quoteCount={quoteCounts[product.id] || 0}
                onClick={() => navigate(`/products/${product.id}`)}
                onEdit={() => handleOpenModal(product)}
                onDelete={() => handleDelete(product.id)}
              />
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🎯 {editingProduct ? 'Edit Buying Intent' : 'New Buying Intent'}</span>
              <button className="icon-btn" onClick={handleCloseModal}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-section-title"><Package size={18} color="var(--accent)" /> What You Want to Buy</div>
                <div className="form-group">
                  <label className="form-label">Intent Name *</label>
                  <input type="text" className="form-input" placeholder="e.g., Aluminum Container 225×175×42mm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  <p className="form-hint">Describe what you're trying to buy (independent of suppliers)</p>
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <input type="text" className="form-input" placeholder="e.g., Aluminum, Plastic, Packaging" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Target Specifications</label>
                  <textarea className="form-input" rows={3} placeholder="Dimensions, material, target price range, quality requirements..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}><Check size={16} /> {editingProduct ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;
