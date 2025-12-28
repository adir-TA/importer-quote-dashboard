import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, FileSpreadsheet, FileText, Sparkles,
  TrendingDown, MessageSquare, Trophy, X, Check, CheckCircle2,
  FileDown, Calculator, Package, ChevronDown, Search, AlertCircle, AlertTriangle
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import ExcelJS from 'exceljs';
import { EXPORT_THEMES } from '../utils/exportThemes';

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
    <div className="product-selector" ref={dropdownRef}>
      <button
        className="product-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <Package size={18} className="trigger-icon" />
        <span className="trigger-text">
          {selectedProduct ? (
            <>
              {selectedProduct.name}
              <span className={`quote-count ${selectedProduct.quoteCount === 0 ? 'muted' : ''}`}>
                ({selectedProduct.quoteCount} {selectedProduct.quoteCount === 1 ? 'quote' : 'quotes'})
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Select a buying intent to compare...</span>
          )}
        </span>
        <ChevronDown size={18} className={`trigger-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="product-selector-dropdown" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <div className="product-selector-search">
            <Search size={16} className="search-icon" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by name or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => setSearchTerm('')} type="button">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="product-selector-options">
            {filteredProducts.length === 0 ? (
              <div className="product-selector-empty">
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
                    background: 'var(--bg-secondary)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 5,
                    borderTop: '1px solid var(--border-light)',
                  }}>
                    {category}
                  </div>
                  {categoryProducts.map(product => (
                    <button
                      key={product.id}
                      className="product-option"
                      onClick={() => {
                        onSelect(product.id);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      type="button"
                    >
                      <span className="option-name">{product.name}</span>
                      <span className={`option-count ${product.quoteCount === 0 ? 'muted' : ''}`}>
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

  const handleExportExcel = async (themeName = 'vibrant') => {
    const theme = EXPORT_THEMES[themeName];
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
        {/* Stats Summary */}
        {selectedProductId && quotesWithLanded.length > 0 && bestQuote && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '28px',
          }}>
            <div className="stat-card" style={{ '--stat-color': '#6366F1', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                <FileText size={22} color="#6366F1" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Total Quotes</div>
                <div className="stat-value">{quotesWithLanded.length}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': '#10b981', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                <TrendingDown size={22} color="#10b981" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Best Price</div>
                <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                  {formatCurrency(bestQuote.unit_price)}
                </div>
              </div>
            </div>
            {otherQuotes.length > 0 && (
              <div className="stat-card" style={{ '--stat-color': '#f59e0b', '--stat-bg': 'rgba(245, 158, 11, 0.1)' }}>
                <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                  <Calculator size={22} color="#f59e0b" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Potential Savings</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {formatCurrency(otherQuotes[0].unit_price - bestQuote.unit_price)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Two-column layout: Product selector sidebar + Main content */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Sidebar: Product Selector */}
          <div style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            position: 'sticky',
            top: '24px'
          }}>
            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              marginBottom: '20px'
            }}>
              Select Buying Intent
            </h3>

            <ProductSelector
              products={products}
              quotes={[]}
              selectedProductId={selectedProductId}
              onSelect={handleProductChange}
              quoteCounts={quoteCounts}
            />

            {!selectedProductId && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <AlertCircle size={14} style={{ color: 'var(--accent)', marginRight: '6px' }} />
                Select a buying intent to compare quotes
              </div>
            )}

            {/* Recently Used */}
            {!loadingCounts && products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Recently Used
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).map(product => (
                    <button
                      key={product.id}
                      onClick={() => handleProductChange(product.id)}
                      style={{
                        padding: '12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.2s',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        textAlign: 'left'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--accent-light)';
                        e.currentTarget.style.borderColor = 'var(--accent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--bg-secondary)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }}
                    >
                      <Package size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</span>
                      <span style={{
                        padding: '2px 8px',
                        background: 'var(--success-light)',
                        color: 'var(--success)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        {quoteCounts[product.id]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Main Content */}
          <div>
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
            )
            }
          </>
        ) : (
          <div className="empty-state">
            <TrendingDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>Select a Buying Intent</h3>
            <p>Choose a buying intent from the sidebar to compare supplier quotes</p>
          </div>
        )}
        </div>
        {/* End two-column layout */}
      </div>

      {/* Theme Selector Modal - keeping outside main content */}
      {false && (
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
                  {Object.entries(EXPORT_THEMES).map(([key, theme]) => (
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
                    const theme = EXPORT_THEMES[selectedTheme];
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
                    Export with {EXPORT_THEMES[selectedTheme].name}
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
