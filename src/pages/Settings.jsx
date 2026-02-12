import React, { useState } from 'react';
import { Settings as SettingsIcon, Key, Globe, Database, Trash2, Download, Upload, Check, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useModal } from '../context/ModalContext';

function Settings() {
  const { state, actions } = useAppContext();
  const { t } = useLanguage();
  const { confirm, alert: showAlert } = useModal();
  const { settings, products, quotes, suppliers, orders, documents } = state;

  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [currency, setCurrency] = useState(settings.currency || 'USD');
  const [saved, setSaved] = useState(false);

  const handleSaveSettings = () => {
    actions.updateSettings({ apiKey, currency });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearSeedData = async () => {
    const confirmed = await confirm({
      title: 'Delete Fake Seed Products',
      message: 'This will permanently delete the fake products (USB-C Cable, LED Desk Lamp, etc.) and their quotes from the database. Continue?',
      type: 'danger',
      confirmText: 'Delete Fake Data'
    });

    if (confirmed) {
      try {
        await actions.clearAllSeedData();
        showAlert({ title: 'Success', message: 'All fake seed data has been deleted!', type: 'success' });
      } catch (error) {
        showAlert({ title: 'Error', message: 'Failed to delete seed data: ' + error.message, type: 'error' });
      }
    }
  };

  const handleClearAllData = async () => {
    const confirmed = await confirm({
      title: 'Clear All Data',
      message: 'This will permanently delete all products, quotes, suppliers, orders, and documents. This cannot be undone!',
      type: 'danger',
      confirmText: 'Delete Everything'
    });

    if (confirmed) {
      localStorage.removeItem('ha-tools-state');
      window.location.reload();
    }
  };

  const handleExportBackup = () => {
    actions.exportData();
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            actions.importData(data);
            showAlert({ title: 'Success', message: 'Data imported successfully!', type: 'success' });
          } catch (err) {
            showAlert({ title: 'Error', message: 'Failed to import: Invalid file format', type: 'error' });
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const stats = [
    { label: t('settings.products'), count: products.length },
    { label: t('settings.quotes'), count: quotes.length },
    { label: t('settings.suppliers'), count: suppliers.length },
    { label: t('settings.orders'), count: orders.length },
    { label: t('settings.documents'), count: documents.length }
  ];

  return (
    <div className="page">
      <div className="header">
        <h2>{t('settings.title')}</h2>
      </div>

      <div className="content" style={{ maxWidth: '900px' }}>
        {/* Stats Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '16px',
          marginBottom: '28px',
        }}>
          {stats.map(stat => (
            <div key={stat.label} className="stat-card" style={{ '--stat-color': '#6366F1', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
              <div className="stat-content">
                <div className="stat-label">{stat.label}</div>
                <div className="stat-value">{stat.count}</div>
              </div>
            </div>
          ))}
        </div>

        {/* API Configuration */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span className="card-title"><Key size={18} style={{ marginRight: '8px' }} /> {t('settings.apiConfiguration')}</span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">{t('settings.anthropicApiKey')}</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="form-input"
                  placeholder="sk-ant-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
                <button className="icon-btn" onClick={() => setShowApiKey(!showApiKey)}>
                  {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              <p className="form-hint">{t('settings.apiKeyHint')}</p>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('settings.defaultCurrency')}</label>
              <select className="form-select" value={currency} onChange={e => setCurrency(e.target.value)} style={{ maxWidth: '200px' }}>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CNY">CNY (¥)</option>
                <option value="ILS">ILS (₪)</option>
              </select>
            </div>
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={handleSaveSettings}>
              {saved ? <><Check size={16} /> {t('settings.saved')}</> : t('settings.saveSettings')}
            </button>
          </div>
        </div>

        {/* Backup & Restore */}
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <span className="card-title"><Download size={18} style={{ marginRight: '8px' }} /> {t('settings.backupRestore')}</span>
          </div>
          <div className="card-body">
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {t('settings.backupDesc')}
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={handleExportBackup}>
                <Download size={16} /> {t('settings.exportBackup')}
              </button>
              <button className="btn btn-secondary" onClick={handleImportBackup}>
                <Upload size={16} /> {t('settings.importBackup')}
              </button>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div className="card-header" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
            <span className="card-title" style={{ color: '#ef4444' }}><Trash2 size={18} style={{ marginRight: '8px' }} /> {t('settings.dangerZone')}</span>
          </div>
          <div className="card-body">
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {t('settings.dangerDesc')}
            </p>
            <div style={{ display: 'flex', gap: '12px', flexDirection: 'column' }}>
              <button className="btn" onClick={handleClearSeedData} style={{ background: '#f59e0b', color: 'white', padding: '12px 20px' }}>
                <Trash2 size={16} /> {t('settings.deleteFakeSeed')}
              </button>
              <button className="btn btn-danger" onClick={handleClearAllData}>
                <Trash2 size={16} /> {t('settings.clearAllData')}
              </button>
            </div>
          </div>
        </div>

        {/* About */}
        <div style={{ marginTop: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '0.9rem' }}>{t('settings.about')}</p>
          <p style={{ fontSize: '0.8rem' }}>{t('settings.aboutDesc')}</p>
        </div>
      </div>
    </div>
  );
}

export default Settings;
