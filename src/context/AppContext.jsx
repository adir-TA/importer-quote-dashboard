import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { DEFAULT_FX_RATES } from '../utils/currency';
import API_BASE_URL from '../config/api';
const AppContext = createContext(null);

// Default fees for landed cost calculation
const DEFAULT_FEES = [
  { id: 'freight', name: 'Freight/Shipping', type: 'fixed', value: 500 },
  { id: 'customs', name: 'Customs Duty', type: 'percentage', value: 5 },
  { id: 'insurance', name: 'Insurance', type: 'percentage', value: 1 },
  { id: 'broker', name: 'Broker Fee', type: 'fixed', value: 150 },
];

// The app still reads and writes the pre-migration single-item quotes table.
// Kept in one place so it is obvious this is legacy, and so a deployment that
// has already dropped it degrades gracefully instead of erroring on every load.
const LEGACY_QUOTES_TABLE = 'quotes_old';

/** Postgres 42P01 = undefined_table. Supabase surfaces it as PGRST205 too. */
function isMissingTableError(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** Postgres 42703 = undefined_column; PostgREST reports PGRST204 for unknown columns. */
function isMissingColumnError(error) {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Load user settings without ever selecting api_key.
 *
 * `has_api_key` is a generated column added by the 20260908 migration. If a
 * deployment ships this frontend before applying that migration, the select
 * fails with 42703 - so fall back to the columns that always existed rather
 * than losing the user's currency, rates and fees.
 */
async function loadUserSettings() {
  const withFlag = await supabase
    .from('user_settings')
    .select('id, currency, fees, fx_rates, has_api_key')
    .maybeSingle();

  if (!withFlag.error || !isMissingColumnError(withFlag.error)) {
    return withFlag;
  }

  console.warn(
    '[AppContext] user_settings.has_api_key is missing - run migrations/20260908_bug_audit_fixes.sql. ' +
    'Falling back; "API key saved" status will read as false until the migration is applied.'
  );

  const legacy = await supabase
    .from('user_settings')
    .select('id, currency, fees, fx_rates')
    .maybeSingle();

  if (legacy.data) legacy.data.has_api_key = false;
  return legacy;
}

/**
 * Durable buffer for unsaved fee edits.
 *
 * A pagehide/visibilitychange flush issues an ordinary supabase-js request,
 * and browsers cancel non-keepalive requests during teardown - so closing the
 * tab within the debounce window could still lose the edit. Mirroring the
 * pending fees into localStorage lets the next load finish the write.
 */
const PENDING_FEES_KEY = 'ha-tools-pending-fees';

function readPendingFees(userId) {
  try {
    const raw = localStorage.getItem(PENDING_FEES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Scoped to the user who made the edit, so it can never be replayed
    // into a different account's settings row.
    if (!parsed || parsed.userId !== userId || !Array.isArray(parsed.fees)) return null;
    return parsed.fees;
  } catch {
    return null;
  }
}

function writePendingFees(userId, fees) {
  try {
    if (fees === null) localStorage.removeItem(PENDING_FEES_KEY);
    else localStorage.setItem(PENDING_FEES_KEY, JSON.stringify({ userId, fees }));
  } catch {
    // Storage unavailable (private mode / blocked). Best effort only.
  }
}

/**
 * Ask the API whether the deployment supplies an Anthropic key for everyone.
 * Bounded by a timeout: an unresponsive API host must not hold the app on its
 * loading spinner after all the Supabase data has arrived.
 */
async function fetchServerKeyStatus() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
    if (!res.ok) return false;
    return Boolean((await res.json())?.serverKeyConfigured);
  } catch {
    // Offline, aborted, or API unreachable - assume the user supplies the key
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// The Anthropic key is never loaded into browser state. The client only ever
// learns *whether* one is saved; the backend reads the value server-side.
const DEFAULT_SETTINGS = {
  hasApiKey: false,      // this user saved their own key
  serverHasKey: false,   // the deployment supplies a key for everyone
  currency: 'USD',
  fxRates: DEFAULT_FX_RATES,
};

/** Can AI features run at all? Either key source is enough. */
export function canUseAi(settings) {
  return Boolean(settings?.hasApiKey || settings?.serverHasKey);
}

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
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [selectedQuotes, setSelectedQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  // True when user_settings could not be read. Blocks fee writes so a failed
  // read cannot upsert defaults over the user's real configuration.
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);

  // All line items loaded upfront for fast in-memory filtering
  const [allLineItems, setAllLineItems] = useState([]);
  const allLineItemsRef = useRef([]);

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
      setSettings(DEFAULT_SETTINGS);
      setSelectedQuotes([]);
      setAllLineItems([]);
      allLineItemsRef.current = [];
      // Drop any unsaved fee edit. Retaining it across a sign-out would let
      // the pagehide flush write the previous user's fees into the next
      // user's settings row.
      if (feeSaveTimer.current) {
        clearTimeout(feeSaveTimer.current);
        feeSaveTimer.current = null;
      }
      pendingFeesRef.current = null;
      writePendingFees(user?.id, null);
      setFeeSaveError(null);
      setSettingsLoadFailed(false);
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
      const [productsRes, quotesRes, suppliersRes, ordersRes, documentsRes, settingsRes, lineItemsRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        // Legacy single-item quotes. Tolerated as missing - see LEGACY_QUOTES_TABLE.
        supabase.from(LEGACY_QUOTES_TABLE).select('*').order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
        // maybeSingle: .single() raised PGRST116 (and a console 406) for every
        // user who had not saved settings yet.
        // api_key is deliberately NOT in the column list - it must never reach
        // the browser. Whether one exists is derived from has_api_key, a
        // generated boolean column (see the 20260908 migration).
        loadUserSettings(),
        supabase.from('quote_line_items').select(`
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
        `).order('created_at', { ascending: false }),
      ]);

      // A dropped legacy table is a normal state, not a failure to surface
      if (quotesRes.error && !isMissingTableError(quotesRes.error)) {
        console.error('Error loading legacy quotes:', quotesRes.error.message);
      }

      // Transform quotes to new structure if needed
      const transformedQuotes = (quotesRes.data || []).map(q => ({
        ...q,
        supplierName: q.supplier_name || q.supplierName || '',
        unitPrice: q.fields?.unitPrice || q.unitPrice || 0,
        currency: q.fields?.currency || q.currency || 'USD',
        moq: q.fields?.moq || q.moq || 0,
        incoterm: q.fields?.incoterm || q.incoterm || '',
      }));

      // Transform line items with supplier info (same transform as previous per-product query)
      const transformedLineItems = (lineItemsRes.data || []).map(item => ({
        ...item,
        supplierName: item.supplier_quote?.supplier_name,
        currency: item.supplier_quote?.currency || 'USD',
        incoterm: item.supplier_quote?.incoterm || '',
        supplier: item.supplier_quote,
      }));
      allLineItemsRef.current = transformedLineItems;
      setAllLineItems(transformedLineItems);

      setProducts(productsRes.data || []);
      setQuotes(transformedQuotes);
      setSuppliers(suppliersRes.data || []);
      setOrders(ordersRes.data || []);
      setDocuments(documentsRes.data || []);
      
      const serverHasKey = await fetchServerKeyStatus();

      if (settingsRes.error) {
        // Do NOT fall back to defaults here. Overwriting local state with
        // DEFAULT_SETTINGS/DEFAULT_FEES means the next fee edit upserts those
        // defaults over the user's real saved configuration.
        console.error('Failed to load user settings:', settingsRes.error.message);
        setSettingsLoadFailed(true);
        setSettings(prev => ({ ...prev, serverHasKey }));
      } else if (settingsRes.data) {
        setSettingsLoadFailed(false);
        setSettings({
          // Only a boolean crosses into the browser, never the key itself
          hasApiKey: Boolean(settingsRes.data.has_api_key),
          serverHasKey,
          currency: settingsRes.data.currency || 'USD',
          fxRates: { ...DEFAULT_FX_RATES, ...(settingsRes.data.fx_rates || {}) },
        });
        // Load saved fees if available
        if (Array.isArray(settingsRes.data.fees) && settingsRes.data.fees.length > 0) {
          setFees(settingsRes.data.fees);
        }

        // Finish a fee edit that was still in the debounce window when the
        // tab was closed. Scoped to this user by readPendingFees().
        const recovered = readPendingFees(user.id);
        if (recovered) {
          console.warn('[AppContext] Recovering unsaved fee changes from the last session');
          setFees(recovered);
          try {
            await supabase
              .from('user_settings')
              .upsert({ user_id: user.id, fees: recovered }, { onConflict: 'user_id' })
              .throwOnError();
            writePendingFees(user.id, null);
          } catch (error) {
            console.error('[AppContext] Failed to recover pending fees:', error);
          }
        }
      } else {
        // No row yet - a genuinely new user
        setSettingsLoadFailed(false);
        setSettings({ ...DEFAULT_SETTINGS, serverHasKey });
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      // We never reached the settings branches, so treat settings as
      // unresolved: `fees` may still be DEFAULT_FEES and must not be written.
      setSettingsLoadFailed(true);
    } finally {
      setLoading(false);
    }
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

    if (!user) throw new Error('User not authenticated');

    try {
      // Scoped to the signed-in user. This previously deleted by name alone,
      // so a real Buying Intent that happened to be called e.g. "LED Desk Lamp"
      // was destroyed along with the seed rows.
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('user_id', user.id)
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
      .from(LEGACY_QUOTES_TABLE)
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
      .from(LEGACY_QUOTES_TABLE)
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

    const { error } = await supabase.from(LEGACY_QUOTES_TABLE).delete().eq('id', quoteId);
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

    if (lineItemsError) {
      // Roll the parent row back. Without this, a failed line-item insert left
      // an empty supplier_quotes row behind on every retry.
      const { error: rollbackError } = await supabase
        .from('supplier_quotes')
        .delete()
        .eq('id', quoteData.id);
      if (rollbackError) {
        console.error('[AppContext] Failed to roll back orphaned supplier quote:', rollbackError.message);
      }
      throw lineItemsError;
    }

    console.log(`✅ [AppContext] Saved supplier quote with ${lineItemsData.length} line items`);

    // Fold the new rows into the in-memory line-item cache. This step was
    // missing, so a freshly uploaded quote did not appear (and quote counts did
    // not move) until the user did a full page reload.
    const enrichedLineItems = lineItemsData.map(item => ({
      ...item,
      supplierName: quoteData.supplier_name,
      currency: quoteData.currency || 'USD',
      incoterm: quoteData.incoterm || '',
      supplier: quoteData,
      supplier_quote: quoteData,
    }));

    allLineItemsRef.current = [...enrichedLineItems, ...allLineItemsRef.current];
    setAllLineItems(allLineItemsRef.current);

    return {
      ...quoteData,
      lineItems: lineItemsData,
    };
  };

  // ============================================
  // FEE ACTIONS
  // ============================================
  // These used to touch local state only, so every landed-cost fee edit was
  // lost on reload even though the app read `fees` back from user_settings.
  // Each mutation now writes through to the database.
  // Fee inputs fire on every keystroke, so local state updates immediately and
  // the database write is debounced. Writing straight through issued one
  // upsert per character typed.
  const feeSaveTimer = useRef(null);
  const pendingFeesRef = useRef(null);
  const feeSaveChain = useRef(Promise.resolve());
  const [feeSaveError, setFeeSaveError] = useState(null);

  /**
   * Persist the latest pending fees.
   * Writes are chained rather than fired in parallel, so a blur-triggered
   * flush cannot land before a slower in-flight timer flush and leave the
   * stale set persisted. The payload is only cleared once the write succeeds,
   * so a failure stays retryable.
   */
  const flushFees = useCallback(() => {
    if (feeSaveTimer.current) {
      clearTimeout(feeSaveTimer.current);
      feeSaveTimer.current = null;
    }

    if (pendingFeesRef.current === null) return feeSaveChain.current;

    feeSaveChain.current = feeSaveChain.current.then(async () => {
      const pending = pendingFeesRef.current;
      if (pending === null) return; // an earlier link already wrote it

      try {
        await persistSettings({ fees: pending });
        // Only clear if nothing newer arrived while we were writing
        if (pendingFeesRef.current === pending) {
          pendingFeesRef.current = null;
          writePendingFees(user?.id, null);
        }
        setFeeSaveError(null);
      } catch (error) {
        console.error('Failed to save fees:', error);
        // Keep the payload so blur / the next edit retries it
        setFeeSaveError(error.message || 'Could not save fees');
      }
    });

    return feeSaveChain.current;
  }, [user]);

  const commitFees = useCallback((nextFees) => {
    setFees(nextFees);

    if (settingsLoadFailed) {
      // Settings could not be read, so we do not know what we would be
      // overwriting. Keep the edit local rather than persisting a guess.
      setFeeSaveError('Settings could not be loaded, so fee changes are not being saved. Reload to try again.');
      return;
    }

    pendingFeesRef.current = nextFees;
    writePendingFees(user.id, nextFees);

    if (feeSaveTimer.current) clearTimeout(feeSaveTimer.current);
    feeSaveTimer.current = setTimeout(flushFees, 800);
  }, [flushFees, settingsLoadFailed]);

  // Do not lose an in-flight edit when the tab is closed, hidden or reloaded.
  // The unmount cleanup alone cannot cover teardown - it cannot await.
  useEffect(() => {
    const handlePageHide = () => { flushFees(); };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushFees();
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
      flushFees();
    };
  }, [flushFees]);

  const updateFees = (newFees) => commitFees(newFees);

  const addFee = (fee) => {
    const newFee = {
      id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: fee.name || 'New Fee',
      type: fee.type || 'fixed',
      value: fee.value || 0,
    };
    commitFees([...fees, newFee]);
    return newFee;
  };

  const updateFee = (feeId, updates) =>
    commitFees(fees.map(f => (f.id === feeId ? { ...f, ...updates } : f)));

  const deleteFee = (feeId) => commitFees(fees.filter(f => f.id !== feeId));

  const resetFees = () => commitFees(DEFAULT_FEES);


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
    if (!doc.type || !doc.buyingIntentId) {
      throw new Error('Document must have type and buyingIntentId');
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        type: doc.type,
        buying_intent_id: doc.buyingIntentId,
        supplier_quote_id: doc.supplierQuoteId || null,
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

  /**
   * Persist user settings.
   *
   * `apiKey` is write-only: pass a string to replace the stored key, pass null
   * to clear it, omit it to leave it untouched. It is never read back into
   * browser state - only the `hasApiKey` flag is.
   */
  const persistSettings = async (patch) => {
    if (!user) throw new Error('User not authenticated');

    // We could not read the row, so we do not know what an upsert would be
    // overwriting. Refuse rather than persist defaults over real settings.
    if (settingsLoadFailed) {
      throw new Error(
        'Your settings could not be loaded, so changes cannot be saved safely. Please reload the page.'
      );
    }

    const row = {};
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.fees !== undefined) row.fees = patch.fees;
    if (patch.fxRates !== undefined) row.fx_rates = patch.fxRates;
    if (patch.apiKey !== undefined) row.api_key = patch.apiKey || null;

    if (Object.keys(row).length === 0) return;

    // onConflict on the unique user_id avoids the select-then-branch race that
    // could insert two rows for the same user.
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, ...row }, { onConflict: 'user_id' });

    if (error) throw error;
  };

  const updateSettings = async (newSettings) => {
    await persistSettings(newSettings);

    setSettings(prev => ({
      ...prev,
      currency: newSettings.currency ?? prev.currency,
      fxRates: newSettings.fxRates ?? prev.fxRates,
      hasApiKey:
        newSettings.apiKey === undefined
          ? prev.hasApiKey
          : Boolean(newSettings.apiKey),
      serverHasKey: prev.serverHasKey,
    }));
  };

  /**
   * Export everything the signed-in user owns as a JSON backup object.
   * The Settings page called actions.exportData(), which did not exist and
   * threw a TypeError on click.
   */
  const exportData = () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    // Deliberately excludes user_settings: it holds the API key.
    data: { products, quotes, suppliers, orders, documents, lineItems: allLineItems },
  });

  /**
   * Permanently delete every row this user owns.
   * The "Clear all data" button previously removed an unused localStorage key
   * and reloaded, so it claimed to delete everything and deleted nothing.
   */
  const clearAllData = async () => {
    if (!user) throw new Error('User not authenticated');

    // Order matters: quote_line_items and documents cascade from their parents,
    // but delete explicitly so nothing is left if a cascade is missing.
    const tables = ['documents', 'supplier_quotes', LEGACY_QUOTES_TABLE, 'orders', 'suppliers', 'products'];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq('user_id', user.id);
      if (error && !isMissingTableError(error)) {
        throw new Error(`Failed to clear ${table}: ${error.message}`);
      }
    }

    await fetchAllData();
  };

  const toggleQuoteSelection = (quoteId) => {
    setSelectedQuotes(prev => prev.includes(quoteId) ? prev.filter(id => id !== quoteId) : [...prev, quoteId]);
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
   * Note: Now synchronous - filters from pre-loaded allLineItems via ref
   * All callers that `await` this still work (await on non-Promise returns the value)
   */
  const getLineItemsForBuyingIntent = useCallback((buyingIntentId) => {
    if (!user) return [];
    // Reads `allLineItems` (state), not the ref. Keying off the ref meant the
    // callback identity never changed when line items did, so memoised
    // consumers kept showing stale counts after an upload.
    return allLineItems.filter(item => item.linked_buying_intent_id === buyingIntentId);
  }, [user, allLineItems]);

  // Legacy alias for backwards compatibility
  const getLineItemsForProduct = getLineItemsForBuyingIntent;

  // Memoize computed object so consumers' useEffect deps don't trigger on every render
  const computedMemo = useMemo(() => ({
    getProductQuotes, getSupplierQuotes, getProductById, getActiveOrders, getDocumentCategories,
    getLineItemsForProduct, // Legacy alias
    getLineItemsForBuyingIntent, // Filter line items by buying intent (now synchronous)
    getDocumentsForBuyingIntent, // Query documents by buying intent
    calculateLandedCost,
  }), [getProductQuotes, getSupplierQuotes, getProductById, getActiveOrders, getDocumentCategories,
       getLineItemsForBuyingIntent, getDocumentsForBuyingIntent, calculateLandedCost]);

  // Actions are only ever invoked from event handlers, never used as render
  // inputs, so we expose a referentially stable facade that always dispatches
  // to the latest closure. Without this the whole context value changed
  // identity on every provider render and re-rendered every consumer.
  const latestActions = useRef({});
  latestActions.current = {
    addProduct, updateProduct, deleteProduct, finalizeBuyingIntent,
    addQuote, updateQuote, deleteQuote,
    addSupplierQuote, // NEW: Multi-item quote support
    addSupplier, updateSupplier, deleteSupplier,
    addOrder, updateOrder, deleteOrder,
    addDocument, updateDocument, deleteDocument,
    updateFees, addFee, updateFee, deleteFee, resetFees, flushFees,
    updateSettings, toggleQuoteSelection, setSelectedQuotes,
    refreshData: fetchAllData,
    clearAllSeedData, clearAllData, exportData,
  };

  const actions = useMemo(() => {
    const stable = {};
    for (const key of Object.keys(latestActions.current)) {
      stable[key] = (...args) => latestActions.current[key](...args);
    }
    return stable;
  }, []);

  const state = useMemo(
    () => ({ products, quotes, suppliers, orders, documents, fees, settings, selectedQuotes, loading, allLineItems, feeSaveError, settingsLoadFailed }),
    [products, quotes, suppliers, orders, documents, fees, settings, selectedQuotes, loading, allLineItems, feeSaveError, settingsLoadFailed]
  );

  // Memoised so consumers do not re-render on every provider render
  const value = useMemo(
    () => ({ state, actions, computed: computedMemo }),
    [state, actions, computedMemo]
  );

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
