import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Top-level error boundary.
 *
 * Without one, a single render error anywhere in the tree unmounted the whole
 * app and left the user staring at a blank white page with no way to recover.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    // Full navigation rather than router navigation: the router itself may be
    // the thing that threw.
    window.location.href = '/';
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div style={styles.container} role="alert">
        <div style={styles.card}>
          <AlertTriangle size={40} color="#ef4444" />
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.message}>
            The page hit an unexpected error. Your saved data is safe — reloading
            usually fixes it.
          </p>

          {import.meta.env.DEV && (
            <pre style={styles.details}>
              {this.state.error?.stack || String(this.state.error)}
            </pre>
          )}

          <div style={styles.actions}>
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              Reload page
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleGoHome}>
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#f8fafc',
  },
  card: {
    maxWidth: '520px',
    width: '100%',
    background: '#fff',
    borderRadius: '12px',
    padding: '32px',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.08)',
  },
  title: { margin: '16px 0 8px', fontSize: '1.25rem', color: '#0f172a' },
  message: { margin: '0 0 20px', color: '#64748b', lineHeight: 1.6 },
  details: {
    textAlign: 'left',
    fontSize: '0.75rem',
    background: '#f1f5f9',
    padding: '12px',
    borderRadius: '8px',
    overflowX: 'auto',
    maxHeight: '200px',
    marginBottom: '20px',
    color: '#334155',
  },
  actions: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' },
};

export default ErrorBoundary;
