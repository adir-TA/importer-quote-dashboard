import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, FileSpreadsheet, FileText, Sparkles,
  TrendingDown, MessageSquare, Trophy, X, Check, CheckCircle2,
  FileDown, Calculator, Package, AlertCircle, AlertTriangle, Filter
} from 'lucide-react';
import { useAppContext, canUseAi } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useModal } from '../context/ModalContext';
import { BuyingIntentCommandSelect } from '../components';
import { EXPORT_THEMES } from '../utils/exportThemes';
// formatCurrency used to hardcode 'USD', so a CNY quote rendered as "$5.00".
// It now respects each quote's own currency; see src/utils/currency.js.
import { formatCurrency, formatNumber, convertAmount, normalizeCurrency } from '../utils/currency';
import { callClaude } from '../utils/aiService';
import { downloadBlob, sanitizeCell } from '../utils/helpers';

// ProductSelector removed - now using BuyingIntentCommandSelect


// ============================================
// MAIN QUOTE COMPARISON PAGE
// ============================================
function QuoteComparison() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, computed, actions } = useAppContext();
  const { t } = useLanguage();
  const { alert: showAlert } = useModal();
  const { products, settings } = state;
  // Base currency for cross-quote comparison. The Settings value was saved but
  // never actually used anywhere before.
  const baseCurrency = normalizeCurrency(settings?.currency);
  const fxRates = settings?.fxRates;
  const [lineItems, setLineItems] = React.useState([]);
  const [quoteCounts, setQuoteCounts] = React.useState({});

  const [selectedProductId, setSelectedProductId] = useState(location.state?.productId || null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [isSelectionLocked, setIsSelectionLocked] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiAction, setAiAction] = useState('');
  const [loadingCounts, setLoadingCounts] = React.useState(true); // track loading state
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('vibrant');
  const [isMobileSelectorOpen, setIsMobileSelectorOpen] = useState(false);

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
      .map(item => {
        const currency = normalizeCurrency(item.currency);
        // Ranking MUST happen in a single currency. Sorting raw unit_price
        // across mixed currencies compared e.g. CNY 5.00 against USD 1.00 as
        // if they were the same number.
        const comparablePrice = convertAmount(item.unit_price, currency, baseCurrency, fxRates);

        return {
          id: item.id,
          supplierName: item.supplierName || item.supplier?.supplier_name,
          unit_price: item.unit_price,
          currency,
          // Price expressed in the user's base currency, or null when we have
          // no rate for that currency.
          comparablePrice,
          isConverted: currency !== baseCurrency && comparablePrice !== null,
          moq: item.moq || 1,
          incoterm: item.incoterm || 'FOB',
          created_at: item.created_at,
        };
      })
      .filter(q => q.unit_price > 0); // Only validate unit_price, MOQ has no influence

    // Quotes we cannot convert are listed last rather than mis-ranked
    return validQuotes.sort((a, b) => {
      if (a.comparablePrice === null && b.comparablePrice === null) return 0;
      if (a.comparablePrice === null) return 1;
      if (b.comparablePrice === null) return -1;
      return a.comparablePrice - b.comparablePrice;
    });
  }, [lineItems, selectedProductId, baseCurrency, fxRates]);

  // Quotes in a currency we have no exchange rate for - surfaced as a warning
  // so the ranking is never silently incomplete.
  const unconvertibleQuotes = useMemo(
    () => quotesWithLanded.filter(q => q.comparablePrice === null),
    [quotesWithLanded]
  );

  const hasMixedCurrencies = useMemo(
    () => new Set(quotesWithLanded.map(q => q.currency)).size > 1,
    [quotesWithLanded]
  );

  // Invalid quotes (for warning) - Only check unit_price, NOT moq
  const invalidQuotes = useMemo(() => {
    if (!selectedProductId || lineItems.length === 0) return [];
    return lineItems
      .filter(item => {
        const price = item.unit_price || 0;
        return price <= 0; // Only validate price, MOQ has no influence
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

  /**
   * Export the supplier decision as a printable page (Save as PDF).
   *
   * This was a stub that only showed "your selection would be exported".
   * The document is built with DOM APIs and textContent rather than an HTML
   * string, so supplier-controlled text cannot inject markup.
   */
  const handleExportDecision = () => {
    const chosen = quotesWithLanded.find(q => q.id === selectedSupplierId) || bestQuote;

    if (!selectedProduct || !chosen) {
      showAlert({ title: 'Nothing to export', message: 'Select a supplier first.', type: 'warning' });
      return;
    }

    // Opened synchronously so popup blockers do not swallow it
    const win = window.open('', '_blank');
    if (!win) {
      showAlert({
        title: 'Popup blocked',
        message: 'Allow popups for this site to export the decision.',
        type: 'warning',
      });
      return;
    }

    const doc = win.document;
    doc.title = `Supplier decision — ${selectedProduct.name}`;

    const style = doc.createElement('style');
    style.textContent = `
      body { font-family: Arial, Helvetica, sans-serif; padding: 40px; color: var(--text-primary); }
      h1 { margin: 0 0 4px; font-size: 20px; }
      .meta { color: var(--text-secondary); font-size: 13px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid var(--border-strong); padding: 10px; text-align: left; font-size: 13px; }
      th { background: var(--grey-100); }
      tr.chosen td { background: var(--success-light); font-weight: 600; }
      .note { margin-top: 24px; font-size: 12px; color: var(--text-secondary); }
    `;
    doc.head.appendChild(style);

    const h1 = doc.createElement('h1');
    h1.textContent = `Supplier decision: ${selectedProduct.name}`;
    doc.body.appendChild(h1);

    const meta = doc.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Selected: ${chosen.supplierName || 'Unknown supplier'} · Generated ${new Date().toLocaleString()}`;
    doc.body.appendChild(meta);

    const table = doc.createElement('table');
    const thead = doc.createElement('thead');
    const headRow = doc.createElement('tr');
    ['Rank', 'Supplier', 'Unit price', `Comparable (${baseCurrency})`, 'MOQ', 'Incoterm'].forEach(label => {
      const th = doc.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = doc.createElement('tbody');
    quotesWithLanded.forEach((quote, index) => {
      const tr = doc.createElement('tr');
      if (quote.id === chosen.id) tr.className = 'chosen';

      [
        String(index + 1),
        quote.supplierName || 'Unknown supplier',
        formatCurrency(quote.unit_price, quote.currency),
        quote.comparablePrice === null ? 'no rate' : formatCurrency(quote.comparablePrice, baseCurrency),
        formatNumber(quote.moq),
        quote.incoterm || 'FOB',
      ].forEach(value => {
        const td = doc.createElement('td');
        td.textContent = value; // never innerHTML - this text comes from suppliers
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    doc.body.appendChild(table);

    const note = doc.createElement('p');
    note.className = 'note';
    note.textContent =
      `Comparable prices use the exchange rates configured in Settings. ` +
      `Use your browser's "Save as PDF" option in the print dialog.`;
    doc.body.appendChild(note);

    // Wait for layout before printing, or some browsers print a blank page
    win.setTimeout(() => win.print(), 100);
  };

  const handleExportExcel = async (themeName = 'vibrant') => {
    const theme = EXPORT_THEMES[themeName];
    if (!selectedProduct || quotesWithLanded.length === 0) {
      showAlert({ title: 'Nothing to export', message: 'No quotes available to export.', type: 'warning' });
      return;
    }

    // exceljs is ~940kB minified. Imported on demand so it is only downloaded
    // when the user actually exports, not on every page view.
    const { default: ExcelJS } = await import('exceljs');
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
    titleCell.value = 'QUOTE COMPARISON';
    titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: theme.colors.title.text } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.title.bg } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.border = {
      bottom: { style: 'medium', color: { argb: theme.colors.title.bg } }
    };
    worksheet.getRow(1).height = 35;

    // Row 2: Empty
    worksheet.getRow(2).height = 8;

    // Rows 3-6: Product Image (left) and Product Info (right)
    worksheet.mergeCells('A3:C6');
    const imageCell = worksheet.getCell('A3');

    // Try to embed actual product image
    if (selectedProduct.image_url) {
      try {
        const response = await fetch(selectedProduct.image_url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();

          // Determine image format
          let extension = 'png';
          if (selectedProduct.image_url.toLowerCase().includes('.jpg') ||
              selectedProduct.image_url.toLowerCase().includes('.jpeg')) {
            extension = 'jpeg';
          }

          const imageId = workbook.addImage({
            buffer: arrayBuffer,
            extension: extension,
          });

          // Calculate image size to fit within cell (preserve aspect ratio)
          // Cell spans columns A-C (width ~55) and rows 3-6 (height ~90)
          const maxWidth = 200;
          const maxHeight = 100;

          // Add image with positioning
          worksheet.addImage(imageId, {
            tl: { col: 0, row: 2 },
            ext: { width: maxWidth, height: maxHeight },
            editAs: 'oneCell'
          });

          // Clear the placeholder text
          imageCell.value = '';
        } else {
          throw new Error('Failed to fetch image');
        }
      } catch (error) {
        console.error('Failed to embed product image:', error);
        // Fall back to placeholder
        imageCell.value = 'PRODUCT IMAGE\n[Not Available]';
        imageCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.imagePlaceholder.text } };
        imageCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    } else {
      // No image URL - show placeholder
      imageCell.value = 'PRODUCT IMAGE\n[Not Available]';
      imageCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.imagePlaceholder.text } };
      imageCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    // Border for image cell
    imageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.imagePlaceholder.bg } };
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
    headerRow.values = ['Rank', 'Supplier', 'Unit Price', 'MOQ', 'Total (at MOQ)', 'Incoterm', `Savings (${baseCurrency})`, 'Status'];
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
      // Savings compare converted prices; the raw subtraction across
      // currencies was meaningless.
      const savings =
        nextQuote && nextQuote.comparablePrice !== null && quote.comparablePrice !== null
          ? formatCurrency(nextQuote.comparablePrice - quote.comparablePrice, baseCurrency)
          : '-';
      const isBestPrice = index === 0;

      const row = worksheet.addRow([
        index + 1,
        // Supplier names come from supplier documents, so they are untrusted
        // text: a value starting with = + - or @ is executed as a formula
        // when the sheet is opened.
        sanitizeCell(quote.supplierName),
        formatCurrency(quote.unit_price, quote.currency),
        quote.moq.toLocaleString(),
        formatCurrency(quote.unit_price * quote.moq, quote.currency),
        sanitizeCell(quote.incoterm || 'FOB'),
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
    // downloadBlob attaches the anchor and defers revokeObjectURL; revoking
    // synchronously after .click() cancelled the download in Firefox/Safari.
    downloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename
    );
  };

  // These two used to return hardcoded template text after a fake 800ms delay,
  // presented to the user as AI analysis. They now call the model through the
  // backend proxy, and say so honestly when no API key is configured.
  const describeQuote = (quote) =>
    `${quote.supplierName || 'Unknown supplier'}: ` +
    `${formatCurrency(quote.unit_price, quote.currency)}/unit, ` +
    `MOQ ${formatNumber(quote.moq)}, ${quote.incoterm || 'FOB'}` +
    (quote.isConverted
      ? ` (≈ ${formatCurrency(quote.comparablePrice, baseCurrency)}/unit)`
      : '');

  const runAI = async (action, buildPrompt) => {
    if (!canUseAi(settings)) {
      setAiError('Add your Anthropic API key in Settings to use the AI analysis.');
      return;
    }

    setAiError('');
    setAiResponse('');
    setAiAction(action);
    setAiLoading(true);

    try {
      setAiResponse(await callClaude(buildPrompt(), { maxTokens: 1500 }));
    } catch (err) {
      setAiError(err.message || 'AI request failed');
      setAiAction('');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIExplain = () => {
    if (!bestQuote || !selectedProduct) return;

    return runAI('explain', () => `You are helping an importer choose a supplier.

Buying Intent: ${selectedProduct.name}
All prices are shown in each supplier's own currency; comparable values in ${baseCurrency} are in brackets.

Quotes, cheapest first:
${quotesWithLanded.map((q, i) => `${i + 1}. ${describeQuote(q)}`).join('\n')}

Explain which option is best and why, in this EXACT format:

**BEST OPTION:** [supplier] - [one sentence why]

**PRICE ANALYSIS:**
- [comparison of prices]
- [note on value, MOQ and incoterm differences]

**RISKS TO WATCH:**
- [risk 1]
- [risk 2]

**RECOMMENDATION:** [final advice in 1-2 sentences]

Base every statement on the numbers above. Do not invent data.`);
  };

  const handleAINegotiate = (quote) => {
    if (!selectedProduct) return;

    return runAI('negotiate', () => `Write a short WhatsApp/WeChat message to negotiate a better price.

Product: ${selectedProduct.name}
Supplier and current quote: ${describeQuote(quote)}
Target: about 10% below the quoted unit price, in the same currency.

Rules:
- Very simple English, 5-10 words per sentence
- Under 80 words total
- Friendly and professional
- Reference a larger future order or fast payment as leverage
- At most two emojis

Write ONLY the message.`);
  };

  const clearAI = () => {
    setAiResponse('');
    setAiAction('');
    setAiError('');
  };

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>{t('comparison.title')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: '2px' }}>
              {t('comparison.subtitle')}
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
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-md)' }}>{t('comparison.loading')}</p>
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
            <div className="stat-card" style={{ '--stat-color': 'var(--accent)', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                <FileText size={22} color="var(--accent)" />
              </div>
              <div className="stat-content">
                <div className="stat-label">{t('comparison.totalQuotes')}</div>
                <div className="stat-value">{quotesWithLanded.length}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': 'var(--success)', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                <TrendingDown size={22} color="var(--success)" />
              </div>
              <div className="stat-content">
                <div className="stat-label">{t('comparison.bestPrice')}</div>
                <div className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>
                  {formatCurrency(bestQuote.unit_price, bestQuote.currency)}
                </div>
              </div>
            </div>
            {otherQuotes.length > 0 && (
              <div className="stat-card" style={{ '--stat-color': 'var(--warning)', '--stat-bg': 'rgba(245, 158, 11, 0.1)' }}>
                <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                  <Calculator size={22} color="var(--warning)" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">{t('comparison.potentialSavings')}</div>
                  <div className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>
                    {otherQuotes[0].comparablePrice !== null && bestQuote.comparablePrice !== null
                      ? formatCurrency(otherQuotes[0].comparablePrice - bestQuote.comparablePrice, baseCurrency)
                      : '—'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile Selector Button */}
        <button
          className="mobile-filters-btn"
          onClick={() => setIsMobileSelectorOpen(true)}
          style={{
            display: 'none',
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: 'var(--text-base)',
            fontWeight: 600,
            alignItems: 'center',
            gap: '8px',
            width: '100%',
          }}
        >
          <Filter size={16} /> {t('comparison.selectBuyingIntent')}
        </button>

        {/* Two-column layout: Product selector sidebar + Main content */}
        <div className="products-layout" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Sidebar: Product Selector */}
          <div className="filters-sidebar" style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            position: 'sticky',
            top: '24px'
          }}>
            <h3 style={{
              fontSize: 'var(--text-base)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              marginBottom: '20px'
            }}>
              {t('comparison.selectBuyingIntent')}
            </h3>

            <BuyingIntentCommandSelect
              buyingIntents={products}
              value={selectedProductId}
              onChange={handleProductChange}
              quoteCounts={quoteCounts}
              placeholder={t('comparison.selectPlaceholder')}
            />

            {!selectedProductId && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', color: 'var(--text-secondary)' }}>
                <AlertCircle size={14} style={{ color: 'var(--accent)', marginInlineEnd: '6px' }} />
                {t('comparison.selectToCompare')}
              </div>
            )}

            {/* Recently Used */}
            {!loadingCounts && products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('comparison.recentlyUsed')}
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
                        fontSize: 'var(--text-base)',
                        fontWeight: 500,
                        textAlign: 'start'
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
                        fontSize: 'var(--text-xs)',
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
                  {invalidQuotes.length} quote(s) excluded due to invalid data (price ≤ 0 or quantity ≤ 0)
                </span>
              </div>
            )}

            {/* Mixed-currency ranking is only trustworthy if the user knows
                conversion happened, and at what rates. */}
            {hasMixedCurrencies && unconvertibleQuotes.length === 0 && (
              <div className="validation-warning" style={{ marginBottom: '16px' }}>
                <AlertTriangle size={16} />
                <span>
                  Quotes are in different currencies. Ranking uses your{' '}
                  {baseCurrency} exchange rates from Settings — check they are current.
                </span>
              </div>
            )}

            {unconvertibleQuotes.length > 0 && (
              <div className="validation-warning" style={{ marginBottom: '16px' }}>
                <AlertTriangle size={16} />
                <span>
                  {unconvertibleQuotes.length} quote(s) could not be ranked: no {baseCurrency}{' '}
                  exchange rate for {[...new Set(unconvertibleQuotes.map(q => q.currency))].join(', ')}.
                  Add a rate in Settings.
                </span>
              </div>
            )}

            {quotesWithLanded.length === 0 ? (
              <div className="empty-state">
                <TrendingDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3>{t('comparison.noValidQuotes').replace('{name}', selectedProduct?.name)}</h3>
                <p>{t('comparison.addValidQuotes')}</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => navigate(`/products/${selectedProductId}`)}
                >
                  {t('comparison.addQuotes')}
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
                        ? 'var(--success-light)'
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
                            <h3>{t('comparison.supplierSelected')}</h3>
                            <p>{bestQuote.supplierName} — {formatCurrency(bestQuote.unit_price, bestQuote.currency)}/unit</p>
                          </div>
                        </div>

                        <div className="next-actions-section">
                          <p className="next-actions-helper">
                            {t('comparison.youveSelected').replace('{name}', selectedProduct?.name)}
                          </p>
                          <div className="next-actions-title">{t('comparison.nextActions')}</div>
                          <div className="next-actions-buttons">
                            <button className="btn btn-secondary" onClick={handleExportDecision}>
                              <FileDown size={18} /> {t('comparison.exportDecision')}
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleAINegotiate(bestQuote)}>
                              <MessageSquare size={18} /> {t('comparison.negotiationMessage')}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="best-quote-header">
                          <Trophy size={24} color="var(--warning)" />
                          <div style={{ flex: 1 }}>
                            <h3 style={{ margin: 0 }}>{t('comparison.best')}: {bestQuote.supplierName}</h3>
                            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                              {t('comparison.lowestPrice')} ({bestQuote.incoterm})
                            </p>
                          </div>
                          <div className="best-quote-price">
                            <span className="price-label">{t('comparison.unitPrice')}</span>
                            <span className="price-value">{formatCurrency(bestQuote.unit_price, bestQuote.currency)}/unit</span>
                          </div>
                        </div>
                        
                        <div className="best-quote-cta">
                          <button 
                            className="btn btn-select-supplier"
                            onClick={() => handleSelectSupplier(bestQuote.id)}
                          >
                            <Check size={20} /> {t('comparison.selectThisSupplier')}
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
                            <Sparkles size={14} /> {t('comparison.whyBest')}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleAINegotiate(bestQuote)} title="Generate negotiation message">
                            <MessageSquare size={14} /> {t('comparison.negotiate')}
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
                    background: 'linear-gradient(135deg, var(--warning-light) 0%, var(--warning-light) 100%)',
                    border: '2px solid var(--warning)',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                  }}>
                    <AlertCircle size={24} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--warning)', marginBottom: '4px' }}>
                        This Buying Intent was auto-created
                      </div>
                      <div style={{ fontSize: 'var(--text-base)', color: 'var(--warning)' }}>
                        Give it a meaningful name to finalize and organize your quotes better
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const newName = prompt('Enter a name for this Buying Intent:', selectedProduct.name);
                        if (newName && newName.trim()) {
                          try {
                            await actions.finalizeBuyingIntent(selectedProduct.id, newName.trim());
                            showAlert({ title: 'Finalized', message: 'Buying Intent finalized successfully.', type: 'success' });
                          } catch (err) {
                            showAlert({ title: 'Error', message: `Failed to finalize: ${err.message}`, type: 'error' });
                          }
                        }
                      }}
                      style={{
                        padding: '10px 20px',
                        background: 'var(--warning)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 'var(--text-base)',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--warning)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--warning)';
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
                        <TrendingDown size={18} /> {t('comparison.quotesFor').replace('{count}', quotesWithLanded.length).replace('{name}', selectedProduct?.name)}
                      </span>
                      {selectedProduct?.status === 'draft' && (
                        <span style={{
                          padding: '3px 10px',
                          background: 'var(--warning-light)',
                          color: 'var(--warning)',
                          borderRadius: 'var(--radius-xs)',
                          fontSize: 'var(--text-xs)',
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
                        fontSize: 'var(--text-base)',
                      }}
                      title="Export comparison to Excel"
                    >
                      <FileSpreadsheet size={16} />
                      {t('comparison.exportToExcel')}
                    </button>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="table comparison-table">
                      <thead>
                        <tr>
                          <th style={{ width: '50px' }}>{t('comparison.rank')}</th>
                          <th>{t('comparison.supplier')}</th>
                          <th>{t('comparison.unitPrice')}</th>
                          <th>{t('comparison.mOQ')}</th>
                          <th>{t('comparison.totalAtMOQ')}</th>
                          <th>{t('comparison.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotesWithLanded.map((quote, index) => {
                          const isBest = index === 0;
                          const isSelected = selectedSupplierId === quote.id;
                          // Savings are only meaningful between two quotes we
                          // can express in the same currency.
                          const next = quotesWithLanded[index + 1];
                          const savingsVsNext =
                            next && next.comparablePrice !== null && quote.comparablePrice !== null
                              ? next.comparablePrice - quote.comparablePrice
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
                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                  {quote.incoterm}
                                </div>
                              </td>
                              <td>
                                <span style={{
                                  fontWeight: 700,
                                  color: isBest ? 'var(--success)' : 'var(--text-primary)',
                                }}>
                                  {formatCurrency(quote.unit_price, quote.currency)}/unit
                                </span>
                                {quote.isConverted && (
                                  <span style={{
                                    display: 'block',
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--text-muted)',
                                  }}>
                                    ≈ {formatCurrency(quote.comparablePrice, baseCurrency)}/unit
                                  </span>
                                )}
                                {quote.comparablePrice === null && (
                                  <span style={{
                                    display: 'block',
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--warning, var(--warning))',
                                  }}>
                                    No {baseCurrency} rate — not ranked
                                  </span>
                                )}
                                {isBest && savingsVsNext > 0 && (
                                  <span style={{
                                    display: 'block',
                                    fontSize: 'var(--text-xs)',
                                    color: 'var(--success)',
                                  }}>
                                    Saves {formatCurrency(savingsVsNext, baseCurrency)}/unit
                                  </span>
                                )}
                              </td>
                              <td>{formatNumber(quote.moq)} units</td>
                              <td style={{ color: 'var(--text-secondary)' }}>
                                {formatCurrency(totalAtMoq, quote.currency)}
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
                {(aiResponse || aiLoading || aiError) && (
                  <div className="card" style={{ marginTop: '24px' }}>
                    <div className="card-header">
                      <span className="card-title">
                        <Sparkles size={18} color="var(--accent)" />
                        {aiAction === 'negotiate' ? 'Generated Message' : 'AI Analysis'}
                      </span>
                      <button className="icon-btn" onClick={clearAI}>
                        <X size={18} />
                      </button>
                    </div>
                    <div className="card-body">
                      {aiError && (
                        <div className="auth-error" role="alert" style={{ marginBottom: '12px' }}>
                          <AlertCircle size={18} />
                          <span style={{ whiteSpace: 'pre-wrap' }}>{aiError}</span>
                        </div>
                      )}
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
                              return <li key={i} style={{ marginInlineStart: '20px' }}>{line.substring(2)}</li>;
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
                                showAlert({ title: 'Copied', message: 'Copied to clipboard.', type: 'success' });
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
            background: 'var(--grey-50)',
            borderRadius: 'var(--radius-xl)',
            border: '2px dashed var(--border-strong)',
          }}>
            <div style={{
              display: 'inline-flex',
              padding: '20px',
              background: 'white',
              borderRadius: '50%',
              marginBottom: '20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            }}>
              <TrendingDown size={48} style={{ color: 'var(--text-subtle)' }} />
            </div>
            <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Select a Buying Intent to Compare
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)', maxWidth: '400px', margin: '0 auto' }}>
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
            borderRadius: 'var(--radius-xl)',
            maxWidth: '1200px',
            width: '95%',
            height: '85vh',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '24px 32px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-primary)', margin: 0, marginBottom: '4px' }}>
                  Choose Export Theme
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)', margin: 0 }}>
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
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--grey-100)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <X size={24} style={{ color: 'var(--text-secondary)' }} />
              </button>
            </div>

            {/* Split Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left Sidebar - Theme List */}
              <div style={{
                width: '320px',
                borderInlineEnd: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div style={{
                  padding: '20px',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <h3 style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-secondary)',
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
                        background: selectedTheme === key ? 'var(--accent-light)' : 'white',
                        border: `2px solid ${selectedTheme === key ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        textAlign: 'start',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedTheme !== key) {
                          e.currentTarget.style.borderColor = 'var(--border-strong)';
                          e.currentTarget.style.background = 'var(--grey-50)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedTheme !== key) {
                          e.currentTarget.style.borderColor = 'var(--border)';
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
                          border: `2px solid ${selectedTheme === key ? 'var(--accent)' : 'var(--border-strong)'}`,
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
                              background: 'var(--accent)',
                            }} />
                          )}
                        </div>
                        <h4 style={{
                          fontSize: 'var(--text-md)',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          margin: 0,
                        }}>
                          {theme.name}
                        </h4>
                      </div>
                      <p style={{
                        color: 'var(--text-secondary)',
                        fontSize: 'var(--text-sm)',
                        margin: '0 0 12px 28px',
                      }}>
                        {theme.description}
                      </p>
                      <div style={{
                        display: 'flex',
                        gap: '6px',
                        marginInlineStart: '28px',
                      }}>
                        {theme.preview.map((color, index) => (
                          <div
                            key={index}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: 'var(--radius-xs)',
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
                background: 'var(--grey-50)',
              }}>
                <div style={{
                  padding: '20px 32px',
                  background: 'white',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <h3 style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'var(--text-secondary)',
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
                          fontSize: 'var(--text-xl)',
                          borderBottom: '2px solid #000',
                        }}>
                          QUOTE COMPARISON
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
                            fontSize: 'var(--text-xs)',
                            fontWeight: 'bold',
                            border: `2px solid #${theme.colors.imagePlaceholder.border.substring(2)}`,
                            borderInlineStart: 'none',
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
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'bold',
                              borderBottom: '1px solid var(--border)',
                              borderInlineEnd: '2px solid #000',
                            }}>Product: {selectedProduct?.name || 'Adhesive Tape'}</div>

                            <div style={{
                              background: `#${theme.colors.category.bg.substring(2)}`,
                              color: `#${theme.colors.category.text.substring(2)}`,
                              padding: '10px 12px',
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'bold',
                              borderBottom: '1px solid var(--border)',
                              borderInlineEnd: '2px solid #000',
                            }}>Category: {selectedProduct?.category || 'Other'}</div>

                            <div style={{
                              background: `#${theme.colors.date.bg.substring(2)}`,
                              color: `#${theme.colors.date.text.substring(2)}`,
                              padding: '10px 12px',
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'bold',
                              borderBottom: '1px solid var(--border)',
                              borderInlineEnd: '2px solid #000',
                            }}>Generated: {new Date().toLocaleDateString()}</div>

                            <div style={{
                              background: `#${theme.colors.totalQuotes.bg.substring(2)}`,
                              color: `#${theme.colors.totalQuotes.text.substring(2)}`,
                              padding: '10px 12px',
                              fontSize: 'var(--text-sm)',
                              fontWeight: 'bold',
                              borderInlineEnd: '2px solid #000',
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
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '1px solid #666', borderBottom: '2px solid #000' }}>Rank</div>
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '1px solid #666', borderBottom: '2px solid #000' }}>Supplier</div>
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '1px solid #666', borderBottom: '2px solid #000' }}>Price</div>
                            <div style={{ padding: '12px 8px', fontWeight: 'bold', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '2px solid #000', borderBottom: '2px solid #000' }}>Status</div>
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
                              fontSize: 'var(--text-sm)',
                              textAlign: 'center',
                              borderInlineEnd: '1px solid #999',
                              borderBottom: '1px solid #999',
                              background: `#${theme.colors.rankColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>1</div>
                            <div style={{ padding: '10px 8px', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '1px solid #999', borderBottom: '1px solid #999' }}>A Sarah</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: 'var(--text-sm)',
                              textAlign: 'center',
                              borderInlineEnd: '1px solid #999',
                              borderBottom: '1px solid #999',
                              background: `#${theme.colors.priceColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>$0.32</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: 'var(--text-sm)',
                              textAlign: 'center',
                              borderInlineEnd: '2px solid #000',
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
                              fontSize: 'var(--text-sm)',
                              textAlign: 'center',
                              borderInlineEnd: '1px solid #ccc',
                              borderBottom: '1px solid #ccc',
                              background: `#${theme.colors.rankColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>2</div>
                            <div style={{ padding: '10px 8px', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '1px solid #ccc', borderBottom: '1px solid #ccc' }}>Jasion</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: 'var(--text-sm)',
                              textAlign: 'center',
                              borderInlineEnd: '1px solid #ccc',
                              borderBottom: '1px solid #ccc',
                              background: `#${theme.colors.priceColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>$0.33</div>
                            <div style={{ padding: '10px 8px', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '2px solid #000', borderBottom: '1px solid #ccc' }}>-</div>
                          </div>

                          {/* Regular Row 2 */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '60px 2fr 100px 100px',
                            background: `#${theme.colors.alternatingRow.even.substring(2)}`,
                          }}>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: 'var(--text-sm)',
                              textAlign: 'center',
                              borderInlineEnd: '1px solid #ccc',
                              borderBottom: '2px solid #000',
                              background: `#${theme.colors.rankColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>3</div>
                            <div style={{ padding: '10px 8px', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '1px solid #ccc', borderBottom: '2px solid #000' }}>Melo</div>
                            <div style={{
                              padding: '10px 8px',
                              fontSize: 'var(--text-sm)',
                              textAlign: 'center',
                              borderInlineEnd: '1px solid #ccc',
                              borderBottom: '2px solid #000',
                              background: `#${theme.colors.priceColumn.bg.substring(2)}`,
                              fontWeight: 'bold',
                            }}>$0.34</div>
                            <div style={{ padding: '10px 8px', fontSize: 'var(--text-sm)', textAlign: 'center', borderInlineEnd: '2px solid #000', borderBottom: '2px solid #000' }}>-</div>
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
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                }}>
                  <button
                    onClick={() => setShowThemeSelector(false)}
                    className="btn btn-secondary"
                    style={{
                      padding: '10px 20px',
                      fontSize: 'var(--text-md)',
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
                      fontSize: 'var(--text-md)',
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

      {/* Mobile Selector Drawer */}
      {isMobileSelectorOpen && (
        <>
          <div
            className="mobile-filters-overlay"
            onClick={() => setIsMobileSelectorOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(2px)',
              zIndex: 999,
            }}
          />
          <div className="mobile-filters-drawer" style={{
            position: 'fixed',
            right: 0,
            top: 0,
            bottom: 0,
            width: '85%',
            maxWidth: '320px',
            background: 'white',
            zIndex: 1000,
            overflowY: 'auto',
            padding: '24px',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)' }}>Select Buying Intent</h3>
              <button
                onClick={() => setIsMobileSelectorOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={24} />
              </button>
            </div>

            <BuyingIntentCommandSelect
              buyingIntents={products}
              value={selectedProductId}
              onChange={(id) => {
                handleProductChange(id);
                setIsMobileSelectorOpen(false);
              }}
              quoteCounts={quoteCounts}
              placeholder={t('comparison.selectPlaceholder')}
            />

            {!selectedProductId && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'var(--accent-light)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', color: 'var(--text-secondary)' }}>
                <AlertCircle size={14} style={{ color: 'var(--accent)', marginInlineEnd: '6px' }} />
                {t('comparison.selectToCompare')}
              </div>
            )}

            {/* Recently Used */}
            {!loadingCounts && products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {t('comparison.recentlyUsed')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {products.filter(p => (quoteCounts[p.id] || 0) > 0 && p.id !== selectedProductId).slice(0, 3).map(product => (
                    <button
                      key={product.id}
                      onClick={() => {
                        handleProductChange(product.id);
                        setIsMobileSelectorOpen(false);
                      }}
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
                        fontSize: 'var(--text-base)',
                        fontWeight: 500,
                        textAlign: 'start'
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
                        fontSize: 'var(--text-xs)',
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
        </>
      )}
    </div>
  );
}

export default QuoteComparison;
