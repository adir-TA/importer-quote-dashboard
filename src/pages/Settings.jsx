import React, { useState, useEffect } from 'react';
import { Key, Trash2, Download, Check, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useModal } from '../context/ModalContext';
import { DEFAULT_FX_RATES, SUPPORTED_CURRENCIES } from '../utils/currency';
import { downloadBlob } from '../utils/helpers';

function Settings() {
  const { state, actions } = useAppContext();
  const { t } = useLanguage();
  const { confirm, alert: showAlert } = useModal();
  const { settings, products, quotes, suppliers, orders, documents, settingsLoadFailed } = state;

  // The API key is write-only: the browser only ever learns whether one is
  // stored (settings.hasApiKey), never its value.
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [currency, setCurrency] = useState(settings.currency || 'USD');
  const [rates, setRates] = useState(() => ({ ...DEFAULT_FX_RATES, ...(settings.fxRates || {}) }));
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-sync when settings finish loading from the database
  useEffect(() => {
    setCurrency(settings.currency || 'USD');
    setRates({ ...DEFAULT_FX_RATES, ...(settings.fxRates || {}) });
  }, [settings.currency, settings.fxRates]);

  const handleRateChange = (code, value) => {
    setRates(prev => ({ ...prev, [code]: value }));
  };

  const handleSaveSettings = async () => {
    setSaveError('');

    // The form is seeded from defaults when the settings read failed, so
    // saving would overwrite the user's real currency and rates.
    if (settingsLoadFailed) {
      setSaveError('Your settings could not be loaded, so they cannot be saved safely. Please reload the page.');
      return;
    }

    // Validate the rate table before writing it - a bad rate silently corrupts
    // every price comparison in the app.
    const cleanedRates = {};
    for (const [code, value] of Object.entries(rates)) {
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (!Number.isFinite(num) || num <= 0) {
        setSaveError(`Exchange rate for ${code} must be a positive number.`);
        return;
      }
      cleanedRates[code] = num;
    }

    if (!Number.isFinite(cleanedRates[currency])) {
      setSaveError(`Add an exchange rate for your base currency (${currency}).`);
      return;
    }

    setBusy(true);
    try {
      await actions.updateSettings({
        currency,
        fxRates: cleanedRates,
        // Only send the key when the user actually typed a new one
        ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
      });
      setApiKeyInput('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSaveError(error.message || 'Failed to save settings');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveApiKey = async () => {
    const confirmed = await confirm({
      title: 'Remove API key',
      message: 'Quote extraction and the AI helpers will stop working until you add a key again.',
      type: 'danger',
      confirmText: 'Remove key',
    });
    if (!confirmed) return;

    try {
      await actions.updateSettings({ apiKey: null });
      setApiKeyInput('');
      showAlert({ title: 'Removed', message: 'Your API key has been deleted.', type: 'success' });
    } catch (error) {
      setSaveError(error.message || 'Failed to remove API key');
    }
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
      message: 'This will permanently delete all Buying Intents, quotes, suppliers, orders, and documents. This cannot be undone!',
      type: 'danger',
      confirmText: 'Delete Everything'
    });

    if (!confirmed) return;

    setBusy(true);
    try {
      // This used to just remove an unused localStorage key and reload, so it
      // told the user everything was deleted while deleting nothing.
      await actions.clearAllData();
      showAlert({ title: 'Deleted', message: 'All of your data has been removed.', type: 'success' });
    } catch (error) {
      showAlert({ title: 'Error', message: 'Failed to clear data: ' + error.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleExportBackup = () => {
    try {
      const backup = actions.exportData();
      downloadBlob(
        new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
        `ha-tools-backup-${new Date().toISOString().split('T')[0]}.json`
      );
    } catch (error) {
      showAlert({ title: 'Error', message: 'Failed to export: ' + error.message, type: 'error' });
    }
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
                  placeholder={settings.hasApiKey ? '•••••••••••••••• (saved)' : 'sk-ant-...'}
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowApiKey(!showApiKey)}
                  aria-label={showApiKey ? 'Hide key' : 'Show key'}
                >
                  {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
                {settings.hasApiKey && (
                  <button type="button" className="btn btn-secondary" onClick={handleRemoveApiKey}>
                    Remove
                  </button>
                )}
              </div>
              <p className="form-hint">
                {settings.hasApiKey
                  ? 'A key is saved. It is stored server-side and never sent back to your browser — type a new one to replace it.'
                  : t('settings.apiKeyHint')}
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">{t('settings.defaultCurrency')}</label>
              <select
                className="form-select"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                style={{ maxWidth: '200px' }}
              >
                {SUPPORTED_CURRENCIES.map(code => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
              <p className="form-hint">
                Quotes in other currencies are converted to this currency for ranking and landed cost.
              </p>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Exchange rates</label>
              <p className="form-hint" style={{ marginTop: 0, marginBottom: '12px' }}>
                Units of each currency per 1 USD. These are manual — update them
                to match your bank's rates, they are not fetched live.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: '12px',
              }}>
                {SUPPORTED_CURRENCIES.map(code => (
                  <div key={code}>
                    <label className="form-label" style={{ fontSize: '0.8rem' }} htmlFor={`rate-${code}`}>
                      {code}
                    </label>
                    <input
                      id={`rate-${code}`}
                      type="number"
                      step="0.0001"
                      min="0"
                      className="form-input"
                      value={rates[code] ?? ''}
                      disabled={code === 'USD'}
                      onChange={e => handleRateChange(code, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {settingsLoadFailed && (
              <div className="auth-error" role="alert" style={{ marginTop: '16px' }}>
                <AlertCircle size={18} />
                <span>
                  Your saved settings could not be loaded. The values shown are
                  defaults — reload before changing anything.
                </span>
              </div>
            )}

            {saveError && (
              <div className="auth-error" role="alert" style={{ marginTop: '16px' }}>
                <AlertCircle size={18} />
                <span>{saveError}</span>
              </div>
            )}
          </div>
          <div className="modal-footer" style={{ borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-primary" onClick={handleSaveSettings} disabled={busy || settingsLoadFailed}>
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
            </div>
            {/* The Import button called actions.importData(), which never
                existed and threw a TypeError. Restoring a backup needs
                conflict handling that does not exist yet, so the button is
                removed rather than left broken. */}
            <p className="form-hint" style={{ marginTop: '12px' }}>
              Your API key is never included in the backup file.
            </p>
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
              <button className="btn" onClick={handleClearSeedData} disabled={busy} style={{ background: '#f59e0b', color: 'white', padding: '12px 20px' }}>
                <Trash2 size={16} /> {t('settings.deleteFakeSeed')}
              </button>
              <button className="btn btn-danger" onClick={handleClearAllData} disabled={busy}>
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
