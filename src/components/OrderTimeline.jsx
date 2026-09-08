import React from 'react';
import { Check } from 'lucide-react';

// Colour here encodes STATE (done / current / upcoming), not stage identity -
// the stage is already named by its label and its position, so six different
// hues carried no information and only made the row noisy.
const STATUSES = [
  { key: 'pending', label: 'Pending' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'production', label: 'Production' },
  { key: 'qc', label: 'QC' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

const DONE = 'var(--success)';
const CURRENT = 'var(--accent)';

function OrderTimeline({ status, size = 'default' }) {
  const currentIndex = STATUSES.findIndex(s => s.key === status);

  return (
    <div className="order-timeline">
      {STATUSES.map((step, idx) => {
        const isCompleted = idx < currentIndex;
        const isCurrent = idx === currentIndex;
        
        return (
          <React.Fragment key={step.key}>
            <div className="timeline-step">
              <div
                className={`timeline-dot ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`}
                style={{
                  backgroundColor: isCompleted ? DONE : undefined,
                  borderColor: isCurrent ? CURRENT : undefined,
                  color: isCurrent ? CURRENT : undefined,
                  width: size === 'small' ? '24px' : '28px',
                  height: size === 'small' ? '24px' : '28px'
                }}
              >
                {isCompleted ? <Check size={14} /> : (idx + 1)}
              </div>
              {size !== 'small' && (
                <span className="timeline-label" style={{ color: isCurrent ? CURRENT : undefined }}>
                  {step.label}
                </span>
              )}
            </div>
            {idx < STATUSES.length - 1 && (
              <div
                className={`timeline-line ${isCompleted ? 'completed' : ''}`}
                style={{ backgroundColor: isCompleted ? DONE : undefined }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Status badge. Uses the app's reserved status colours rather than a per-stage
// hue, and always carries its label - state is never colour alone.
const BADGE_TONE = {
  pending: 'tag-favorite',
  deposit: 'tag-pending',
  production: 'tag-pending',
  qc: 'tag-pending',
  shipped: 'tag-approved',
  delivered: 'tag-approved',
};

function StatusBadge({ status }) {
  const config = STATUSES.find(s => s.key === status) || STATUSES[0];
  return (
    <span className={`tag ${BADGE_TONE[config.key] || 'tag-default'}`}>
      {config.label}
    </span>
  );
}

export { OrderTimeline, StatusBadge, STATUSES };
export default OrderTimeline;
