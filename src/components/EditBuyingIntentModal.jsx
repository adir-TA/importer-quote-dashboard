import React from 'react';
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
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">🎯 {editingProduct ? 'Edit Buying Intent' : 'New Buying Intent'}</span>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
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
                      type="text"
                      className="form-input"
                      value={categorySearch}
                      onChange={e => setCategorySearch(e.target.value)}
                      placeholder="Search categories..."
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: '0.875rem', flex: 1, border: 'none', background: 'transparent', padding: 0 }}
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
                  style={{ flex: 1, background: '#f1f5f9' }}
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
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Add Custom Field:</p>
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
