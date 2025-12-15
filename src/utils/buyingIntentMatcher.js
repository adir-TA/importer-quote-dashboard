/**
 * Buying Intent Auto-Matching Utility
 *
 * Deterministic matching algorithm to auto-suggest which Buying Intent
 * a quote line item belongs to, with confidence scoring.
 *
 * NO AI/embeddings - pure rule-based matching for speed and transparency.
 */

// ============================================
// DIMENSION PARSING & COMPARISON
// ============================================

/**
 * Parse dimension string like "225×175×42" or "225x175x42mm" or "225*175*42"
 * Returns { length, width, height } in mm, or null if unparseable
 */
function parseDimensions(dimStr) {
  if (!dimStr) return null;

  // Remove units and normalize separators
  const cleaned = dimStr
    .toLowerCase()
    .replace(/mm|cm|inch|"/g, '')
    .replace(/\s+/g, '')
    .trim();

  // Try common separators: ×, x, *, -
  const patterns = [
    /(\d+\.?\d*)[×x*\-](\d+\.?\d*)[×x*\-](\d+\.?\d*)/,
    /(\d+\.?\d*)\s*[×x*\-]\s*(\d+\.?\d*)\s*[×x*\-]\s*(\d+\.?\d*)/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      return {
        length: parseFloat(match[1]),
        width: parseFloat(match[2]),
        height: parseFloat(match[3]),
      };
    }
  }

  return null;
}

/**
 * Compare two dimension objects
 * Returns { match: boolean, delta: number, explanation: string }
 */
function compareDimensions(dims1, dims2, toleranceMm = 2) {
  if (!dims1 || !dims2) {
    return { match: false, delta: Infinity, explanation: 'Missing dimensions' };
  }

  // Sort dimensions to handle orientation differences (e.g., 225×175 vs 175×225)
  const sorted1 = [dims1.length, dims1.width, dims1.height].sort((a, b) => a - b);
  const sorted2 = [dims2.length, dims2.width, dims2.height].sort((a, b) => a - b);

  // Calculate deltas
  const deltas = sorted1.map((d, i) => Math.abs(d - sorted2[i]));
  const maxDelta = Math.max(...deltas);

  if (maxDelta === 0) {
    return { match: true, delta: 0, explanation: 'Exact match' };
  } else if (maxDelta <= toleranceMm) {
    return { match: true, delta: maxDelta, explanation: `Within ±${maxDelta.toFixed(1)}mm` };
  } else {
    return { match: false, delta: maxDelta, explanation: `Off by ${maxDelta.toFixed(1)}mm` };
  }
}

// ============================================
// WEIGHT COMPARISON
// ============================================

/**
 * Parse weight string and convert to grams
 * Handles: "50g", "50", "0.05kg", etc.
 */
function parseWeight(weightStr) {
  if (!weightStr) return null;

  const cleaned = String(weightStr).toLowerCase().replace(/\s+/g, '');

  // Try kg
  const kgMatch = cleaned.match(/(\d+\.?\d*)kg/);
  if (kgMatch) {
    return parseFloat(kgMatch[1]) * 1000; // Convert to grams
  }

  // Try grams
  const gMatch = cleaned.match(/(\d+\.?\d*)g/);
  if (gMatch) {
    return parseFloat(gMatch[1]);
  }

  // Plain number - assume grams
  const num = parseFloat(cleaned);
  if (!isNaN(num)) {
    return num;
  }

  return null;
}

/**
 * Compare two weights in grams
 */
function compareWeights(weight1, weight2, toleranceG = 1) {
  if (!weight1 || !weight2) {
    return { match: false, delta: Infinity, explanation: 'Missing weight' };
  }

  const delta = Math.abs(weight1 - weight2);

  if (delta === 0) {
    return { match: true, delta: 0, explanation: 'Exact match' };
  } else if (delta <= toleranceG) {
    return { match: true, delta, explanation: `Within ±${delta.toFixed(1)}g` };
  } else {
    return { match: false, delta, explanation: `Off by ${delta.toFixed(1)}g` };
  }
}

// ============================================
// STRING SIMILARITY
// ============================================

/**
 * Simple Levenshtein distance for name comparison
 */
function levenshtein(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const costs = [];

  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }

  return costs[s2.length];
}

/**
 * Calculate string similarity (0-100%)
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 100;

  const distance = levenshtein(longer, shorter);
  return ((longer.length - distance) / longer.length) * 100;
}

// ============================================
// CATEGORY/MATERIAL MATCHING
// ============================================

/**
 * Extract material keywords from text
 */
function extractMaterialKeywords(text) {
  if (!text) return [];

  const materials = [
    'aluminum', 'aluminium', 'plastic', 'glass', 'paper', 'cardboard',
    'steel', 'stainless', 'wood', 'bamboo', 'silicone', 'ceramic'
  ];

  const lower = text.toLowerCase();
  return materials.filter(m => lower.includes(m));
}

/**
 * Compare materials/categories
 */
function compareMaterials(text1, text2) {
  const keywords1 = extractMaterialKeywords(text1);
  const keywords2 = extractMaterialKeywords(text2);

  if (keywords1.length === 0 || keywords2.length === 0) {
    return { match: false, explanation: 'No material keywords found' };
  }

  const commonKeywords = keywords1.filter(k => keywords2.includes(k));

  if (commonKeywords.length > 0) {
    return { match: true, explanation: `Material: ${commonKeywords.join(', ')}` };
  }

  return { match: false, explanation: 'Different materials' };
}

// ============================================
// MAIN MATCHING FUNCTION
// ============================================

/**
 * Calculate match confidence between a line item and a buying intent
 *
 * @param {Object} lineItem - Quote line item with raw_item_name, product_dimensions_text, weight_g
 * @param {Object} buyingIntent - Buying intent with name, description
 * @returns {Object} - { confidence: 0-100, breakdown: {}, autoSelect: boolean }
 */
export function calculateMatchConfidence(lineItem, buyingIntent) {
  const breakdown = {
    dimensions: { score: 0, weight: 40, detail: null },
    weight: { score: 0, weight: 25, detail: null },
    material: { score: 0, weight: 20, detail: null },
    name: { score: 0, weight: 15, detail: null },
  };

  // 1. DIMENSIONS (40% weight)
  const lineItemDims = parseDimensions(lineItem.product_dimensions_text || lineItem.dimensions);
  const intentDims = parseDimensions(buyingIntent.name + ' ' + (buyingIntent.description || ''));

  if (lineItemDims && intentDims) {
    const dimComparison = compareDimensions(lineItemDims, intentDims);
    breakdown.dimensions.detail = dimComparison;

    if (dimComparison.match) {
      if (dimComparison.delta === 0) {
        breakdown.dimensions.score = 100; // Exact match
      } else {
        breakdown.dimensions.score = 85; // Within tolerance
      }
    } else {
      // Partial credit based on how close
      const similarity = Math.max(0, 100 - (dimComparison.delta * 10));
      breakdown.dimensions.score = similarity;
    }
  }

  // 2. WEIGHT (25% weight)
  const lineItemWeight = parseWeight(lineItem.weight_g);
  const intentWeight = parseWeight(buyingIntent.description); // Assume weight might be in description

  if (lineItemWeight && intentWeight) {
    const weightComparison = compareWeights(lineItemWeight, intentWeight);
    breakdown.weight.detail = weightComparison;

    if (weightComparison.match) {
      if (weightComparison.delta === 0) {
        breakdown.weight.score = 100;
      } else {
        breakdown.weight.score = 85;
      }
    } else {
      const similarity = Math.max(0, 100 - (weightComparison.delta * 5));
      breakdown.weight.score = similarity;
    }
  }

  // 3. MATERIAL/CATEGORY (20% weight)
  const lineItemText = (lineItem.raw_item_name || lineItem.productName || '') + ' ' + (lineItem.product_dimensions_text || '');
  const intentText = buyingIntent.name + ' ' + (buyingIntent.description || '') + ' ' + (buyingIntent.category || '');

  const materialComparison = compareMaterials(lineItemText, intentText);
  breakdown.material.detail = materialComparison;
  breakdown.material.score = materialComparison.match ? 100 : 0;

  // 4. NAME SIMILARITY (15% weight)
  const nameSimilarity = stringSimilarity(
    lineItem.raw_item_name || lineItem.productName || '',
    buyingIntent.name
  );
  breakdown.name.score = nameSimilarity;
  breakdown.name.detail = { similarity: nameSimilarity.toFixed(1) + '%' };

  // Calculate weighted confidence
  let totalConfidence = 0;
  let totalWeight = 0;

  Object.values(breakdown).forEach(component => {
    totalConfidence += (component.score * component.weight) / 100;
    totalWeight += component.weight;
  });

  const confidence = (totalConfidence / totalWeight) * 100;

  // Determine confidence level
  let confidenceLevel;
  if (confidence >= 85) {
    confidenceLevel = 'high';
  } else if (confidence >= 60) {
    confidenceLevel = 'medium';
  } else {
    confidenceLevel = 'low';
  }

  return {
    confidence: Math.round(confidence),
    confidenceLevel,
    breakdown,
    autoSelect: confidence >= 85,
  };
}

/**
 * Find best matching Buying Intent for a line item
 *
 * @param {Object} lineItem - Quote line item
 * @param {Array} buyingIntents - Array of buying intents
 * @returns {Object|null} - { intent, matchResult } or null if no good match
 */
export function findBestMatch(lineItem, buyingIntents) {
  if (!buyingIntents || buyingIntents.length === 0) return null;

  let bestMatch = null;
  let highestConfidence = 0;

  buyingIntents.forEach(intent => {
    const matchResult = calculateMatchConfidence(lineItem, intent);

    if (matchResult.confidence > highestConfidence) {
      highestConfidence = matchResult.confidence;
      bestMatch = { intent, matchResult };
    }
  });

  // Only return if confidence is above minimum threshold (50%)
  if (bestMatch && bestMatch.matchResult.confidence >= 50) {
    return bestMatch;
  }

  return null;
}

// Export helper functions for testing
export {
  parseDimensions,
  compareDimensions,
  parseWeight,
  compareWeights,
  stringSimilarity,
  extractMaterialKeywords,
  compareMaterials,
};
