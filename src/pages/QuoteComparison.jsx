import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, FileSpreadsheet, FileText, Sparkles,
  TrendingDown, MessageSquare, Trophy, X, Check, CheckCircle2,
  FileDown, Calculator, Package, ChevronDown, Search, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import ExcelJS from 'exceljs';

// ============================================
// FORMATTING HELPERS (Display only - never in calculations)
// ============================================
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatNumber = (num) => {
  return new Intl.NumberFormat('en-US').format(num);
};

// ============================================
// MOCKED AI RESPONSES
// ============================================
const MOCK_AI_RESPONSES = {
  explain: (best, others, product) => `
**Why ${best.supplierName} is the best option for ${product}:**

1. **Lowest Price**: At ${formatCurrency(best.unit_price)}/unit, this is the most cost-effective choice.

2. **FOB Price**: ${formatCurrency(best.unit_price)}/unit is competitive for this product category.

${others.length > 0 ? `3. **Savings**: You save ${formatCurrency(others[0].unit_price - best.unit_price)}/unit compared to the next option (${others[0].supplierName}).` : ''}

**Recommendation**: Verify quality with samples before placing a large order.
  `.trim(),

  negotiate: (quote, product) => {
    const targetPrice = quote.unit_price * 0.9;
    return `
**Negotiation Message for ${quote.supplierName}:**

---

Dear ${quote.supplierName} Team,

Thank you for your quotation for ${product} at ${formatCurrency(quote.unit_price)}/unit (${quote.incoterm || 'FOB'}).

After reviewing our options, we're interested in establishing a long-term partnership. To proceed:

• **Target Price**: ${formatCurrency(targetPrice)}/unit for orders of ${formatNumber(quote.moq * 2)}+ units
• **Payment Terms**: 30% deposit, 70% before shipment

Please let us know what adjustments are possible.

Best regards,
[Your Name]

---
    `.trim();
  },
};

// ============================================
// SEARCHABLE PRODUCT SELECTOR
// ============================================
function ProductSelector({ products, quotes, selectedProductId, onSelect, quoteCounts }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const productsWithCounts = useMemo(() => {
    return products.map(product => ({
      ...product,
      quoteCount: quoteCounts[product.id] || 0,
    }));
  }, [products, quoteCounts]);

  const filteredProducts = useMemo(() => {
    // Exclude the currently selected product from dropdown to avoid duplication
    const availableProducts = productsWithCounts.filter(p => p.id !== selectedProductId);

    if (!searchTerm.trim()) return availableProducts;
    const term = searchTerm.toLowerCase();
    return availableProducts.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term))
    );
  }, [productsWithCounts, searchTerm, selectedProductId]);

  // Group by category
  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach(product => {
      const cat = product.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(product);
    });
    return groups;
  }, [filteredProducts]);

  const selectedProduct = productsWithCounts.find(p => p.id === selectedProductId);

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        style={{
          width: '100%',
          padding: '14px 18px',
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '0.95rem',
          fontWeight: 500,
          transition: 'all 0.2s',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = '#3b82f6';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.borderColor = '#e5e7eb';
        }}
      >
        <Package size={20} style={{ color: '#64748b', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedProduct ? (
            <>
              {selectedProduct.name}
              <span style={{
                marginLeft: '8px',
                padding: '2px 8px',
                background: selectedProduct.quoteCount > 0 ? '#d1fae5' : '#fee2e2',
                color: selectedProduct.quoteCount > 0 ? '#065f46' : '#991b1b',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}>
                {selectedProduct.quoteCount} {selectedProduct.quoteCount === 1 ? 'quote' : 'quotes'}
              </span>
            </>
          ) : (
            <span style={{ color: '#9ca3af' }}>Select a buying intent to compare...</span>
          )}
        </span>
        <ChevronDown size={18} style={{
          color: '#64748b',
          flexShrink: 0,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
        }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '8px',
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
          maxHeight: '500px',
          overflowY: 'auto',
          zIndex: 1000,
        }}>
          {/* Search input */}
          <div style={{
            position: 'sticky',
            top: 0,
            background: 'white',
            borderBottom: '2px solid #e5e7eb',
            padding: '16px',
            zIndex: 10,
            borderTopLeftRadius: '12px',
            borderTopRightRadius: '12px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              background: '#f9fafb',
            }}>
              <Search size={18} style={{ color: '#9ca3af', flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by name or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  width: '100%',
                  fontSize: '0.95rem',
                  color: '#1f2937',
                }}
                onClick={(e) => e.stopPropagation()}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    color: '#9ca3af',
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div>
            {filteredProducts.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#9ca3af',
                fontSize: '0.95rem',
              }}>
                {searchTerm ? (
                  <>
                    No other buying intents found
                    <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                      Try a different search term
                    </div>
                  </>
                ) : (
                  <>
                    No other buying intents available
                    <div style={{ marginTop: '8px', fontSize: '0.85rem' }}>
                      Currently viewing: {selectedProduct?.name}
                    </div>
                  </>
                )}
              </div>
            ) : (
              Object.entries(groupedProducts).map(([category, categoryProducts]) => (
                <div key={category}>
                  <div style={{
                    padding: '10px 16px',
                    background: '#f9fafb',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    position: 'sticky',
                    top: '72px',
                    zIndex: 5,
                    borderTop: '1px solid #e5e7eb',
                  }}>
                    {category}
                  </div>
                  {categoryProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => {
                        onSelect(product.id);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      type="button"
                      style={{
                        width: '100%',
                        padding: '14px 18px',
                        textAlign: 'left',
                        border: 'none',
                        background: 'white',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        borderBottom: '1px solid #f3f4f6',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'white';
                      }}
                    >
                      <span style={{
                        flex: 1,
                        color: '#374151',
                        fontWeight: 400,
                      }}>
                        {product.name}
                      </span>
                      <span style={{
                        padding: '3px 10px',
                        background: product.quoteCount > 0 ? '#d1fae5' : '#fee2e2',
                        color: product.quoteCount > 0 ? '#065f46' : '#991b1b',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {product.quoteCount}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================
// MAIN QUOTE COMPARISON PAGE
// ============================================
function QuoteComparison() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, computed } = useAppContext();
  const { products } = state;
  const [lineItems, setLineItems] = React.useState([]);
  const [quoteCounts, setQuoteCounts] = React.useState({});

  const [selectedProductId, setSelectedProductId] = useState(location.state?.productId || null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [isSelectionLocked, setIsSelectionLocked] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState('');
  const [loadingCounts, setLoadingCounts] = React.useState(true); // track loading state
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('vibrant');

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showThemeSelector) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showThemeSelector]);

  // Load quote counts for all products
  React.useEffect(() => {
    const loadQuoteCounts = async () => {
      setLoadingCounts(true);
      const counts = {};
      for (const product of products) {
        // Count both old quotes AND new line items (same as ProductDetail page)
        const oldQuotes = computed.getProductQuotes(product.id);
        const newLineItems = await computed.getLineItemsForBuyingIntent(product.id);
        counts[product.id] = oldQuotes.length + newLineItems.length;
      }
      setQuoteCounts(counts);
      setLoadingCounts(false);
    };
    if (products.length > 0) {
      loadQuoteCounts();
    } else {
      setLoadingCounts(false);
    }
  }, [products, computed]);

  // Load line items when product changes
  React.useEffect(() => {
    const loadLineItems = async () => {
      if (!selectedProductId) {
        setLineItems([]);
        return;
      }

      // Load BOTH old quotes AND new line items (same as ProductDetail page)
      const oldQuotes = computed.getProductQuotes(selectedProductId);
      const newLineItems = await computed.getLineItemsForBuyingIntent(selectedProductId);

      // Transform old quotes to line item format
      const oldQuotesAsLineItems = oldQuotes.map(quote => ({
        id: quote.id,
        unit_price: quote.unitPrice || quote.fields?.unitPrice || 0,
        moq: quote.moq || quote.fields?.moq || 1,
        currency: quote.currency || quote.fields?.currency || 'USD',
        incoterm: quote.incoterm || quote.fields?.incoterm || 'FOB',
        supplierName: quote.supplierName || quote.supplier_name,
        supplier: null,
        created_at: quote.created_at,
      }));

      // Combine old quotes and new line items
      setLineItems([...oldQuotesAsLineItems, ...newLineItems]);
    };
    loadLineItems();
  }, [selectedProductId, computed]);

  // Selected product
  const selectedProduct = useMemo(() => {
    return products.find(p => p.id === selectedProductId);
  }, [products, selectedProductId]);

  // ============================================
  // PROCESS AND SORT QUOTES BY PRICE
  // ============================================
  const quotesWithLanded = useMemo(() => {
    if (!selectedProductId || lineItems.length === 0) return [];

    // Transform line items to quote format and validate
    const validQuotes = lineItems
      .map(item => ({
        id: item.id,
        supplierName: item.supplierName || item.supplier?.supplier_name,
        unit_price: item.unit_price,
        currency: item.currency || 'USD',
        moq: item.moq || 1,
        incoterm: item.incoterm || 'FOB',
        created_at: item.created_at,
      }))
      .filter(q => q.unit_price > 0 && q.moq > 0);

    // Sort by unit_price (lowest first = best)
    return validQuotes.sort((a, b) => a.unit_price - b.unit_price);
  }, [lineItems, selectedProductId]);

  // Invalid quotes (for warning)
  const invalidQuotes = useMemo(() => {
    if (!selectedProductId || lineItems.length === 0) return [];
    return lineItems
      .filter(item => {
        const price = item.unit_price || 0;
        const moq = item.moq || 0;
        return price <= 0 || moq <= 0;
      });
  }, [lineItems, selectedProductId]);

  // Best quote = lowest unit_price
  const bestQuote = quotesWithLanded[0];
  const otherQuotes = quotesWithLanded.slice(1);
  const isSupplierSelected = selectedSupplierId === bestQuote?.id;

  // Handlers
  const handleProductChange = (productId) => {
    setSelectedProductId(productId);
    setSelectedSupplierId(null);
    setIsSelectionLocked(false);
    setAiResponse('');
    setAiAction('');
  };

  const handleSelectSupplier = (quoteId) => {
    setSelectedSupplierId(quoteId);
    setIsSelectionLocked(true);
  };

  const handleExportDecision = () => {
    alert('PDF export: Your supplier selection would be exported.');
  };

  // Define export themes
  const exportThemes = {
    vibrant: {
      name: 'Vibrant & Modern',
      description: 'Bold colors with high contrast',
      preview: ['#2563EB', '#A7F3D0', '#FEF9C3', '#E0E7FF'],
      colors: {
        title: { bg: 'FF2563EB', text: 'FFFFFFFF' },
        imagePlaceholder: { bg: 'FFDBEAFE', text: 'FF1E40AF', border: 'FF3B82F6' },
        productName: { bg: 'FFFEF3C7', text: 'FF92400E' },
        category: { bg: 'FFE0E7FF', text: 'FF3730A3' },
        date: { bg: 'FFDBEAFE', text: 'FF1E40AF' },
        totalQuotes: { bg: 'FFD1FAE5', text: 'FF065F46' },
        header: { bg: 'FF1E293B', text: 'FFFFFFFF' },
        bestPrice: { bg: 'FFA7F3D0', text: 'FF065F46', border: 'FF10B981', status: 'FFEA580C' },
        rankColumn: { bg: 'FFEFF6FF' },
        priceColumn: { bg: 'FFFEF9C3' },
        savingsColumn: { bg: 'FFD1FAE5', text: 'FF065F46' },
        alternatingRow: { odd: 'FFF8FAFC', even: 'FFFFFFFF' }
      }
    },
    corporate: {
      name: 'Professional Corporate',
      description: 'Navy blue with subtle accents',
      preview: ['#1E3A8A', '#E0E7FF', '#F1F5F9', '#DBEAFE'],
      colors: {
        title: { bg: 'FF1E3A8A', text: 'FFFFFFFF' },
        imagePlaceholder: { bg: 'FFE0E7FF', text: 'FF1E3A8A', border: 'FF3B82F6' },
        productName: { bg: 'FFDBEAFE', text: 'FF1E40AF' },
        category: { bg: 'FFF1F5F9', text: 'FF475569' },
        date: { bg: 'FFF1F5F9', text: 'FF475569' },
        totalQuotes: { bg: 'FFE0E7FF', text: 'FF1E3A8A' },
        header: { bg: 'FF334155', text: 'FFFFFFFF' },
        bestPrice: { bg: 'FFBFDBFE', text: 'FF1E3A8A', border: 'FF3B82F6', status: 'FF1E3A8A' },
        rankColumn: { bg: 'FFDBEAFE' },
        priceColumn: { bg: 'FFDBEAFE' },
        savingsColumn: { bg: 'FFDBEAFE', text: 'FF1E40AF' },
        alternatingRow: { odd: 'FFF8FAFC', even: 'FFFFFFFF' }
      }
    },
    minimal: {
      name: 'Modern Minimal',
      description: 'Clean black & white with subtle grays',
      preview: ['#000000', '#F3F4F6', '#E5E7EB', '#D1D5DB'],
      colors: {
        title: { bg: 'FF000000', text: 'FFFFFFFF' },
        imagePlaceholder: { bg: 'FFF3F4F6', text: 'FF374151', border: 'FF9CA3AF' },
        productName: { bg: 'FFE5E7EB', text: 'FF111827' },
        category: { bg: 'FFF9FAFB', text: 'FF6B7280' },
        date: { bg: 'FFF9FAFB', text: 'FF6B7280' },
        totalQuotes: { bg: 'FFE5E7EB', text: 'FF374151' },
        header: { bg: 'FF374151', text: 'FFFFFFFF' },
        bestPrice: { bg: 'FFD1D5DB', text: 'FF000000', border: 'FF6B7280', status: 'FF000000' },
        rankColumn: { bg: 'FFF3F4F6' },
        priceColumn: { bg: 'FFF3F4F6' },
        savingsColumn: { bg: 'FFE5E7EB', text: 'FF374151' },
        alternatingRow: { odd: 'FFFAFAFA', even: 'FFFFFFFF' }
      }
    },
    elegant: {
      name: 'Elegant Warm',
      description: 'Burgundy & gold tones',
      preview: ['#7C2D12', '#FEF3C7', '#FED7AA', '#FECACA'],
      colors: {
        title: { bg: 'FF7C2D12', text: 'FFFFFFFF' },
        imagePlaceholder: { bg: 'FFFED7AA', text: 'FF7C2D12', border: 'FFFB923C' },
        productName: { bg: 'FFFEF3C7', text: 'FF78350F' },
        category: { bg: 'FFFECACA', text: 'FF991B1B' },
        date: { bg: 'FFFED7AA', text: 'FFEA580C' },
        totalQuotes: { bg: 'FFFEF3C7', text: 'FF92400E' },
        header: { bg: 'FF7C2D12', text: 'FFFFFFFF' },
        bestPrice: { bg: 'FFFDE68A', text: 'FF713F12', border: 'FFF59E0B', status: 'FFDC2626' },
        rankColumn: { bg: 'FFFEF3C7' },
        priceColumn: { bg: 'FFFEF3C7' },
        savingsColumn: { bg: 'FFFDE68A', text: 'FF78350F' },
        alternatingRow: { odd: 'FFFFFBEB', even: 'FFFFFFFF' }
      }
    }
  };

  const handleExportExcel = async (themeName = 'vibrant') => {
    const theme = exportThemes[themeName];
    if (!selectedProduct || quotesWithLanded.length === 0) {
      alert('No quotes available to export');
      return;
    }

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HA Tools';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Quote Comparison');

    // Set column widths
    worksheet.columns = [
      { width: 10 },  // Rank
      { width: 30 },  // Supplier
      { width: 15 },  // Unit Price
      { width: 12 },  // MOQ
      { width: 18 },  // Total (at MOQ)
      { width: 12 },  // Incoterm
      { width: 15 },  // Savings
      { width: 16 }   // Status
    ];

    // Row 1: Title
    worksheet.mergeCells('A1:H1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'QUOTE COMPARISON REPORT';
    titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: theme.colors.title.text } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.title.bg } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.border = {
      bottom: { style: 'medium', color: { argb: theme.colors.title.bg } }
    };
    worksheet.getRow(1).height = 35;

    // Row 2: Empty
    worksheet.getRow(2).height = 8;

    // Rows 3-6: Product Image Placeholder (left) and Product Info (right)
    worksheet.mergeCells('A3:C6');
    const imageCell = worksheet.getCell('A3');
    imageCell.value = 'PRODUCT IMAGE\n[Insert Product Image Here]';
    imageCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.imagePlaceholder.text } };
    imageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.imagePlaceholder.bg } };
    imageCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    imageCell.border = {
      top: { style: 'medium', color: { argb: theme.colors.imagePlaceholder.border } },
      bottom: { style: 'medium', color: { argb: theme.colors.imagePlaceholder.border } },
      left: { style: 'medium', color: { argb: theme.colors.imagePlaceholder.border } },
      right: { style: 'medium', color: { argb: theme.colors.imagePlaceholder.border } }
    };
    worksheet.getRow(3).height = 90;

    // Product name (row 3)
    worksheet.mergeCells('D3:H3');
    const productCell = worksheet.getCell('D3');
    productCell.value = `Product: ${selectedProduct.name}`;
    productCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.productName.text } };
    productCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.productName.bg } };
    productCell.alignment = { horizontal: 'left', vertical: 'middle' };
    productCell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
    worksheet.getRow(3).height = 22;

    // Category (row 4)
    worksheet.mergeCells('D4:H4');
    const categoryCell = worksheet.getCell('D4');
    categoryCell.value = `Category: ${selectedProduct.category || 'General'}`;
    categoryCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.category.text } };
    categoryCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.category.bg } };
    categoryCell.alignment = { horizontal: 'left', vertical: 'middle' };
    categoryCell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
    worksheet.getRow(4).height = 22;

    // Generated date (row 5)
    worksheet.mergeCells('D5:H5');
    const dateCell = worksheet.getCell('D5');
    dateCell.value = `Generated: ${new Date().toLocaleDateString()}`;
    dateCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.date.text } };
    dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.date.bg } };
    dateCell.alignment = { horizontal: 'left', vertical: 'middle' };
    dateCell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
    worksheet.getRow(5).height = 22;

    // Total quotes (row 6)
    worksheet.mergeCells('D6:H6');
    const quotesCell = worksheet.getCell('D6');
    quotesCell.value = `Total Quotes: ${quotesWithLanded.length}`;
    quotesCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.totalQuotes.text } };
    quotesCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.totalQuotes.bg } };
    quotesCell.alignment = { horizontal: 'left', vertical: 'middle' };
    quotesCell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
    worksheet.getRow(6).height = 22;

    // Empty rows
    worksheet.getRow(7).height = 8;
    worksheet.getRow(8).height = 8;

    // Row 9: Header
    const headerRow = worksheet.getRow(9);
    headerRow.values = ['Rank', 'Supplier', 'Unit Price', 'MOQ', 'Total (at MOQ)', 'Incoterm', 'Savings', 'Status'];
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.header.text } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.header.bg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: theme.colors.header.bg } },
        right: { style: 'thin', color: { argb: theme.colors.header.bg } }
      };
    });

    // Data rows
    quotesWithLanded.forEach((quote, index) => {
      const nextQuote = quotesWithLanded[index + 1];
      const savings = nextQuote ? `${quote.currency || 'USD'} ${(nextQuote.unit_price - quote.unit_price).toFixed(2)}` : '-';
      const isBestPrice = index === 0;

      const row = worksheet.addRow([
        index + 1,
        quote.supplierName,
        `${quote.currency || 'USD'} ${quote.unit_price.toFixed(2)}`,
        quote.moq.toLocaleString(),
        `${quote.currency || 'USD'} ${(quote.unit_price * quote.moq).toFixed(2)}`,
        quote.incoterm || 'FOB',
        savings,
        isBestPrice ? '⭐ BEST PRICE' : ''
      ]);

      row.eachCell((cell, colNumber) => {
        // Best price row
        if (isBestPrice) {
          cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.bestPrice.text } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.bestPrice.bg } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'medium', color: { argb: theme.colors.bestPrice.border } },
            bottom: { style: 'medium', color: { argb: theme.colors.bestPrice.border } },
            left: { style: 'thin', color: { argb: theme.colors.bestPrice.border } },
            right: { style: 'thin', color: { argb: theme.colors.bestPrice.border } }
          };

          // Status text color
          if (colNumber === 8) {
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.bestPrice.status } };
          }
        } else {
          // Alternating rows
          const bgColor = index % 2 === 0 ? theme.colors.alternatingRow.odd : theme.colors.alternatingRow.even;
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        }

        // Column-specific colors
        // Rank column (1)
        if (colNumber === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isBestPrice ? theme.colors.bestPrice.bg : theme.colors.rankColumn.bg } };
          cell.font = { ...cell.font, bold: true };
        }

        // MOQ column (4) - centered
        if (colNumber === 4) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // Unit Price column (3)
        if (colNumber === 3) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isBestPrice ? theme.colors.bestPrice.bg : theme.colors.priceColumn.bg } };
          cell.font = { ...cell.font, bold: true };
        }

        // Savings column (7)
        if (colNumber === 7 && !isBestPrice) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.savingsColumn.bg } };
          cell.font = { ...cell.font, color: { argb: theme.colors.savingsColumn.text } };
        }
      });
    });

    // Generate filename and export
    const filename = `Quote_Comparison_${selectedProduct.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleAIExplain = () => {
    if (!bestQuote || !selectedProduct) return;
    setAiLoading(true);
    setAiAction('explain');
    setTimeout(() => {
      setAiResponse(MOCK_AI_RESPONSES.explain(bestQuote, otherQuotes, selectedProduct.name));
      setAiLoading(false);
    }, 800);
  };

  const handleAINegotiate = (quote) => {
    if (!selectedProduct) return;
    setAiLoading(true);
    setAiAction('negotiate');
    setTimeout(() => {
      setAiResponse(MOCK_AI_RESPONSES.negotiate(quote, selectedProduct.name));
      setAiLoading(false);
    }, 800);
  };

  const clearAI = () => {
    setAiResponse('');
    setAiAction('');
  };

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>Compare Quotes</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '2px' }}>
              Compare suppliers for a buying intent and select the best price
            </p>
          </div>
        </div>
      </div>

      <div className="content">
        {/* Loading State */}
        {loadingCounts ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px',
            gap: '16px',
          }}>
            <div className="spinner" style={{ width: '40px', height: '40px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading buying intents...</p>
          </div>
        ) : (
          <>
        {/* Recently Used Buying Intents */}
        {!loadingCounts && products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', marginBottom: '12px' }}>
              Recently Used
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).map(product => (
                <button
                  key={product.id}
                  onClick={() => handleProductChange(product.id)}
                  style={{
                    padding: '12px 18px',
                    background: 'white',
                    border: '2px solid #e5e7eb',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.2s',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f9fafb';
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Package size={18} style={{ color: '#64748b' }} />
                  <span>{product.name}</span>
                  <span style={{
                    padding: '3px 10px',
                    background: '#d1fae5',
                    color: '#065f46',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}>
                    {quoteCounts[product.id]} {quoteCounts[product.id] === 1 ? 'quote' : 'quotes'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Product Selector */}
        <div className="card" style={{ marginBottom: '24px', border: '2px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="card-header" style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            <span className="card-title">
              <Package size={18} />
              {selectedProduct ? (
                <>
                  <span style={{ fontWeight: 700 }}>{selectedProduct.name}</span>
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '8px' }}>
                    ({quoteCounts[selectedProductId] || 0} {quoteCounts[selectedProductId] === 1 ? 'quote' : 'quotes'})
                  </span>
                </>
              ) : (
                'Select Buying Intent to Compare'
              )}
            </span>
          </div>
          <div className="card-body">
            <ProductSelector
              products={products}
              quotes={[]}
              selectedProductId={selectedProductId}
              onSelect={handleProductChange}
              quoteCounts={quoteCounts}
            />
            {!selectedProductId && (
              <div className="info-message" style={{ marginTop: '16px', padding: '12px 16px', background: '#eff6ff', borderLeft: '4px solid #3b82f6', borderRadius: '6px' }}>
                <AlertCircle size={16} style={{ color: '#3b82f6' }} />
                <span style={{ color: '#1e40af' }}>Select a buying intent above to compare supplier quotes and find the best price</span>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        {selectedProductId ? (
          <>
            {/* Invalid Quotes Warning */}
            {invalidQuotes.length > 0 && (
              <div className="validation-warning" style={{ marginBottom: '16px' }}>
                <AlertTriangle size={16} />
                <span>
                  {invalidQuotes.length} quote(s) excluded due to invalid data (price ≤ $0 or quantity ≤ 0)
                </span>
              </div>
            )}

            {quotesWithLanded.length === 0 ? (
              <div className="empty-state">
                <TrendingDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3>No valid quotes for {selectedProduct?.name}</h3>
                <p>Add quotes with valid prices and quantities</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => navigate(`/products/${selectedProductId}`)}
                >
                  Add Quotes
                </button>
              </div>
            ) : (
              <>
                {/* Best Option Card */}
                {bestQuote && (
                  <div
                    className="best-quote-card"
                    style={{
                      marginBottom: '24px',
                      borderColor: isSupplierSelected ? 'var(--success)' : undefined,
                      background: isSupplierSelected
                        ? '#f0fdf4'
                        : undefined,
                    }}
                  >
                    {isSupplierSelected ? (
                      <div className="selection-complete">
                        <div className="best-quote-selected">
                          <div className="selected-icon">
                            <CheckCircle2 size={48} />
                          </div>
                          <div className="selected-content">
                            <h3>Supplier Selected</h3>
                            <p>{bestQuote.supplierName} — {formatCurrency(bestQuote.unit_price)}/unit</p>
                          </div>
                        </div>

                        <div className="next-actions-section">
                          <p className="next-actions-helper">
                            You've selected the best option for {selectedProduct?.name}. What's next?
                          </p>
                          <div className="next-actions-title">Next Actions</div>
                          <div className="next-actions-buttons">
                            <button className="btn btn-secondary" onClick={handleExportDecision}>
                              <FileDown size={18} /> Export Decision
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleAINegotiate(bestQuote)}>
                              <MessageSquare size={18} /> Negotiation Message
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="best-quote-header">
                          <Trophy size={24} color="#f59e0b" />
                          <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0 }}>Best: {bestQuote.supplierName}</h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                              Lowest price ({bestQuote.incoterm})
                            </p>
                          </div>
                          <div className="best-quote-price">
                            <span className="price-label">Unit Price</span>
                            <span className="price-value">{formatCurrency(bestQuote.unit_price)}/unit</span>
                          </div>
                        </div>
                        
                        <div className="best-quote-cta">
                          <button 
                            className="btn btn-select-supplier"
                            onClick={() => handleSelectSupplier(bestQuote.id)}
                          >
                            <Check size={20} /> Select This Supplier
                          </button>
                        </div>

                        {/* Secondary Actions - Grouped and less prominent */}
                        <div className="secondary-actions" style={{
                          display: 'flex',
                          gap: '8px',
                          justifyContent: 'center',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--border-light)',
                          marginTop: '16px'
                        }}>
                          <button className="btn btn-ghost btn-sm" onClick={handleAIExplain} title="Explain why this is best">
                            <Sparkles size={14} /> Why Best?
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleAINegotiate(bestQuote)} title="Generate negotiation message">
                            <MessageSquare size={14} /> Negotiate
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Draft Finalize Prompt */}
                {selectedProduct?.status === 'draft' && (
                  <div style={{
                    marginBottom: '20px',
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)',
                    border: '2px solid #fbbf24',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                  }}>
                    <AlertCircle size={24} style={{ color: '#92400e', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '4px' }}>
                        This Buying Intent was auto-created
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#78350f' }}>
                        Give it a meaningful name to finalize and organize your quotes better
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const newName = prompt('Enter a name for this Buying Intent:', selectedProduct.name);
                        if (newName && newName.trim()) {
                          try {
                            await actions.finalizeBuyingIntent(selectedProduct.id, newName.trim());
                            alert('Buying Intent finalized successfully!');
                          } catch (err) {
                            alert(`Failed to finalize: ${err.message}`);
                          }
                        }
                      }}
                      style={{
                        padding: '10px 20px',
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#d97706';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f59e0b';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.3)';
                      }}
                    >
                      Name & Finalize
                    </button>
                  </div>
                )}

                {/* Comparison Table */}
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <TrendingDown size={18} /> {quotesWithLanded.length} Quotes for {selectedProduct?.name}
                      </span>
                      {selectedProduct?.status === 'draft' && (
                        <span style={{
                          padding: '3px 10px',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px',
                        }}>
                          Draft
                        </span>
                      )}
                    </span>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowThemeSelector(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        fontSize: '0.875rem',
                      }}
                      title="Export comparison to Excel"
                    >
                      <FileSpreadsheet size={16} />
                      Export to Excel
                    </button>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="table comparison-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>#</th>
                          <th>Supplier</th>
                          <th>Unit Price</th>
                          <th>MOQ</th>
                          <th>Total (at MOQ)</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotesWithLanded.map((quote, index) => {
                          const isBest = index === 0;
                          const isSelected = selectedSupplierId === quote.id;
                          const savingsVsNext = index < quotesWithLanded.length - 1
                            ? quotesWithLanded[index + 1].unit_price - quote.unit_price
                            : 0;
                          const totalAtMoq = quote.unit_price * quote.moq;

                          return (
                            <tr
                              key={quote.id}
                              className={`${isBest ? 'row-highlight' : ''} ${isSelected ? 'row-selected' : ''}`}
                            >
                              <td>
                                {isSelected ? (
                                  <span className="rank-badge selected"><Check size={14} /></span>
                                ) : isBest ? (
                                  <span className="rank-badge best"><Trophy size={14} /></span>
                                ) : (
                                  <span className="rank-badge">{index + 1}</span>
                                )}
                              </td>
                              <td style={{ fontWeight: 500 }}>
                                {quote.supplierName}
                                {isSelected && <span className="selected-label">Selected</span>}
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {quote.incoterm}
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  fontWeight: 700,
                                  color: isBest ? 'var(--success)' : 'var(--text-primary)',
                                }}>
                                  {formatCurrency(quote.unit_price)}/unit
                                </span>
                                {isBest && savingsVsNext > 0 && (
                                  <span style={{
                                    display: 'block',
                                    fontSize: '0.7rem',
                                    color: 'var(--success)',
                                  }}>
                                    Saves {formatCurrency(savingsVsNext)}/unit
                                  </span>
                                )}
                              </td>
                              <td>{formatNumber(quote.moq)} units</td>
                              <td style={{ color: 'var(--text-secondary)' }}>
                                {formatCurrency(totalAtMoq)}
                              </td>
                              <td>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleAINegotiate(quote)}
                                  title="Generate negotiation message"
                                >
                                  <MessageSquare size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* AI Response Panel */}
                {(aiResponse || aiLoading) && (
                  <div className="card" style={{ marginTop: '24px' }}>
                    <div className="card-header">
                      <span className="card-title">
                        <Sparkles size={18} color="var(--accent)" />
                        {aiAction === 'explain' ? 'AI Analysis' : 'Generated Message'}
                      </span>
                      <button className="icon-btn" onClick={clearAI}>
                        <X size={18} />
                      </button>
                    </div>
                    <div className="card-body">
                      {aiLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '20px' }}>
                          <div className="spinner" />
                          <span>Generating...</span>
                        </div>
                      ) : (
                        <div className="ai-response-content">
                          {aiResponse.split('\n').map((line, i) => {
                            if (line.startsWith('**') && line.endsWith('**')) {
                              return <h4 key={i} style={{ marginTop: i > 0 ? '16px' : 0 }}>{line.replace(/\*\*/g, '')}</h4>;
                            }
                            if (line.startsWith('• ')) {
                              return <li key={i} style={{ marginLeft: '20px' }}>{line.substring(2)}</li>;
                            }
                            if (line.startsWith('---')) {
                              return <hr key={i} style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border)' }} />;
                            }
                            if (line.trim() === '') return <br key={i} />;
                            return <p key={i} style={{ margin: '8px 0' }}>{line}</p>;
                          })}
                          {aiAction === 'negotiate' && (
                            <button
                              className="btn btn-primary"
                              style={{ marginTop: '16px' }}
                              onClick={() => {
                                navigator.clipboard.writeText(aiResponse.replace(/\*\*/g, ''));
                                alert('Copied to clipboard!');
                              }}
                            >
                              Copy Message
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div style={{
            padding: '80px 20px',
            textAlign: 'center',
            background: '#f9fafb',
            borderRadius: '16px',
            border: '2px dashed #cbd5e1',
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '20px',
              background: 'white',
              borderRadius: '50%',
              marginBottom: '20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}>
              <TrendingDown size={48} style={{ color: '#94a3b8' }} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
              Select a Buying Intent to Compare
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.95rem', maxWidth: '400px', margin: '0 auto' }}>
              Choose a buying intent above to view and compare supplier quotes side-by-side.
            </p>
          </div>
        )}
        </>
        )}
      </div>

      {/* Theme Selector Modal - Split Screen */}
      {showThemeSelector && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
        >
          <div style={{
            background: 'white',
            borderRadius: '16px',
            maxWidth: '1200px',
            width: '95%',
            height: '85vh',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '24px 32px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0, marginBottom: '4px' }}>
                  Choose Export Theme
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  Select a theme and preview before exporting
                </p>
              </div>
              <button
                onClick={() => setShowThemeSelector(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <X size={24} style={{ color: '#64748b' }} />
              </button>
            </div>

            {/* Split Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left Sidebar - Theme List */}
              <div style={{
                width: '320px',
                borderRight: '1px solid #e5e7eb',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{
                  padding: '20px',
                  borderBottom: '1px solid #e5e7eb',
                }}>
                  <h3 style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#64748b',
                    margin: 0,
                  }}>
                    Available Themes
                  </h3>
                </div>

                <div style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '8px',
                }}>
                  {Object.entries(exportThemes).map(([key, theme]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedTheme(key)}
                      style={{
                        width: '100%',
                        padding: '16px',
                        marginBottom: '8px',
                        background: selectedTheme === key ? '#eff6ff' : 'white',
                        border: `2px solid ${selectedTheme === key ? '#3b82f6' : '#e5e7eb'}`,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedTheme !== key) {
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          e.currentTarget.style.background = '#f9fafb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedTheme !== key) {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.background = 'white';
                        }
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px',
                      }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          border: `2px solid ${selectedTheme === key ? '#3b82f6' : '#d1d5db'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {selectedTheme === key && (
                            <div style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: '#3b82f6',
                            }} />
                          )}
                        </div>
                        <h4 style={{
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: '#1e293b',
                          margin: 0,
                        }}>
                          {theme.name}
                        </h4>
                      </div>
                      <p style={{
                        color: '#64748b',
                        fontSize: '0.8rem',
                        margin: '0 0 12px 28px',
                      }}>
                        {theme.description}
                      </p>
                      <div style={{
                        display: 'flex',
                        gap: '6px',
                        marginLeft: '28px',
                      }}>
                        {theme.preview.map((color, index) => (
                          <div
                            key={index}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              background: color,
                              border: '1px solid rgba(0,0,0,0.1)',
                            }}
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Side - Large Preview */}
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: '#f9fafb',
              }}>
                <div style={{
                  padding: '20px 32px',
                  background: 'white',
                  borderBottom: '1px solid #e5e7eb',
                }}>
                  <h3 style={{
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: '#64748b',
                    margin: 0,
                  }}>
                    Preview
                  </h3>
                </div>

                <div style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '32px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                }}>
                  {/* Excel-Style Preview */}
                  {(() => {
                    const theme = exportThemes[selectedTheme];
                    return (
                      <div style={{
                        background: 'white',
                        border: '2px solid #000',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                        maxWidth: '600px',
                        width: '100%',
                      }}>
                        {/* Title Row - Excel Style */}
                        <div style={{
                          background: `#${theme.colors.title.bg.substring(2)}`,
                          color: `#${theme.colors.title.text.substring(2)}`,
                          padding: '20px',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          fontSize: '1.2rem',
                          borderBottom: '2px solid #000',
                        }}>
                          QUOTE COMPARISON REPORT
                        </div>

                        {/* Info Section - Excel Grid Style */}
                        <div style={{ display: 'flex', border: '0' }}>
                          {/* Left: Image Placeholder */}
                          <div style={{
                            flex: 1,
                            background: `#${theme.colors.imagePlaceholder.bg.substring(2)}`,
                            color: `#${theme.colors.imagePlaceholder.text.substring(2)}`,
                            padding: '30px 10px',
                            textAlign: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            border: `2px solid #${theme.colors.imagePlaceholder.border.substring(2)}`,
                            borderLeft: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            PRODUCT IMAGE<br/>[Insert Image Here]
                          </div>

                          {/* Right: Product Info */}
                          <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                              background: `#${theme.colors.productName.bg.substring(2)}`,
                              color: `#${theme.colors.productName.text.substring(2)}`,
                              padding: '10px 12px',
                              fontSize: '0.85rem',
                              fontWeight: 'bold',
                              borderBottom: '1px solid #d0d0d0',
                              borderRight: '2px solid #000',
                            }}>Product: {selectedProduct?.name || 'Adhesive Tape'}</div>

                            <div style={{
                              background: `#${theme.colors.category.bg.substring(2)}`,
                              color: `#${theme.colors.category.text.substring(2)}`,
                              padding: '10px 12px',
                              fontSize: '0.85rem',
                              fontWeight: 'bold',
                              borderBottom: '1px solid #d0d0d0',
                              borderRight: '2px solid #000',
                            }}>Category: {selectedProduct?.category || 'Other'}</div>

                            <div style={{
                              background: `#${theme.colors.date.bg.substring(2)}`,
                              color: `#${theme.colors.date.text.substring(2)}`,
                              padding: '10px 12px',
                              fontSize: '0.85rem',
                              fontWeight: 'bold',
                              borderBottom: '1px solid #d0d0d0',
                              borderRight: '2px solid #000',
                            }}>Generated: {new Date().toLocaleDateString()}</div>

                            <div style={{
                              background: `#${theme.colors.totalQuotes.bg.substring(2)}`,
                              color: `#${theme.colors.totalQuotes.text.substring(2)}`,
                              padding: '10px 12px',
                              fontSize: '0.85rem',
                              fontWeight: 'bold',
                              borderRight: '2px solid #000',
                              borderBottom: '2px solid #000',
                            }}>Total Quotes: {quotesWithLanded.length || 5}</div>
                          </div>
                        </div>

                        {/* Table - Excel Grid Style */}
                        <div>
                          {/* Header Row */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '60px 2fr 100px 100px',
                            background: `#${theme.colors.header.bg.substring(2)}`,
                            color: `#${theme.colors.header.text.substring(2)}`,
                          }}>
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', borderRight: '1px solid #666', borderBottom: '2px solid #000' }}>Rank</div>
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', borderRight: '1px solid #666', borderBottom: '2px solid #000' }}>Supplier</div>
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', borderRight: '1px solid #666', borderBottom: '2px solid #000' }}>Price</div>
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', borderRight: '2px solid #000', borderBottom: '2px solid #000' }}>Status</div>
                          </div>

                          {/* Best Price Row */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '60px 2fr 100px 100px',
                            background: `#${theme.colors.bestPrice.bg.substring(2)}`,
                            color: `#${theme.colors.bestPrice.text.substring(2)}`,
                          }}>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: '0.85rem',
                              textAlign: 'center',
                              borderRight: '1px solid #999',
                              borderBottom: '1px solid #999',
                              background: `#${theme.colors.rankColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>1</div>
                            <div style={{ padding: '10px 8px', fontSize: '0.85rem', textAlign: 'center', borderRight: '1px solid #999', borderBottom: '1px solid #999' }}>A Sarah</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: '0.85rem',
                              textAlign: 'center',
                              borderRight: '1px solid #999',
                              borderBottom: '1px solid #999',
                              background: `#${theme.colors.priceColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>$0.32</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: '0.85rem',
                              textAlign: 'center',
                              borderRight: '2px solid #000',
                              borderBottom: '1px solid #999',
                              fontWeight: 'bold',
                              color: `#${theme.colors.bestPrice.status.substring(2)}`,
                            }}>⭐ BEST</div>
                          </div>

                          {/* Regular Row 1 */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '60px 2fr 100px 100px',
                            background: `#${theme.colors.alternatingRow.odd.substring(2)}`,
                          }}>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: '0.85rem',
                              textAlign: 'center',
                              borderRight: '1px solid #ccc',
                              borderBottom: '1px solid #ccc',
                              background: `#${theme.colors.rankColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>2</div>
                            <div style={{ padding: '10px 8px', fontSize: '0.85rem', textAlign: 'center', borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc' }}>Jasion</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: '0.85rem',
                              textAlign: 'center',
                              borderRight: '1px solid #ccc',
                              borderBottom: '1px solid #ccc',
                              background: `#${theme.colors.priceColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>$0.33</div>
                            <div style={{ padding: '10px 8px', fontSize: '0.85rem', textAlign: 'center', borderRight: '2px solid #000', borderBottom: '1px solid #ccc' }}>-</div>
                          </div>

                          {/* Regular Row 2 */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '60px 2fr 100px 100px',
                            background: `#${theme.colors.alternatingRow.even.substring(2)}`,
                          }}>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: '0.85rem',
                              textAlign: 'center',
                              borderRight: '1px solid #ccc',
                              borderBottom: '2px solid #000',
                              background: `#${theme.colors.rankColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>3</div>
                            <div style={{ padding: '10px 8px', fontSize: '0.85rem', textAlign: 'center', borderRight: '1px solid #ccc', borderBottom: '2px solid #000' }}>Melo</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: '0.85rem',
                              textAlign: 'center',
                              borderRight: '1px solid #ccc',
                              borderBottom: '2px solid #000',
                              background: `#${theme.colors.priceColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>$0.34</div>
                            <div style={{ padding: '10px 8px', fontSize: '0.85rem', textAlign: 'center', borderRight: '2px solid #000', borderBottom: '2px solid #000' }}>-</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Export Button */}
                <div style={{
                  padding: '20px 32px',
                  background: 'white',
                  borderTop: '1px solid #e5e7eb',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                }}>
                  <button
                    onClick={() => setShowThemeSelector(false)}
                    className="btn btn-secondary"
                    style={{
                      padding: '10px 20px',
                      fontSize: '0.9rem',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleExportExcel(selectedTheme);
                      setShowThemeSelector(false);
                    }}
                    className="btn btn-primary"
                    style={{
                      padding: '10px 24px',
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <FileSpreadsheet size={18} />
                    Export with {exportThemes[selectedTheme].name}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuoteComparison;
