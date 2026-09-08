import React from 'react';

/**
 * The one loading treatment for the app.
 *
 * Pages previously each rolled their own: some overrode the spinner to 40px
 * inline, some used the default, some wrapped it in an empty state. Same
 * wait, three different appearances.
 */
function LoadingState({ label, size = 'default', className = '' }) {
  const px = size === 'small' ? 20 : size === 'large' ? 36 : 28;

  return (
    <div className={`loading-state ${className}`} role="status" aria-live="polite">
      <div className="spinner" style={{ width: px, height: px }} />
      {label && <p className="loading-state-label">{label}</p>}
    </div>
  );
}

export default LoadingState;
