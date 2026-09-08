// ============================================
// CURRENCY CONVERSION & FORMATTING
// ============================================
// Quotes arrive in whatever currency the supplier used. Before this module,
// the comparison and landed-cost pages sorted, summed and displayed raw
// numbers as if they were all USD, so a CNY quote was ranked against a USD
// quote and then labelled "$". Every cross-quote comparison must go through
// convertAmount() first.

// Rates are expressed as "how many units of this currency equal 1 USD".
// They are a starting point, not a live feed - users override them in
// Settings, and the UI is explicit that they are manual.
export const DEFAULT_FX_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CNY: 7.24,
  RMB: 7.24, // Alias frequently used on Chinese quotes
  ILS: 3.67,
  JPY: 149.5,
  HKD: 7.82,
  INR: 83.2,
  KRW: 1360,
};

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'ILS', 'JPY', 'HKD', 'INR', 'KRW'];

const CURRENCY_SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  RMB: '¥',
  ILS: '₪',
  JPY: '¥',
  HKD: 'HK$',
  INR: '₹',
  KRW: '₩',
};

// Currencies conventionally written without decimal places
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW']);

/** Normalise a currency code. Returns 'USD' for anything unrecognisable. */
export function normalizeCurrency(currency) {
  if (!currency || typeof currency !== 'string') return 'USD';
  const code = currency.trim().toUpperCase();
  if (code === 'RMB') return 'CNY';
  return code || 'USD';
}

/** Look up a rate, falling back to the defaults and finally to null. */
export function getRate(currency, rates = DEFAULT_FX_RATES) {
  const code = normalizeCurrency(currency);
  const rate = rates?.[code] ?? DEFAULT_FX_RATES[code];
  return typeof rate === 'number' && rate > 0 ? rate : null;
}

/** True when we can convert between both currencies with the rates we have. */
export function canConvert(from, to, rates = DEFAULT_FX_RATES) {
  return getRate(from, rates) !== null && getRate(to, rates) !== null;
}

/**
 * Convert an amount between currencies.
 * Returns null (never a silently wrong number) when a rate is missing, so
 * callers can show "rate unavailable" instead of comparing bad values.
 */
export function convertAmount(amount, from, to, rates = DEFAULT_FX_RATES) {
  const value = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(value)) return null;

  const fromCode = normalizeCurrency(from);
  const toCode = normalizeCurrency(to);
  if (fromCode === toCode) return value;

  const fromRate = getRate(fromCode, rates);
  const toRate = getRate(toCode, rates);
  if (fromRate === null || toRate === null) return null;

  const usd = value / fromRate;
  return usd * toRate;
}

/**
 * Format an amount in its own currency.
 * Unlike the old helpers, the currency code actually drives the symbol -
 * they hardcoded 'USD' and mislabelled every non-USD quote.
 */
export function formatCurrency(amount, currency = 'USD') {
  const code = normalizeCurrency(currency);
  const value = typeof amount === 'number' ? amount : parseFloat(amount);

  if (!Number.isFinite(value)) return '—';

  const digits = ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    // Intl throws on codes it does not know (e.g. a typo in a quote)
    const symbol = CURRENCY_SYMBOLS[code] || `${code} `;
    return `${symbol}${value.toFixed(digits)}`;
  }
}

/**
 * Format an amount converted into the base currency, annotating it with the
 * original when a conversion actually happened.
 */
export function formatConverted(amount, from, base, rates = DEFAULT_FX_RATES) {
  const fromCode = normalizeCurrency(from);
  const baseCode = normalizeCurrency(base);

  if (fromCode === baseCode) return formatCurrency(amount, baseCode);

  const converted = convertAmount(amount, fromCode, baseCode, rates);
  if (converted === null) {
    // Be explicit rather than pretending the number is in the base currency
    return `${formatCurrency(amount, fromCode)} (no ${baseCode} rate)`;
  }

  return `${formatCurrency(converted, baseCode)} (${formatCurrency(amount, fromCode)})`;
}

/** Number formatting for unit counts. */
export function formatNumber(num) {
  const value = typeof num === 'number' ? num : parseFloat(num);
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

export default {
  DEFAULT_FX_RATES,
  SUPPORTED_CURRENCIES,
  normalizeCurrency,
  getRate,
  canConvert,
  convertAmount,
  formatCurrency,
  formatConverted,
  formatNumber,
};
