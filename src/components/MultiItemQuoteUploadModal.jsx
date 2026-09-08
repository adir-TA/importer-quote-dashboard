import React, { useRef, useState } from 'react';
import {
  X, Upload, FileText, Image, AlertCircle, CheckCircle, Loader,
  Trash2, Plus, Info, ChevronDown, ChevronRight, Lock, Check, Search,
  User, Package, Eye
} from 'lucide-react';
import { useMultiItemQuoteExtraction } from '../hooks/useMultiItemQuoteExtraction';
import { useAppContext, canUseAi } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import { calculateMatchConfidence, findBestMatch } from '../utils/buyingIntentMatcher';
import { generateAutoName, generateAutoDescription } from '../utils/autoNaming';
import API_BASE_URL from '../config/api';
import { fetchJson, formatApiError } from '../utils/apiHelpers';

// ============================================
// MULTI-ITEM QUOTE UPLOAD MODAL
// ============================================
//
// Trust-First UX Principles:
// 1. Hide percentages - use human-readable labels
// 2. Auto-lock high confidence (no dropdown)
// 3. Trust-building copy in match details
// 4. Inline expandable match details (not floating)
// 5. Directive auto-match summary
// 6. Dropdowns only close on selection or Escape
// ============================================

const ACCEPTED_FILES = '.pdf,.xlsx,.xls,.png,.jpg,.jpeg,.webp';

// Helper component for field confidence badges with source
function FieldConfidenceBadge({ field, label }) {
  if (!field) return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>(Not found)</span>;

  if (field.status === 'extracted') {
    const sourceColors = {
      header: { bg: 'var(--accent-light)', text: 'var(--accent-text)', label: 'Header' },
      footer: { bg: 'var(--error-light)', text: 'var(--error)', label: 'Footer' },
      body: { bg: 'var(--warning-light)', text: 'var(--warning)', label: 'Body' },
    };

    const sourceStyle = field.source && sourceColors[field.source];

    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 500 }}>✓ Found</span>
        {sourceStyle && (
          <span style={{
            fontSize: 'var(--text-xs)',
            background: sourceStyle.bg,
            color: sourceStyle.text,
            padding: '2px 6px',
            borderRadius: 'var(--radius-xs)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
          }}>
            {sourceStyle.label}
          </span>
        )}
      </div>
    );
  }

  if (field.status === 'not_found') {
    return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>(Not found)</span>;
  }

  return null;
}

// Product Specs Popover - Shows all product specifications
function ProductSpecsPopover({ item, onClose, anchorRef }) {
  const hasSpecs = item.material || item.dimensions || item.weight_g ||
                   item.packing_pcs_per_ctn || item.carton_length_cm ||
                   item.cbm_per_carton || item.raw_product_name;

  if (!hasSpecs) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: '4px',
        background: 'white',
        border: '2px solid var(--accent)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        zIndex: 1000,
        minWidth: '280px',
        maxWidth: '350px',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--accent-light)',
        borderBottom: '1px solid var(--accent-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--accent-text)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Info size={14} />
          Product Specifications
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {item.raw_product_name && item.raw_product_name !== item.productName && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                marginBottom: '3px',
              }}>
                Raw Name (Debug)
              </div>
              <div style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                background: 'var(--grey-50)',
                padding: '6px 8px',
                borderRadius: 'var(--radius-xs)',
                fontFamily: 'monospace',
                border: '1px solid var(--border)',
              }}>
                {item.raw_product_name}
              </div>
            </div>
          )}

          {item.material && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                marginBottom: '3px',
              }}>
                Material
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {item.material}
              </div>
            </div>
          )}

          {item.dimensions && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                marginBottom: '3px',
              }}>
                Dimensions
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {item.dimensions}
              </div>
            </div>
          )}

          {item.weight_g && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                marginBottom: '3px',
              }}>
                Weight
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {item.weight_g}g
              </div>
            </div>
          )}

          {item.packing_pcs_per_ctn && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                marginBottom: '3px',
              }}>
                Packing
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {item.packing_pcs_per_ctn} pcs/carton
              </div>
            </div>
          )}

          {(item.carton_length_cm || item.carton_width_cm || item.carton_height_cm) && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                marginBottom: '3px',
              }}>
                Carton Dimensions
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {item.carton_length_cm || '?'} × {item.carton_width_cm || '?'} × {item.carton_height_cm || '?'} cm
              </div>
            </div>
          )}

          {item.cbm_per_carton && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                marginBottom: '3px',
              }}>
                CBM per Carton
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {item.cbm_per_carton} m³
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Confidence Badge Component - Suggestions Only
function ConfidenceBadge({ level, confidence }) {
  const badges = {
    high: {
      label: 'Strong Suggestion',
      icon: Info,
      bg: 'var(--accent-light)',
      text: 'var(--accent-text)',
      border: 'var(--accent-border)',
    },
    medium: {
      label: 'Suggested',
      icon: Info,
      bg: 'var(--warning-light)',
      text: 'var(--warning)',
      border: 'var(--warning-border)',
    },
    low: {
      label: 'Weak Suggestion',
      icon: AlertCircle,
      bg: 'var(--grey-100)',
      text: 'var(--text-muted)',
      border: 'var(--border-strong)',
    },
  };

  const badge = badges[level] || badges.low;
  const Icon = badge.icon;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 10px',
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      borderRadius: 'var(--radius-xs)',
      background: badge.bg,
      color: badge.text,
      border: `1px solid ${badge.border}`,
      marginInlineStart: '6px',
    }}>
      <Icon size={12} />
      <span>{badge.label}</span>
    </div>
  );
}

// Inline Match Details Component
function InlineMatchDetails({ item, buyingIntent, matchBreakdown, confidence, confidenceLevel, onClose }) {
  if (!buyingIntent || !matchBreakdown) return null;

  // Match explanation (factual, not confident)
  const getMatchExplanation = () => {
    if (confidenceLevel === 'high') {
      return "Dimensions and weight match. Any other differences are labeling only.";
    } else if (confidenceLevel === 'medium') {
      return "Physical specs are similar. Review the breakdown below to confirm.";
    } else {
      return "Some specs differ. Check the breakdown before accepting this suggestion.";
    }
  };

  return (
    <tr>
      <td colSpan="8" style={{ padding: 0, background: 'var(--grey-50)', borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '16px', fontSize: 'var(--text-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-secondary)' }}>
                Suggested: {buyingIntent.name}
              </div>
              {buyingIntent.category && (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Category: {buyingIntent.category}
                </div>
              )}
              <div style={{
                marginTop: '8px',
                padding: '8px 12px',
                background: 'var(--grey-100)',
                borderInlineStart: '3px solid var(--text-subtle)',
                borderRadius: 'var(--radius-xs)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
              }}>
                {getMatchExplanation()}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: 'var(--text-secondary)',
              }}
              title="Close details"
            >
              <X size={16} />
            </button>
          </div>

          {/* Match Breakdown - Grouped by Priority */}
          <div style={{ marginTop: '16px' }}>
            <div style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              Match Breakdown
            </div>

            {/* Physical Specs Section */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                marginBottom: '6px',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                Physical Specifications
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {['dimensions', 'weight'].map(key => {
                  const data = matchBreakdown[key];
                  if (!data) return null;
                  const scorePercent = data.score;
                  const barColor = scorePercent >= 80 ? 'var(--success)' : scorePercent >= 50 ? 'var(--warning)' : 'var(--error)';

                  return (
                    <div key={key} style={{
                      background: 'white',
                      padding: '10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{
                          textTransform: 'capitalize',
                          fontWeight: 500,
                          fontSize: 'var(--text-sm)',
                        }}>
                          {key}
                        </span>
                        <span style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-secondary)',
                        }}>
                          {data.weight}% weight
                        </span>
                      </div>
                      <div style={{
                        height: '8px',
                        background: 'var(--border)',
                        borderRadius: 'var(--radius-xs)',
                        overflow: 'hidden',
                        marginBottom: '4px',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${scorePercent}%`,
                          background: barColor,
                          transition: 'width 0.3s',
                          borderRadius: 'var(--radius-xs)',
                        }} />
                      </div>
                      {data.detail && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {data.detail.explanation || JSON.stringify(data.detail)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Other Attributes Section */}
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                marginBottom: '6px',
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                Material & Naming
              </div>
              <div style={{ display: 'grid', gap: '8px' }}>
                {['material', 'name'].map(key => {
                  const data = matchBreakdown[key];
                  if (!data) return null;
                  const scorePercent = data.score;

                  // Name mismatch uses neutral/amber, never red
                  let barColor;
                  if (key === 'name') {
                    barColor = scorePercent >= 80 ? 'var(--success)' : 'var(--warning)'; // Green or amber only
                  } else {
                    barColor = scorePercent >= 80 ? 'var(--success)' : scorePercent >= 50 ? 'var(--warning)' : 'var(--error)';
                  }

                  // Special label for name differences
                  const label = key === 'name' && scorePercent < 50
                    ? 'Supplier naming differs (common in quotes)'
                    : key;

                  return (
                    <div key={key} style={{
                      background: 'white',
                      padding: '10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{
                          textTransform: key === 'name' && scorePercent < 50 ? 'none' : 'capitalize',
                          fontWeight: 500,
                          fontSize: 'var(--text-sm)',
                        }}>
                          {label}
                        </span>
                        <span style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-secondary)',
                        }}>
                          {data.weight}% weight
                        </span>
                      </div>
                      <div style={{
                        height: '8px',
                        background: 'var(--border)',
                        borderRadius: 'var(--radius-xs)',
                        overflow: 'hidden',
                        marginBottom: '4px',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${scorePercent}%`,
                          background: barColor,
                          transition: 'width 0.3s',
                          borderRadius: 'var(--radius-xs)',
                        }} />
                      </div>
                      {data.detail && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                          {data.detail.explanation || JSON.stringify(data.detail)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function MultiItemQuoteUploadModal({ isOpen, onClose, onSuccess, preselectedBuyingIntentId = null }) {
  const { state, actions } = useAppContext();
  const { alert: showAlert } = useModal();
  const { settings, products: rawProducts } = state;
  // Ensure products is always an array to prevent useMemo errors
  const products = rawProducts || [];
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [attachWarning, setAttachWarning] = useState('');
  const [expandedMatchDetails, setExpandedMatchDetails] = useState({});
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [showCreateIntent, setShowCreateIntent] = useState(null); // index of line item creating intent for
  const [newIntentName, setNewIntentName] = useState('');
  const [newIntentCategory, setNewIntentCategory] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]); // for filtering buying intents
  const [inputMode, setInputMode] = useState('file'); // 'file' or 'text'
  const [textInput, setTextInput] = useState('');
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    preview: false,
    supplier: false,
    lineItems: false,
  });
  const [openBuyingIntentDropdown, setOpenBuyingIntentDropdown] = useState(null); // index of line item with open dropdown
  const [buyingIntentSearch, setBuyingIntentSearch] = useState('');
  const [openSpecsPopover, setOpenSpecsPopover] = useState(null); // index of line item with open specs popover

  const hookResult = useMultiItemQuoteExtraction(canUseAi(settings), products);

  const {
    step = 'idle',
    progress = '',
    error = null,
    extraction = null,
    supplierFields = {},
    editableLineItems = [],
    uploadedFile = null,
    missingSupplierFields = [],
    invalidLineItems = [],
    canSave = false,
    processFile = () => {},
    processText = () => {},
    updateSupplierField = () => {},
    updateLineItem = () => {},
    deleteLineItem = () => {},
    getQuoteData = () => {},
    reset = () => {},
  } = hookResult || {};

  // Get unique categories from products
  const categories = React.useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  // Filter categories by search
  const filteredCategories = React.useMemo(() => {
    if (!categories || categories.length === 0) return [];
    if (!categorySearch.trim()) return categories;
    return categories.filter(cat =>
      cat.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categories, categorySearch]);

  // Filter products by selected categories
  const filteredProducts = React.useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    if (selectedCategories.length === 0) return products;
    return products.filter(p => selectedCategories.includes(p.category));
  }, [products, selectedCategories]);

  // Filter buying intents by search query
  const getFilteredBuyingIntents = (searchQuery) => {
    if (!filteredProducts || !Array.isArray(filteredProducts)) return [];
    if (!searchQuery.trim()) return filteredProducts;
    const query = searchQuery.toLowerCase();
    return filteredProducts.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.category && p.category.toLowerCase().includes(query))
    );
  };

  // Toggle category selection
  const toggleCategory = (category) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Handle category selection in create intent form
  const handleSelectCategory = (category) => {
    setNewIntentCategory(category);
    setShowCategoryDropdown(false);
    setCategorySearch('');
  };

  // Handle create new category
  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      showAlert({ title: 'Check your input', message: 'Please enter a category name', type: 'warning' });
      return;
    }
    setNewIntentCategory(newCategoryName.trim());
    setShowCreateCategory(false);
    setShowCategoryDropdown(false);
    setNewCategoryName('');
    setCategorySearch('');
  };

  // Create preview URL when uploadedFile changes
  React.useEffect(() => {
    if (uploadedFile) {
      const url = URL.createObjectURL(uploadedFile);
      setFilePreviewUrl(url);
      console.log('[Modal] Created preview URL for uploaded file:', uploadedFile.name);
      return () => URL.revokeObjectURL(url);
    } else {
      setFilePreviewUrl(null);
    }
  }, [uploadedFile]);

  // Close dropdowns and popovers on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (openBuyingIntentDropdown !== null) {
          setOpenBuyingIntentDropdown(null);
          setBuyingIntentSearch('');
        }
        if (openSpecsPopover !== null) {
          setOpenSpecsPopover(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openBuyingIntentDropdown, openSpecsPopover]);

  // No early return needed - component only mounts when isOpen is true (conditional rendering in parent)

  // ============================================
  // HANDLERS
  // ============================================

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleSave = async () => {
    const data = getQuoteData();
    if (!data) {
      setSaveError('Please fill in all required fields before saving.');
      return;
    }

    setSaveError('');
    setAttachWarning('');
    setSaving(true);
    try {
      console.log('[Modal] Saving quote data:', data);
      console.log('[Modal] Uploaded file:', uploadedFile);

      // Auto-create draft Buying Intents for unlinked items (with duplicate prevention).
      //
      // `candidateIntents` accumulates intents created during this loop. Matching
      // against the render-time `products` array alone meant two similar line
      // items in the same quote each created their own duplicate draft, because
      // the first one was not yet visible to the second iteration.
      const candidateIntents = [...products];
      const createdIntentIds = [];
      const updatedLineItems = [];

      for (const item of data.lineItems) {
        let linkedBuyingIntentId = item.linkedBuyingIntentId;

        // If no linked intent, check for existing matches first
        if (!linkedBuyingIntentId) {
          const bestMatch = findBestMatch(item, candidateIntents);

          if (bestMatch && bestMatch.matchResult.confidence >= 85) {
            // Found a strong match - use existing intent instead of creating duplicate
            linkedBuyingIntentId = bestMatch.intent.id;
            console.log('[Modal] Reusing existing Buying Intent', `(${bestMatch.matchResult.confidence}% confidence)`);
          } else {
            // No good match found - create new draft Buying Intent
            const autoName = generateAutoName(data.supplierQuote, item);
            const autoDescription = generateAutoDescription(data.supplierQuote, item);
            const draftIntent = await actions.addProduct({
              name: autoName,
              status: 'draft',
              category: item.category || null,
              description: autoDescription
            });

            linkedBuyingIntentId = draftIntent.id;
            createdIntentIds.push(draftIntent.id);
            candidateIntents.push(draftIntent); // visible to later items in this quote
            console.log('[Modal] Created draft Buying Intent:', draftIntent.id);
          }
        }

        updatedLineItems.push({
          ...item,
          linkedBuyingIntentId
        });
      }

      // Update data with auto-linked items
      const finalData = {
        ...data,
        lineItems: updatedLineItems
      };

      let result;
      try {
        result = await actions.addSupplierQuote(finalData.supplierQuote, finalData.lineItems);
      } catch (saveError) {
        // Clean up the drafts we just created, otherwise a failed save leaves
        // orphaned Buying Intents behind on every retry.
        for (const intentId of createdIntentIds) {
          try {
            await actions.deleteProduct(intentId);
          } catch (cleanupError) {
            console.error('[Modal] Failed to clean up draft intent', intentId, cleanupError);
          }
        }
        throw saveError;
      }
      console.log('✅ [Modal] Saved supplier quote:', result?.id);

      // Auto-upload the quote file as a document
      console.log('[Modal] Checking auto-upload conditions:', {
        hasUploadedFile: !!uploadedFile,
        uploadedFileName: uploadedFile?.name,
        supplierQuoteId: result?.id,
        resultStructure: result
      });

      if (uploadedFile && result?.id) {
        console.log('[Modal] Auto-uploading quote as document...');

        // Get unique buying intent IDs from line items
        const uniqueBuyingIntentIds = [...new Set(
          finalData.lineItems
            .filter(item => item.linkedBuyingIntentId)
            .map(item => item.linkedBuyingIntentId)
        )];

        console.log('[Modal] Unique buying intent IDs:', uniqueBuyingIntentIds);

        // Upload document for each unique buying intent
        const attachFailures = [];

        for (const buyingIntentId of uniqueBuyingIntentIds) {
          try {
            // Step 1: Upload file to backend.
            // `userId` is no longer sent - the backend takes it from the
            // verified access token that authFetch attaches.
            const formData = new FormData();
            formData.append('file', uploadedFile);
            formData.append('buyingIntentId', buyingIntentId);
            formData.append('supplierQuoteId', result.id);

            const uploadResult = await fetchJson(`${API_BASE_URL}/api/documents/upload`, {
              method: 'POST',
              body: formData,
            });

            if (!uploadResult.ok) {
              throw new Error(formatApiError(uploadResult.error, uploadResult.error?.httpStatus));
            }

            const uploadedFileData = uploadResult.data?.file;
            if (!uploadedFileData?.path) {
              throw new Error('Upload succeeded but no file path was returned');
            }

            // Step 2: Save document metadata to database.
            // `type` MUST be uppercase: the documents table has
            // CHECK (upper(type) IN ('PI','QUOTE','SPEC','OTHER')) and the
            // lowercase 'quote' used here before failed that check on every
            // single upload.
            await actions.addDocument({
              type: 'QUOTE',
              buyingIntentId,
              supplierQuoteId: result.id,
              filePath: uploadedFileData.path,
              fileName: uploadedFile.name,
              fileType: uploadedFile.type,
              fileSize: uploadedFile.size,
            });

            console.log(`✅ [Modal] Document attached to buying intent: ${buyingIntentId}`);
          } catch (docError) {
            // The quote itself is saved, so this is not fatal - but it must be
            // visible. It used to be logged and silently dropped, so users had
            // no idea their quote file was never attached.
            console.error(`❌ [Modal] Failed to attach document for ${buyingIntentId}:`, docError);
            attachFailures.push(docError.message || 'Unknown error');
          }
        }

        if (attachFailures.length > 0) {
          setAttachWarning(
            `Your quote was saved, but the source file could not be attached to ` +
            `${attachFailures.length} of ${uniqueBuyingIntentIds.length} Buying Intent(s). ` +
            `You can upload it manually from the Documents tab. (${attachFailures[0]})`
          );
        }
      } else {
        console.log('[Modal] Skipping auto-upload - no file or no saved quote id');
      }

      if (onSuccess) onSuccess(result);
      handleClose();
    } catch (err) {
      console.error('❌ [Modal] Save failed:', err);
      setSaveError(err.message || 'Failed to save quote');
    } finally {
      setSaving(false);
    }
  };

  // Calculate match statistics for all line items
  const matchStats = React.useMemo(() => {
    if (!editableLineItems || editableLineItems.length === 0 || !products) {
      return { total: 0, highConfidence: 0, hasMatches: 0, allHighConfidence: false };
    }

    let highConfidence = 0;
    let hasMatches = 0;

    editableLineItems.forEach(item => {
      try {
        const bestMatch = findBestMatch(item, products);
        if (bestMatch) {
          hasMatches++;
          if (bestMatch.matchResult.confidence >= 85) {
            highConfidence++;
          }
        }
      } catch (error) {
        console.error('[Modal] Error calculating match for item:', item, error);
      }
    });

    return {
      total: editableLineItems.length,
      highConfidence,
      hasMatches,
      allHighConfidence: highConfidence === editableLineItems.length && editableLineItems.length > 0,
    };
  }, [editableLineItems, products]);

  // Accept all high-confidence suggestions
  const handleAcceptAllSuggestions = () => {
    if (!editableLineItems || !products) return;

    editableLineItems.forEach((item, index) => {
      // Only auto-accept if no buying intent already selected
      if (!item.linkedBuyingIntentId) {
        try {
          const bestMatch = findBestMatch(item, products);
          if (bestMatch && bestMatch.matchResult.confidence >= 85) {
            handleBuyingIntentChange(index, bestMatch.intent.id);
          }
        } catch (error) {
          console.error('[Modal] Error accepting suggestion for item:', item, error);
        }
      }
    });
  };

  // Quick save handler - auto-creates drafts without review
  const handleQuickSave = async () => {
    setSaving(true);
    try {
      // Use the existing handleSave logic
      await handleSave();
    } catch (error) {
      console.error('[Modal] Quick save failed:', error);
      showAlert({ title: 'Error', message: 'Failed to save quote: ' + error.message, type: 'error' });
      setSaving(false);
    }
  };

  const handleClose = () => {
    reset();
    setExpandedMatchDetails({});
    setShowCreateIntent(null);
    setNewIntentName('');
    setNewIntentCategory('');
    setShowCategoryDropdown(false);
    setCategorySearch('');
    setShowCreateCategory(false);
    setNewCategoryName('');
    setSelectedCategories([]);
    setOpenBuyingIntentDropdown(null);
    setBuyingIntentSearch('');
    setOpenSpecsPopover(null);
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl(null);
    }
    onClose();
  };

  const handleCreateNewIntent = async (lineItemIndex) => {
    if (!newIntentName.trim()) {
      showAlert({ title: 'Check your input', message: 'Please enter a name for the new Buying Intent', type: 'warning' });
      return;
    }

    if (!newIntentCategory.trim()) {
      showAlert({ title: 'Check your input', message: 'Please select or create a category', type: 'warning' });
      return;
    }

    try {
      const lineItem = editableLineItems[lineItemIndex];

      // Populate weight and dimensions from the line item
      const newIntentData = {
        name: newIntentName.trim(),
        category: newIntentCategory.trim(),
        dimensions: lineItem.dimensions || null,
        weight_g: lineItem.weight_g ? parseInt(lineItem.weight_g) : null,
      };

      console.log('Creating new buying intent with specs:', newIntentData);

      const newIntent = await actions.addProduct(newIntentData);

      console.log('✅ Created new buying intent with specs:', newIntent);

      // Link the new intent to this line item
      handleBuyingIntentChange(lineItemIndex, newIntent.id);

      // Close the create form and reset states
      setShowCreateIntent(null);
      setNewIntentName('');
      setNewIntentCategory('');
      setShowCategoryDropdown(false);
      setCategorySearch('');
      setShowCreateCategory(false);
      setNewCategoryName('');
    } catch (err) {
      console.error('❌ Failed to create buying intent:', err);
      showAlert({ title: 'Error', message: 'Failed to create buying intent: ' + err.message, type: 'error' });
    }
  };

  const toggleMatchDetails = (index) => {
    setExpandedMatchDetails(prev => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const toggleSection = (section) => {
    setSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleBuyingIntentChange = (index, intentId) => {
    updateLineItem(index, 'linkedBuyingIntentId', intentId || null);

    // Recalculate match confidence if a new intent is selected
    if (intentId) {
      const item = editableLineItems[index];
      const intent = products.find(p => p.id === intentId);
      if (intent) {
        const matchResult = calculateMatchConfidence(item, intent);
        updateLineItem(index, 'matchConfidence', matchResult.confidence);
        updateLineItem(index, 'matchConfidenceLevel', matchResult.confidenceLevel);
        updateLineItem(index, 'matchBreakdown', matchResult.breakdown);
        updateLineItem(index, 'autoMatched', false); // Manual override
      }
    } else {
      // Clear match data if deselected
      updateLineItem(index, 'matchConfidence', null);
      updateLineItem(index, 'matchConfidenceLevel', null);
      updateLineItem(index, 'matchBreakdown', null);
      updateLineItem(index, 'autoMatched', false);
    }
  };

  // Count suggestions and selections
  const suggestionStats = React.useMemo(() => {
    if (!editableLineItems || !Array.isArray(editableLineItems)) {
      return {
        high: 0,
        medium: 0,
        low: 0,
        totalSuggestions: 0,
        totalSelected: 0,
      };
    }

    return {
      high: editableLineItems.filter(i => i.suggestedBuyingIntentId && i.matchConfidenceLevel === 'high').length,
      medium: editableLineItems.filter(i => i.suggestedBuyingIntentId && i.matchConfidenceLevel === 'medium').length,
      low: editableLineItems.filter(i => i.suggestedBuyingIntentId && i.matchConfidenceLevel === 'low').length,
      totalSuggestions: editableLineItems.filter(i => i.suggestedBuyingIntentId).length,
      totalSelected: editableLineItems.filter(i => i.linkedBuyingIntentId).length,
    };
  }, [editableLineItems]);

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>
            Upload Supplier Quote
            {preselectedBuyingIntentId && (
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--text-secondary)', marginInlineStart: '12px' }}>
                (Auto-linking to selected intent)
              </span>
            )}
          </h2>
          <button onClick={handleClose} style={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* IDLE: Upload or Paste Text */}
          {step === 'idle' && (
            <div>
              {/* Mode Selector Tabs */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '20px',
                borderBottom: '1px solid var(--border)',
              }}>
                <button
                  onClick={() => setInputMode('file')}
                  style={{
                    padding: '12px 24px',
                    background: 'none',
                    border: 'none',
                    borderBottom: inputMode === 'file' ? '3px solid var(--accent)' : '3px solid transparent',
                    color: inputMode === 'file' ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: inputMode === 'file' ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  Upload File
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  style={{
                    padding: '12px 24px',
                    background: 'none',
                    border: 'none',
                    borderBottom: inputMode === 'text' ? '3px solid var(--accent)' : '3px solid transparent',
                    color: inputMode === 'text' ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: inputMode === 'text' ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  Paste Text
                </button>
              </div>

              {/* File Upload Mode */}
              {inputMode === 'file' && (
                <div
                  style={{ ...styles.dropzone, ...(dragActive ? styles.dropzoneActive : {}) }}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={48} color="var(--text-subtle)" />
                  <p style={styles.dropzoneText}>
                    Drop quote file here or <span style={styles.link}>browse</span>
                  </p>
                  <p style={styles.dropzoneHint}>
                    Supports: PDF, Excel, Images
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILES}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </div>
              )}

              {/* Text Input Mode */}
              {inputMode === 'text' && (
                <div>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Paste your quote message here...

Example:
hi  MOQ 500rolls  RMB 2.5  fob ningbo
$ 0.36 /roll

Or:
The price is USD 0.5 per roll FOB Shenzhen, with a Minimum Order Quantity (MOQ) of 1,000 rolls"
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      padding: '16px',
                      border: '2px dashed var(--border)',
                      borderRadius: 'var(--radius-lg)',
                      fontSize: 'var(--text-md)',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                  />
                  <button
                    onClick={() => {
                      if (!textInput.trim()) {
                        showAlert({ title: 'Check your input', message: 'Please paste some text first', type: 'warning' });
                        return;
                      }
                      processText(textInput);
                    }}
                    disabled={!textInput.trim()}
                    style={{
                      marginTop: '16px',
                      padding: '12px 24px',
                      background: textInput.trim() ? 'var(--accent)' : 'var(--bg-light)',
                      color: textInput.trim() ? 'white' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-md)',
                      fontWeight: 600,
                      cursor: textInput.trim() ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                    }}
                  >
                    Extract Quote
                  </button>
                </div>
              )}
            </div>
          )}

          {/* EXTRACTING */}
          {step === 'extracting' && (
            <div style={styles.loading}>
              <Loader size={48} color="var(--accent)" style={styles.spinner} />
              <p style={styles.loadingText}>{progress}</p>
            </div>
          )}

          {/* ERROR */}
          {step === 'error' && (
            <div style={styles.error}>
              <AlertCircle size={48} color="var(--error)" />
              <p style={styles.errorText}>{error}</p>
              <button onClick={reset} style={styles.retryButton}>
                Try Again
              </button>
            </div>
          )}

          {/* REVIEW */}
          {step === 'review' && (
            <div style={styles.review}>
              {/* Quick Save Banner - Show when all items have high confidence matches */}
              {matchStats.allHighConfidence && (
                <div style={{
                  background: 'linear-gradient(135deg, var(--success-light) 0%, var(--success-light) 100%)',
                  border: '2px solid var(--success)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  marginBottom: '20px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '12px',
                  }}>
                    <CheckCircle size={32} color="var(--success)" />
                    <div>
                      <h3 style={{
                        margin: 0,
                        fontSize: 'var(--text-lg)',
                        fontWeight: 600,
                        color: 'var(--success)',
                        marginBottom: '4px',
                      }}>
                        Ready to Save!
                      </h3>
                      <p style={{
                        margin: 0,
                        fontSize: 'var(--text-md)',
                        color: 'var(--success)',
                      }}>
                        All {matchStats.total} items have strong matches. You can save immediately or review details first.
                      </p>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginTop: '16px',
                  }}>
                    <button
                      onClick={handleQuickSave}
                      disabled={saving}
                      style={{
                        padding: '12px 24px',
                        background: 'var(--success)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: 'var(--text-md)',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                        opacity: saving ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!saving) {
                          e.target.style.background = 'var(--success)';
                          e.target.style.transform = 'translateY(-1px)';
                          e.target.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'var(--success)';
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.3)';
                      }}
                    >
                      {saving ? (
                        <>
                          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                          Saving...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={18} />
                          Save Quote Now
                        </>
                      )}
                    </button>
                    <div style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-muted)',
                      alignSelf: 'center',
                      fontStyle: 'italic',
                    }}>
                      or scroll down to review details
                    </div>
                  </div>
                </div>
              )}

              {/* File Preview Section */}
              {filePreviewUrl && uploadedFile && (
                <div style={styles.card}>
                  <div
                    style={styles.cardHeader}
                    onClick={() => toggleSection('preview')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={18} />
                      <h3 style={styles.cardTitle}>Quote Preview</h3>
                    </div>
                    {sectionsCollapsed.preview ? (
                      <ChevronRight size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </div>
                  {!sectionsCollapsed.preview && (
                    <div style={styles.cardBody}>
                      <div style={styles.previewContainer}>
                        {uploadedFile.type.startsWith('image/') ? (
                          <img
                            src={filePreviewUrl}
                            alt="Quote preview"
                            style={styles.previewImage}
                          />
                        ) : uploadedFile.type === 'application/pdf' ? (
                          <iframe
                            src={filePreviewUrl}
                            style={styles.previewPdf}
                            title="Quote preview"
                          />
                        ) : (
                          <div style={styles.previewFallback}>
                            <FileText size={48} color="var(--text-subtle)" />
                            <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>
                              {uploadedFile.name}
                            </p>
                            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-subtle)' }}>
                              Preview not available for this file type
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Supplier Info Section */}
              <div style={styles.card}>
                <div
                  style={styles.cardHeader}
                  onClick={() => toggleSection('supplier')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <User size={18} />
                    <h3 style={styles.cardTitle}>Supplier Information</h3>
                  </div>
                  {sectionsCollapsed.supplier ? (
                    <ChevronRight size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </div>
                {!sectionsCollapsed.supplier && (
                  <div style={styles.cardBody}>
                    <div style={styles.grid}>
                      <div style={styles.field}>
                        <label style={styles.label}>
                          Supplier Name <span style={styles.required}>*</span>
                          {' '}
                          <FieldConfidenceBadge field={extraction?.supplierName} />
                        </label>
                        <input
                          type="text"
                          value={supplierFields.supplierName}
                          onChange={(e) => updateSupplierField('supplierName', e.target.value)}
                          style={styles.input}
                          placeholder="Required"
                        />
                        {missingSupplierFields.includes('supplierName') && (
                          <span style={styles.errorHint}>Required field</span>
                        )}
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>
                          Contact Person{' '}
                          <FieldConfidenceBadge field={extraction?.supplierContact} />
                        </label>
                        <input
                          type="text"
                          value={supplierFields.supplierContact}
                          onChange={(e) => updateSupplierField('supplierContact', e.target.value)}
                          style={styles.input}
                        />
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>
                          Email{' '}
                          <FieldConfidenceBadge field={extraction?.supplierEmail} />
                        </label>
                        <input
                          type="email"
                          value={supplierFields.supplierEmail}
                          onChange={(e) => updateSupplierField('supplierEmail', e.target.value)}
                          style={styles.input}
                        />
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>
                          Phone / WhatsApp{' '}
                          <FieldConfidenceBadge field={extraction?.supplierPhone} />
                        </label>
                        <input
                          type="text"
                          value={supplierFields.supplierPhone}
                          onChange={(e) => updateSupplierField('supplierPhone', e.target.value)}
                          style={styles.input}
                          placeholder="Optional"
                        />
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>
                          Address{' '}
                          <FieldConfidenceBadge field={extraction?.supplierAddress} />
                        </label>
                        <textarea
                          value={supplierFields.supplierAddress}
                          onChange={(e) => updateSupplierField('supplierAddress', e.target.value)}
                          style={{...styles.input, minHeight: '60px', resize: 'vertical'}}
                          placeholder="Factory/office address (optional)"
                        />
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>Currency</label>
                        <select
                          value={supplierFields.currency}
                          onChange={(e) => updateSupplierField('currency', e.target.value)}
                          style={styles.input}
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="CNY">CNY</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>
                          Incoterm <span style={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          value={supplierFields.incoterm}
                          onChange={(e) => updateSupplierField('incoterm', e.target.value)}
                          style={styles.input}
                          placeholder="e.g., FOB Shanghai"
                        />
                        {missingSupplierFields.includes('incoterm') && (
                          <span style={styles.errorHint}>Required field</span>
                        )}
                      </div>

                      <div style={styles.field}>
                        <label style={styles.label}>Valid Until</label>
                        <input
                          type="date"
                          value={supplierFields.validUntil}
                          onChange={(e) => updateSupplierField('validUntil', e.target.value)}
                          style={styles.input}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Line Items Table */}
              <div style={styles.card}>
                <div
                  style={styles.cardHeader}
                  onClick={() => toggleSection('lineItems')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Package size={18} />
                    <h3 style={styles.cardTitle}>
                      Line Items ({editableLineItems.length})
                    </h3>
                  </div>
                  {sectionsCollapsed.lineItems ? (
                    <ChevronRight size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </div>
                {!sectionsCollapsed.lineItems && (
                  <div style={styles.cardBody}>
                    {/* Accept All Suggestions Banner */}
                    {matchStats.allHighConfidence && (
                      <div style={{
                        background: 'linear-gradient(135deg, var(--accent-light) 0%, var(--accent-light) 100%)',
                        border: '2px solid var(--accent)',
                        borderRadius: 'var(--radius-md)',
                        padding: '16px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                          <CheckCircle size={24} color="var(--accent)" />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--accent-text)', marginBottom: '2px' }}>
                              ✓ Found matches for all {matchStats.total} items
                            </div>
                            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                              All items have high-confidence matches (85%+). Accept all suggestions to save time.
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptAllSuggestions();
                          }}
                          style={{
                            padding: '12px 24px',
                            background: 'var(--accent)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = 'var(--accent)';
                            e.target.style.transform = 'translateY(-1px)';
                            e.target.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.4)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'var(--accent)';
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.3)';
                          }}
                        >
                          <Check size={18} />
                          Accept All Suggestions
                        </button>
                      </div>
                    )}
                    {editableLineItems.length === 0 ? (
                      <div style={styles.noItems}>
                        <AlertCircle size={32} color="var(--text-subtle)" />
                        <p>No line items extracted</p>
                      </div>
                    ) : (
                  <div style={styles.tableContainer}>
                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Product Name</th>
                          <th style={styles.th}>SKU</th>
                          <th style={styles.th}>Unit Price</th>
                          <th style={styles.th}>MOQ</th>
                          <th style={styles.th}>Dimensions</th>
                          <th style={styles.th}>Weight (g)</th>
                          <th style={styles.th}>Buying Intent</th>
                          <th style={styles.thActions}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editableLineItems.map((item, index) => {
                          const selectedIntent = products.find(p => p.id === item.linkedBuyingIntentId);
                          const suggestedIntent = products.find(p => p.id === item.suggestedBuyingIntentId);
                          const showDetails = expandedMatchDetails[index];

                          return (
                            <React.Fragment key={item.id}>
                              <tr style={styles.tr}>
                                <td style={{ ...styles.td, position: 'relative' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                      type="text"
                                      value={item.productName}
                                      onChange={(e) => updateLineItem(index, 'productName', e.target.value)}
                                      style={{ ...styles.tableInput, flex: 1 }}
                                      placeholder="Required"
                                    />
                                    {/* Info button for specs popover */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenSpecsPopover(openSpecsPopover === index ? null : index);
                                      }}
                                      style={{
                                        background: openSpecsPopover === index ? 'var(--accent-light)' : 'var(--grey-50)',
                                        border: openSpecsPopover === index ? '1px solid var(--accent)' : '1px solid var(--border)',
                                        borderRadius: 'var(--radius-xs)',
                                        cursor: 'pointer',
                                        padding: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: openSpecsPopover === index ? 'var(--accent)' : 'var(--text-secondary)',
                                        transition: 'all 0.2s',
                                        flexShrink: 0,
                                      }}
                                      title="View product specifications"
                                      onMouseEnter={(e) => {
                                        if (openSpecsPopover !== index) {
                                          e.target.style.background = 'var(--grey-100)';
                                          e.target.style.color = 'var(--accent)';
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (openSpecsPopover !== index) {
                                          e.target.style.background = 'var(--grey-50)';
                                          e.target.style.color = 'var(--text-secondary)';
                                        }
                                      }}
                                    >
                                      <Eye size={14} />
                                    </button>
                                  </div>

                                  {/* Specs popover */}
                                  {openSpecsPopover === index && (
                                    <ProductSpecsPopover
                                      item={item}
                                      onClose={() => setOpenSpecsPopover(null)}
                                    />
                                  )}
                                </td>
                                <td style={styles.td}>
                                  <input
                                    type="text"
                                    value={item.sku}
                                    onChange={(e) => updateLineItem(index, 'sku', e.target.value)}
                                    style={styles.tableInput}
                                  />
                                </td>
                                <td style={styles.td}>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={item.unitPrice}
                                    onChange={(e) => updateLineItem(index, 'unitPrice', e.target.value)}
                                    style={{...styles.tableInput, width: '80px'}}
                                    placeholder="Required"
                                  />
                                </td>
                                <td style={styles.td}>
                                  <input
                                    type="number"
                                    value={item.moq}
                                    onChange={(e) => updateLineItem(index, 'moq', e.target.value)}
                                    style={{...styles.tableInput, width: '70px'}}
                                  />
                                </td>
                                <td style={styles.td}>
                                  <input
                                    type="text"
                                    value={item.dimensions}
                                    onChange={(e) => updateLineItem(index, 'dimensions', e.target.value)}
                                    style={styles.tableInput}
                                  />
                                </td>
                                <td style={styles.td}>
                                  <input
                                    type="number"
                                    value={item.weight_g}
                                    onChange={(e) => updateLineItem(index, 'weight_g', e.target.value)}
                                    style={{...styles.tableInput, width: '70px'}}
                                  />
                                </td>
                                <td style={styles.td}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {/* Suggestion with Apply button (if available) */}
                                    {suggestedIntent && !selectedIntent && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 8px',
                                        background: 'var(--grey-50)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-xs)',
                                      }}>
                                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', flex: 1 }}>
                                          Suggested: {suggestedIntent.name}
                                        </span>
                                        <button
                                          onClick={() => handleBuyingIntentChange(index, suggestedIntent.id)}
                                          style={{
                                            padding: '4px 8px',
                                            fontSize: 'var(--text-xs)',
                                            background: 'var(--accent)',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 'var(--radius-xs)',
                                            cursor: 'pointer',
                                            fontWeight: 500,
                                          }}
                                          title="Apply this suggestion"
                                        >
                                          Apply
                                        </button>
                                      </div>
                                    )}

                                    {/* Create new intent form */}
                                    {showCreateIntent === index ? (
                                      <div style={{
                                        padding: '12px',
                                        background: 'var(--accent-light)',
                                        border: '1px solid var(--accent)',
                                        borderRadius: 'var(--radius-sm)',
                                      }}>
                                        {/* Name input */}
                                        <input
                                          type="text"
                                          value={newIntentName}
                                          onChange={(e) => setNewIntentName(e.target.value)}
                                          placeholder="Buying Intent Name *"
                                          style={{
                                            ...styles.tableInput,
                                            width: '100%',
                                            marginBottom: '8px',
                                          }}
                                          autoFocus
                                        />

                                        {/* Category dropdown */}
                                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                                          {showCreateCategory ? (
                                            /* Create new category form */
                                            <div style={{
                                              display: 'flex',
                                              gap: '6px',
                                              marginBottom: '6px',
                                            }}>
                                              <input
                                                type="text"
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                placeholder="New category name"
                                                style={{
                                                  ...styles.tableInput,
                                                  flex: 1,
                                                }}
                                                autoFocus
                                              />
                                              <button
                                                onClick={handleCreateCategory}
                                                style={{
                                                  padding: '6px 12px',
                                                  fontSize: 'var(--text-xs)',
                                                  background: 'var(--success)',
                                                  color: 'white',
                                                  border: 'none',
                                                  borderRadius: 'var(--radius-xs)',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                }}
                                              >
                                                Add
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setShowCreateCategory(false);
                                                  setNewCategoryName('');
                                                }}
                                                style={{
                                                  padding: '6px 12px',
                                                  fontSize: 'var(--text-xs)',
                                                  background: 'var(--error)',
                                                  color: 'white',
                                                  border: 'none',
                                                  borderRadius: 'var(--radius-xs)',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                }}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ) : (
                                            /* Category selection button */
                                            <button
                                              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                                              style={{
                                                ...styles.tableInput,
                                                width: '100%',
                                                textAlign: 'start',
                                                cursor: 'pointer',
                                                background: 'white',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                              }}
                                            >
                                              <span style={{ color: newIntentCategory ? 'var(--text-secondary)' : 'var(--text-subtle)' }}>
                                                {newIntentCategory || 'Select Category *'}
                                              </span>
                                              <ChevronDown size={14} />
                                            </button>
                                          )}

                                          {/* Category dropdown list */}
                                          {showCategoryDropdown && !showCreateCategory && (
                                            <div style={{
                                              position: 'absolute',
                                              top: '100%',
                                              left: 0,
                                              right: 0,
                                              background: 'white',
                                              border: '1px solid var(--border)',
                                              borderRadius: 'var(--radius-xs)',
                                              boxShadow: 'var(--shadow-md)',
                                              maxHeight: '200px',
                                              overflowY: 'auto',
                                              zIndex: 1000,
                                              marginTop: '4px',
                                            }}>
                                              {/* Search input */}
                                              <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '8px',
                                                borderBottom: '1px solid var(--border)'
                                              }}>
                                                <Search size={14} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
                                                <input
                                                  type="text"
                                                  value={categorySearch}
                                                  onChange={(e) => setCategorySearch(e.target.value)}
                                                  placeholder="Search categories..."
                                                  style={{
                                                    ...styles.tableInput,
                                                    width: '100%',
                                                    fontSize: 'var(--text-xs)',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    padding: 0,
                                                    flex: 1,
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                              </div>

                                              {/* Category list */}
                                              {filteredCategories.length > 0 ? (
                                                filteredCategories.map(cat => (
                                                  <button
                                                    key={cat}
                                                    onClick={() => handleSelectCategory(cat)}
                                                    style={{
                                                      width: '100%',
                                                      padding: '8px 12px',
                                                      textAlign: 'start',
                                                      border: 'none',
                                                      background: newIntentCategory === cat ? 'var(--accent-light)' : 'white',
                                                      cursor: 'pointer',
                                                      fontSize: 'var(--text-xs)',
                                                      borderBottom: '1px solid var(--grey-100)',
                                                    }}
                                                    onMouseEnter={(e) => e.target.style.background = 'var(--grey-50)'}
                                                    onMouseLeave={(e) => e.target.style.background = newIntentCategory === cat ? 'var(--accent-light)' : 'white'}
                                                  >
                                                    {cat}
                                                  </button>
                                                ))
                                              ) : (
                                                <div style={{
                                                  padding: '12px',
                                                  textAlign: 'center',
                                                  color: 'var(--text-subtle)',
                                                  fontSize: 'var(--text-xs)',
                                                }}>
                                                  No categories found
                                                </div>
                                              )}

                                              {/* Create new category button */}
                                              <button
                                                onClick={() => {
                                                  setShowCreateCategory(true);
                                                  setShowCategoryDropdown(false);
                                                }}
                                                style={{
                                                  width: '100%',
                                                  padding: '10px 12px',
                                                  textAlign: 'start',
                                                  border: 'none',
                                                  background: 'var(--success-light)',
                                                  color: 'var(--success)',
                                                  cursor: 'pointer',
                                                  fontSize: 'var(--text-xs)',
                                                  fontWeight: 600,
                                                  borderTop: '2px solid var(--border)',
                                                }}
                                              >
                                                + Create New Category
                                              </button>
                                            </div>
                                          )}
                                        </div>

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button
                                            onClick={() => handleCreateNewIntent(index)}
                                            style={{
                                              flex: 1,
                                              padding: '8px 12px',
                                              fontSize: 'var(--text-xs)',
                                              background: 'var(--accent)',
                                              color: 'white',
                                              border: 'none',
                                              borderRadius: 'var(--radius-xs)',
                                              cursor: 'pointer',
                                              fontWeight: 500,
                                            }}
                                          >
                                            Create Buying Intent
                                          </button>
                                          <button
                                            onClick={() => {
                                              setShowCreateIntent(null);
                                              setNewIntentName('');
                                              setNewIntentCategory('');
                                              setShowCategoryDropdown(false);
                                              setCategorySearch('');
                                              setShowCreateCategory(false);
                                              setNewCategoryName('');
                                            }}
                                            style={{
                                              flex: 1,
                                              padding: '8px 12px',
                                              fontSize: 'var(--text-xs)',
                                              background: 'white',
                                              color: 'var(--text-secondary)',
                                              border: '1px solid var(--border)',
                                              borderRadius: 'var(--radius-xs)',
                                              cursor: 'pointer',
                                            }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        {/* Category filter buttons */}
                                        {categories.length > 0 && (
                                          <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '4px',
                                            marginBottom: '6px',
                                          }}>
                                            {categories.map(category => (
                                              <button
                                                key={category}
                                                onClick={() => toggleCategory(category)}
                                                style={{
                                                  padding: '4px 10px',
                                                  fontSize: 'var(--text-xs)',
                                                  background: selectedCategories.includes(category) ? 'var(--accent)' : 'var(--grey-100)',
                                                  color: selectedCategories.includes(category) ? 'white' : 'var(--text-secondary)',
                                                  border: 'none',
                                                  borderRadius: 'var(--radius-lg)',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                  transition: 'all 0.2s',
                                                }}
                                                title={`Filter by ${category}`}
                                              >
                                                {category}
                                              </button>
                                            ))}
                                            {selectedCategories.length > 0 && (
                                              <button
                                                onClick={() => setSelectedCategories([])}
                                                style={{
                                                  padding: '4px 10px',
                                                  fontSize: 'var(--text-xs)',
                                                  background: 'var(--error-light)',
                                                  color: 'var(--error)',
                                                  border: 'none',
                                                  borderRadius: 'var(--radius-lg)',
                                                  cursor: 'pointer',
                                                  fontWeight: 500,
                                                }}
                                                title="Clear filters"
                                              >
                                                Clear
                                              </button>
                                            )}
                                          </div>
                                        )}

                                        {/* Searchable dropdown */}
                                        <div style={{ position: 'relative' }}>
                                          <button
                                            onClick={() => {
                                              if (openBuyingIntentDropdown === index) {
                                                setOpenBuyingIntentDropdown(null);
                                                setBuyingIntentSearch('');
                                              } else {
                                                setOpenBuyingIntentDropdown(index);
                                                setBuyingIntentSearch('');
                                              }
                                            }}
                                            style={{
                                              ...styles.tableInput,
                                              width: '100%',
                                              textAlign: 'start',
                                              cursor: 'pointer',
                                              background: 'white',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              borderColor: 'var(--border)', // No warning needed - will auto-create
                                            }}
                                          >
                                            <span style={{
                                              color: item.linkedBuyingIntentId ? 'var(--text-secondary)' : 'var(--text-subtle)',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                            }}>
                                              {item.linkedBuyingIntentId
                                                ? products.find(p => p.id === item.linkedBuyingIntentId)?.name || 'Select...'
                                                : `Select Buying Intent (Required)${selectedCategories.length > 0 ? ` (${filteredProducts.length} filtered)` : ''}`
                                              }
                                            </span>
                                            <ChevronDown size={14} style={{ flexShrink: 0, marginInlineStart: '8px' }} />
                                          </button>

                                          {/* Dropdown menu */}
                                          {openBuyingIntentDropdown === index && (
                                            <div style={{
                                              position: 'absolute',
                                              top: '100%',
                                              left: 0,
                                              right: 0,
                                              background: 'white',
                                              border: '1px solid var(--border)',
                                              borderRadius: 'var(--radius-sm)',
                                              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                              maxHeight: '400px',
                                              overflowY: 'auto',
                                              zIndex: 1000,
                                              marginTop: '4px',
                                            }}>
                                              {/* Search input */}
                                              <div style={{
                                                position: 'sticky',
                                                top: 0,
                                                background: 'white',
                                                borderBottom: '1px solid var(--border)',
                                                padding: '12px',
                                                zIndex: 10,
                                              }}>
                                                <div style={{
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '8px',
                                                  padding: '8px 12px',
                                                  border: '1px solid var(--border)',
                                                  borderRadius: 'var(--radius-sm)',
                                                  background: 'var(--grey-50)',
                                                }}>
                                                  <Search size={16} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />
                                                  <input
                                                    type="text"
                                                    value={buyingIntentSearch}
                                                    onChange={(e) => setBuyingIntentSearch(e.target.value)}
                                                    placeholder="Search buying intents..."
                                                    style={{
                                                      border: 'none',
                                                      background: 'transparent',
                                                      outline: 'none',
                                                      width: '100%',
                                                      fontSize: 'var(--text-base)',
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    autoFocus
                                                  />
                                                  {buyingIntentSearch && (
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setBuyingIntentSearch('');
                                                      }}
                                                      style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        padding: '2px',
                                                        color: 'var(--text-subtle)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                      }}
                                                    >
                                                      <X size={14} />
                                                    </button>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Filtered results */}
                                              <div>
                                                {(() => {
                                                  const searchResults = getFilteredBuyingIntents(buyingIntentSearch);

                                                  if (searchResults.length === 0) {
                                                    return (
                                                      <div style={{
                                                        padding: '24px',
                                                        textAlign: 'center',
                                                        color: 'var(--text-subtle)',
                                                        fontSize: 'var(--text-base)',
                                                      }}>
                                                        No buying intents found
                                                        {buyingIntentSearch && (
                                                          <div style={{ marginTop: '4px', fontSize: 'var(--text-sm)' }}>
                                                            Try a different search term
                                                          </div>
                                                        )}
                                                      </div>
                                                    );
                                                  }

                                                  // Group by category
                                                  const grouped = searchResults.reduce((acc, product) => {
                                                    const cat = product.category || 'Uncategorized';
                                                    if (!acc[cat]) acc[cat] = [];
                                                    acc[cat].push(product);
                                                    return acc;
                                                  }, {});

                                                  return Object.entries(grouped).map(([category, products]) => (
                                                    <div key={category}>
                                                      <div style={{
                                                        padding: '8px 12px',
                                                        background: 'var(--grey-50)',
                                                        fontSize: 'var(--text-xs)',
                                                        fontWeight: 600,
                                                        color: 'var(--text-secondary)',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.5px',
                                                        position: 'sticky',
                                                        top: '61px',
                                                        zIndex: 5,
                                                      }}>
                                                        {category}
                                                      </div>
                                                      {products.map(product => (
                                                        <button
                                                          key={product.id}
                                                          onClick={() => {
                                                            handleBuyingIntentChange(index, product.id);
                                                            setOpenBuyingIntentDropdown(null);
                                                            setBuyingIntentSearch('');
                                                          }}
                                                          style={{
                                                            width: '100%',
                                                            padding: '10px 16px',
                                                            textAlign: 'start',
                                                            border: 'none',
                                                            background: item.linkedBuyingIntentId === product.id ? 'var(--accent-light)' : 'white',
                                                            cursor: 'pointer',
                                                            fontSize: 'var(--text-base)',
                                                            borderBottom: '1px solid var(--grey-100)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            transition: 'background 0.1s',
                                                          }}
                                                          onMouseEnter={(e) => {
                                                            if (item.linkedBuyingIntentId !== product.id) {
                                                              e.target.style.background = 'var(--grey-50)';
                                                            }
                                                          }}
                                                          onMouseLeave={(e) => {
                                                            if (item.linkedBuyingIntentId !== product.id) {
                                                              e.target.style.background = 'white';
                                                            }
                                                          }}
                                                        >
                                                          {item.linkedBuyingIntentId === product.id && (
                                                            <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                                          )}
                                                          <span style={{
                                                            flex: 1,
                                                            color: 'var(--text-secondary)',
                                                            fontWeight: item.linkedBuyingIntentId === product.id ? 500 : 400,
                                                          }}>
                                                            {product.name}
                                                          </span>
                                                          {product.dimensions && (
                                                            <span style={{
                                                              fontSize: 'var(--text-xs)',
                                                              color: 'var(--text-subtle)',
                                                              flexShrink: 0,
                                                            }}>
                                                              {product.dimensions}
                                                            </span>
                                                          )}
                                                        </button>
                                                      ))}
                                                    </div>
                                                  ));
                                                })()}
                                              </div>

                                              {/* Auto-create info */}
                                              <div style={{
                                                position: 'sticky',
                                                bottom: 0,
                                                background: 'var(--grey-50)',
                                                borderTop: '2px solid var(--border)',
                                                padding: '10px 16px',
                                                fontSize: 'var(--text-xs)',
                                                color: 'var(--text-secondary)',
                                                textAlign: 'center',
                                                fontStyle: 'italic',
                                              }}>
                                                If not selected, a Buying Intent will be created automatically
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Suggestion badge + Details button */}
                                    {suggestedIntent && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <ConfidenceBadge
                                          level={item.matchConfidenceLevel}
                                          confidence={item.matchConfidence}
                                        />
                                        <button
                                          onClick={() => toggleMatchDetails(index)}
                                          style={{
                                            background: 'none',
                                            border: '1px solid var(--border)',
                                            borderRadius: 'var(--radius-xs)',
                                            cursor: 'pointer',
                                            padding: '4px 8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--text-secondary)',
                                          }}
                                          title={showDetails ? "Hide details" : "Why suggested?"}
                                        >
                                          {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                          <span>Why?</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td style={styles.tdActions}>
                                  <button
                                    onClick={() => deleteLineItem(index)}
                                    style={styles.deleteButton}
                                    title="Delete line item"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>

                              {/* Inline Match Details */}
                              {showDetails && suggestedIntent && (
                                <InlineMatchDetails
                                  item={item}
                                  buyingIntent={suggestedIntent}
                                  matchBreakdown={item.matchBreakdown}
                                  confidence={item.matchConfidence}
                                  confidenceLevel={item.matchConfidenceLevel}
                                  onClose={() => toggleMatchDetails(index)}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                    )}
                  </div>
                )}
              </div>

              {/* Suggestion Summary - Informational */}
              {editableLineItems.length > 0 && suggestionStats.totalSuggestions > 0 && (
                <div style={{
                  background: 'var(--grey-50)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  fontSize: 'var(--text-sm)',
                  marginTop: '16px',
                }}>
                  <div style={{
                    fontWeight: 500,
                    marginBottom: '6px',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <Info size={16} />
                    <span>
                      Found {suggestionStats.totalSuggestions} possible {suggestionStats.totalSuggestions === 1 ? 'match' : 'matches'}.
                      {suggestionStats.totalSelected > 0 && ` ${suggestionStats.totalSelected} selected.`}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                  }}>
                    Click "Why?" to see how each suggestion was calculated. Apply suggestions manually or select from the dropdown.
                  </div>
                </div>
              )}

              {/* Save failure - previously an alert() that lost the detail */}
              {saveError && (
                <div style={styles.validationError} role="alert">
                  <AlertCircle size={20} />
                  <div><p style={{ whiteSpace: 'pre-wrap' }}>{saveError}</p></div>
                </div>
              )}

              {/* Quote saved but the source file could not be attached */}
              {attachWarning && (
                <div style={styles.validationError} role="alert">
                  <AlertCircle size={20} />
                  <div><p>{attachWarning}</p></div>
                </div>
              )}

              {/* Validation Errors */}
              {!canSave && (
                <div style={styles.validationError}>
                  <AlertCircle size={20} />
                  <div>
                    {missingSupplierFields.length > 0 && (
                      <p>Missing supplier fields: {missingSupplierFields.join(', ')}</p>
                    )}
                    {invalidLineItems.length > 0 && (
                      <p>Invalid line items: rows {invalidLineItems.map(i => i.index + 1).join(', ')}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
          <div style={styles.footer}>
            <button onClick={handleClose} style={styles.cancelButton}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                ...styles.saveButton,
                ...((!canSave || saving) ? styles.saveButtonDisabled : {})
              }}
            >
              {saving ? (
                <>
                  <Loader size={16} style={styles.spinner} />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  Confirm & Save Quote
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// STYLES
// ============================================

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-xl)',
    maxWidth: '1400px',
    width: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    color: 'var(--text-secondary)',
  },
  content: {
    padding: '24px',
    overflowY: 'auto',
    flex: 1,
  },
  dropzone: {
    border: '2px dashed var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    padding: '60px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  dropzoneActive: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--accent-light)',
  },
  dropzoneText: {
    marginTop: '16px',
    fontSize: '16px',
    color: 'var(--text-secondary)',
  },
  link: {
    color: 'var(--accent)',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  dropzoneHint: {
    marginTop: '8px',
    fontSize: '14px',
    color: 'var(--text-subtle)',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  spinner: {
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '16px',
    fontSize: '16px',
    color: 'var(--text-secondary)',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
  },
  errorText: {
    marginTop: '16px',
    fontSize: '16px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: '24px',
    padding: '10px 20px',
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  review: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    background: 'white',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
  },
  cardHeader: {
    padding: '18px 24px',
    background: 'var(--grey-50)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s',
    ':hover': {
      background: 'var(--grey-100)',
    },
  },
  cardTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  cardBody: {
    padding: '24px',
  },
  previewSection: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '20px',
    background: 'var(--grey-50)',
  },
  previewContainer: {
    width: '100%',
    height: '400px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'white',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
  },
  previewImage: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  },
  previewPdf: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  previewFallback: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-subtle)',
  },
  section: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '20px',
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: 600,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '6px',
    color: 'var(--text-secondary)',
  },
  required: {
    color: 'var(--error)',
  },
  input: {
    padding: '8px 12px',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
  },
  errorHint: {
    fontSize: '12px',
    color: 'var(--error)',
    marginTop: '4px',
  },
  tableContainer: {
    overflowX: 'auto',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '10px',
    background: 'var(--grey-50)',
    borderBottom: '2px solid var(--border)',
    textAlign: 'start',
    fontWeight: 600,
    fontSize: '12px',
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  },
  thActions: {
    padding: '10px',
    background: 'var(--grey-50)',
    borderBottom: '2px solid var(--border)',
    width: '50px',
  },
  tr: {
    borderBottom: '1px solid var(--border)',
  },
  td: {
    padding: '8px',
    verticalAlign: 'middle',
  },
  tdActions: {
    padding: '8px',
    textAlign: 'center',
  },
  tableInput: {
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xs)',
    fontSize: '13px',
    width: '100%',
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--error)',
    padding: '4px',
  },
  noItems: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px',
    color: 'var(--text-subtle)',
  },
  validationError: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    background: 'var(--error-light)',
    border: '1px solid var(--error-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--error)',
    fontSize: '14px',
  },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelButton: {
    padding: '10px 20px',
    background: 'white',
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },
  saveButton: {
    padding: '10px 20px',
    background: 'var(--accent)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  saveButtonDisabled: {
    background: 'var(--border-strong)',
    cursor: 'not-allowed',
  },
};

export default MultiItemQuoteUploadModal;
