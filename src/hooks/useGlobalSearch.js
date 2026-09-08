import { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useDebounce } from './useDebounce';
import { formatCurrency } from '../utils/currency';

/**
 * Global search hook - searches across all entities
 * Returns grouped results sorted by relevance (starts-with > contains > recency)
 */
export function useGlobalSearch(rawQuery) {
  const { products, quotes, suppliers, documents, allLineItems } = useApp();

  // Re-scoring the whole dataset on every keystroke was needless work
  const query = useDebounce(rawQuery, 150);

  const results = useMemo(() => {
    if (!query || query.trim().length === 0) {
      return {
        suppliers: [],
        products: [],
        quotes: [],
        documents: [],
        buyingIntentCategories: [],
        total: 0
      };
    }

    const searchTerm = query.toLowerCase().trim();

    // Helper to calculate relevance score
    const getRelevanceScore = (text, field = 'primary') => {
      if (!text) return 0;
      const lowerText = text.toLowerCase();

      // Primary fields get higher base score
      const baseScore = field === 'primary' ? 100 : 50;

      if (lowerText.startsWith(searchTerm)) return baseScore + 3;
      if (lowerText.includes(` ${searchTerm}`)) return baseScore + 2; // Word boundary
      if (lowerText.includes(searchTerm)) return baseScore + 1;
      return 0;
    };

    // Search suppliers
    const supplierResults = suppliers
      .map(supplier => {
        // The schema columns are `contact` and `email` - this used to read
        // `contact_person` and `country`, which do not exist, so contact
        // matching never worked and the subtitle was always "No contact".
        const companyScore = getRelevanceScore(supplier.company, 'primary');
        const notesScore = getRelevanceScore(supplier.notes, 'secondary');
        const contactScore = getRelevanceScore(supplier.contact, 'secondary');
        const emailScore = getRelevanceScore(supplier.email, 'secondary');
        const score = Math.max(companyScore, notesScore, contactScore, emailScore);

        return {
          type: 'supplier',
          id: supplier.id,
          title: supplier.company,
          subtitle: supplier.contact || supplier.email || 'No contact',
          metadata: supplier.status || '',
          score,
          data: supplier
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Search products (buying intents)
    const productResults = products
      .map(product => {
        const nameScore = getRelevanceScore(product.name, 'primary');
        const categoryScore = getRelevanceScore(product.category, 'secondary');
        const descScore = getRelevanceScore(product.description, 'secondary');
        const score = Math.max(nameScore, categoryScore, descScore);

        return {
          type: 'product',
          id: product.id,
          title: product.name,
          subtitle: product.category || 'No category',
          metadata: product.status || '',
          score,
          data: product
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Search quotes
    // Legacy single-item quotes. `product_name` and `reference_number` are not
    // columns on this table - resolve the intent name from products instead.
    const legacyQuoteResults = quotes
      .map(quote => {
        const supplierName = quote.supplierName || quote.supplier_name;
        const intent = products.find(p => p.id === quote.product_id);

        const supplierScore = getRelevanceScore(supplierName, 'primary');
        const productScore = getRelevanceScore(intent?.name, 'primary');
        const score = Math.max(supplierScore, productScore);

        return {
          type: 'quote',
          id: quote.id,
          title: `${supplierName || 'Unknown supplier'} — ${intent?.name || 'Unlinked'}`,
          subtitle: intent?.name || '',
          metadata: quote.unitPrice ? formatCurrency(quote.unitPrice, quote.currency) : '',
          score,
          data: quote
        };
      })
      .filter(r => r.score > 0);

    // Current multi-item quote line items. These were not searched at all,
    // even though they hold essentially every quote in the app now.
    const lineItemResults = allLineItems
      .map(item => {
        const intent = products.find(p => p.id === item.linked_buying_intent_id);

        const nameScore = getRelevanceScore(item.product_name, 'primary');
        const supplierScore = getRelevanceScore(item.supplierName, 'primary');
        const skuScore = getRelevanceScore(item.sku, 'secondary');
        const score = Math.max(nameScore, supplierScore, skuScore);

        return {
          type: 'quote',
          id: item.id,
          title: `${item.supplierName || 'Unknown supplier'} — ${item.product_name || 'Unnamed item'}`,
          subtitle: intent?.name || 'Not linked to a Buying Intent',
          metadata: item.unit_price ? formatCurrency(item.unit_price, item.currency) : '',
          score,
          data: { ...item, product_id: item.linked_buying_intent_id },
        };
      })
      .filter(r => r.score > 0);

    const quoteResults = [...lineItemResults, ...legacyQuoteResults]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Search documents
    const documentResults = documents
      .map(doc => {
        // The schema column is `file_name`, not `filename`, and there is no
        // `supplier_name` on documents. Reading the wrong names meant every
        // document scored 0 and no document was ever findable.
        const fileNameScore = getRelevanceScore(doc.file_name, 'primary');
        const typeScore = getRelevanceScore(doc.type, 'secondary');
        const score = Math.max(fileNameScore, typeScore);

        const intent = products.find(p => p.id === doc.buying_intent_id);

        return {
          type: 'document',
          id: doc.id,
          title: doc.file_name,
          subtitle: intent?.name || 'Unlinked document',
          metadata: doc.type || 'File',
          score,
          data: doc
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Search Buying Intent Categories (extract unique categories from products)
    const buyingIntentCategoryMap = new Map();
    products.forEach(product => {
      if (product.category) {
        if (!buyingIntentCategoryMap.has(product.category)) {
          buyingIntentCategoryMap.set(product.category, {
            name: product.category,
            count: 0
          });
        }
        buyingIntentCategoryMap.get(product.category).count++;
      }
    });

    const buyingIntentCategoryResults = Array.from(buyingIntentCategoryMap.values())
      .map(category => {
        const nameScore = getRelevanceScore(category.name, 'primary');

        return {
          type: 'buyingIntentCategory',
          id: category.name, // Use name as ID since categories are stored as strings
          title: category.name,
          subtitle: 'Buying Intent Category',
          metadata: `${category.count} product${category.count === 1 ? '' : 's'}`,
          score: nameScore,
          data: category
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => {
        // Sort by score first, then by count (usage)
        if (b.score !== a.score) return b.score - a.score;
        return b.data.count - a.data.count;
      })
      .slice(0, 10);

    const total =
      supplierResults.length +
      productResults.length +
      quoteResults.length +
      documentResults.length +
      buyingIntentCategoryResults.length;

    return {
      suppliers: supplierResults,
      products: productResults,
      quotes: quoteResults,
      documents: documentResults,
      buyingIntentCategories: buyingIntentCategoryResults,
      total
    };
  }, [query, products, quotes, suppliers, documents, allLineItems]);

  return results;
}
