import React, { useState, useMemo, useRef } from 'react';
import { Plus, FileText, X, Check, Upload, FolderPlus } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import { SearchInput, DocumentCard, FileUpload } from '../components';
import { filterBySearch, getFileIcon, formatFileSize } from '../utils/helpers';

function Documents() {
  const { state, actions, computed } = useAppContext();
  const { confirm } = useModal();
  const { documents } = state;

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [formData, setFormData] = useState({ name: '', category: '', notes: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [newCategory, setNewCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  const categories = computed.getDocumentCategories();

  const filteredDocs = useMemo(() => {
    let result = filterBySearch(documents, search, ['name', 'category', 'notes']);
    if (categoryFilter !== 'all') result = result.filter(d => d.category === categoryFilter);
    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [documents, search, categoryFilter]);

  const handleOpenModal = (doc = null) => {
    if (doc) {
      setEditingDoc(doc);
      setFormData({ name: doc.name, category: doc.category || '', notes: doc.notes || '' });
    } else {
      setEditingDoc(null);
      setFormData({ name: '', category: '', notes: '' });
      setSelectedFile(null);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => { setIsModalOpen(false); setEditingDoc(null); setSelectedFile(null); setShowNewCategory(false); setNewCategory(''); };

  const handleFileSelect = (file) => {
    setSelectedFile(file);
    if (!formData.name) setFormData({ ...formData, name: file.name });
  };

  const handleSave = () => {
    if (!formData.name.trim()) { alert('Please enter document name'); return; }
    const category = showNewCategory && newCategory.trim() ? newCategory.trim() : formData.category;
    
    if (editingDoc) {
      actions.updateDocument({ ...editingDoc, ...formData, category });
    } else {
      if (selectedFile) {
        const reader = new FileReader();
        reader.onload = () => {
          actions.addDocument({ ...formData, category, data: reader.result, size: selectedFile.size, type: selectedFile.type });
        };
        reader.readAsDataURL(selectedFile);
      } else {
        actions.addDocument({ ...formData, category });
      }
    }
    handleCloseModal();
  };

  const handleDelete = async (docId) => {
    const confirmed = await confirm({ title: 'Delete Document', message: 'Are you sure?', type: 'danger', confirmText: 'Delete' });
    if (confirmed) actions.deleteDocument(docId);
  };

  const handleDownload = (doc) => {
    if (doc.data) {
      const a = document.createElement('a');
      a.href = doc.data;
      a.download = doc.name;
      a.click();
    }
  };

  return (
    <div className="page">
      <div className="header">
        <h2>Documents</h2>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={16} /> Upload Document</button>
      </div>

      <div className="content">
        <div className="filter-bar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search documents..." />
          <select className="filter-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>No documents found</h3>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => handleOpenModal()}><Plus size={16} /> Upload Document</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {filteredDocs.map(doc => (
              <DocumentCard key={doc.id} document={doc} onEdit={() => handleOpenModal(doc)} onDelete={() => handleDelete(doc.id)} onDownload={handleDownload} />
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">📄 {editingDoc ? 'Edit Document' : 'Upload Document'}</span>
              <button className="icon-btn" onClick={handleCloseModal}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {!editingDoc && (
                <div className="form-group">
                  <FileUpload onFileSelect={handleFileSelect}>
                    {selectedFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '2rem' }}>{getFileIcon(selectedFile.name)}</span>
                        <div>
                          <div style={{ fontWeight: 500 }}>{selectedFile.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatFileSize(selectedFile.size)}</div>
                        </div>
                      </div>
                    ) : (
                      <><div className="upload-icon"><Upload size={32} /></div><p className="upload-text">Drop file or click to browse</p></>
                    )}
                  </FileUpload>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Document Name *</label>
                <input type="text" className="form-input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                {showNewCategory ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" className="form-input" placeholder="New category name" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
                    <button className="btn btn-ghost" onClick={() => setShowNewCategory(false)}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select className="form-select" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                      <option value="">-- Select --</option>
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <button className="btn btn-ghost" onClick={() => setShowNewCategory(true)}><FolderPlus size={16} /></button>
                  </div>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}><Check size={16} /> {editingDoc ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Documents;
