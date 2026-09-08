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
        <Compass size={44} color="var(--text-subtle)" />
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
  title: { margin: '12px 0 0', fontSize: 'var(--text-2xl)', color: 'var(--text-primary, var(--text-primary))' },
  message: { margin: 0, color: 'var(--text-secondary, var(--text-secondary))' },
  path: {
    display: 'inline-block',
    margin: '4px 0 16px',
    padding: '4px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-tertiary)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary, var(--text-secondary))',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  },
  actions: { display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' },
};

export default NotFound;
