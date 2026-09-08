import React, { useRef, useEffect } from 'react';
import { Package, X, Check, ChevronDown, Search, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';

function EditBuyingIntentModal({
  isOpen,
  onClose,
  onSave,
  editingProduct,
  formData,
  setFormData,
  imagePreview,
  setImagePreview,
  selectedImage,
  setSelectedImage,
  isSubmitting,
  showCategoryDropdown,
  setShowCategoryDropdown,
  categorySearch,
  setCategorySearch,
  showCreateCategory,
  setShowCreateCategory,
  newCategoryName,
  setNewCategoryName,
  filteredCategories,
  handleSelectCategory,
  handleCreateCategory,
  handleRemoveImage,
  customFieldName,
  setCustomFieldName,
  customFieldValue,
  setCustomFieldValue,
  handleAddCustomField,
  handleRemoveSpec,
  handleUpdateSpecValue
}) {
  const modalRef = useRef(null);
  const nameInputRef = useRef(null);
  const categorySearchRef = useRef(null);

  // Handle paste events for image upload
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    // Get the first image from clipboard
    const blob = imageItems[0].getAsFile();
    if (!blob) return;

    // Create a proper File object with a name
    const extension = blob.type.split('/')[1] || 'png';
    const fileName = `pasted-image-${Date.now()}.${extension}`;
    const file = new File([blob], fileName, { type: blob.type });

    // Set the selected image and preview (same as file input)
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  // Listen for paste events when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleDocumentPaste = (e) => {
      // Only handle paste if modal is open
      if (modalRef.current) {
        handlePaste(e);
      }
    };

    document.addEventListener('paste', handleDocumentPaste);
    return () => {
      document.removeEventListener('paste', handleDocumentPaste);
    };
  }, [isOpen]);

  // Auto-focus Name field when creating new (not editing)
  useEffect(() => {
    if (isOpen && !editingProduct && nameInputRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, editingProduct]);

  // Auto-focus category search when dropdown opens
  useEffect(() => {
    if (showCategoryDropdown && categorySearchRef.current) {
      setTimeout(() => {
        categorySearchRef.current?.focus();
      }, 50);
    }
  }, [showCategoryDropdown]);

  // Handle Enter key in Name field to open category dropdown
  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      setShowCategoryDropdown(true);
    }
  };

  // Handle Enter key in category search to select first result
  const handleCategorySearchKeyDown = (e) => {
    if (e.key === 'Enter' && filteredCategories.length > 0) {
      e.preventDefault();
      handleSelectCategory(filteredCategories[0]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" ref={modalRef}>
        <div className="modal-header">
          <span className="modal-title">{editingProduct ? 'Edit Buying Intent' : 'New Buying Intent'}</span>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="form-section">
            <div className="form-section-title"><Package size={18} color="var(--accent)" /> What You Want to Buy</div>
            <div className="form-group">
              <label className="form-label">Intent Name *</label>
              <input
                ref={nameInputRef}
                type="text"
                className="form-input"
                placeholder="e.g., Aluminum Container 225×175×42mm"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                onKeyDown={handleNameKeyDown}
              />
              <p className="form-hint">Describe what you're trying to buy (independent of suppliers)</p>
            </div>
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Category</label>

              {showCreateCategory ? (
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
                <button
                  type="button"
                  className="form-input"
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  style={{
                    textAlign: 'start',
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
                      ref={categorySearchRef}
                      type="text"
                      className="form-input"
                      value={categorySearch}
                      onChange={e => setCategorySearch(e.target.value)}
                      onKeyDown={handleCategorySearchKeyDown}
                      placeholder="Search categories..."
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 'var(--text-base)', flex: 1, border: 'none', background: 'transparent', padding: 0 }}
                    />
                  </div>

                  {filteredCategories.length > 0 ? (
                    filteredCategories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleSelectCategory(cat)}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          textAlign: 'start',
                          border: 'none',
                          background: formData.category === cat ? 'var(--accent-light)' : 'transparent',
                          color: formData.category === cat ? 'var(--accent)' : 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: 'var(--text-base)',
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
                      fontSize: 'var(--text-base)',
                    }}>
                      No categories found
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateCategory(true);
                      setShowCategoryDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      textAlign: 'start',
                      border: 'none',
                      background: 'var(--accent-light)',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-base)',
                      fontWeight: 600,
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    + Create New Category
                  </button>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">
                <ImageIcon size={16} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />
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
                    style={{ padding: '6px 12px', fontSize: 'var(--text-base)' }}
                  >
                    <X size={14} /> Remove
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept="image/*"
                    id="image-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedImage(file);
                        setImagePreview(URL.createObjectURL(file));
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <label
                    htmlFor="image-upload"
                    className="btn btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    <ImageIcon size={16} /> Choose Image
                  </label>
                  <p className="form-hint" style={{ marginTop: '8px', marginBottom: 0 }}>
                    Tip: Paste an image (Ctrl+V)
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Specifications</div>
            {formData.specs?.map((spec, index) => (
              <div key={index} style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  value={spec.key}
                  readOnly
                  placeholder="Spec Name"
                  style={{ flex: 1, background: 'var(--grey-100)' }}
                />
                <input
                  type="text"
                  className="form-input"
                  value={spec.value}
                  onChange={(e) => handleUpdateSpecValue(index, e.target.value)}
                  placeholder="Value"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => handleRemoveSpec(index)}
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div style={{ marginTop: '12px' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '8px' }}>Add Custom Field:</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  value={customFieldName}
                  onChange={e => setCustomFieldName(e.target.value)}
                  placeholder="Field name (e.g., Color)"
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  className="form-input"
                  value={customFieldValue}
                  onChange={e => setCustomFieldValue(e.target.value)}
                  placeholder="Value"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleAddCustomField}
                  disabled={!customFieldName.trim()}
                  style={{ padding: '0 16px' }}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Additional Notes (Optional)</div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={3} placeholder="Any additional context, requirements, or notes..." value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave} disabled={isSubmitting}><Check size={16} /> {editingProduct ? 'Update' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export default EditBuyingIntentModal;
