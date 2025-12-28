import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import * as businessCardsService from '../utils/businessCardsService';

const AppContext = createContext(null);

// Default fees for landed cost calculation
const DEFAULT_FEES = [
  { id: 'freight', name: 'Freight/Shipping', type: 'fixed', value: 500 },
  { id: 'customs', name: 'Customs Duty', type: 'percentage', value: 5 },
  { id: 'insurance', name: 'Insurance', type: 'percentage', value: 1 },
  { id: 'broker', name: 'Broker Fee', type: 'fixed', value: 150 },
];

// ============================================
// PRODUCTION READY - NO FAKE DATA
// ============================================
// All data comes from Supabase. No seed/mock data.

export function AppProvider({ children }) {
  const { user } = useAuth();
  
  const [products, setProducts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [fees, setFees] = useState(DEFAULT_FEES);
  const [settings, setSettings] = useState({ apiKey: '', currency: 'USD' });
  const [selectedQuotes, setSelectedQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // Business Cards state
  const [businessCards, setBusinessCards] = useState([]);
  const [cardCategories, setCardCategories] = useState([]);
  const [cardTags, setCardTags] = useState([]);

  useEffect(() => {
    if (user) {
      fetchAllData();
    } else {
      // Reset all state
      setProducts([]);
      setQuotes([]);
      setSuppliers([]);
      setOrders([]);
      setDocuments([]);
      setFees(DEFAULT_FEES);
      setSettings({ apiKey: '', currency: 'USD' });
      setSelectedQuotes([]);
      setBusinessCards([]);
      setCardCategories([]);
      setCardTags([]);
      setLoading(false);
      setInitialized(false);
    }
  }, [user]);

  // Mark as initialized when data is loaded
  useEffect(() => {
    if (!loading && !initialized && user) {
      setInitialized(true);
    }
  }, [loading, initialized, user]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [productsRes, quotesRes, suppliersRes, ordersRes, documentsRes, settingsRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('quotes_old').select('*').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
        supabase.from('user_settings').select('*').single(),
      ]);

      // Transform quotes to new structure if needed
      const transformedQuotes = (quotesRes.data || []).map(q => ({
        ...q,
        supplierName: q.supplier_name || q.supplierName || '',
        unitPrice: q.fields?.unitPrice || q.unitPrice || 0,
        currency: q.fields?.currency || q.currency || 'USD',
        moq: q.fields?.moq || q.moq || 0,
        incoterm: q.fields?.incoterm || q.incoterm || '',
      }));

      setProducts(productsRes.data || []);
      setQuotes(transformedQuotes);
      setSuppliers(suppliersRes.data || []);
      setOrders(ordersRes.data || []);
      setDocuments(documentsRes.data || []);
      
      if (settingsRes.data) {
        setSettings({
          apiKey: settingsRes.data.api_key || '',
          currency: settingsRes.data.currency || 'USD',
        });
        // Load saved fees if available
        if (settingsRes.data.fees) {
          setFees(settingsRes.data.fees);
        }
      }

      // Fetch business cards data
      try {
        const cards = await businessCardsService.fetchBusinessCards(user.id);
        const categories = await businessCardsService.fetchCardCategories(user.id);
        const tags = await businessCardsService.fetchCardTags(user.id);

        console.log('Business Cards - Fetched categories:', categories);
        console.log('Business Cards - Fetched tags:', tags);
        console.log('Business Cards - Fetched cards:', cards);

        setBusinessCards(cards || []);
        setCardCategories(categories || []);
        setCardTags(tags || []);
      } catch (bcError) {
        console.error('Error fetching Business Cards data:', bcError);
        console.error('Error details:', {
          message: bcError.message,
          code: bcError.code,
          details: bcError.details,
          hint: bcError.hint
        });
        // Set to empty arrays so UI doesn't break
        setBusinessCards([]);
        setCardCategories([]);
        setCardTags([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  // Product actions
  const addProduct = async (product) => {
    // Check if it's a demo product (local only)
    if (product.id?.startsWith('demo-')) {
      setProducts(prev => [product, ...prev]);
      return product;
    }

    const { data, error} = await supabase
      .from('products')
      .insert({
        user_id: user.id,
        name: product.name,
        category: product.category || null,
        description: product.description || null,
        specs: product.specs || [],
        status: product.status || 'draft', // Auto-created intents start as draft
        image_storage_path: product.image_storage_path || null,
        image_url: product.image_url || null
      })
      .select()
      .single();
    if (error) throw error;
    setProducts(prev => [data, ...prev]);
    return data;
  };

  const updateProduct = async (product) => {
    if (product.id?.startsWith('demo-')) {
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...product } : p));
      return product;
    }

    const updateData = {
      name: product.name,
      category: product.category,
      description: product.description
    };

    // Include specs if provided
    if (product.specs !== undefined) {
      updateData.specs = product.specs;
    }

    // Include status if provided
    if (product.status !== undefined) {
      updateData.status = product.status;
    }

    // Include image fields if provided
    if (product.image_storage_path !== undefined) {
      updateData.image_storage_path = product.image_storage_path;
    }
    if (product.image_url !== undefined) {
      updateData.image_url = product.image_url;
    }

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', product.id)
      .select()
      .single();
    if (error) throw error;
    setProducts(prev => prev.map(p => p.id === product.id ? data : p));
    return data;
  };

  const deleteProduct = async (productId) => {
    if (productId?.startsWith('demo-')) {
      setProducts(prev => prev.filter(p => p.id !== productId));
      setQuotes(prev => prev.filter(q => q.product_id !== productId));
      return;
    }

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
    setProducts(prev => prev.filter(p => p.id !== productId));
    setQuotes(prev => prev.filter(q => q.product_id !== productId));
  };

  const finalizeBuyingIntent = async (productId, newName = null) => {
    const product = products.find(p => p.id === productId);
    if (!product) throw new Error('Product not found');

    const updateData = {
      status: 'finalized'
    };

    // Update name if provided
    if (newName && newName.trim()) {
      updateData.name = newName.trim();
    }

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single();

    if (error) throw error;
    setProducts(prev => prev.map(p => p.id === productId ? data : p));
    return data;
  };

  // DELETE ALL SEED/FAKE DATA FROM DATABASE
  const clearAllSeedData = async () => {
    const FAKE_PRODUCT_NAMES = [
      'USB-C Charging Cable',
      'Microfiber Cleaning Cloth',
      'LED Desk Lamp',
      'Silicone Phone Case'
    ];

    try {
      // Delete all products with these fake names
      const { error } = await supabase
        .from('products')
        .delete()
        .in('name', FAKE_PRODUCT_NAMES);

      if (error) throw error;

      // Refresh data from database
      await fetchAllData();

      console.log('[CLEARED] All seed data deleted from database');
    } catch (error) {
      console.error('[ERROR] Failed to clear seed data:', error);
      throw error;
    }
  };

  // Quote actions with new structure
  const addQuote = async (quote) => {
    const newQuote = {
      id: quote.id || `quote-${Date.now()}`,
      product_id: quote.productId || quote.product_id,
      supplierName: quote.supplierName,
      unitPrice: parseFloat(quote.unitPrice) || 0,
      currency: quote.currency || 'USD',
      moq: parseInt(quote.moq) || 0,
      incoterm: quote.incoterm || '',
      created_at: new Date().toISOString(),
    };

    // For demo/local quotes
    if (newQuote.id?.startsWith('demo-') || newQuote.product_id?.startsWith('demo-')) {
      setQuotes(prev => [newQuote, ...prev]);
      return newQuote;
    }

    const { data, error } = await supabase
      .from('quotes_old')
      .insert({
        user_id: user.id,
        product_id: newQuote.product_id,
        supplier_name: newQuote.supplierName,
        fields: {
          unitPrice: newQuote.unitPrice,
          currency: newQuote.currency,
          moq: newQuote.moq,
          incoterm: newQuote.incoterm,
        },
      })
      .select()
      .single();
    
    if (error) throw error;
    
    const transformedData = {
      ...data,
      supplierName: data.supplier_name,
      unitPrice: newQuote.unitPrice,
      currency: newQuote.currency,
      moq: newQuote.moq,
      incoterm: newQuote.incoterm,
    };
    
    setQuotes(prev => [transformedData, ...prev]);
    return transformedData;
  };

  const updateQuote = async (quote) => {
    const updatedQuote = {
      ...quote,
      unitPrice: parseFloat(quote.unitPrice) || 0,
      moq: parseInt(quote.moq) || 0,
    };

    if (quote.id?.startsWith('demo-')) {
      setQuotes(prev => prev.map(q => q.id === quote.id ? updatedQuote : q));
      return updatedQuote;
    }

    const { data, error } = await supabase
      .from('quotes_old')
      .update({
        supplier_name: updatedQuote.supplierName,
        fields: {
          unitPrice: updatedQuote.unitPrice,
          currency: updatedQuote.currency,
          moq: updatedQuote.moq,
          incoterm: updatedQuote.incoterm,
        },
      })
      .eq('id', quote.id)
      .select()
      .single();
    
    if (error) throw error;
    
    const transformedData = {
      ...data,
      supplierName: data.supplier_name,
      unitPrice: updatedQuote.unitPrice,
      currency: updatedQuote.currency,
      moq: updatedQuote.moq,
      incoterm: updatedQuote.incoterm,
    };
    
    setQuotes(prev => prev.map(q => q.id === quote.id ? transformedData : q));
    return transformedData;
  };

  const deleteQuote = async (quoteId) => {
    if (quoteId?.startsWith('demo-')) {
      setQuotes(prev => prev.filter(q => q.id !== quoteId));
      setSelectedQuotes(prev => prev.filter(id => id !== quoteId));
      return;
    }

    const { error } = await supabase.from('quotes_old').delete().eq('id', quoteId);
    if (error) throw error;
    setQuotes(prev => prev.filter(q => q.id !== quoteId));
    setSelectedQuotes(prev => prev.filter(id => id !== quoteId));
  };

  // ============================================
  // MULTI-ITEM SUPPLIER QUOTE ACTIONS (NEW SCHEMA)
  // ============================================
  /**
   * Save a supplier quote with all its line items
   * @param {Object} supplierQuote - Document-level fields
   * @param {Array} lineItems - Array of line item objects
   * @returns {Object} The created supplier quote with line items
   */
  const addSupplierQuote = async (supplierQuote, lineItems) => {
    if (!user) throw new Error('User not authenticated');

    // Step 1: Insert supplier_quote (document-level)
    const { data: quoteData, error: quoteError } = await supabase
      .from('supplier_quotes')
      .insert({
        user_id: user.id,
        supplier_name: supplierQuote.supplierName,
        supplier_contact: supplierQuote.supplierContact || null,
        supplier_email: supplierQuote.supplierEmail || null,
        currency: supplierQuote.currency || 'USD',
        incoterm: supplierQuote.incoterm || null,
        quote_date: supplierQuote.quoteDate || null,
        valid_until: supplierQuote.validUntil || null,
        payment_terms: supplierQuote.paymentTerms || null,
        lead_time: supplierQuote.leadTime || null,
        notes: supplierQuote.notes || null,
        original_file_name: supplierQuote.fileName || null,
        file_type: supplierQuote.fileType || null,
      })
      .select()
      .single();

    if (quoteError) throw quoteError;

    // Step 2: Insert all line items with supplier_quote_id FK
    const lineItemsToInsert = lineItems.map(item => ({
      supplier_quote_id: quoteData.id,
      product_name: item.productName, // Exact name from supplier
      sku: item.sku || null,
      dimensions_text: item.dimensions || null, // Raw dimensions string
      unit_price: parseFloat(item.unitPrice),
      price_unit: item.priceUnit || 'per pc',
      moq: item.moq ? parseInt(item.moq) : null,
      weight_g: item.weight_g ? parseInt(item.weight_g) : null,
      packing_pcs_per_ctn: item.packing_pcs_per_ctn ? parseInt(item.packing_pcs_per_ctn) : null,
      carton_length_cm: item.carton_length_cm ? parseFloat(item.carton_length_cm) : null,
      carton_width_cm: item.carton_width_cm ? parseFloat(item.carton_width_cm) : null,
      carton_height_cm: item.carton_height_cm ? parseFloat(item.carton_height_cm) : null,
      cbm_per_carton: item.cbm_per_carton ? parseFloat(item.cbm_per_carton) : null,
      extracted_confidence: item.priceConfidence || null,
      linked_buying_intent_id: item.linkedBuyingIntentId || null, // Human-assigned link
    }));

    const { data: lineItemsData, error: lineItemsError } = await supabase
      .from('quote_line_items')
      .insert(lineItemsToInsert)
      .select();

    if (lineItemsError) throw lineItemsError;

    console.log(`✅ [AppContext] Saved supplier quote with ${lineItemsData.length} line items`);

    return {
      ...quoteData,
      lineItems: lineItemsData,
    };
  };

  // Fee actions
  const updateFees = (newFees) => {
    setFees(newFees);
  };

  const addFee = (fee) => {
    const newFee = {
      id: `fee-${Date.now()}`,
      name: fee.name || 'New Fee',
      type: fee.type || 'fixed',
      value: fee.value || 0,
    };
    setFees(prev => [...prev, newFee]);
    return newFee;
  };

  const updateFee = (feeId, updates) => {
    setFees(prev => prev.map(f => f.id === feeId ? { ...f, ...updates } : f));
  };

  const deleteFee = (feeId) => {
    setFees(prev => prev.filter(f => f.id !== feeId));
  };

  const resetFees = () => {
    setFees(DEFAULT_FEES);
  };

  // ============================================
  // LANDED COST CALCULATION
  // ============================================
  // FORMULA (strict separation of money vs units):
  //   unit_price     = $/unit (money per unit)
  //   quantity       = units (count)
  //   FOB_total      = unit_price × quantity ($ total)
  //   total_fees     = fixed$ + (percent × FOB_total) ($ total)
  //   total_landed   = FOB_total + total_fees ($ total)
  //   landed_per_unit = total_landed ÷ quantity ($/unit)
  // ============================================
  const calculateLandedCost = useCallback((quote, quantity = null) => {
    // Step 1: Extract unit_price ($/unit) - MONEY
    const unit_price = parseFloat(quote.unitPrice) || 0;
    
    // Step 2: Determine quantity (units) - COUNT
    const qty = quantity || parseFloat(quote.moq) || 1;
    
    // Safety check: both must be > 0 for valid calculation
    const isValid = unit_price > 0 && qty > 0;
    
    // Step 3: Calculate FOB_total ($ total) = unit_price × quantity
    const FOB_total = unit_price * qty;

    // Step 4: Calculate fees (all in $ money)
    let totalFees = 0;
    const feeBreakdown = fees.map(fee => {
      const feeValue = parseFloat(fee.value) || 0;
      let amount = 0;
      
      if (fee.type === 'percentage') {
        // Percentage: (FOB_total × percentage) / 100 = $
        amount = (FOB_total * feeValue) / 100;
      } else {
        // Fixed: Already in $ (per shipment)
        amount = feeValue;
      }
      totalFees += amount;
      return { ...fee, amount };
    });

    // Step 5: Calculate total_landed ($ total)
    const total_landed = FOB_total + totalFees;
    
    // Step 6: Calculate landed_per_unit ($/unit)
    const landed_per_unit = qty > 0 ? total_landed / qty : 0;
    
    // Step 7: Fee markup percentage
    const fee_markup_percent = FOB_total > 0 ? (totalFees / FOB_total) * 100 : 0;

    return {
      // Validation
      isValid,
      
      // Core values (new naming)
      unit_price,           // $/unit
      quantity: qty,        // units
      FOB_total,            // $ total
      total_fees: totalFees,// $ total
      total_landed,         // $ total
      landed_per_unit,      // $/unit
      fee_markup_percent,   // %
      feeBreakdown,
      
      // Backward compatibility aliases
      unitPrice: unit_price,
      fobTotal: FOB_total,
      productCost: FOB_total,
      totalFees,
      totalLandedCost: total_landed,
      totalLanded: total_landed,
      landedCostPerUnit: landed_per_unit,
      landedPerUnit: landed_per_unit,
      feeMarkupPercent: fee_markup_percent,
      feePercentage: fee_markup_percent,
    };
  }, [fees]);

  // Supplier actions
  const addSupplier = async (supplier) => {
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        user_id: user.id,
        company: supplier.company,
        contact: supplier.contact || null,
        email: supplier.email || null,
        wechat: supplier.wechat || null,
        website: supplier.website || null,
        status: supplier.status || 'pending',
        notes: supplier.notes || null,
      })
      .select()
      .single();
    if (error) throw error;
    setSuppliers(prev => [data, ...prev]);
    return data;
  };

  const updateSupplier = async (supplier) => {
    const { data, error } = await supabase
      .from('suppliers')
      .update({
        company: supplier.company,
        contact: supplier.contact,
        email: supplier.email,
        wechat: supplier.wechat,
        website: supplier.website,
        status: supplier.status,
        notes: supplier.notes,
      })
      .eq('id', supplier.id)
      .select()
      .single();
    if (error) throw error;
    setSuppliers(prev => prev.map(s => s.id === supplier.id ? data : s));
    return data;
  };

  const deleteSupplier = async (supplierId) => {
    const { error } = await supabase.from('suppliers').delete().eq('id', supplierId);
    if (error) throw error;
    setSuppliers(prev => prev.filter(s => s.id !== supplierId));
  };

  // Order actions (kept but not exposed in nav)
  const addOrder = async (order) => {
    const { data, error } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        name: order.name,
        supplier: order.supplier || null,
        status: order.status || 'pending',
        quantity: order.quantity || null,
        total: order.total || null,
        notes: order.notes || null,
      })
      .select()
      .single();
    if (error) throw error;
    setOrders(prev => [data, ...prev]);
    return data;
  };

  const updateOrder = async (order) => {
    const { data, error } = await supabase
      .from('orders')
      .update({ name: order.name, supplier: order.supplier, status: order.status, quantity: order.quantity, total: order.total, notes: order.notes })
      .eq('id', order.id)
      .select()
      .single();
    if (error) throw error;
    setOrders(prev => prev.map(o => o.id === order.id ? data : o));
    return data;
  };

  const deleteOrder = async (orderId) => {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) throw error;
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  // Document actions - Proforma Invoices & Quotes storage
  const addDocument = async (doc) => {
    if (!doc.type || !doc.buyingIntentId || !doc.supplierQuoteId) {
      throw new Error('Document must have type, buyingIntentId, and supplierQuoteId');
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        type: doc.type,
        buying_intent_id: doc.buyingIntentId,
        supplier_quote_id: doc.supplierQuoteId,
        quote_line_item_id: doc.quoteLineItemId || null,
        file_path: doc.filePath,
        file_name: doc.fileName,
        file_type: doc.fileType,
        file_size: doc.fileSize || null,
      })
      .select()
      .single();
    if (error) throw error;
    setDocuments(prev => [data, ...prev]);
    return data;
  };

  const updateDocument = async (docId, updates) => {
    const { data, error } = await supabase
      .from('documents')
      .update({
        type: updates.type,
        quote_line_item_id: updates.quoteLineItemId,
      })
      .eq('id', docId)
      .select()
      .single();
    if (error) throw error;
    setDocuments(prev => prev.map(d => d.id === docId ? data : d));
    return data;
  };

  const deleteDocument = async (docId) => {
    const { error } = await supabase.from('documents').delete().eq('id', docId);
    if (error) throw error;
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  // Get documents for a specific Buying Intent
  const getDocumentsForBuyingIntent = useCallback(async (buyingIntentId) => {
    if (!user) return [];

    const { data, error } = await supabase
      .from('documents')
      .select(`
        *,
        supplier_quote:supplier_quotes(
          id,
          supplier_name
        )
      `)
      .eq('buying_intent_id', buyingIntentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }, [user]);

  const updateSettings = async (newSettings) => {
    const { data: existing } = await supabase.from('user_settings').select('id').eq('user_id', user.id).single();
    if (existing) {
      await supabase.from('user_settings').update({ api_key: newSettings.apiKey, currency: newSettings.currency }).eq('user_id', user.id);
    } else {
      await supabase.from('user_settings').insert({ user_id: user.id, api_key: newSettings.apiKey, currency: newSettings.currency });
    }
    setSettings(newSettings);
  };

  const toggleQuoteSelection = (quoteId) => {
    setSelectedQuotes(prev => prev.includes(quoteId) ? prev.filter(id => id !== quoteId) : [...prev, quoteId]);
  };

  // Business Cards actions
  const addBusinessCard = async (cardData) => {
    const newCard = await businessCardsService.createBusinessCard(cardData, user.id);
    const cards = await businessCardsService.fetchBusinessCards(user.id);
    const fullCard = cards.find(c => c.id === newCard.id);
    setBusinessCards(prev => [fullCard || newCard, ...prev]);
    return fullCard || newCard;
  };

  const updateBusinessCard = async (cardId, updates) => {
    await businessCardsService.updateBusinessCard(cardId, updates, user.id);
    const cards = await businessCardsService.fetchBusinessCards(user.id);
    setBusinessCards(cards);
  };

  const deleteBusinessCard = async (cardId) => {
    await businessCardsService.deleteBusinessCard(cardId, user.id);
    setBusinessCards(prev => prev.filter(c => c.id !== cardId));
  };

  const bulkUpdateCardStatus = async (cardIds, status) => {
    await businessCardsService.bulkUpdateCardStatus(cardIds, status, user.id);
    const cards = await businessCardsService.fetchBusinessCards(user.id);
    setBusinessCards(cards);
  };

  const bulkUpdateCardCategory = async (cardIds, categoryId) => {
    await businessCardsService.bulkUpdateCardCategory(cardIds, categoryId, user.id);
    const cards = await businessCardsService.fetchBusinessCards(user.id);
    setBusinessCards(cards);
  };

  const bulkDeleteCards = async (cardIds) => {
    await businessCardsService.bulkDeleteCards(cardIds, user.id);
    setBusinessCards(prev => prev.filter(c => !cardIds.includes(c.id)));
  };

  const addCardCategory = async (name, color) => {
    const newCategory = await businessCardsService.createCardCategory(name, color, user.id);
    // Refresh from database to ensure consistency
    const categories = await businessCardsService.fetchCardCategories(user.id);
    setCardCategories(categories);
    return newCategory;
  };

  const updateCardCategory = async (categoryId, name, color) => {
    await businessCardsService.updateCardCategory(categoryId, name, color, user.id);
    // Refresh from database to ensure consistency
    const categories = await businessCardsService.fetchCardCategories(user.id);
    setCardCategories(categories);
  };

  const deleteCardCategory = async (categoryId) => {
    await businessCardsService.deleteCardCategory(categoryId, user.id);
    // Refresh from database to ensure consistency
    const categories = await businessCardsService.fetchCardCategories(user.id);
    setCardCategories(categories);
  };

  const refreshCardCategories = async () => {
    try {
      console.log('Manual refresh - Fetching categories for user:', user.id);
      const categories = await businessCardsService.fetchCardCategories(user.id);
      console.log('Manual refresh - Fetched categories:', categories);
      setCardCategories(categories || []);
      return categories;
    } catch (error) {
      console.error('Manual refresh - Error:', error);
      console.error('Manual refresh - Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }
  };

  const addCardTag = async (name) => {
    const newTag = await businessCardsService.createCardTag(name, user.id);
    setCardTags(prev => [...prev, newTag]);
    return newTag;
  };

  const deleteCardTag = async (tagId) => {
    await businessCardsService.deleteCardTag(tagId, user.id);
    setCardTags(prev => prev.filter(t => t.id !== tagId));
  };

  // Computed values
  const getProductQuotes = useCallback((productId) => quotes.filter(q => q.product_id === productId), [quotes]);
  const getSupplierQuotes = useCallback((supplierId) => quotes.filter(q => q.supplier_id === supplierId), [quotes]);
  const getProductById = useCallback((productId) => products.find(p => p.id === productId), [products]);
  const getActiveOrders = useCallback(() => orders.filter(o => o.status !== 'delivered'), [orders]);
  const getDocumentCategories = useCallback(() => [...new Set(documents.map(d => d.category).filter(Boolean))], [documents]);

  /**
   * Get all line items linked to a BuyingIntent
   * Returns: Array of line items with supplier details
   */
  const getLineItemsForBuyingIntent = useCallback(async (buyingIntentId) => {
    if (!user) return [];

    // Query line items where linked_buying_intent_id = buyingIntentId
    // Join with supplier_quotes to get supplier info
    const { data, error} = await supabase
      .from('quote_line_items')
      .select(`
        *,
        supplier_quote:supplier_quotes(
          id,
          supplier_name,
          supplier_contact,
          supplier_email,
          currency,
          incoterm,
          quote_date,
          valid_until,
          payment_terms,
          lead_time,
          notes,
          created_at
        )
      `)
      .eq('linked_buying_intent_id', buyingIntentId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[AppContext] Error fetching line items:', error);
      return [];
    }

    // Transform to usable format
    return (data || []).map(item => ({
      ...item,
      supplierName: item.supplier_quote?.supplier_name,
      currency: item.supplier_quote?.currency || 'USD',
      incoterm: item.supplier_quote?.incoterm || '',
      supplier: item.supplier_quote,
    }));
  }, [user]);

  // Legacy alias for backwards compatibility
  const getLineItemsForProduct = getLineItemsForBuyingIntent;

  const value = {
    state: { products, quotes, suppliers, orders, documents, fees, settings, selectedQuotes, loading, businessCards, cardCategories, cardTags },
    actions: {
      addProduct, updateProduct, deleteProduct, finalizeBuyingIntent,
      addQuote, updateQuote, deleteQuote,
      addSupplierQuote, // NEW: Multi-item quote support
      addSupplier, updateSupplier, deleteSupplier,
      addOrder, updateOrder, deleteOrder,
      addDocument, updateDocument, deleteDocument,
      updateFees, addFee, updateFee, deleteFee, resetFees,
      updateSettings, toggleQuoteSelection, setSelectedQuotes,
      refreshData: fetchAllData,
      clearAllSeedData,
      // Business Cards actions
      addBusinessCard, updateBusinessCard, deleteBusinessCard,
      bulkUpdateCardStatus, bulkUpdateCardCategory, bulkDeleteCards,
      addCardCategory, updateCardCategory, deleteCardCategory, refreshCardCategories,
      addCardTag, deleteCardTag,
    },
    computed: {
      getProductQuotes, getSupplierQuotes, getProductById, getActiveOrders, getDocumentCategories,
      getLineItemsForProduct, // Legacy alias
      getLineItemsForBuyingIntent, // Query line items by buying intent
      getDocumentsForBuyingIntent, // Query documents by buying intent
      calculateLandedCost,
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
}

export function useApp() {
  const context = useAppContext();
  return { ...context.state, ...context.actions, ...context.computed };
}
