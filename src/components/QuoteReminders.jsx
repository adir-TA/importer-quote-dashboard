import React, { useMemo } from 'react';
import { Clock, RefreshCw, AlertCircle, ChevronRight } from 'lucide-react';

function QuoteReminders({ quotes, products, onRequestQuote }) {
  const reminders = useMemo(() => {
    const now = new Date();
    const reminderList = [];

    // Group quotes by product to find the most recent quote per product
    const productQuotes = {};
    quotes.forEach(quote => {
      const productId = quote.product_id || quote.productId;
      const quoteDate = new Date(quote.created_at || quote.createdAt);
      
      if (!productQuotes[productId] || quoteDate > productQuotes[productId].date) {
        productQuotes[productId] = {
          date: quoteDate,
          quote,
        };
      }
    });

    // Check each product's most recent quote
    products.forEach(product => {
      const lastQuoteInfo = productQuotes[product.id];
      
      if (!lastQuoteInfo) {
        // Product has no quotes
        reminderList.push({
          id: product.id,
          type: 'no-quotes',
          productName: product.name,
          productId: product.id,
          message: 'No quotes yet',
          priority: 'high',
          daysAgo: null,
        });
        return;
      }

      const daysSinceQuote = Math.floor((now - lastQuoteInfo.date) / (1000 * 60 * 60 * 24));
      
      if (daysSinceQuote >= 90) {
        reminderList.push({
          id: product.id,
          type: 'stale',
          productName: product.name,
          productId: product.id,
          message: `Last quote ${daysSinceQuote} days ago`,
          priority: 'high',
          daysAgo: daysSinceQuote,
        });
      } else if (daysSinceQuote >= 60) {
        reminderList.push({
          id: product.id,
          type: 'aging',
          productName: product.name,
          productId: product.id,
          message: `Last quote ${daysSinceQuote} days ago`,
          priority: 'medium',
          daysAgo: daysSinceQuote,
        });
      } else if (daysSinceQuote >= 30) {
        reminderList.push({
          id: product.id,
          type: 'upcoming',
          productName: product.name,
          productId: product.id,
          message: `Last quote ${daysSinceQuote} days ago`,
          priority: 'low',
          daysAgo: daysSinceQuote,
        });
      }
    });

    // Sort by priority (high first) then by days
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return reminderList.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return (b.daysAgo || 999) - (a.daysAgo || 999);
    });
  }, [quotes, products]);

  if (reminders.length === 0) {
    return (
      <div className="quote-reminders empty">
        <Clock size={24} color="var(--success)" />
        <p>All quotes are up to date!</p>
        <span>Your quotes are less than 30 days old</span>
      </div>
    );
  }

  const getPriorityStyles = (priority) => {
    switch (priority) {
      case 'high':
        return { bg: 'var(--error-light)', color: 'var(--error)', icon: AlertCircle };
      case 'medium':
        return { bg: 'var(--warning-light)', color: 'var(--warning)', icon: Clock };
      default:
        return { bg: 'var(--info-light)', color: 'var(--info)', icon: RefreshCw };
    }
  };

  return (
    <div className="quote-reminders">
      {reminders.slice(0, 5).map(reminder => {
        const styles = getPriorityStyles(reminder.priority);
        const IconComponent = styles.icon;
        
        return (
          <div key={reminder.id} className="reminder-item" style={{ '--priority-color': styles.color, '--priority-bg': styles.bg }}>
            <div className="reminder-icon" style={{ background: styles.bg }}>
              <IconComponent size={18} color={styles.color} />
            </div>
            <div className="reminder-content">
              <div className="reminder-product">{reminder.productName}</div>
              <div className="reminder-message">{reminder.message}</div>
            </div>
            <button 
              className="reminder-action"
              onClick={() => onRequestQuote?.(reminder.productId)}
            >
              Request Quote <ChevronRight size={16} />
            </button>
          </div>
        );
      })}
      
      {reminders.length > 5 && (
        <div className="reminders-more">
          +{reminders.length - 5} more products need requoting
        </div>
      )}
    </div>
  );
}

export default QuoteReminders;
