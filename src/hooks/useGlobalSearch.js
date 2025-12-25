import { useMemo } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Global search hook - searches across all entities
 * Returns grouped results sorted by relevance (starts-with > contains > recency)
 */
export function useGlobalSearch(query) {
  const { products, quotes, suppliers, documents, businessCards } = useApp();

  const results = useMemo(() => {
    if (!query || query.trim().length === 0) {
      return {
        suppliers: [],
        products: [],
        quotes: [],
        documents: [],
        businessCards: [],
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
        const companyScore = getRelevanceScore(supplier.company, 'primary');
        const notesScore = getRelevanceScore(supplier.notes, 'secondary');
        const contactScore = getRelevanceScore(supplier.contact_person, 'secondary');
        const score = Math.max(companyScore, notesScore, contactScore);

        return {
          type: 'supplier',
          id: supplier.id,
          title: supplier.company,
          subtitle: supplier.contact_person || 'No contact',
          metadata: supplier.country || '',
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
    const quoteResults = quotes
      .map(quote => {
        const supplierScore = getRelevanceScore(quote.supplierName || quote.supplier_name, 'primary');
        const productScore = getRelevanceScore(quote.product_name, 'primary');
        const refScore = getRelevanceScore(quote.reference_number, 'secondary');
        const score = Math.max(supplierScore, productScore, refScore);

        return {
          type: 'quote',
          id: quote.id,
          title: `${quote.supplierName || quote.supplier_name || 'Unknown'} - ${quote.product_name || 'Unknown product'}`,
          subtitle: quote.reference_number ? `Ref: ${quote.reference_number}` : '',
          metadata: quote.unitPrice ? `${quote.currency || 'USD'} ${quote.unitPrice}` : '',
          score,
          data: quote
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Search documents
    const documentResults = documents
      .map(doc => {
        const filenameScore = getRelevanceScore(doc.filename, 'primary');
        const supplierScore = getRelevanceScore(doc.supplier_name, 'secondary');
        const typeScore = getRelevanceScore(doc.type, 'secondary');
        const score = Math.max(filenameScore, supplierScore, typeScore);

        return {
          type: 'document',
          id: doc.id,
          title: doc.filename,
          subtitle: doc.supplier_name || 'No supplier',
          metadata: doc.type || 'File',
          score,
          data: doc
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Search business cards
    const businessCardResults = businessCards
      .map(card => {
        const displayNameScore = getRelevanceScore(card.display_name, 'primary');
        const companyScore = getRelevanceScore(card.company_name, 'primary');
        const contactScore = getRelevanceScore(card.contact_person, 'secondary');
        const phoneScore = getRelevanceScore(card.phone, 'secondary');
        const emailScore = getRelevanceScore(card.email, 'secondary');
        const score = Math.max(displayNameScore, companyScore, contactScore, phoneScore, emailScore);

        return {
          type: 'businessCard',
          id: card.id,
          title: card.display_name || card.company_name,
          subtitle: card.company_name !== card.display_name ? card.company_name : (card.contact_person || ''),
          metadata: card.phone || card.email || '',
          score,
          data: card
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const total =
      supplierResults.length +
      productResults.length +
      quoteResults.length +
      documentResults.length +
      businessCardResults.length;

    return {
      suppliers: supplierResults,
      products: productResults,
      quotes: quoteResults,
      documents: documentResults,
      businessCards: businessCardResults,
      total
    };
  }, [query, products, quotes, suppliers, documents, businessCards]);

  return results;
}
