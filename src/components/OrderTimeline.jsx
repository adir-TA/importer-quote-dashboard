import React from 'react';
import { Check } from 'lucide-react';

const STATUSES = [
  { key: 'pending', label: 'Pending', color: '#f59e0b' },
  { key: 'deposit', label: 'Deposit', color: '#3b82f6' },
  { key: 'production', label: 'Production', color: '#8b5cf6' },
  { key: 'qc', label: 'QC', color: '#06b6d4' },
  { key: 'shipped', label: 'Shipped', color: '#10b981' },
  { key: 'delivered', label: 'Delivered', color: '#10b981' }
];

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
                  backgroundColor: isCompleted ? step.color : undefined,
                  borderColor: isCurrent ? step.color : undefined,
                  color: isCurrent ? step.color : undefined,
                  width: size === 'small' ? '24px' : '28px',
                  height: size === 'small' ? '24px' : '28px'
                }}
              >
                {isCompleted ? <Check size={14} /> : (idx + 1)}
              </div>
              {size !== 'small' && (
                <span className="timeline-label" style={{ color: isCurrent ? step.color : undefined }}>
                  {step.label}
                </span>
              )}
            </div>
            {idx < STATUSES.length - 1 && (
              <div
                className={`timeline-line ${isCompleted ? 'completed' : ''}`}
                style={{ backgroundColor: isCompleted ? STATUSES[idx + 1].color : undefined }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Status badge component
function StatusBadge({ status }) {
  const statusConfig = STATUSES.find(s => s.key === status) || STATUSES[0];
  
  return (
    <span
      className="status-badge"
      style={{
        backgroundColor: `${statusConfig.color}20`,
        color: statusConfig.color
      }}
    >
      {statusConfig.label}
    </span>
  );
}

export { OrderTimeline, StatusBadge, STATUSES };
export default OrderTimeline;
