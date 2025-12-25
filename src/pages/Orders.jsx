import React, { useState, useMemo } from 'react';
import { Plus, Truck, X, Check, Edit2, Trash2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import { SearchInput, OrderTimeline, StatusBadge, STATUSES, CustomSelect } from '../components';
import { filterBySearch, formatDate } from '../utils/helpers';

function Orders() {
  const { state, actions } = useAppContext();
  const { confirm } = useModal();
  const { orders, suppliers } = state;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [formData, setFormData] = useState({ name: '', supplier: '', status: 'pending', quantity: '', total: '', notes: '' });

  const filteredOrders = useMemo(() => {
    let result = filterBySearch(orders, search, ['name', 'supplier']);
    if (statusFilter !== 'all') result = result.filter(o => o.status === statusFilter);
    return result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, search, statusFilter]);

  const handleOpenModal = (order = null) => {
    if (order) {
      setEditingOrder(order);
      setFormData({ name: order.name, supplier: order.supplier || '', status: order.status || 'pending', quantity: order.quantity || '', total: order.total || '', notes: order.notes || '' });
    } else {
      setEditingOrder(null);
      setFormData({ name: '', supplier: '', status: 'pending', quantity: '', total: '', notes: '' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => { setIsModalOpen(false); setEditingOrder(null); };

  const handleSave = () => {
    if (!formData.name.trim()) { alert('Please enter order name'); return; }
    if (editingOrder) actions.updateOrder({ ...editingOrder, ...formData });
    else actions.addOrder(formData);
    handleCloseModal();
  };

  const handleDelete = async (orderId) => {
    const confirmed = await confirm({ title: 'Delete Order', message: 'Are you sure?', type: 'danger', confirmText: 'Delete' });
    if (confirmed) actions.deleteOrder(orderId);
  };

  const handleStatusChange = (orderId, newStatus) => {
    const order = orders.find(o => o.id === orderId);
    if (order) actions.updateOrder({ ...order, status: newStatus });
  };

  // Stats calculation
  const statusCounts = useMemo(() => {
    const counts = { total: orders.length };
    STATUSES.forEach(s => {
      counts[s.key] = orders.filter(o => o.status === s.key).length;
    });
    return counts;
  }, [orders]);

  return (
    <div className="page">
      <div className="header">
        <h2>Orders</h2>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={16} /> New Order</button>
      </div>

      <div className="content">
        {/* Stats Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}>
          <div className="stat-card" style={{ '--stat-color': '#6366F1', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
            <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
              <Truck size={22} color="#6366F1" />
            </div>
            <div className="stat-content">
              <div className="stat-label">Total Orders</div>
              <div className="stat-value">{statusCounts.total}</div>
            </div>
          </div>
          {STATUSES.slice(0, 4).map(s => (
            <div key={s.key} className="stat-card" style={{ '--stat-color': s.color, '--stat-bg': `${s.color}20` }}>
              <div className="stat-content">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{statusCounts[s.key] || 0}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="filter-bar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search orders..." />
          <CustomSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'all', label: 'All Status' },
              ...STATUSES.map(s => ({ value: s.key, label: s.label }))
            ]}
          />
        </div>

        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <Truck size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>No orders found</h3>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => handleOpenModal()}><Plus size={16} /> New Order</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredOrders.map(order => (
              <div key={order.id} className="card">
                <div className="card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{order.name}</h3>
                      <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        {order.supplier && `${order.supplier} • `}{formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="icon-btn" onClick={() => handleOpenModal(order)}><Edit2 size={16} /></button>
                      <button className="icon-btn" onClick={() => handleDelete(order.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <OrderTimeline status={order.status} />
                  <div style={{ marginTop: '16px', display: 'flex', gap: '24px', fontSize: '0.9rem' }}>
                    {order.quantity && <span><strong>Qty:</strong> {order.quantity}</span>}
                    {order.total && <span><strong>Total:</strong> {order.total}</span>}
                  </div>
                  <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {STATUSES.map(s => (
                      <button key={s.key} className={`btn btn-ghost ${order.status === s.key ? 'active' : ''}`} onClick={() => handleStatusChange(order.id, s.key)} style={{ padding: '6px 12px', fontSize: '0.8rem', background: order.status === s.key ? `${s.color}20` : undefined, color: order.status === s.key ? s.color : undefined }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">📦 {editingOrder ? 'Edit Order' : 'New Order'}</span>
              <button className="icon-btn" onClick={handleCloseModal}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Order Name *</label>
                <input type="text" className="form-input" placeholder="e.g., PO-2024-001" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Supplier</label>
                  <CustomSelect
                    value={formData.supplier}
                    onChange={(val) => setFormData({ ...formData, supplier: val })}
                    placeholder="-- Select --"
                    options={suppliers.map(s => ({ value: s.company, label: s.company }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <CustomSelect
                    value={formData.status}
                    onChange={(val) => setFormData({ ...formData, status: val })}
                    options={STATUSES.map(s => ({ value: s.key, label: s.label }))}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Quantity</label>
                  <input type="text" className="form-input" placeholder="e.g., 10,000 pcs" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Value</label>
                  <input type="text" className="form-input" placeholder="e.g., $5,000" value={formData.total} onChange={e => setFormData({ ...formData, total: e.target.value })} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes</label>
                <textarea className="form-input" rows={3} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}><Check size={16} /> {editingOrder ? 'Update' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Orders;
