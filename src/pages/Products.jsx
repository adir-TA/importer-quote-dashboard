import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Package, X, Check, ChevronDown } from 'lucide-react';
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

  // Category dropdown states (for modal)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Category filter for main page
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState([]);

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
    let result = filterBySearch(products, search, ['name', 'category', 'description']);

    // Apply category filters
    if (selectedCategoryFilters.length > 0) {
      result = result.filter(p => selectedCategoryFilters.includes(p.category));
    }

    return result;
  }, [products, search, selectedCategoryFilters]);

  // Get unique categories from all products
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter(cat =>
      cat.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categories, categorySearch]);

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
    setShowCategoryDropdown(false);
    setCategorySearch('');
    setShowCreateCategory(false);
    setNewCategoryName('');
  };

  const handleSelectCategory = (category) => {
    setFormData({ ...formData, category });
    setShowCategoryDropdown(false);
    setCategorySearch('');
  };

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      alert('Please enter a category name');
      return;
    }
    setFormData({ ...formData, category: newCategoryName.trim() });
    setShowCreateCategory(false);
    setShowCategoryDropdown(false);
    setNewCategoryName('');
    setCategorySearch('');
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

        {/* Category filter pills */}
        {categories.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', marginTop: '16px' }}>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => {
                  setSelectedCategoryFilters(prev =>
                    prev.includes(category)
                      ? prev.filter(c => c !== category)
                      : [...prev, category]
                  );
                }}
                className="btn"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  background: selectedCategoryFilters.includes(category) ? 'var(--accent)' : 'var(--bg-light)',
                  color: selectedCategoryFilters.includes(category) ? 'white' : 'var(--text)',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
              >
                {category}
              </button>
            ))}
            {selectedCategoryFilters.length > 0 && (
              <button
                onClick={() => setSelectedCategoryFilters([])}
                className="btn"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.875rem',
                  background: '#fef2f2',
                  color: '#ef4444',
                  border: 'none',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}

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
        <div className="modal-overlay">
          <div className="modal">
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
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Category</label>

                  {showCreateCategory ? (
                    /* Create new category form */
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={newCategoryName}
                        onChange={e => setNewCategoryName(e.target.value)}
                        placeholder="New category name"
                        autoFocus
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleCreateCategory}
                        style={{ padding: '0 16px' }}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowCreateCategory(false);
                          setNewCategoryName('');
                        }}
                        style={{ padding: '0 16px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    /* Category selection button */
                    <button
                      type="button"
                      className="form-input"
                      onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                      style={{
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--bg-light)',
                      }}
                    >
                      <span style={{ color: formData.category ? 'var(--text)' : 'var(--text-muted)' }}>
                        {formData.category || 'Select or create category...'}
                      </span>
                      <ChevronDown size={16} />
                    </button>
                  )}

                  {/* Category dropdown list */}
                  {showCategoryDropdown && !showCreateCategory && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      background: 'white',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      zIndex: 9999,
                    }}>
                      {/* Search input */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px',
                        borderBottom: '1px solid var(--border)'
                      }}>
                        <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        <input
                          type="text"
                          className="form-input"
                          value={categorySearch}
                          onChange={e => setCategorySearch(e.target.value)}
                          placeholder="Search categories..."
                          onClick={e => e.stopPropagation()}
                          style={{ fontSize: '0.875rem', flex: 1, border: 'none', background: 'transparent', padding: 0 }}
                        />
                      </div>

                      {/* Category list */}
                      {filteredCategories.length > 0 ? (
                        filteredCategories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => handleSelectCategory(cat)}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              textAlign: 'left',
                              border: 'none',
                              background: formData.category === cat ? 'var(--accent-bg)' : 'transparent',
                              color: formData.category === cat ? 'var(--accent)' : 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              borderBottom: '1px solid var(--bg-light)',
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (formData.category !== cat) e.target.style.background = 'var(--bg-light)'; }}
                            onMouseLeave={e => { if (formData.category !== cat) e.target.style.background = 'transparent'; }}
                          >
                            {cat}
                          </button>
                        ))
                      ) : (
                        <div style={{
                          padding: '16px',
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          fontSize: '0.875rem',
                        }}>
                          No categories found
                        </div>
                      )}

                      {/* Create new category button */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreateCategory(true);
                          setShowCategoryDropdown(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          textAlign: 'left',
                          border: 'none',
                          background: 'var(--accent-bg)',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          borderTop: '2px solid var(--border)',
                        }}
                      >
                        + Create New Category
                      </button>
                    </div>
                  )}
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
