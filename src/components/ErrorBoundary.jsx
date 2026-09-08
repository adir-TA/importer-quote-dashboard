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
          <AlertTriangle size={40} color="var(--error)" />
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
    background: 'var(--grey-25)',
  },
  card: {
    maxWidth: '520px',
    width: '100%',
    background: '#fff',
    borderRadius: 'var(--radius-lg)',
    padding: '32px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-lg)',
  },
  title: { margin: '16px 0 8px', fontSize: 'var(--text-xl)', color: 'var(--text-primary)' },
  message: { margin: '0 0 20px', color: 'var(--text-secondary)', lineHeight: 1.6 },
  details: {
    textAlign: 'start',
    fontSize: 'var(--text-xs)',
    background: 'var(--grey-100)',
    padding: '12px',
    borderRadius: 'var(--radius-md)',
    overflowX: 'auto',
    maxHeight: '200px',
    marginBottom: '20px',
    color: 'var(--text-secondary)',
  },
  actions: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' },
};

export default ErrorBoundary;
