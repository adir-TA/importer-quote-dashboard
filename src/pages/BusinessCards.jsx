import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../context/ModalContext';
import SearchInput from '../components/SearchInput';
import CustomSelect from '../components/CustomSelect';
import Modal from '../components/Modal';
import BusinessCardImageUpload from '../components/BusinessCardImageUpload';
import TagInput from '../components/TagInput';
import * as businessCardsService from '../utils/businessCardsService';
import { Plus, Grid, List, Filter, Settings, Mail, Phone, MessageCircle, Globe, Trash2, Edit2, Building2, User, CheckSquare, Square, CreditCard } from 'lucide-react';
import '../styles/business-cards.css';

export default function BusinessCards() {
  const { user } = useAuth();
  const { businessCards, cardCategories, cardTags, addBusinessCard, updateBusinessCard, deleteBusinessCard, bulkUpdateCardStatus, bulkUpdateCardCategory, bulkDeleteCards, addCardCategory, updateCardCategory, deleteCardCategory, refreshCardCategories, addCardTag } = useApp();
  const { alert, confirm } = useModal();

  // View state
  const [viewMode, setViewMode] = useState('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [selectedCard, setSelectedCard] = useState(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    display_name: '',
    company_name: '',
    contact_person: '',
    phone: '',
    wechat: '',
    email: '',
    website: '',
    notes: '',
    status: 'new',
    category_id: null,
    tags: [],
    images: []
  });

  // Bulk selection
  const [selectedCards, setSelectedCards] = useState([]);

  // Last used category for quick defaults
  const [lastUsedCategoryId, setLastUsedCategoryId] = useState(null);

  // Filtered cards
  const filteredCards = useMemo(() => {
    return businessCards.filter(card => {
      const matchesSearch = !searchTerm ||
        card.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.wechat?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || card.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || card.category_id === categoryFilter;
      const matchesTag = tagFilter === 'all' || card.tags?.some(t => t.id === tagFilter);

      return matchesSearch && matchesStatus && matchesCategory && matchesTag;
    });
  }, [businessCards, searchTerm, statusFilter, categoryFilter, tagFilter]);

  // Open add modal
  const handleAdd = () => {
    setModalMode('add');
    setSelectedCard(null);
    setFormData({
      display_name: '',
      company_name: '',
      contact_person: '',
      phone: '',
      wechat: '',
      email: '',
      website: '',
      notes: '',
      status: 'new',
      category_id: lastUsedCategoryId,
      tags: [],
      images: []
    });
    setShowModal(true);
  };

  // Open edit modal
  const handleEdit = (card) => {
    setModalMode('edit');
    setSelectedCard(card);
    setFormData({
      display_name: card.display_name || '',
      company_name: card.company_name || '',
      contact_person: card.contact_person || '',
      phone: card.phone || '',
      wechat: card.wechat || '',
      email: card.email || '',
      website: card.website || '',
      notes: card.notes || '',
      status: card.status || 'new',
      category_id: card.category_id,
      tags: card.tags || [],
      images: card.images?.map(img => ({
        id: img.id,
        url: businessCardsService.getCardImageUrl(img.storage_path),
        storage_path: img.storage_path
      })) || []
    });
    setShowModal(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedCard(null);
    setFormData({
      display_name: '',
      company_name: '',
      contact_person: '',
      phone: '',
      wechat: '',
      email: '',
      website: '',
      notes: '',
      status: 'new',
      category_id: null,
      tags: [],
      images: []
    });
  };

  // Save card
  const handleSave = async () => {
    if (!formData.display_name.trim()) {
      await alert({
        title: 'Validation Error',
        message: 'Display name is required',
        type: 'error'
      });
      return;
    }

    try {
      // Check for duplicates
      const duplicates = await businessCardsService.checkDuplicateCard(
        formData.email,
        formData.wechat,
        formData.phone,
        user.id,
        selectedCard?.id
      );

      if (duplicates.length > 0) {
        const confirmed = await confirm({
          title: 'Possible Duplicate',
          message: `Similar contact exists: ${duplicates[0].display_name}. Continue anyway?`,
          type: 'warning',
          confirmText: 'Continue'
        });
        if (!confirmed) return;
      }

      if (modalMode === 'add') {
        const newCard = await addBusinessCard(formData);

        // Upload images
        const newImages = formData.images.filter(img => img instanceof File);
        for (let i = 0; i < newImages.length; i++) {
          await businessCardsService.uploadCardImage(newCard.id, newImages[i], i, user.id);
        }

        // Set tags
        if (formData.tags.length > 0) {
          await businessCardsService.setCardTags(newCard.id, formData.tags.map(t => t.id), user.id);
        }

        if (formData.category_id) {
          setLastUsedCategoryId(formData.category_id);
        }

        await alert({
          title: 'Success',
          message: 'Card added successfully',
          type: 'success'
        });
      } else {
        await updateBusinessCard(selectedCard.id, formData);

        // Handle image changes
        const existingImages = formData.images.filter(img => !(img instanceof File));
        const newImages = formData.images.filter(img => img instanceof File);

        // Delete removed images
        const existingImageIds = existingImages.map(img => img.id);
        const originalImages = selectedCard.images || [];
        for (const img of originalImages) {
          if (!existingImageIds.includes(img.id)) {
            await businessCardsService.deleteCardImage(img.id, user.id);
          }
        }

        // Upload new images
        for (let i = 0; i < newImages.length; i++) {
          await businessCardsService.uploadCardImage(selectedCard.id, newImages[i], existingImages.length + i, user.id);
        }

        // Update tags
        await businessCardsService.setCardTags(selectedCard.id, formData.tags.map(t => t.id), user.id);

        await alert({
          title: 'Success',
          message: 'Card updated successfully',
          type: 'success'
        });
      }

      handleCloseModal();
    } catch (error) {
      console.error('Error saving card:', error);
      await alert({
        title: 'Error',
        message: error.message || 'Failed to save card',
        type: 'error'
      });
    }
  };

  // Delete card
  const handleDelete = async (cardId) => {
    const confirmed = await confirm({
      title: 'Confirm Delete',
      message: 'Are you sure you want to delete this card?',
      type: 'warning',
      confirmText: 'Delete'
    });

    if (confirmed) {
      try {
        await deleteBusinessCard(cardId);
        await alert({
          title: 'Success',
          message: 'Card deleted successfully',
          type: 'success'
        });
      } catch (error) {
        await alert({
          title: 'Error',
          message: error.message || 'Failed to delete card',
          type: 'error'
        });
      }
    }
  };

  // Bulk actions
  const handleBulkStatusChange = async (status) => {
    try {
      await bulkUpdateCardStatus(selectedCards, status);
      setSelectedCards([]);
      await alert({
        title: 'Success',
        message: `${selectedCards.length} card(s) updated`,
        type: 'success'
      });
    } catch (error) {
      await alert({
        title: 'Error',
        message: error.message || 'Bulk update failed',
        type: 'error'
      });
    }
  };

  const handleBulkCategoryChange = async (categoryId) => {
    try {
      await bulkUpdateCardCategory(selectedCards, categoryId);
      setSelectedCards([]);
      await alert({
        title: 'Success',
        message: `${selectedCards.length} card(s) updated`,
        type: 'success'
      });
    } catch (error) {
      await alert({
        title: 'Error',
        message: error.message || 'Bulk update failed',
        type: 'error'
      });
    }
  };

  const handleBulkDelete = async () => {
    const confirmed = await confirm({
      title: 'Confirm Bulk Delete',
      message: `Delete ${selectedCards.length} card(s)?`,
      type: 'warning',
      confirmText: 'Delete'
    });

    if (confirmed) {
      try {
        await bulkDeleteCards(selectedCards);
        setSelectedCards([]);
        await alert({
          title: 'Success',
          message: 'Cards deleted successfully',
          type: 'success'
        });
      } catch (error) {
        await alert({
          title: 'Error',
          message: error.message || 'Bulk delete failed',
          type: 'error'
        });
      }
    }
  };

  // Create tag handler
  const handleCreateTag = async (tagName) => {
    try {
      return await addCardTag(tagName);
    } catch (error) {
      console.error('Error creating tag:', error);
      return null;
    }
  };

  // Toggle card selection
  const toggleCardSelection = (cardId) => {
    setSelectedCards(prev =>
      prev.includes(cardId)
        ? prev.filter(id => id !== cardId)
        : [...prev, cardId]
    );
  };

  const selectAll = () => {
    setSelectedCards(filteredCards.map(c => c.id));
  };

  const deselectAll = () => {
    setSelectedCards([]);
  };

  const getStatusBadgeClass = (status) => {
    const baseClass = 'business-cards-status-badge';
    return `${baseClass} ${baseClass}--${status}`;
  };

  return (
    <div className="page">
      <div className="header">
        <h2>Business Cards</h2>
        <button className="btn btn-primary" onClick={handleAdd}>
          <Plus size={16} />
          Add Card
        </button>
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
              <CreditCard size={22} color="#6366F1" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Cards</div>
              <div className="stat-value">{businessCards.length}</div>
            </div>
          </div>
          <div className="stat-card" style={{ '--stat-color': '#10b981', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
              <CheckSquare size={22} color="#10b981" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Filtered</div>
              <div className="stat-value">{filteredCards.length}</div>
            </div>
          </div>
        </div>

        {/* Two-column layout: Filters sidebar + Main content */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Sidebar: Filters */}
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
                  onClick={() => setViewMode('grid')}
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
                  onClick={() => setViewMode('list')}
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

            {/* Status Filter */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                Status
              </label>
              <CustomSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'all', label: 'All Status' },
                  { value: 'new', label: 'New' },
                  { value: 'contacted', label: 'Contacted' },
                  { value: 'accepted', label: 'Accepted' },
                  { value: 'rejected', label: 'Rejected' },
                  { value: 'inactive', label: 'Inactive' }
                ]}
              />
            </div>

            {/* Category Filter */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                Category
              </label>
              <CustomSelect
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...cardCategories.map(cat => ({
                    value: cat.id,
                    label: cat.name
                  }))
                ]}
              />
            </div>

            {/* Tag Filter */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                Tags
              </label>
              <CustomSelect
                value={tagFilter}
                onChange={setTagFilter}
                options={[
                  { value: 'all', label: 'All Tags' },
                  ...cardTags.map(tag => ({
                    value: tag.id,
                    label: tag.name
                  }))
                ]}
              />
            </div>

            {/* Manage Categories */}
            <button
              className="btn btn-secondary"
              onClick={() => setShowCategoryManager(true)}
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.875rem' }}
            >
              <Settings size={14} />
              Manage Categories
            </button>

            {/* Bulk Actions */}
            {selectedCards.length > 0 && (
              <div style={{
                marginTop: '24px',
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--error)',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--error)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {selectedCards.length} Selected
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <CustomSelect
                    value=""
                    onChange={(val) => val && handleBulkStatusChange(val)}
                    placeholder="Change Status..."
                    options={[
                      { value: 'new', label: 'New' },
                      { value: 'contacted', label: 'Contacted' },
                      { value: 'accepted', label: 'Accepted' },
                      { value: 'rejected', label: 'Rejected' },
                      { value: 'inactive', label: 'Inactive' }
                    ]}
                  />
                  <CustomSelect
                    value=""
                    onChange={(val) => val && handleBulkCategoryChange(val)}
                    placeholder="Change Category..."
                    options={cardCategories.map(cat => ({
                      value: cat.id,
                      label: cat.name
                    }))}
                  />
                  <button className="btn btn-secondary" onClick={handleBulkDelete} style={{ width: '100%', justifyContent: 'center', fontSize: '0.875rem', background: 'var(--error)', color: 'white' }}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <button className="btn btn-ghost" onClick={deselectAll} style={{ width: '100%', justifyContent: 'center', fontSize: '0.875rem' }}>Deselect All</button>
                </div>
              </div>
            )}
          </div>

          {/* Right: Main Content */}
          <div>
            {/* Search Bar */}
            <div style={{ marginBottom: '24px' }}>
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search cards..."
              />
            </div>

            {/* Cards display */}
        {filteredCards.length === 0 ? (
          <div className="empty-state">
            <CreditCard size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>{searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || tagFilter !== 'all' ? 'No cards match your filters' : 'No business cards yet'}</h3>
            <p>{searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || tagFilter !== 'all' ? 'Try adjusting your filters or search term' : 'Add supplier business cards to keep track of your contacts from China'}</p>
            {!searchTerm && statusFilter === 'all' && categoryFilter === 'all' && tagFilter === 'all' && (
              <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={handleAdd}>
                <Plus size={16} />
                Add Card
              </button>
            )}
          </div>
        ) : (
        <div className={viewMode === 'grid' ? 'business-cards-grid' : 'business-cards-list'}>
          {filteredCards.map(card => (
            <div key={card.id} className="business-cards-card">
              <div className="business-cards-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    className="business-cards-checkbox"
                    onClick={() => toggleCardSelection(card.id)}
                  >
                    {selectedCards.includes(card.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <h3>{card.display_name}</h3>
                </div>
                <div className="business-cards-card-actions">
                  <button onClick={() => handleEdit(card)}>
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(card.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {card.images && card.images.length > 0 && (
                <div className="business-cards-card-image">
                  <img
                    src={businessCardsService.getCardImageUrl(card.images[0].storage_path)}
                    alt={card.display_name}
                  />
                </div>
              )}

              <div className="business-cards-card-body">
                {card.company_name && (
                  <div className="business-cards-card-field">
                    <Building2 size={14} />
                    <span>{card.company_name}</span>
                  </div>
                )}
                {card.contact_person && (
                  <div className="business-cards-card-field">
                    <User size={14} />
                    <span>{card.contact_person}</span>
                  </div>
                )}
                {card.email && (
                  <div className="business-cards-card-field">
                    <Mail size={14} />
                    <span>{card.email}</span>
                  </div>
                )}
                {card.phone && (
                  <div className="business-cards-card-field">
                    <Phone size={14} />
                    <span>{card.phone}</span>
                  </div>
                )}
                {card.wechat && (
                  <div className="business-cards-card-field">
                    <MessageCircle size={14} />
                    <span>{card.wechat}</span>
                  </div>
                )}
                {card.website && (
                  <div className="business-cards-card-field">
                    <Globe size={14} />
                    <span>{card.website}</span>
                  </div>
                )}
              </div>

              <div className="business-cards-card-footer">
                <span className={getStatusBadgeClass(card.status)}>
                  {card.status}
                </span>
                {card.category && (
                  <span
                    className="business-cards-category-badge"
                    style={{ backgroundColor: card.category.color + '20', color: card.category.color }}
                  >
                    {card.category.name}
                  </span>
                )}
              </div>

              {card.tags && card.tags.length > 0 && (
                <div className="business-cards-card-tags">
                  {card.tags.map(tag => (
                    <span key={tag.id} className="business-cards-tag-small">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        )}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={handleCloseModal}
          title={modalMode === 'add' ? 'Add Business Card' : 'Edit Business Card'}
          size="large"
        >
          <div className="business-cards-modal-content">
            <div className="business-cards-modal-section">
              <h3>Card Images (max 5)</h3>
              <BusinessCardImageUpload
                images={formData.images}
                onImagesChange={(images) => setFormData({ ...formData, images })}
                maxImages={5}
              />
            </div>

            <div className="business-cards-modal-section">
              <h3>Basic Information</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Display Name *</label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="How to display this contact"
                  />
                </div>
                <div className="form-group">
                  <label>Company Name</label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="Company name"
                  />
                </div>
                <div className="form-group">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    placeholder="Person name"
                  />
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <CustomSelect
                    value={formData.status}
                    onChange={(val) => setFormData({ ...formData, status: val })}
                    options={[
                      { value: 'new', label: 'New' },
                      { value: 'contacted', label: 'Contacted' },
                      { value: 'accepted', label: 'Accepted' },
                      { value: 'rejected', label: 'Rejected' },
                      { value: 'inactive', label: 'Inactive' }
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="business-cards-modal-section">
              <h3>Contact Details</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Phone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+86 ..."
                  />
                </div>
                <div className="form-group">
                  <label>WeChat ID</label>
                  <input
                    type="text"
                    value={formData.wechat}
                    onChange={(e) => setFormData({ ...formData, wechat: e.target.value })}
                    placeholder="WeChat ID"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="form-group">
                  <label>Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <div className="business-cards-modal-section">
              <h3>Organization</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Category</label>
                  <CustomSelect
                    value={formData.category_id || ''}
                    onChange={(val) => setFormData({ ...formData, category_id: val || null })}
                    placeholder="No category"
                    options={cardCategories.map(cat => ({
                      value: cat.id,
                      label: cat.name
                    }))}
                  />
                </div>
                <div className="form-group">
                  <label>Tags</label>
                  <TagInput
                    selectedTags={formData.tags}
                    availableTags={cardTags}
                    onTagsChange={(tags) => setFormData({ ...formData, tags })}
                    onCreateTag={handleCreateTag}
                  />
                </div>
              </div>
            </div>

            <div className="business-cards-modal-section">
              <h3>Notes</h3>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={4}
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                {modalMode === 'add' ? 'Add Card' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <CategoryManager
          categories={cardCategories}
          onClose={() => setShowCategoryManager(false)}
          onAdd={addCardCategory}
          onUpdate={updateCardCategory}
          onDelete={deleteCardCategory}
          onRefresh={refreshCardCategories}
        />
      )}
    </div>
  );
}

// Category Manager Component
function CategoryManager({ categories, onClose, onAdd, onUpdate, onDelete, onRefresh }) {
  const { alert, confirm } = useModal();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;

    // Check for duplicate category name
    const trimmedName = name.trim();
    const duplicate = categories.find(
      cat => cat.name.toLowerCase() === trimmedName.toLowerCase() && cat.id !== editingId
    );

    if (duplicate) {
      await alert({
        title: 'Duplicate Category',
        message: `A category named "${trimmedName}" already exists. Please choose a different name.`,
        type: 'error'
      });
      return;
    }

    try {
      if (editingId) {
        await onUpdate(editingId, trimmedName, color);
      } else {
        await onAdd(trimmedName, color);
      }
      setName('');
      setColor('#3b82f6');
      setEditingId(null);
    } catch (error) {
      // Check for database unique constraint error
      const isDuplicateError = error.message?.includes('duplicate key') ||
                               error.message?.includes('unique constraint');

      await alert({
        title: 'Error',
        message: isDuplicateError
          ? `A category named "${trimmedName}" already exists. Please choose a different name.`
          : error.message || 'Failed to save category',
        type: 'error'
      });
    }
  };

  const handleEdit = (category) => {
    setEditingId(category.id);
    setName(category.name);
    setColor(category.color);
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Confirm Delete',
      message: 'Delete this category? Cards will not be deleted.',
      type: 'warning',
      confirmText: 'Delete'
    });

    if (confirmed) {
      try {
        await onDelete(id);
      } catch (error) {
        await alert({
          title: 'Error',
          message: error.message || 'Failed to delete category',
          type: 'error'
        });
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const refreshedCategories = await onRefresh();
      await alert({
        title: 'Success',
        message: `Refreshed! Found ${refreshedCategories?.length || 0} categories. Check browser console for details.`,
        type: 'success'
      });
    } catch (error) {
      await alert({
        title: 'Refresh Error',
        message: `Failed to refresh: ${error.message}. Check browser console for details.`,
        type: 'error'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Manage Categories">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Add new category form */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            style={{ flex: 1 }}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleSave}>
            {editingId ? 'Update' : 'Add'}
          </button>
          {editingId && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setEditingId(null);
                setName('');
                setColor('#3b82f6');
              }}
            >
              Cancel
            </button>
          )}
        </div>

        {/* Categories list */}
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <div style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Categories ({categories.length})
            </div>
            <button
              className="btn btn-secondary"
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '300px',
            overflowY: 'auto'
          }}>
            {categories.length === 0 ? (
              <div style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.875rem'
              }}>
                No categories yet. Create one above!
              </div>
            ) : (
              categories.map(cat => (
                <div
                  key={cat.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px',
                    border: '1px solid var(--border)',
                    borderRadius: '4px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        backgroundColor: cat.color
                      }}
                    />
                    <span>{cat.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={() => handleEdit(cat)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" onClick={() => handleDelete(cat.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
