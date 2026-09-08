import React, { useState, useMemo } from 'react';
import { Plus, Users, X, Check, Globe, MessageCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useModal } from '../context/ModalContext';
import { SearchInput } from '../components';
import { filterBySearch } from '../utils/helpers';

const STATUS_OPTIONS = [
  { value: 'verified', label: 'Verified', color: '#10b981' },
  { value: 'pending', label: 'Pending', color: '#f59e0b' },
  { value: 'warning', label: 'Warning', color: '#ef4444' },
  { value: 'blocked', label: 'Blocked', color: '#6b7280' }
];

function Suppliers() {
  const { state, actions, computed } = useAppContext();
  const { t } = useLanguage();
  const { confirm, alert: showAlert } = useModal();
  const { suppliers } = state;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [formData, setFormData] = useState({ company: '', contact: '', email: '', wechat: '', website: '', status: 'pending', notes: '' });

  const filteredSuppliers = useMemo(() => {
    let result = filterBySearch(suppliers, search, ['company', 'contact', 'email']);
    if (statusFilter !== 'all') result = result.filter(s => s.status === statusFilter);
    return result;
  }, [suppliers, search, statusFilter]);

  const handleOpenModal = (supplier = null) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({ company: supplier.company, contact: supplier.contact || '', email: supplier.email || '', wechat: supplier.wechat || '', website: supplier.website || '', status: supplier.status || 'pending', notes: supplier.notes || '' });
    } else {
      setEditingSupplier(null);
      setFormData({ company: '', contact: '', email: '', wechat: '', website: '', status: 'pending', notes: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => { setIsModalOpen(false); setEditingSupplier(null); };

  const handleSave = () => {
    if (!formData.company.trim()) { showAlert({ title: 'Check your input', message: 'Please enter company name', type: 'warning' }); return; }
    if (editingSupplier) actions.updateSupplier({ ...editingSupplier, ...formData });
    else actions.addSupplier(formData);
    handleCloseModal();
  };

  const handleDelete = async (supplierId) => {
    const confirmed = await confirm({ title: 'Delete Supplier', message: 'Are you sure?', type: 'danger', confirmText: 'Delete' });
    if (confirmed) actions.deleteSupplier(supplierId);
  };

  const getStatusBadge = (status) => {
    const opt = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[1];
    return <span className="status-badge" style={{ background: `${opt.color}20`, color: opt.color }}>{opt.label}</span>;
  };

  return (
    <div className="page">
      <div className="header">
        <h2>Suppliers</h2>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={16} /> Add Supplier</button>
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
              <Users size={22} color="#6366F1" />
            </div>
            <div className="stat-content">
              <div className="stat-label">{t('suppliers.totalSuppliers')}</div>
              <div className="stat-value">{suppliers.length}</div>
            </div>
          </div>
          {STATUS_OPTIONS.map(status => (
            <div key={status.value} className="stat-card" style={{ '--stat-color': status.color, '--stat-bg': `${status.color}20` }}>
              <div className="stat-icon-wrapper" style={{ background: `${status.color}20` }}>
                <Check size={22} color={status.color} />
              </div>
              <div className="stat-content">
                <div className="stat-label">{status.label}</div>
                <div className="stat-value">{suppliers.filter(s => s.status === status.value).length}</div>
              </div>
            </div>
          ))}
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
              Filter Suppliers
            </h3>

            {/* Status Filter */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                Status
              </label>
              <select
                className="form-input"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ fontSize: '0.875rem' }}
              >
                <option value="all">All Suppliers</option>
                {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>

            {/* Quick Stats */}
            <div style={{
              padding: '16px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Quick Stats
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{t('suppliers.totalSuppliers')}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{suppliers.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Filtered</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{filteredSuppliers.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Main Content */}
          <div>
            {/* Search Bar */}
            <div style={{ marginBottom: '24px' }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers..." />
            </div>

        {filteredSuppliers.length === 0 ? (
          <div className="empty-state">
            <Users size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>{t('suppliers.none')}</h3>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => handleOpenModal()}><Plus size={16} /> Add Supplier</button>
          </div>
        ) : (
          <div className="suppliers-grid">
            {filteredSuppliers.map(supplier => (
              <div key={supplier.id} className="supplier-card" onClick={() => handleOpenModal(supplier)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div className="supplier-name">{supplier.company}</div>
                  {getStatusBadge(supplier.status)}
                </div>
                <div className="supplier-info">
                  {supplier.contact && <span>{supplier.contact}</span>}
                  {supplier.email && <span>{supplier.email}</span>}
                  {supplier.wechat && <span><MessageCircle size={14} style={{ marginRight: '4px' }} />{supplier.wechat}</span>}
                  {supplier.website && <span><Globe size={14} style={{ marginRight: '4px' }} />{supplier.website}</span>}
                </div>
                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {computed.getSupplierQuotes(supplier.id).length} quotes
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
          {/* End right content area */}
        </div>
        {/* End two-column layout */}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">🏢 {editingSupplier ? 'Edit Supplier' : 'New Supplier'}</span>
              <button className="icon-btn" onClick={handleCloseModal}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('suppliers.companyName')} *</label>
                <input type="text" className="form-input" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('suppliers.contactPerson')}</label>
                  <input type="text" className="form-input" value={formData.contact} onChange={e => setFormData({ ...formData, contact: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                    {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('suppliers.wechat')}</label>
                  <input type="text" className="form-input" value={formData.wechat} onChange={e => setFormData({ ...formData, wechat: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('suppliers.website')}</label>
                  <input type="text" className="form-input" value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              {editingSupplier && <button className="btn btn-danger" onClick={() => { handleDelete(editingSupplier.id); handleCloseModal(); }} style={{ marginRight: 'auto' }}>Delete</button>}
              <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}><Check size={16} /> {editingSupplier ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Suppliers;
