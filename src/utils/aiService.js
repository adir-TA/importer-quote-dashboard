// ============================================
// AI SERVICE
// ============================================
// All Claude calls go through our own backend (/api/ai/complete).
//
// These functions used to POST directly to https://api.anthropic.com from the
// browser. Those requests are blocked by CORS, so every AI helper failed - and
// had they succeeded, the user's API key would have been exposed in the page.
// The backend resolves the key server-side from the authenticated user.

import API_BASE_URL from '../config/api.js';
import { fetchJson, formatApiError } from './apiHelpers.js';
import { convertAmount, getRate, normalizeCurrency, DEFAULT_FX_RATES } from './currency.js';

/**
 * Generic AI call.
 * @param {string} prompt
 * @param {{ maxTokens?: number, system?: string }} [options]
 * @returns {Promise<string>} the model's text response
 */
export async function callClaude(prompt, options = {}) {
  const { maxTokens = 2000, system } = options;

  if (!prompt || !prompt.trim()) {
    throw new Error('Nothing to send to the AI');
  }

  const result = await fetchJson(`${API_BASE_URL}/api/ai/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system, maxTokens }),
  });

  if (!result.ok) {
    throw new Error(formatApiError(result.error, result.error?.httpStatus));
  }

  if (!result.data?.text) {
    throw new Error('No response from the AI service');
  }

  return result.data.text;
}

// Generate AI Summary for quote comparison
export async function generateQuoteSummary(quotes) {
  const quoteSummary = quotes.map(q => {
    const fields = Object.entries(q.fields || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `${q.supplierName}: ${fields}`;
  }).join('\n');

  const prompt = `Analyze these supplier quotes and give me a clear recommendation:

${quoteSummary}

Provide your analysis in this EXACT format:
**BEST OPTION:** [supplier name] - [one sentence why]

**PRICE ANALYSIS:**
- [bullet point comparing prices]
- [bullet point on value]

**RISKS TO WATCH:**
- [risk 1]
- [risk 2]

**NEGOTIATION TIP:** [specific tactic to use]

**RECOMMENDATION:** [final advice in 1-2 sentences]`;

  return callClaude(prompt, { maxTokens: 1500 });
}

// Generate RFQ
export async function generateRFQ(products, companyInfo) {
  const productList = products.map(p => 
    `- ${p.name}: Quantity ${p.quantity}, Specs: ${p.specs || 'Standard'}`
  ).join('\n');

  const prompt = `Generate a professional Request for Quotation (RFQ) email for these products:

Products:
${productList}

Company: ${companyInfo.name || 'Our Company'}
${companyInfo.details || ''}

Write a professional, concise RFQ email that:
1. Is polite and professional
2. Lists all products clearly
3. Asks for: unit price, MOQ, lead time, payment terms, shipping terms
4. Mentions we're comparing multiple suppliers
5. Requests response within 3 business days`;

  return callClaude(prompt, { maxTokens: 1000 });
}

// Translate text
export async function translateText(text, targetLang) {
  const langNames = {
    en: 'English',
    zh: 'Chinese (Simplified)',
    he: 'Hebrew'
  };

  const prompt = `Translate the following text to ${langNames[targetLang] || targetLang}. 
Only provide the translation, no explanations.

Text to translate:
${text}`;

  return callClaude(prompt, { maxTokens: 2000 });
}

// Generate negotiation message
export async function generateNegotiationMessage(currentPrice, targetPrice, context) {
  const prompt = `Write a short WeChat/WhatsApp message to negotiate a better price.

Current price: ${currentPrice}
Target price: ${targetPrice}
Context: ${context || 'General negotiation'}

Rules:
- Use VERY simple English (5-10 words per sentence)
- Keep total message under 60 words
- Be friendly but professional
- Use psychology: mention competitor prices, future orders, or quick payment
- Can use 1-2 emojis like 👍 🙏
- Make it feel natural, like texting a business contact

Write ONLY the message, nothing else.`;

  return callClaude(prompt, { maxTokens: 500 });
}

// Analyze contract
export async function analyzeContract(contractText) {
  const prompt = `Analyze this supplier contract/agreement and provide a detailed assessment:

${contractText}

Provide your analysis in this EXACT format:

🔍 **CONTRACT SUMMARY**
[2-3 sentence overview]

💰 **PAYMENT TERMS**
- Deposit: [amount/percentage]
- Balance: [when due]
- Method: [payment method]
- Risk Level: [Low/Medium/High]

🚚 **DELIVERY & SHIPPING**
- Incoterm: [term]
- Lead Time: [days/weeks]
- Who pays shipping: [buyer/seller]

🛡️ **WARRANTY & QUALITY**
- Warranty Period: [duration]
- Defect Handling: [policy]
- QC Requirements: [requirements]

🚨 **RED FLAGS**
⚠️ [list any concerning clauses]

❌ **MISSING PROTECTIONS**
[list important terms NOT in the contract]

💡 **NEGOTIATION POINTS**
[specific changes to request]

✅ **FINAL VERDICT**
[Safe to sign / Needs changes / Do not sign] - [explanation]`;

  return callClaude(prompt, { maxTokens: 2500 });
}

// ============================================
// CURRENCY
// ============================================
// Delegates to the shared currency module so there is one rate table in the
// app (this file previously carried its own hardcoded copy that returned NaN
// for any currency outside its list of six).
export async function convertCurrency(amount, from, to, rates = DEFAULT_FX_RATES) {
  const converted = convertAmount(amount, from, to, rates);

  if (converted === null) {
    throw new Error(`No exchange rate available for ${from} to ${to}`);
  }

  const fromRate = getRate(from, rates);
  const toRate = getRate(to, rates);

  return {
    amount: converted,
    rate: toRate / fromRate,
    from: normalizeCurrency(from),
    to: normalizeCurrency(to),
  };
}

export default {
  callClaude,
  generateQuoteSummary,
  generateRFQ,
  translateText,
  generateNegotiationMessage,
  analyzeContract,
  convertCurrency
};
