/**
 * Auto-naming utility for draft Buying Intents
 * Generates temporary names for auto-created Buying Intents
 */

/**
 * Clean and shorten supplier name
 * Removes legal suffixes and extra words
 */
function cleanSupplierName(supplierName) {
  if (!supplierName) return 'Unknown';

  // Remove common legal suffixes
  let cleaned = supplierName
    .replace(/\s+(CO\.,?\s*LTD\.?|LIMITED|LTD\.?|INC\.?|CORP\.?|LLC|PTE\.?\s*LTD\.?|GMBH)$/i, '')
    .replace(/\s+PRODUCTS\s+(CO\.,?\s*LTD\.?)?$/i, '')
    .trim();

  // If still too long, take first significant word or first 2 words
  if (cleaned.length > 25) {
    const words = cleaned.split(/\s+/);
    cleaned = words.slice(0, 2).join(' ');
  }

  return cleaned;
}

/**
 * Extract clean product name
 * Removes SKUs, excessive details
 */
function cleanProductName(rawName) {
  if (!rawName) return 'Product';

  // Remove SKU patterns like "LS-N22542", "SKU: XXX", etc.
  let cleaned = rawName
    .replace(/\s*-\s*[A-Z]{1,3}-?[A-Z0-9]{4,10}\s*-?\s*/gi, ' ')
    .replace(/\s*SKU:?\s*[A-Z0-9-]+\s*/gi, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ') // Remove parenthetical info
    .replace(/\s+/g, ' ')
    .trim();

  // Remove duplicate dimension patterns
  const dimPattern = /\d+\s*[×x]\s*\d+\s*[×x]\s*\d+\s*mm/gi;
  const matches = cleaned.match(dimPattern);
  if (matches && matches.length > 1) {
    // Keep only first dimension occurrence
    cleaned = cleaned.replace(dimPattern, (match, offset) => {
      return offset === cleaned.search(dimPattern) ? match : '';
    }).replace(/\s+/g, ' ').trim();
  }

  // If too long, take first 40 chars
  if (cleaned.length > 40) {
    cleaned = cleaned.substring(0, 40).trim() + '...';
  }

  return cleaned;
}

/**
 * Generate an automatic name for a draft Buying Intent
 * Format: "{product_name} ({dimensions})"
 * Clean, short, and organized
 *
 * @param {Object} supplierQuote - The supplier quote object
 * @param {string} supplierQuote.supplierName - Supplier company name
 * @param {Object} lineItem - Line item data for specific naming
 * @param {string} lineItem.productName - Product name from quote
 * @param {string} lineItem.dimensions - Product dimensions
 * @param {number} lineItem.weight_g - Product weight in grams
 * @returns {string} Auto-generated name
 */
export function generateAutoName(supplierQuote, lineItem = null) {
  const supplierName = supplierQuote?.supplierName || supplierQuote?.supplier_name || 'Unknown';

  // If we have line item details, create a descriptive name
  if (lineItem) {
    const rawProductName = lineItem.productName || lineItem.raw_item_name;
    const productName = cleanProductName(rawProductName);
    const dimensions = lineItem.dimensions || lineItem.product_dimensions_text;

    // Build clean name
    let name = productName;

    // Add dimensions in parentheses if available
    if (dimensions) {
      name += ` (${dimensions})`;
    }

    return name;
  }

  // Fallback to supplier-based name
  const cleanSupplier = cleanSupplierName(supplierName);
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return `${cleanSupplier} – ${date}`;
}

/**
 * Generate a detailed description for auto-created Buying Intent
 * Includes all available details from the quote in organized format
 *
 * @param {Object} supplierQuote - The supplier quote object
 * @param {Object} lineItem - Line item data
 * @returns {string} Rich description with all details
 */
export function generateAutoDescription(supplierQuote, lineItem) {
  const lines = [];

  // Header
  const supplierName = cleanSupplierName(supplierQuote?.supplierName || 'Unknown supplier');
  lines.push(`📦 Auto-created from: ${supplierName}`);
  lines.push('');

  // Product specs
  const specs = [];

  if (lineItem.sku) {
    specs.push(`• SKU: ${lineItem.sku}`);
  }

  if (lineItem.dimensions || lineItem.product_dimensions_text) {
    specs.push(`• Size: ${lineItem.dimensions || lineItem.product_dimensions_text}`);
  }

  if (lineItem.weight_g) {
    const kg = (lineItem.weight_g / 1000).toFixed(2);
    specs.push(`• Weight: ${kg}kg (${lineItem.weight_g}g)`);
  }

  if (specs.length > 0) {
    lines.push('SPECIFICATIONS');
    lines.push(...specs);
    lines.push('');
  }

  // Pricing & order info
  const pricing = [];

  if (lineItem.unitPrice) {
    const currency = supplierQuote.currency || 'USD';
    pricing.push(`• Price: ${currency} ${lineItem.unitPrice}`);
  }

  if (lineItem.moq) {
    pricing.push(`• MOQ: ${lineItem.moq} units`);
  }

  if (pricing.length > 0) {
    lines.push('PRICING');
    lines.push(...pricing);
    lines.push('');
  }

  // Packing details
  const packing = [];

  if (lineItem.packing_pcs_per_ctn) {
    packing.push(`• Packing: ${lineItem.packing_pcs_per_ctn} pcs/carton`);
  }

  if (lineItem.carton_length_cm && lineItem.carton_width_cm && lineItem.carton_height_cm) {
    packing.push(`• Carton: ${lineItem.carton_length_cm}×${lineItem.carton_width_cm}×${lineItem.carton_height_cm}cm`);
  }

  if (lineItem.cbm_per_carton) {
    packing.push(`• CBM: ${lineItem.cbm_per_carton} m³/carton`);
  }

  if (packing.length > 0) {
    lines.push('PACKING');
    lines.push(...packing);
  }

  return lines.join('\n');
}

/**
 * Check if a Buying Intent name is auto-generated
 * @param {string} name - The Buying Intent name to check
 * @returns {boolean} True if the name appears to be auto-generated
 */
export function isAutoGeneratedName(name) {
  if (!name) return false;
  return name.startsWith('Auto – Supplier ');
}

/**
 * Extract supplier name from an auto-generated name
 * @param {string} name - Auto-generated name
 * @returns {string|null} Supplier name or null if not auto-generated
 */
export function extractSupplierFromAutoName(name) {
  if (!isAutoGeneratedName(name)) return null;

  const match = name.match(/^Auto – Supplier (.+?) – \d{4}-\d{2}-\d{2}$/);
  return match ? match[1] : null;
}
