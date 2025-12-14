import { useState, useCallback, useMemo } from 'react';
import { extractQuoteFromFile, wasFound, getValue } from '../utils/quoteExtractionService';
import { buildCoreQuote, buildQuoteMetadata } from '../utils/quoteDataModels';

// ============================================
// useQuoteExtraction Hook
// ============================================
// 
// FLOW:
// 1. Upload file → extract data
// 2. Show extraction results (read-only)
// 3. If multiple items → user selects one
// 4. User confirms/fills required fields
// 5. Save creates CoreQuote + QuoteMetadata
//
// RULES:
// - Never auto-fill missing required fields
// - Never guess values
// - User must confirm everything
// ============================================

export function useQuoteExtraction(productId, apiKey) {
  // ============================================
  // STATE
  // ============================================

  // Flow: 'idle' | 'extracting' | 'review' | 'error'
  const [step, setStep] = useState('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  
  // Extraction result
  const [extraction, setExtraction] = useState(null);
  
  // Selected line item index (-1 = none selected)
  const [selectedIndex, setSelectedIndex] = useState(-1);
  
  // User-confirmed form values (for core quote fields)
  const [formValues, setFormValues] = useState({
    supplierName: '',
    unitPrice: '',
    currency: 'USD',
    moq: '',
    incoterm: '',
  });

  // ============================================
  // COMPUTED
  // ============================================
  
  const hasMultipleItems = useMemo(() => {
    return extraction?.hasMultipleItems || (extraction?.lineItems?.length > 1);
  }, [extraction]);

  const selectedItem = useMemo(() => {
    if (!extraction?.lineItems?.length) return null;
    if (selectedIndex < 0) return null;
    return extraction.lineItems[selectedIndex];
  }, [extraction, selectedIndex]);

  const needsItemSelection = useMemo(() => {
    return hasMultipleItems && selectedIndex < 0;
  }, [hasMultipleItems, selectedIndex]);

  // Validation: which required fields are missing?
  const missingFields = useMemo(() => {
    const missing = [];
    if (!formValues.supplierName?.trim()) missing.push('supplierName');
    if (!formValues.unitPrice || parseFloat(formValues.unitPrice) <= 0) missing.push('unitPrice');
    if (!formValues.moq || parseInt(formValues.moq) <= 0) missing.push('moq');
    if (!formValues.incoterm?.trim()) missing.push('incoterm');
    return missing;
  }, [formValues]);

  const canSave = useMemo(() => {
    return !needsItemSelection && missingFields.length === 0;
  }, [needsItemSelection, missingFields]);

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
    setSelectedIndex(-1);
    setFormValues({
      supplierName: '',
      unitPrice: '',
      currency: 'USD',
      moq: '',
      incoterm: '',
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

      // Auto-select if single item
      if (!result.hasMultipleItems && result.lineItems?.length === 1) {
        setSelectedIndex(0);
        prefillForm(result, result.lineItems[0]);
      } else if (!result.lineItems?.length) {
        // No line items - still show extraction
        prefillForm(result, null);
      }

      setStep('review');

    } catch (err) {
      console.error('[useQuoteExtraction] Error:', err);
      setError(err.message || 'Failed to process file');
      setStep('error');
    }
  }, []);

  /**
   * Pre-fill form from extraction (only if found, never guess)
   */
  const prefillForm = useCallback((ext, item) => {
    setFormValues({
      // From extraction-level fields
      supplierName: wasFound(ext.supplierName) ? ext.supplierName.value : '',
      currency: wasFound(ext.currency) ? ext.currency.value : 'USD',
      incoterm: wasFound(ext.incoterm) ? ext.incoterm.value : '',
      // From selected line item
      unitPrice: item && wasFound(item.unitPrice) ? String(item.unitPrice.value) : '',
      moq: item && wasFound(item.moq) ? String(item.moq.value) : '', // EMPTY if not found, never guess
    });
  }, []);

  /**
   * Select a line item
   */
  const selectItem = useCallback((index) => {
    if (!extraction?.lineItems?.[index]) return;
    setSelectedIndex(index);
    prefillForm(extraction, extraction.lineItems[index]);
  }, [extraction, prefillForm]);

  /**
   * Update form field
   */
  const updateField = useCallback((field, value) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  }, []);

  /**
   * Get final quote data for saving
   * Returns: { coreQuote, metadata } or null if invalid
   */
  const getQuoteData = useCallback(() => {
    if (!canSave) return null;

    const coreQuote = buildCoreQuote(formValues, productId);
    const metadata = buildQuoteMetadata(extraction, selectedItem);

    return {
      // Core quote fields (for landed cost calculation)
      ...coreQuote,
      // Additional metadata (stored but not used in calc)
      notes: buildNotesString(metadata),
      metadata,
    };
  }, [canSave, formValues, productId, extraction, selectedItem]);

  /**
   * Build notes string from metadata
   */
  const buildNotesString = (metadata) => {
    const parts = [];
    if (metadata.sourceFile) parts.push(`Source: ${metadata.sourceFile}`);
    if (metadata.productName) parts.push(`Product: ${metadata.productName}`);
    if (metadata.leadTime) parts.push(`Lead: ${metadata.leadTime}`);
    if (metadata.validUntil) parts.push(`Valid: ${metadata.validUntil}`);
    return parts.join(' | ') || null;
  };

  /**
   * Reset everything
   */
  const reset = useCallback(() => {
    setStep('idle');
    setProgress('');
    setError(null);
    setExtraction(null);
    setSelectedIndex(-1);
    setFormValues({
      supplierName: '',
      unitPrice: '',
      currency: 'USD',
      moq: '',
      incoterm: '',
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
    selectedIndex,
    selectedItem,
    formValues,
    
    // Computed
    hasMultipleItems,
    needsItemSelection,
    missingFields,
    canSave,
    
    // Actions
    processFile,
    selectItem,
    updateField,
    getQuoteData,
    reset,
    
    // Helpers
    wasFound,
    getValue,
  };
}

export default useQuoteExtraction;
