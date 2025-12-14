// AI Service for Claude API calls

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

// Generic AI call function
export async function callClaude(prompt, apiKey, options = {}) {
  if (!apiKey) {
    throw new Error('API key is required');
  }

  const { maxTokens = 2000, system } = options;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: system,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

// Generate AI Summary for quote comparison
export async function generateQuoteSummary(quotes, apiKey) {
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

  return callClaude(prompt, apiKey, { maxTokens: 1500 });
}

// Generate RFQ
export async function generateRFQ(products, companyInfo, apiKey) {
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

  return callClaude(prompt, apiKey, { maxTokens: 1000 });
}

// Translate text
export async function translateText(text, targetLang, apiKey) {
  const langNames = {
    en: 'English',
    zh: 'Chinese (Simplified)',
    he: 'Hebrew'
  };

  const prompt = `Translate the following text to ${langNames[targetLang] || targetLang}. 
Only provide the translation, no explanations.

Text to translate:
${text}`;

  return callClaude(prompt, apiKey, { maxTokens: 2000 });
}

// Generate negotiation message
export async function generateNegotiationMessage(currentPrice, targetPrice, context, apiKey) {
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

  return callClaude(prompt, apiKey, { maxTokens: 500 });
}

// Analyze contract
export async function analyzeContract(contractText, apiKey) {
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

  return callClaude(prompt, apiKey, { maxTokens: 2500 });
}

// Currency conversion rates (simplified - in production use real API)
export async function convertCurrency(amount, from, to) {
  // Approximate rates - in production, use a real currency API
  const rates = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    CNY: 7.24,
    ILS: 3.67,
    JPY: 149.50
  };

  const usdAmount = amount / rates[from];
  const converted = usdAmount * rates[to];
  
  return {
    amount: converted,
    rate: rates[to] / rates[from],
    from,
    to
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
