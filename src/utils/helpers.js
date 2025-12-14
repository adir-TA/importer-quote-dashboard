// Format date for display
export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Format currency
export function formatCurrency(amount, currency = 'USD') {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  
  const symbols = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CNY: '¥',
    ILS: '₪'
  };
  
  const symbol = symbols[currency] || currency + ' ';
  return symbol + num.toFixed(2);
}

// Parse price from string
export function parsePrice(priceString) {
  if (!priceString) return 0;
  const cleaned = String(priceString).replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

// Generate unique ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Escape HTML
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Truncate text
export function truncate(text, maxLength = 50) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// Sort array by key
export function sortBy(array, key, direction = 'asc') {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

// Filter array by search term
export function filterBySearch(array, searchTerm, fields) {
  if (!searchTerm) return array;
  const term = searchTerm.toLowerCase();
  
  return array.filter(item => 
    fields.some(field => {
      const value = item[field];
      if (!value) return false;
      return String(value).toLowerCase().includes(term);
    })
  );
}

// Group array by key
export function groupBy(array, key) {
  return array.reduce((groups, item) => {
    const value = item[key] || 'Other';
    if (!groups[value]) groups[value] = [];
    groups[value].push(item);
    return groups;
  }, {});
}

// Deep clone object
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Debounce function
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Get file icon based on extension
export function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📕',
    xlsx: '📊',
    xls: '📊',
    csv: '📊',
    doc: '📘',
    docx: '📘',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️'
  };
  return icons[ext] || '📄';
}

// Calculate order status index
export function getStatusIndex(status) {
  const statuses = ['pending', 'deposit', 'production', 'qc', 'shipped', 'delivered'];
  return statuses.indexOf(status);
}

// Get status color
export function getStatusColor(status) {
  const colors = {
    pending: '#f59e0b',
    deposit: '#3b82f6',
    production: '#8b5cf6',
    qc: '#06b6d4',
    shipped: '#10b981',
    delivered: '#10b981',
    verified: '#10b981',
    warning: '#ef4444',
    blocked: '#6b7280'
  };
  return colors[status] || '#6b7280';
}

// Format file size
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Validate email
export function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Download file
export function downloadFile(content, filename, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Copy to clipboard
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

export default {
  formatDate,
  formatCurrency,
  parsePrice,
  generateId,
  escapeHtml,
  truncate,
  sortBy,
  filterBySearch,
  groupBy,
  deepClone,
  debounce,
  getFileIcon,
  getStatusIndex,
  getStatusColor,
  formatFileSize,
  isValidEmail,
  downloadFile,
  copyToClipboard
};
