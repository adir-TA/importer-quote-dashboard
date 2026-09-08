import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * 404 page. Previously any unrecognised URL matched no route at all and
 * rendered a blank content area next to the sidebar.
 */
function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  return (
    <div className="page">
      <div style={styles.wrapper}>
        <Compass size={44} color="#94a3b8" />
        <h1 style={styles.title}>{t('notFound.title')}</h1>
        <p style={styles.message}>{t('notFound.message')}</p>
        <code style={styles.path}>{location.pathname}</code>
        <div style={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
            {t('notFound.goDashboard')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            {t('notFound.goBack')}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '64px 24px',
    gap: '8px',
  },
  title: { margin: '12px 0 0', fontSize: '1.4rem', color: 'var(--text-primary, #0f172a)' },
  message: { margin: 0, color: 'var(--text-secondary, #64748b)' },
  path: {
    display: 'inline-block',
    margin: '4px 0 16px',
    padding: '4px 10px',
    borderRadius: '6px',
    background: 'var(--surface-alt, #f1f5f9)',
    fontSize: '0.8rem',
    color: 'var(--text-secondary, #64748b)',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  },
  actions: { display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' },
};

export default NotFound;
