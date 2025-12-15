import { useState, useCallback, useMemo } from 'react';
import { extractQuoteFromFile, wasFound, getValue } from '../utils/quoteExtractionService';
import { findBestMatch } from '../utils/buyingIntentMatcher';

// ============================================
// useMultiItemQuoteExtraction Hook
// ============================================
//
// NEW FLOW (Multi-Item):
// 1. Upload file → extract data
// 2. Show ALL line items in editable table
// 3. User edits supplier fields + line items
// 4. Save creates SupplierQuote + ALL QuoteLineItems
//
// RULES:
// - NO item selection - show all items at once
// - Inline editing for all fields
// - One "Confirm & Save" button
// - Save ALL items in one transaction
// ============================================

export function useMultiItemQuoteExtraction(apiKey, buyingIntents = []) {
  // ============================================
  // STATE
  // ============================================

  // Flow: 'idle' | 'extracting' | 'review' | 'error'
  const [step, setStep] = useState('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);

  // Extraction result
  const [extraction, setExtraction] = useState(null);

  // Supplier-level editable fields
  const [supplierFields, setSupplierFields] = useState({
    supplierName: '',
    supplierContact: '',
    supplierEmail: '',
    currency: 'USD',
    incoterm: '',
    quoteDate: '',
    validUntil: '',
    paymentTerms: '',
    leadTime: '',
    notes: '',
  });

  // Line items with editable fields (array of objects)
  const [editableLineItems, setEditableLineItems] = useState([]);

  // ============================================
  // COMPUTED
  // ============================================

  // Validation: which supplier fields are missing?
  const missingSupplierFields = useMemo(() => {
    const missing = [];
    if (!supplierFields.supplierName?.trim()) missing.push('supplierName');
    if (!supplierFields.incoterm?.trim()) missing.push('incoterm');
    return missing;
  }, [supplierFields]);

  // Validation: which line items have invalid data?
  const invalidLineItems = useMemo(() => {
    return editableLineItems.map((item, index) => {
      const errors = [];
      if (!item.productName?.trim()) errors.push('productName');
      if (!item.unitPrice || parseFloat(item.unitPrice) <= 0) errors.push('unitPrice');
      return { index, errors };
    }).filter(item => item.errors.length > 0);
  }, [editableLineItems]);

  const canSave = useMemo(() => {
    return (
      missingSupplierFields.length === 0 &&
      invalidLineItems.length === 0 &&
      editableLineItems.length > 0
    );
  }, [missingSupplierFields, invalidLineItems, editableLineItems]);

  // ============================================
  // ACTIONS
  // ============================================

  /**
   * Process uploaded file
   */
  const processFile = useCallback(async (file) => {
    if (!file) return;

    setError(null);
    setExtraction(null);
    setEditableLineItems([]);
    setSupplierFields({
      supplierName: '',
      supplierContact: '',
      supplierEmail: '',
      currency: 'USD',
      incoterm: '',
      quoteDate: '',
      validUntil: '',
      paymentTerms: '',
      leadTime: '',
      notes: '',
    });

    setStep('extracting');
    setProgress('Reading file...');

    try {
      setProgress('Extracting quote data...');
      const result = await extractQuoteFromFile(file, apiKey);

      if (!result.success) {
        setError(result.error);
        setStep('error');
        return;
      }

      setExtraction(result);

      // Pre-fill supplier fields
      setSupplierFields({
        supplierName: getValue(result.supplierName) || '',
        supplierContact: getValue(result.supplierContact) || '',
        supplierEmail: getValue(result.supplierEmail) || '',
        currency: getValue(result.currency) || 'USD',
        incoterm: getValue(result.incoterm) || '',
        quoteDate: getValue(result.quoteDate) || '',
        validUntil: getValue(result.validUntil) || '',
        paymentTerms: getValue(result.paymentTerms) || '',
        leadTime: getValue(result.leadTime) || '',
        notes: getValue(result.notes) || '',
      });

      // Pre-fill ALL line items as editable + AUTO-MATCH to Buying Intents
      const items = (result.lineItems || []).map((item, index) => {
        const lineItemData = {
          id: item.id || `item-${index}`,
          productName: getValue(item.productName) || '',
          sku: getValue(item.sku) || '',
          unitPrice: getValue(item.unitPrice) !== null ? String(getValue(item.unitPrice)) : '',
          priceConfidence: item.unitPrice?.confidence || null,
          moq: getValue(item.moq) !== null ? String(getValue(item.moq)) : '',
          dimensions: getValue(item.dimensions) || '',
          weight_g: getValue(item.weight_g) !== null ? String(getValue(item.weight_g)) : '',
          packing_pcs_per_ctn: getValue(item.packing_pcs_per_ctn) !== null ? String(getValue(item.packing_pcs_per_ctn)) : '',
          carton_length_cm: getValue(item.carton_length_cm) !== null ? String(getValue(item.carton_length_cm)) : '',
          carton_width_cm: getValue(item.carton_width_cm) !== null ? String(getValue(item.carton_width_cm)) : '',
          carton_height_cm: getValue(item.carton_height_cm) !== null ? String(getValue(item.carton_height_cm)) : '',
          cbm_per_carton: getValue(item.cbm_per_carton) !== null ? String(getValue(item.cbm_per_carton)) : '',
          linkedBuyingIntentId: null, // Will be auto-matched
          matchConfidence: null,
          matchBreakdown: null,
        };

        // AUTO-MATCH to Buying Intent
        if (buyingIntents && buyingIntents.length > 0) {
          const bestMatch = findBestMatch(lineItemData, buyingIntents);
          if (bestMatch) {
            lineItemData.linkedBuyingIntentId = bestMatch.intent.id;
            lineItemData.matchConfidence = bestMatch.matchResult.confidence;
            lineItemData.matchConfidenceLevel = bestMatch.matchResult.confidenceLevel;
            lineItemData.matchBreakdown = bestMatch.matchResult.breakdown;
            lineItemData.autoMatched = bestMatch.matchResult.autoSelect;
          }
        }

        return lineItemData;
      });

      setEditableLineItems(items);
      setStep('review');

    } catch (err) {
      console.error('[useMultiItemQuoteExtraction] Error:', err);
      setError(err.message || 'Failed to process file');
      setStep('error');
    }
  }, [apiKey]);

  /**
   * Update supplier field
   */
  const updateSupplierField = useCallback((field, value) => {
    setSupplierFields(prev => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Update line item field
   */
  const updateLineItem = useCallback((index, field, value) => {
    setEditableLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  /**
   * Delete line item
   */
  const deleteLineItem = useCallback((index) => {
    setEditableLineItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Get final quote data for saving
   * Returns: { supplierQuote, lineItems } or null if invalid
   */
  const getQuoteData = useCallback(() => {
    if (!canSave) return null;

    return {
      supplierQuote: {
        ...supplierFields,
        fileName: extraction?.fileName,
        fileType: extraction?.fileType,
      },
      lineItems: editableLineItems.map(item => ({
        productName: item.productName,
        sku: item.sku || null,
        unitPrice: parseFloat(item.unitPrice),
        priceUnit: 'per pc',
        priceConfidence: item.priceConfidence,
        moq: item.moq ? parseInt(item.moq) : null,
        dimensions: item.dimensions || null,
        weight_g: item.weight_g ? parseInt(item.weight_g) : null,
        packing_pcs_per_ctn: item.packing_pcs_per_ctn ? parseInt(item.packing_pcs_per_ctn) : null,
        carton_length_cm: item.carton_length_cm ? parseFloat(item.carton_length_cm) : null,
        carton_width_cm: item.carton_width_cm ? parseFloat(item.carton_width_cm) : null,
        carton_height_cm: item.carton_height_cm ? parseFloat(item.carton_height_cm) : null,
        cbm_per_carton: item.cbm_per_carton ? parseFloat(item.cbm_per_carton) : null,
        linkedBuyingIntentId: item.linkedBuyingIntentId,
      })),
    };
  }, [canSave, supplierFields, editableLineItems, extraction]);

  /**
   * Reset everything
   */
  const reset = useCallback(() => {
    setStep('idle');
    setProgress('');
    setError(null);
    setExtraction(null);
    setEditableLineItems([]);
    setSupplierFields({
      supplierName: '',
      supplierContact: '',
      supplierEmail: '',
      currency: 'USD',
      incoterm: '',
      quoteDate: '',
      validUntil: '',
      paymentTerms: '',
      leadTime: '',
      notes: '',
    });
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // State
    step,
    progress,
    error,
    extraction,
    supplierFields,
    editableLineItems,

    // Validation
    missingSupplierFields,
    invalidLineItems,
    canSave,

    // Actions
    processFile,
    updateSupplierField,
    updateLineItem,
    deleteLineItem,
    getQuoteData,
    reset,

    // Utilities
    wasFound: (field) => wasFound(field),
    getValue: (field) => getValue(field),
  };
}
