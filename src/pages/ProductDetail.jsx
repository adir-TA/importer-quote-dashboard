import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, Check, X, Trash2, Edit2, DollarSign, Upload, File, FileDown } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import MultiItemQuoteUploadModal from '../components/MultiItemQuoteUploadModal';
import DocumentsTab from '../components/DocumentsTab';
import UploadDocumentModal from '../components/UploadDocumentModal';
import ExcelJS from 'exceljs';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'ILS'];
const INCOTERMS = ['FOB', 'CIF', 'EXW', 'DDP', 'DAP', 'CFR'];

// RFQ Export Themes (reused from QuoteComparison)
const RFQ_THEMES = {
  vibrant: {
    colors: {
      title: { bg: 'FF0F172A', text: 'FFFFFFFF' },
      imagePlaceholder: { bg: 'FFFCE7F3', text: 'FF9F1239', border: 'FFF43F5E' },
      productName: { bg: 'FFE0E7FF', text: 'FF3730A3' },
      category: { bg: 'FFE0E7FF', text: 'FF3730A3' },
      date: { bg: 'FFDBEAFE', text: 'FF1E40AF' },
      infoRow: { bg: 'FFF1F5F9', text: 'FF475569' },
      header: { bg: 'FF1E293B', text: 'FFFFFFFF' }
    }
  }
};

// Helper to get image dimensions from buffer
async function getImageDimensions(buffer) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

async function generateRFQExcel(product, themeName = 'vibrant') {
  const theme = RFQ_THEMES[themeName];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HA Tools';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('RFQ');

  // Get specs with default order: Weight, Height, Length, Width, then custom fields
  const specs = product.specs && product.specs.length > 0
    ? product.specs.filter(spec => spec.value)
    : [];

  const defaultKeys = ['Weight', 'Height', 'Length', 'Width'];
  const orderedSpecs = [];
  const seen = new Set();

  // Add default specs in order
  defaultKeys.forEach(key => {
    const spec = specs.find(s => s.key.toLowerCase() === key.toLowerCase());
    if (spec) {
      orderedSpecs.push(spec);
      seen.add(spec.key.toLowerCase());
    }
  });

  // Add custom specs
  specs.forEach(spec => {
    if (!seen.has(spec.key.toLowerCase())) {
      orderedSpecs.push(spec);
    }
  });

  // Factory-fill columns (for supplier to complete)
  const factoryColumns = ['MOQ', 'Price per Unit', 'Incoterm', 'Packaging'];

  // Calculate columns: Item Name | Category | Image | specs... | factory fields
  const baseColumns = 3; // Item, Category, Image
  const totalColumns = baseColumns + orderedSpecs.length + factoryColumns.length;

  // Set column widths dynamically
  const columnWidths = [
    { width: 25 },  // Item Name
    { width: 15 },  // Category
    { width: 20 }   // Image
  ];
  orderedSpecs.forEach(() => columnWidths.push({ width: 15 }));
  factoryColumns.forEach(() => columnWidths.push({ width: 18 })); // Factory columns slightly wider
  worksheet.columns = columnWidths;

  // Helper to convert column number to letter
  const getColLetter = (num) => {
    let letter = '';
    while (num > 0) {
      const mod = (num - 1) % 26;
      letter = String.fromCharCode(65 + mod) + letter;
      num = Math.floor((num - mod) / 26);
    }
    return letter;
  };

  const lastCol = getColLetter(totalColumns);

  // Row 1: Title
  worksheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'REQUEST FOR QUOTATION (RFQ)';
  titleCell.font = { name: 'Calibri', size: 20, bold: true, color: { argb: theme.colors.title.text } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.title.bg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = {
    bottom: { style: 'medium', color: { argb: theme.colors.title.bg } }
  };
  worksheet.getRow(1).height = 35;

  // Row 2: Empty
  worksheet.getRow(2).height = 8;

  // Row 3: Product info
  worksheet.mergeCells(`A3:${lastCol}3`);
  const productCell = worksheet.getCell('A3');
  productCell.value = `Product: ${product.name}`;
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

  // Row 4: Category
  worksheet.mergeCells(`A4:${lastCol}4`);
  const categoryCell = worksheet.getCell('A4');
  categoryCell.value = `Category: ${product.category || 'General'}`;
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

  // Row 5: Generated date
  worksheet.mergeCells(`A5:${lastCol}5`);
  const dateCell = worksheet.getCell('A5');
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

  // Empty rows
  worksheet.getRow(6).height = 8;
  worksheet.getRow(7).height = 8;

  // Row 8: Request Header
  worksheet.mergeCells(`A8:${lastCol}8`);
  const requestHeader = worksheet.getCell('A8');
  requestHeader.value = 'Please provide your best quotation for the following:';
  requestHeader.font = { name: 'Calibri', size: 12, bold: true, color: { argb: theme.colors.header.text } };
  requestHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.header.bg } };
  requestHeader.alignment = { horizontal: 'left', vertical: 'middle' };
  requestHeader.border = {
    top: { style: 'medium', color: { argb: theme.colors.header.bg } },
    bottom: { style: 'medium', color: { argb: theme.colors.header.bg } },
    left: { style: 'medium', color: { argb: theme.colors.header.bg } },
    right: { style: 'medium', color: { argb: theme.colors.header.bg } }
  };
  worksheet.getRow(8).height = 28;

  // Row 9: Empty
  worksheet.getRow(9).height = 8;

  // Row 10: Column headers - Item Name | Category | Image | specs... | factory fields
  const headerRow = worksheet.getRow(10);
  const headerValues = ['Item Name', 'Category', 'Image'];
  orderedSpecs.forEach(spec => headerValues.push(spec.key));
  factoryColumns.forEach(col => headerValues.push(col)); // Add factory columns
  headerRow.values = headerValues;
  headerRow.height = 25;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: theme.colors.header.text } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.header.bg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // Row 11: Data row with product info, spec values, and empty factory fields
  const dataRowValues = [product.name, product.category || 'General', ''];
  orderedSpecs.forEach(spec => dataRowValues.push(spec.value));
  factoryColumns.forEach(() => dataRowValues.push('')); // Empty cells for factory to fill
  const dataRow = worksheet.addRow(dataRowValues);
  dataRow.height = 60; // Initial height, will adjust if image is present
  dataRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // Embed image in the Image column (column C, row 11) if present
  if (product.image_url) {
    try {
      const response = await fetch(product.image_url);
      if (!response.ok) throw new Error('Failed to fetch image');

      const arrayBuffer = await response.arrayBuffer();

      // Get actual image dimensions
      const dimensions = await getImageDimensions(arrayBuffer);

      // Determine image format from URL or default to PNG
      let extension = 'png';
      if (product.image_url.toLowerCase().includes('.jpg') || product.image_url.toLowerCase().includes('.jpeg')) {
        extension = 'jpeg';
      }

      const imageId = workbook.addImage({
        buffer: arrayBuffer,
        extension: extension,
      });

      // Calculate scaling to fit within reasonable bounds
      // Max width: 130px (fits well in 20-char column)
      // Max height: 100px (keeps row size manageable)
      const maxWidth = 130;
      const maxHeight = 100;

      let targetWidth = dimensions.width;
      let targetHeight = dimensions.height;

      // Scale down if needed (preserve aspect ratio, never upscale)
      if (dimensions.width > maxWidth || dimensions.height > maxHeight) {
        const widthRatio = maxWidth / dimensions.width;
        const heightRatio = maxHeight / dimensions.height;
        const ratio = Math.min(widthRatio, heightRatio);

        targetWidth = Math.floor(dimensions.width * ratio);
        targetHeight = Math.floor(dimensions.height * ratio);
      }

      // Adjust row height to fit image (Excel row height is in points, ~0.75 * pixels)
      const rowHeightPt = Math.ceil(targetHeight * 0.75) + 8;
      dataRow.height = Math.max(60, rowHeightPt);

      // Insert image at column C (index 2), row 11 (index 10)
      // Position with small margins for centering within cell
      worksheet.addImage(imageId, {
        tl: { col: 2, row: 10 },
        ext: { width: targetWidth, height: targetHeight },
        editAs: 'oneCell'
      });
    } catch (error) {
      console.error('Failed to embed image:', error);
      // Image cell remains empty on error - don't break the export
    }
  }

  // Empty row after data
  let currentRow = 12;
  worksheet.getRow(currentRow).height = 16;
  currentRow++;

  // Additional Notes
  worksheet.mergeCells(`A${currentRow}:${lastCol}${currentRow}`);
  const notesCell = worksheet.getCell(`A${currentRow}`);
  notesCell.value = 'Additional Notes:';
  notesCell.font = { name: 'Calibri', size: 11, bold: true };
  notesCell.alignment = { horizontal: 'left', vertical: 'top' };
  currentRow++;

  // Notes area (3 rows)
  const notesStartRow = currentRow;
  const notesEndRow = currentRow + 2;
  worksheet.mergeCells(`A${notesStartRow}:${lastCol}${notesEndRow}`);
  const notesArea = worksheet.getCell(`A${notesStartRow}`);
  notesArea.value = '';
  notesArea.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };
  worksheet.getRow(notesStartRow).height = 20;
  worksheet.getRow(notesStartRow + 1).height = 20;
  worksheet.getRow(notesEndRow).height = 20;

  // Generate filename and export
  const filename = `RFQ_${product.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { state, actions, computed } = useAppContext();
  const { confirm } = useModal();

  const product = computed.getProductById(id);
  const quotes = computed.getProductQuotes(id); // Old quotes
  const [lineItems, setLineItems] = useState([]); // New line items

  const [activeTab, setActiveTab] = useState('quotes'); // 'quotes' | 'documents'
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [editingQuote, setEditingQuote] = useState(null);
  const [formData, setFormData] = useState({
    supplierName: '',
    unitPrice: '',
    currency: 'USD',
    moq: '',
    incoterm: 'FOB',
  });

  // Load line items for this product
  useEffect(() => {
    const loadLineItems = async () => {
      const items = await computed.getLineItemsForProduct(id);
      setLineItems(items);
      console.log(`[ProductDetail] Loaded ${items.length} line items for product ${id}`);
    };
    if (id) {
      loadLineItems();
    }
  }, [id, computed]);

  const resetForm = () => {
    setFormData({
      supplierName: '',
      unitPrice: '',
      currency: 'USD',
      moq: '',
      incoterm: 'FOB',
    });
    setEditingQuote(null);
  };

  const handleOpenQuoteModal = (quote = null) => {
    if (quote) {
      setEditingQuote(quote);
      setFormData({
        supplierName: quote.supplierName || quote.supplier_name || '',
        unitPrice: quote.unitPrice || '',
        currency: quote.currency || 'USD',
        moq: quote.moq || '',
        incoterm: quote.incoterm || 'FOB',
      });
    } else {
      resetForm();
    }
    setIsQuoteModalOpen(true);
  };

  const handleCloseQuoteModal = () => {
    setIsQuoteModalOpen(false);
    resetForm();
  };

  const handleSaveQuote = async () => {
    if (!formData.supplierName.trim()) {
      alert('Please enter a supplier name');
      return;
    }
    if (!formData.unitPrice || parseFloat(formData.unitPrice) <= 0) {
      alert('Please enter a valid unit price');
      return;
    }

    const quoteData = {
      productId: id,
      product_id: id,
      supplierName: formData.supplierName.trim(),
      unitPrice: parseFloat(formData.unitPrice),
      currency: formData.currency,
      moq: parseInt(formData.moq) || 0,
      incoterm: formData.incoterm,
    };

    try {
      if (editingQuote) {
        await actions.updateQuote({ ...editingQuote, ...quoteData });
      } else {
        await actions.addQuote(quoteData);
      }
      handleCloseQuoteModal();
    } catch (error) {
      alert('Error saving quote: ' + error.message);
    }
  };

  const handleDeleteQuote = async (quoteId) => {
    const confirmed = await confirm({
      title: 'Delete Quote',
      message: 'Are you sure you want to delete this quote?',
      type: 'danger',
      confirmText: 'Delete',
    });
    if (confirmed) {
      await actions.deleteQuote(quoteId);
    }
  };

  const handleCompare = () => {
    navigate('/comparison', { state: { productId: id } });
  };

  // Handle quote save from upload modal (multi-item)
  const handleUploadSuccess = async (result) => {
    console.log('✅ [ProductDetail] Quote saved successfully:', result);
    // Refresh data and reload line items
    await actions.refreshData();
    const items = await computed.getLineItemsForProduct(id);
    setLineItems(items);
  };

  if (!product) {
    return (
      <div className="page">
        <div className="content">
          <div className="empty-state">
            <h3>Buying Intent not found</h3>
            <button className="btn btn-primary" onClick={() => navigate('/products')}>
              Back to Buying Intents
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-btn" onClick={() => navigate('/products')}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2>{product.name}</h2>
            {product.category && (
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {product.category}
              </span>
            )}
          </div>
        </div>
        <div className="header-actions">
          {(quotes.length + lineItems.length) >= 2 && (
            <button className="btn btn-secondary" onClick={handleCompare}>
              Compare Quotes
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => generateRFQExcel(product)}>
            <FileDown size={16} /> Generate RFQ
          </button>
          <button className="btn btn-secondary" onClick={() => setIsUploadModalOpen(true)}>
            <Upload size={16} /> Upload Quote
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenQuoteModal()}>
            <Plus size={16} /> Add Quote
          </button>
        </div>
      </div>

      <div className="content">
        {/* Stats Summary */}
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
              <div className="stat-value">{quotes.length + lineItems.length}</div>
            </div>
          </div>
          {quotes.length + lineItems.length > 0 && (() => {
            const allPrices = [
              ...quotes.map(q => parseFloat(q.unitPrice)),
              ...lineItems.map(i => parseFloat(i.unit_price))
            ];
            const bestPrice = Math.min(...allPrices);
            return (
              <div className="stat-card" style={{ '--stat-color': '#10b981', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
                <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                  <DollarSign size={22} color="#10b981" />
                </div>
                <div className="stat-content">
                  <div className="stat-label">Best Price</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                    {quotes[0]?.currency || 'USD'} {bestPrice.toFixed(2)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Two-column layout: Product Info sidebar + Main content */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Sidebar: Product Info */}
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
              Product Details
            </h3>

            {/* Product Image Preview */}
            {product.image_url && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Product Image
                </div>
                <img
                  src={product.image_url}
                  alt={product.name}
                  style={{
                    maxWidth: '200px',
                    maxHeight: '200px',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    objectFit: 'contain',
                    background: 'white'
                  }}
                />
              </div>
            )}

            {product.category && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Category
                </div>
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'inline-block'
                }}>
                  {product.category}
                </div>
              </div>
            )}

            {/* Specifications (or fallback to description) */}
            {(product.specs && product.specs.length > 0) ? (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Specifications
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {product.specs.filter(spec => spec.value).map((spec, index) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', fontSize: '0.875rem' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', minWidth: '100px' }}>
                        {spec.key}:
                      </span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {spec.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : product.description && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Description
                </div>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                  {product.description}
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div style={{
              padding: '16px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              marginTop: '24px'
            }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Quick Actions
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(quotes.length + lineItems.length) >= 2 && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleCompare}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.875rem' }}
                  >
                    Compare Quotes
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsDocumentModalOpen(true)}
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.875rem' }}
                >
                  <File size={14} />
                  Upload Document
                </button>
              </div>
            </div>
          </div>

          {/* Right: Main Content - Tabs */}
          <div>
        {/* Tabs: Quotes & Documents */}
        <div className="card">
          <div className="card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)' }}>
              <button
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'quotes' ? '2px solid var(--primary)' : '2px solid transparent',
                  color: activeTab === 'quotes' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'quotes' ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                }}
                onClick={() => setActiveTab('quotes')}
              >
                <FileText size={16} />
                Quotes ({quotes.length + lineItems.length})
              </button>
              <button
                style={{
                  padding: '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === 'documents' ? '2px solid var(--primary)' : '2px solid transparent',
                  color: activeTab === 'documents' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: activeTab === 'documents' ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s',
                }}
                onClick={() => setActiveTab('documents')}
              >
                <File size={16} />
                Documents
              </button>
            </div>
          </div>

          {activeTab === 'quotes' ? (
            <div className="card-body" style={{ padding: 0 }}>
            {(quotes.length + lineItems.length) === 0 ? (
              <div className="empty-state" style={{ padding: '48px 24px' }}>
                <DollarSign size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                <h3>No quotes yet</h3>
                <p>Add supplier quotes to compare prices</p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                  onClick={() => handleOpenQuoteModal()}
                >
                  <Plus size={16} /> Add First Quote
                </button>
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Unit Price</th>
                    <th>MOQ</th>
                    <th>Incoterm</th>
                    <th style={{ width: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Old quotes (from quotes_old table) */}
                  {quotes.map((quote) => {
                    return (
                      <tr key={quote.id}>
                        <td style={{ fontWeight: 500 }}>{quote.supplierName}</td>
                        <td>
                          {quote.currency} {parseFloat(quote.unitPrice).toFixed(2)}
                        </td>
                        <td>{quote.moq?.toLocaleString() || '-'}</td>
                        <td>{quote.incoterm || '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="icon-btn"
                              onClick={() => handleOpenQuoteModal(quote)}
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => handleDeleteQuote(quote.id)}
                              title="Delete"
                              style={{ color: 'var(--error)' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* New line items (from supplier_quotes + quote_line_items) */}
                  {lineItems.map((item) => {
                    return (
                      <tr key={item.id} style={{ background: '#f0fdf4' }}>
                        <td style={{ fontWeight: 500 }}>
                          {item.supplierName}
                          <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '2px' }}>
                            {item.product_name}
                          </div>
                        </td>
                        <td>
                          {item.currency} {parseFloat(item.unit_price).toFixed(2)}
                        </td>
                        <td>{item.moq ? parseInt(item.moq).toLocaleString() : '-'}</td>
                        <td>{item.incoterm || '-'}</td>
                        <td>
                          <span style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 500 }}>
                            From Upload
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          ) : (
            <DocumentsTab
              key={documentsRefreshKey}
              buyingIntentId={id}
              onUploadClick={() => setIsDocumentModalOpen(true)}
            />
          )}
        </div>

          </div>
          {/* End main content */}
        </div>
        {/* End two-column layout */}
      </div>

      {/* Quote Modal */}
      {isQuoteModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">
                📝 {editingQuote ? 'Edit Quote' : 'New Quote'}
              </span>
              <button className="icon-btn" onClick={handleCloseQuoteModal}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-section-title">
                  <DollarSign size={18} color="var(--accent)" /> Quote Details
                </div>

                <div className="form-group">
                  <label className="form-label">Supplier Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., Shenzhen Tech Co."
                    value={formData.supplierName}
                    onChange={(e) =>
                      setFormData({ ...formData, supplierName: e.target.value })
                    }
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Unit Price *</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={formData.unitPrice}
                      onChange={(e) =>
                        setFormData({ ...formData, unitPrice: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select
                      className="form-select"
                      value={formData.currency}
                      onChange={(e) =>
                        setFormData({ ...formData, currency: e.target.value })
                      }
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">MOQ (Minimum Order Qty)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g., 1000"
                      min="0"
                      value={formData.moq}
                      onChange={(e) =>
                        setFormData({ ...formData, moq: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Incoterm</label>
                    <select
                      className="form-select"
                      value={formData.incoterm}
                      onChange={(e) =>
                        setFormData({ ...formData, incoterm: e.target.value })
                      }
                    >
                      {INCOTERMS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCloseQuoteModal}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveQuote}>
                <Check size={16} /> {editingQuote ? 'Update' : 'Save Quote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Item Quote Upload Modal - only render when open */}
      {isUploadModalOpen && (
        <MultiItemQuoteUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Upload Document Modal */}
      <UploadDocumentModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        buyingIntentId={id}
        onUploadSuccess={() => setDocumentsRefreshKey(prev => prev + 1)}
      />
    </div>
  );
}

export default ProductDetail;
