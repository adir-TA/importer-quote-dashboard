import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Package, X, Check, ChevronDown, Search, ChevronRight, Grid, List, TrendingUp, TrendingDown, Edit2, Trash2 } from 'lucide-react';
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

  // View and sorting options
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [sortBy, setSortBy] = useState('name'); // 'name', 'quotes', 'recent'
  const [collapsedCategories, setCollapsedCategories] = useState({}); // track which categories are collapsed
  const [loadingCounts, setLoadingCounts] = useState(true); // track loading state

  // Bulk selection
  const [selectedProducts, setSelectedProducts] = useState(new Set());

  // Load quote counts for all products
  useEffect(() => {
    const loadQuoteCounts = async () => {
      setLoadingCounts(true);
      const counts = {};
      for (const product of products) {
        // Count both old quotes AND new line items (same as ProductDetail page)
        const oldQuotes = computed.getProductQuotes(product.id);
        const newLineItems = await computed.getLineItemsForBuyingIntent(product.id);
        counts[product.id] = oldQuotes.length + newLineItems.length;
      }
      setQuoteCounts(counts);
      setLoadingCounts(false);
    };

    if (products.length > 0) {
      loadQuoteCounts();
    } else {
      setLoadingCounts(false);
    }
  }, [products, computed]);

  const filteredProducts = useMemo(() => {
    let result = filterBySearch(products, search, ['name', 'category', 'description']);

    // Apply category filters
    if (selectedCategoryFilters.length > 0) {
      result = result.filter(p => selectedCategoryFilters.includes(p.category));
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'quotes') {
        return (quoteCounts[b.id] || 0) - (quoteCounts[a.id] || 0);
      } else if (sortBy === 'recent') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      return 0;
    });

    return result;
  }, [products, search, selectedCategoryFilters, sortBy, quoteCounts]);

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach(product => {
      const cat = product.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(product);
    });
    return groups;
  }, [filteredProducts]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalWithQuotes = Object.values(quoteCounts).filter(count => count > 0).length;
    const totalWithoutQuotes = totalProducts - totalWithQuotes;
    const categoryBreakdown = {};
    products.forEach(p => {
      const cat = p.category || 'Uncategorized';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    });
    return { totalProducts, totalWithQuotes, totalWithoutQuotes, categoryBreakdown };
  }, [products, quoteCounts]);

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

  // Bulk selection handlers
  const toggleSelection = (productId) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedProducts(new Set());
  };

  const handleBulkDelete = async () => {
    const count = selectedProducts.size;
    const totalQuotes = Array.from(selectedProducts).reduce((sum, id) => sum + (quoteCounts[id] || 0), 0);

    const confirmed = await confirm({
      title: `Delete ${count} Buying Intent${count > 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${count} buying intent${count > 1 ? 's' : ''}${totalQuotes > 0 ? ` and ${totalQuotes} linked quotes` : ''}? This action cannot be undone.`,
      type: 'danger',
      confirmText: `Delete ${count} Item${count > 1 ? 's' : ''}`
    });

    if (confirmed) {
      for (const productId of selectedProducts) {
        await actions.deleteProduct(productId);
      }
      deselectAll();
    }
  };

  const toggleCategory = (category) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return (
    <div className="page">
      <div className="header">
        <h2>Buying Intents</h2>
        <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {products.length > 0 && selectedProducts.size > 0 && (
            <span style={{
              fontSize: '0.875rem',
              color: '#64748b',
              fontWeight: 500,
            }}>
              {selectedProducts.size} selected
            </span>
          )}
          {products.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={handleBulkDelete}
              disabled={selectedProducts.size === 0}
              style={{
                fontSize: '0.875rem',
                opacity: selectedProducts.size === 0 ? 0.5 : 1,
                cursor: selectedProducts.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <Trash2 size={16} /> Delete {selectedProducts.size > 0 ? `(${selectedProducts.size})` : ''}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={16} /> New Buying Intent
          </button>
        </div>
      </div>

      <div className="content">
        {/* Loading State */}
        {loadingCounts ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px',
            gap: '16px',
          }}>
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading buying intents...</p>
          </div>
        ) : (
          <>
        {/* Recently Used Section */}
        {products.length > 0 && products.slice(0, 3).length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: '12px' }}>
              Recently Used
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {products.slice(0, 3).map(product => (
                <button
                  key={product.id}
                  onClick={() => navigate(`/products/${product.id}`)}
                  style={{
                    padding: '10px 16px',
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                    e.currentTarget.style.borderColor = '#3b82f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <Package size={16} style={{ color: '#64748b' }} />
                  {product.name}
                  {quoteCounts[product.id] > 0 && (
                    <span style={{
                      padding: '2px 8px',
                      background: '#d1fae5',
                      color: '#065f46',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}>
                      {quoteCounts[product.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Summary */}
        {products.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}>
            <div style={{
              padding: '20px',
              background: '#3b82f6',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
            }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '8px' }}>Total Buying Intents</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.totalProducts}</div>
            </div>
            <div style={{
              padding: '20px',
              background: '#10b981',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
            }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '8px' }}>With Quotes</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.totalWithQuotes}</div>
            </div>
            <div style={{
              padding: '20px',
              background: '#f59e0b',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
            }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '8px' }}>Without Quotes</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{stats.totalWithoutQuotes}</div>
            </div>
            <div style={{
              padding: '20px',
              background: '#8b5cf6',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
            }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '8px' }}>Categories</div>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{Object.keys(stats.categoryBreakdown).length}</div>
            </div>
          </div>
        )}

        {/* Controls Row - Search, Filters, Sort, View */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search Bar */}
            <div style={{ flex: 1, minWidth: '250px' }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Search buying intents..." />
            </div>

            {/* Category filter pills - aligned with search */}
            {categories.length > 0 && (
              <>
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#64748b' }}>
                  Filters:
                </span>
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
                      padding: '6px 14px',
                      fontSize: '0.875rem',
                      background: selectedCategoryFilters.includes(category) ? 'var(--accent)' : 'white',
                      color: selectedCategoryFilters.includes(category) ? 'white' : 'var(--text)',
                      border: selectedCategoryFilters.includes(category) ? 'none' : '1px solid #e5e7eb',
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
                      padding: '6px 14px',
                      fontSize: '0.875rem',
                      background: '#fef2f2',
                      color: '#ef4444',
                      border: 'none',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    Clear
                  </button>
                )}
              </>
            )}

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'white',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <option value="name">Sort by Name</option>
              <option value="quotes">Sort by Quotes</option>
              <option value="recent">Sort by Recent</option>
            </select>

            {/* View Toggle */}
            <div style={{
              display: 'flex',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  padding: '10px 16px',
                  background: viewMode === 'grid' ? 'var(--accent)' : 'white',
                  color: viewMode === 'grid' ? 'white' : 'var(--text)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                <Grid size={16} />
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                style={{
                  padding: '10px 16px',
                  background: viewMode === 'list' ? 'var(--accent)' : 'white',
                  color: viewMode === 'list' ? 'white' : 'var(--text)',
                  border: 'none',
                  borderLeft: '1px solid var(--border)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                <List size={16} />
                List
              </button>
            </div>
          </div>
        </div>

        {/* Products Display */}
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
          <div>
            {Object.entries(groupedProducts).map(([category, products]) => (
              <div key={category} style={{ marginBottom: '32px' }}>
                {/* Category Header */}
                <div
                  onClick={() => toggleCategory(category)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px 20px',
                    background: '#f5f7fa',
                    borderRadius: '12px',
                    marginBottom: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  {collapsedCategories[category] ? (
                    <ChevronRight size={20} style={{ color: '#64748b' }} />
                  ) : (
                    <ChevronDown size={20} style={{ color: '#64748b' }} />
                  )}
                  <Package size={20} style={{ color: '#64748b' }} />
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', flex: 1 }}>
                    {category}
                  </h3>
                  <span style={{
                    padding: '4px 12px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#64748b',
                  }}>
                    {products.length} {products.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {/* Products in Category */}
                {!collapsedCategories[category] && (
                  viewMode === 'grid' ? (
                    <div className="products-grid">
                      {products.map(product => (
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
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {products.map(product => (
                        <div
                          key={product.id}
                          onClick={() => navigate(`/products/${product.id}`)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            padding: '16px 20px',
                            background: selectedProducts.has(product.id) ? '#eff6ff' : 'white',
                            borderRadius: '8px',
                            border: selectedProducts.has(product.id)
                              ? '2px solid #3b82f6'
                              : `2px solid ${quoteCounts[product.id] > 0 ? '#10b981' : '#ef4444'}`,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateX(4px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateX(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleSelection(product.id)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: '18px',
                              height: '18px',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          />
                          <Package size={20} style={{ color: '#94a3b8', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {product.name}
                              {product.status === 'draft' && (
                                <span style={{
                                  padding: '2px 8px',
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  borderRadius: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.3px',
                                }}>
                                  Draft
                                </span>
                              )}
                            </div>
                            {product.description && (
                              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                {product.description}
                              </div>
                            )}
                          </div>
                          <div style={{
                            padding: '6px 12px',
                            background: quoteCounts[product.id] > 0 ? '#d1fae5' : '#fee2e2',
                            color: quoteCounts[product.id] > 0 ? '#065f46' : '#991b1b',
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}>
                            {quoteCounts[product.id] || 0} {quoteCounts[product.id] === 1 ? 'quote' : 'quotes'}
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                            <button
                              className="icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenModal(product);
                              }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(product.id);
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
        </>
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
