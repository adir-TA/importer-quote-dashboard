import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Plus, Package, X, Check, ChevronDown, Search, ChevronRight, Grid, List, TrendingUp, TrendingDown, Edit2, Trash2, Upload, Image as ImageIcon, FileDown, Clock, Type } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import { ProductCard, SearchInput } from '../components';
import MultiItemQuoteUploadModal from '../components/MultiItemQuoteUploadModal';
import { filterBySearch } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { EXPORT_THEMES } from '../utils/exportThemes';
import { generateRFQExcel } from './ProductDetail';

function Products() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, actions, computed } = useAppContext();
  const { confirm } = useModal();
  const { products } = state;

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ name: '', category: '', description: '', specs: [] });
  const [quoteCounts, setQuoteCounts] = useState({});
  const [isUploadQuoteModalOpen, setIsUploadQuoteModalOpen] = useState(false);

  // Image upload state
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Specs editor state
  const [customFieldName, setCustomFieldName] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');

  // Category dropdown states (for modal)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Category filter for main page
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState([]);

  // View and sorting options
  const [viewMode, setViewMode] = useState(() => {
    // Initialize from localStorage if user has manually set a preference
    const saved = localStorage.getItem('buyingIntentsViewMode');
    return saved || 'grid'; // Default to grid initially, will auto-adjust based on count
  });
  const [sortBy, setSortBy] = useState('name'); // 'name', 'quotes', 'recent'
  const [collapsedCategories, setCollapsedCategories] = useState({}); // track which categories are collapsed
  const [loadingCounts, setLoadingCounts] = useState(true); // track loading state
  const [viewModeManuallySet, setViewModeManuallySet] = useState(() => {
    // Track if user has manually overridden the view mode
    return localStorage.getItem('buyingIntentsViewMode') !== null;
  });

  // Bulk selection
  const [selectedProducts, setSelectedProducts] = useState(new Set());

  // RFQ export state
  const [showRFQThemeSelector, setShowRFQThemeSelector] = useState(false);
  const [selectedRFQTheme, setSelectedRFQTheme] = useState('vibrant');

  // Submission guard
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Return URL for edit from detail page
  const [returnToUrl, setReturnToUrl] = useState(null);

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

  // Handle URL-based category filtering (from Global Search)
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      setSelectedCategoryFilters([categoryParam]);
      // Clear URL param after setting filter
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Auto-default to list view when many intents exist (if user hasn't manually set preference)
  useEffect(() => {
    if (!viewModeManuallySet && products.length > 15) {
      setViewMode('list');
    } else if (!viewModeManuallySet && products.length <= 15) {
      setViewMode('grid');
    }
  }, [products.length, viewModeManuallySet]);

  // Handle navigation from detail page with edit intent
  useEffect(() => {
    if (location.state?.editProductId) {
      const productToEdit = products.find(p => p.id === location.state.editProductId);
      if (productToEdit) {
        // Capture returnTo URL before clearing state
        if (location.state.returnTo) {
          setReturnToUrl(location.state.returnTo);
        }
        handleOpenModal(productToEdit);
      }
      // Clear the state to prevent re-opening on subsequent renders
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, products, navigate, location.pathname]);

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
      // Initialize with existing specs or default structure
      const initialSpecs = product.specs && product.specs.length > 0
        ? product.specs
        : [
            { key: 'Weight', value: '' },
            { key: 'Height', value: '' },
            { key: 'Length', value: '' },
            { key: 'Width', value: '' }
          ];
      setFormData({
        name: product.name,
        category: product.category || '',
        description: product.description || '',
        specs: initialSpecs
      });
      // Set existing image preview if product has an image
      if (product.image_url) {
        setImagePreview(product.image_url);
      }
    } else {
      setEditingProduct(null);
      // Initialize with default spec fields
      setFormData({
        name: '',
        category: '',
        description: '',
        specs: [
          { key: 'Weight', value: '' },
          { key: 'Height', value: '' },
          { key: 'Length', value: '' },
          { key: 'Width', value: '' }
        ]
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData({ name: '', category: '', description: '', specs: [] });
    setShowCategoryDropdown(false);
    setCategorySearch('');
    setShowCreateCategory(false);
    setNewCategoryName('');
    setIsSubmitting(false); // Reset submission guard
    setSelectedImage(null); // Reset image state
    setImagePreview(null);
    setCustomFieldName(''); // Reset custom field state
    setReturnToUrl(null); // Reset return URL
    setCustomFieldValue('');
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

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setSelectedImage(file);
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  // Specs management handlers
  const handleSpecChange = (index, value) => {
    const updatedSpecs = [...formData.specs];
    updatedSpecs[index] = { ...updatedSpecs[index], value };
    setFormData({ ...formData, specs: updatedSpecs });
  };

  const handleAddCustomField = () => {
    if (!customFieldName.trim()) {
      alert('Please enter a field name');
      return;
    }

    // Check for duplicate field names (case-insensitive)
    const isDuplicate = formData.specs.some(
      spec => spec.key.toLowerCase() === customFieldName.trim().toLowerCase()
    );

    if (isDuplicate) {
      alert('A field with this name already exists');
      return;
    }

    const newSpec = { key: customFieldName.trim(), value: customFieldValue.trim() };
    setFormData({ ...formData, specs: [...formData.specs, newSpec] });
    setCustomFieldName('');
    setCustomFieldValue('');
  };

  const handleRemoveSpec = (index) => {
    const updatedSpecs = formData.specs.filter((_, i) => i !== index);
    setFormData({ ...formData, specs: updatedSpecs });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { alert('Please enter a buying intent name'); return; }

    // Guard: prevent duplicate submissions
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      let imageData = {};

      // Upload image if a new one was selected
      if (selectedImage) {
        // Correct destructuring: getUser() returns { data: { user }, error }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.error('Auth error:', authError);
          throw new Error('User not authenticated');
        }

        console.log('✅ User authenticated for image upload:', user.id);

        // Generate unique filename
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const storagePath = `${user.id}/products/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('business-cards') // Reuse existing bucket
          .upload(storagePath, selectedImage);

        if (uploadError) throw uploadError;

        // Generate public URL
        const { data: urlData } = supabase.storage
          .from('business-cards')
          .getPublicUrl(storagePath);

        imageData = {
          image_storage_path: storagePath,
          image_url: urlData?.publicUrl || null
        };
      }

      const productData = { ...formData, ...imageData };

      if (editingProduct) {
        await actions.updateProduct({ ...editingProduct, ...productData });
        handleCloseModal();
        // Navigate back to detail page if editing from detail page
        if (returnToUrl) {
          navigate(returnToUrl);
          setReturnToUrl(null);
        }
      } else {
        const newProduct = await actions.addProduct(productData);
        if (newProduct?.id) {
          handleCloseModal();
          navigate(`/products/${newProduct.id}`);
          return;
        }
        handleCloseModal();
      }
    } catch (error) {
      console.error('Error saving buying intent:', error);
      alert('Error saving buying intent');
    } finally {
      setIsSubmitting(false);
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
        <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => setIsUploadQuoteModalOpen(true)}>
            <Upload size={16} /> Upload Quote
          </button>
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
        {/* Stats - Prominent at top */}
        {products.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '28px',
          }}>
            <div className="stat-card" style={{ '--stat-color': '#6366F1', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                <Package size={22} color="#6366F1" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Total Intents</div>
                <div className="stat-value">{stats.totalProducts}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': '#10b981', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                <TrendingUp size={22} color="#10b981" />
              </div>
              <div className="stat-content">
                <div className="stat-label">With Quotes</div>
                <div className="stat-value">{stats.totalWithQuotes}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': '#f59e0b', '--stat-bg': 'rgba(245, 158, 11, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                <TrendingDown size={22} color="#f59e0b" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Without Quotes</div>
                <div className="stat-value">{stats.totalWithoutQuotes}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': '#8b5cf6', '--stat-bg': 'rgba(139, 92, 246, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                <Grid size={22} color="#8b5cf6" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Categories</div>
                <div className="stat-value">{Object.keys(stats.categoryBreakdown).length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Two-column layout: Filters sidebar + Main content */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Sidebar: Filters & Options */}
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
              Filters & View
            </h3>

            {/* View Mode */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                View Mode
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={() => {
                    setViewMode('grid');
                    localStorage.setItem('buyingIntentsViewMode', 'grid');
                    setViewModeManuallySet(true);
                  }}
                  style={{
                    padding: '12px',
                    background: viewMode === 'grid' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <Grid size={18} />
                  Grid
                </button>
                <button
                  onClick={() => {
                    setViewMode('list');
                    localStorage.setItem('buyingIntentsViewMode', 'list');
                    setViewModeManuallySet(true);
                  }}
                  style={{
                    padding: '12px',
                    background: viewMode === 'list' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: viewMode === 'list' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <List size={18} />
                  List
                </button>
              </div>
            </div>

            {/* Sort By */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                Sort By
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={() => setSortBy('name')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'name' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'name' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <Type size={16} />
                  Name (A-Z)
                </button>
                <button
                  onClick={() => setSortBy('quotes')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'quotes' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'quotes' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <TrendingDown size={16} />
                  Quotes (High-Low)
                </button>
                <button
                  onClick={() => setSortBy('recent')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'recent' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'recent' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <Clock size={16} />
                  Recently Added
                </button>
              </div>
            </div>

            {/* Category Filters */}
            {categories.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Categories
                  </label>
                  {selectedCategoryFilters.length > 0 && (
                    <button
                      onClick={() => setSelectedCategoryFilters([])}
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--error)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {categories.map(category => (
                    <label
                      key={category}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: selectedCategoryFilters.includes(category) ? 'var(--accent-light)' : 'var(--bg-secondary)',
                        border: selectedCategoryFilters.includes(category) ? '1px solid var(--accent)' : '1px solid transparent',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategoryFilters.includes(category)}
                        onChange={() => {
                          setSelectedCategoryFilters(prev =>
                            prev.includes(category)
                              ? prev.filter(c => c !== category)
                              : [...prev, category]
                          );
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{category}</span>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        background: 'white',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {stats.categoryBreakdown[category] || 0}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Bulk Actions */}
            {selectedProducts.size > 0 && (
              <div style={{
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--error)',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--error)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {selectedProducts.size} Selected
                </div>
                <button
                  onClick={() => setShowRFQThemeSelector(true)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <FileDown size={16} />
                  Generate RFQ ({selectedProducts.size})
                </button>
                <button
                  onClick={handleBulkDelete}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'var(--error)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '8px',
                  }}
                >
                  <Trash2 size={16} />
                  Delete Selected
                </button>
                <button
                  onClick={deselectAll}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'transparent',
                    color: 'var(--error)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginTop: '8px',
                    textDecoration: 'underline',
                  }}
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>

          {/* Right: Main Content */}
          <div>
            {/* Search Bar */}
            <div style={{ marginBottom: '24px' }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Search buying intents..." />
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
                          isSelected={selectedProducts.has(product.id)}
                          onToggleSelect={toggleSelection}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {products.map(product => {
                        // Helper to get spec value
                        const getSpec = (key) => {
                          const spec = product.specs?.find(s => s.key.toLowerCase() === key.toLowerCase());
                          return spec?.value || '-';
                        };
                        const weight = getSpec('weight');
                        const length = getSpec('length');
                        const hasQuotes = (quoteCounts[product.id] || 0) > 0;
                        const isDraft = product.status === 'draft';

                        return (
                          <div
                            key={product.id}
                            onClick={() => navigate(`/products/${product.id}`)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '32px 1fr 80px 80px 80px 100px 60px',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '8px 12px',
                              background: selectedProducts.has(product.id) ? '#eff6ff' : 'white',
                              borderRadius: '6px',
                              border: selectedProducts.has(product.id)
                                ? '1px solid #3b82f6'
                                : `1px solid ${hasQuotes ? '#10b981' : '#ef4444'}`,
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              fontSize: '0.8rem',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={selectedProducts.has(product.id)}
                              onChange={() => toggleSelection(product.id)}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                              }}
                            />

                            {/* Item Name */}
                            <div style={{
                              fontWeight: 600,
                              color: '#1e293b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}>
                              <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {product.name}
                              </span>
                              {isDraft && (
                                <span style={{
                                  padding: '2px 4px',
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  borderRadius: '3px',
                                  fontSize: '0.6rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  whiteSpace: 'nowrap',
                                }}>
                                  Draft
                                </span>
                              )}
                            </div>

                            {/* Quotes Count */}
                            <div style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: hasQuotes ? '#065f46' : '#991b1b',
                              textAlign: 'center',
                            }}>
                              {quoteCounts[product.id] || 0}
                            </div>

                            {/* Weight */}
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              textAlign: 'center',
                            }}>
                              {weight}
                            </div>

                            {/* Length */}
                            <div style={{
                              fontSize: '0.75rem',
                              color: '#64748b',
                              textAlign: 'center',
                            }}>
                              {length}
                            </div>

                            {/* Status */}
                            <div style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '4px 6px',
                              background: hasQuotes ? '#d1fae5' : '#fee2e2',
                              color: hasQuotes ? '#065f46' : '#991b1b',
                              borderRadius: '4px',
                              textAlign: 'center',
                            }}>
                              {hasQuotes ? 'Has Quotes' : 'No Quotes'}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                              <button
                                className="icon-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenModal(product);
                                }}
                                style={{ padding: '4px' }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                className="icon-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(product.id);
                                }}
                                style={{ padding: '4px' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
          </div>
          {/* End right content area */}
        </div>
        {/* End two-column layout */}
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
                        background: 'var(--bg-primary)',
                      }}
                    >
                      <span style={{ color: formData.category ? 'var(--text-primary)' : 'var(--text-muted)' }}>
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
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-lg)',
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
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-secondary)',
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
                              background: formData.category === cat ? 'var(--accent-light)' : 'transparent',
                              color: formData.category === cat ? 'var(--accent)' : 'var(--text-primary)',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              borderBottom: '1px solid var(--border-light)',
                              transition: 'background var(--transition)',
                            }}
                            onMouseEnter={e => { if (formData.category !== cat) e.target.style.background = 'var(--bg-hover)'; }}
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
                          background: 'var(--accent-light)',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          borderTop: '1px solid var(--border)',
                        }}
                      >
                        + Create New Category
                      </button>
                    </div>
                  )}
                </div>

                {/* Image Upload (Optional) */}
                <div className="form-group">
                  <label className="form-label">
                    <ImageIcon size={16} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                    Product Image (Optional)
                  </label>
                  {imagePreview ? (
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <img
                        src={imagePreview}
                        alt="Preview"
                        style={{
                          maxWidth: '120px',
                          maxHeight: '120px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-md)',
                          objectFit: 'contain'
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleRemoveImage}
                        style={{ padding: '6px 12px', fontSize: '0.875rem' }}
                      >
                        <X size={14} /> Remove
                      </button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        style={{ display: 'none' }}
                        id="product-image-upload"
                      />
                      <label
                        htmlFor="product-image-upload"
                        className="btn btn-secondary"
                        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Upload size={14} /> Choose Image
                      </label>
                      <p className="form-hint">Upload an image to help identify this product</p>
                    </div>
                  )}
                </div>

                {/* Specifications Editor */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Specifications</label>

                  {/* Spec fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {formData.specs.map((spec, index) => {
                      const isDefaultField = ['Weight', 'Height', 'Length', 'Width'].includes(spec.key);
                      return (
                        <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ minWidth: '100px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            {spec.key}:
                          </div>
                          <input
                            type="text"
                            className="form-input"
                            placeholder={`e.g., ${spec.key === 'Weight' ? '1.94kg' : spec.key === 'Height' ? '76cm' : spec.key === 'Length' ? '46cm' : spec.key === 'Width' ? '30cm' : 'Value'}`}
                            value={spec.value}
                            onChange={(e) => handleSpecChange(index, e.target.value)}
                            style={{ flex: 1 }}
                          />
                          {!isDefaultField && (
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => handleRemoveSpec(index)}
                              title="Remove field"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Add custom field */}
                    <div style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Add Custom Field
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Field name (e.g., Material)"
                          value={customFieldName}
                          onChange={(e) => setCustomFieldName(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Value (e.g., Aluminum)"
                          value={customFieldValue}
                          onChange={(e) => setCustomFieldValue(e.target.value)}
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleAddCustomField}
                          style={{ padding: '0 16px' }}
                        >
                          <Plus size={14} /> Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal} disabled={isSubmitting}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSubmitting}><Check size={16} /> {editingProduct ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* RFQ Theme Selection Modal */}
      {showRFQThemeSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            maxWidth: '900px',
            width: '90%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0, marginBottom: '4px' }}>
                  Choose RFQ Export Theme
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  Generating RFQ for {selectedProducts.size} item{selectedProducts.size > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setShowRFQThemeSelector(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}>
                <X size={24} color="#64748b" />
              </button>
            </div>
            <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
              <div style={{ width: '280px', borderRight: '1px solid #e5e7eb', padding: '24px 16px', background: '#f8fafc', overflow: 'auto' }}>
                {Object.entries(EXPORT_THEMES).map(([key, theme]) => (
                  <button key={key} onClick={() => setSelectedRFQTheme(key)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', marginBottom: '8px', background: selectedRFQTheme === key ? '#eff6ff' : 'white', border: `2px solid ${selectedRFQTheme === key ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${selectedRFQTheme === key ? '#3b82f6' : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedRFQTheme === key && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', marginBottom: '4px' }}>{theme.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px' }}>{theme.description}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {theme.preview.map((color, i) => <div key={i} style={{ width: '24px', height: '24px', borderRadius: '4px', background: color, border: '1px solid rgba(0,0,0,0.1)' }} />)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, padding: '32px', overflow: 'auto', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                  <FileDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>Multi-Item RFQ Export</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '8px' }}>Excel file will include {selectedProducts.size} buying intent{selectedProducts.size > 1 ? 's' : ''}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '20px 32px', borderTop: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setShowRFQThemeSelector(false)} style={{ padding: '10px 20px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.95rem', color: '#475569' }}>Cancel</button>
              <button onClick={async () => { const selectedProductList = Array.from(selectedProducts).map(id => products.find(p => p.id === id)).filter(Boolean); await generateRFQExcel(selectedProductList, selectedRFQTheme); setShowRFQThemeSelector(false); }} style={{ padding: '10px 24px', border: 'none', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', color: 'white', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileDown size={18} />Export with {EXPORT_THEMES[selectedRFQTheme].name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Quote Modal - only render when open */}
      {isUploadQuoteModalOpen && (
        <MultiItemQuoteUploadModal
          isOpen={isUploadQuoteModalOpen}
          onClose={() => setIsUploadQuoteModalOpen(false)}
          onSuccess={() => {
            setIsUploadQuoteModalOpen(false);
            // Reload quote counts after successful upload
            const loadQuoteCounts = async () => {
              const counts = {};
              for (const product of products) {
                const oldQuotes = computed.getProductQuotes(product.id);
                const newLineItems = await computed.getLineItemsForBuyingIntent(product.id);
                counts[product.id] = oldQuotes.length + newLineItems.length;
              }
              setQuoteCounts(counts);
            };
            loadQuoteCounts();
          }}
        />
      )}
    </div>
  );
}

export default Products;
