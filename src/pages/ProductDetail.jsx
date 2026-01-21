import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, Check, X, Trash2, Edit2, DollarSign, Upload, File, FileDown, Copy, Package, ChevronDown, Search, Image as ImageIcon } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import { EditBuyingIntentModal } from '../components';
import MultiItemQuoteUploadModal from '../components/MultiItemQuoteUploadModal';
import DocumentsTab from '../components/DocumentsTab';
import UploadDocumentModal from '../components/UploadDocumentModal';
import ExcelJS from 'exceljs';
import { EXPORT_THEMES } from '../utils/exportThemes';
import { supabase } from '../lib/supabase';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'ILS'];
const INCOTERMS = ['FOB', 'CIF', 'EXW', 'DDP', 'DAP', 'CFR'];

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

// Helper to ensure product name has English translation if needed
function formatProductNameWithTranslation(name) {
  // Check if name contains non-Latin characters (Hebrew, Chinese, etc.)
  const hasNonLatin = /[^\u0000-\u007F]/.test(name);

  // If name already has translation in parentheses, return as-is
  if (name.includes('(') && name.includes(')')) {
    return name;
  }

  // If non-Latin characters but no translation, return as-is
  // (Translation should be added in the product data)
  return name;
}

export async function generateRFQExcel(products, themeName = 'vibrant') {
  // Handle both single product and array of products
  const productList = Array.isArray(products) ? products : [products];
  const theme = EXPORT_THEMES[themeName];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HA Tools';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('RFQ');

  // Collect all unique specs from all products (for column headers)
  const defaultKeys = ['Weight', 'Height', 'Length', 'Width'];
  const allSpecKeys = new Set();

  productList.forEach(product => {
    const specs = product.specs && product.specs.length > 0
      ? product.specs.filter(spec => spec.value)
      : [];
    specs.forEach(spec => allSpecKeys.add(spec.key));
  });

  // Order specs: default keys first, then custom
  const orderedSpecKeys = [];
  defaultKeys.forEach(key => {
    if (Array.from(allSpecKeys).some(k => k.toLowerCase() === key.toLowerCase())) {
      orderedSpecKeys.push(key);
    }
  });
  Array.from(allSpecKeys).forEach(key => {
    if (!defaultKeys.some(dk => dk.toLowerCase() === key.toLowerCase())) {
      orderedSpecKeys.push(key);
    }
  });

  // Factory-fill columns (for supplier to complete)
  const factoryColumns = [
    { name: 'MOQ', width: 18 },
    { name: 'Price per Unit', width: 18 },
    { name: 'Incoterm\n(FOB/EXW/CIF)', width: 22 }, // Wider for readability
    { name: 'Packaging', width: 18 }
  ];

  // Calculate columns: Item Name | Image | specs... | factory fields (no Category)
  const baseColumns = 2; // Item Name, Image (removed Category)
  const totalColumns = baseColumns + orderedSpecKeys.length + factoryColumns.length;

  // Set column widths dynamically
  const columnWidths = [
    { width: 30 },  // Item Name (wider since no category)
    { width: 20 }   // Image
  ];
  orderedSpecKeys.forEach(() => columnWidths.push({ width: 15 }));
  factoryColumns.forEach(col => columnWidths.push({ width: col.width }));
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

  // Row 1: Title (compact, professional)
  worksheet.mergeCells(`A1:${lastCol}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'REQUEST FOR QUOTATION (RFQ)';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: theme.colors.title.text } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.title.bg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = {
    bottom: { style: 'medium', color: { argb: theme.colors.title.bg } }
  };
  worksheet.getRow(1).height = 20;

  // Row 2: Compact metadata line (no category, "Created" instead of "Generated")
  worksheet.mergeCells(`A2:${lastCol}2`);
  const metaCell = worksheet.getCell('A2');
  const productInfo = productList.length === 1
    ? `Product: ${productList[0].name}`
    : `Products: ${productList.length} items`;
  metaCell.value = `${productInfo} | Created: ${new Date().toLocaleDateString()}`;
  metaCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: theme.colors.date.text } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.date.bg } };
  metaCell.alignment = { horizontal: 'left', vertical: 'middle' };
  metaCell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };
  worksheet.getRow(2).height = 14;

  // Row 3: Additional Notes header (tight)
  worksheet.mergeCells(`A3:${lastCol}3`);
  const notesHeaderCell = worksheet.getCell('A3');
  notesHeaderCell.value = 'Additional Notes:';
  notesHeaderCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
  notesHeaderCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  notesHeaderCell.alignment = { horizontal: 'left', vertical: 'middle' };
  notesHeaderCell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };
  worksheet.getRow(3).height = 14;

  // Rows 4-5: Additional Notes area (only 2 rows, compact, subtle background)
  worksheet.mergeCells(`A4:${lastCol}5`);
  const notesAreaCell = worksheet.getCell('A4');
  notesAreaCell.value = '';
  notesAreaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; // Subtle background
  notesAreaCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  notesAreaCell.border = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };
  worksheet.getRow(4).height = 14;
  worksheet.getRow(5).height = 14;

  // Row 6: Table header starts immediately (no spacer)
  const headerRow = worksheet.getRow(6);
  const headerValues = ['Item Name', 'Image'];

  // Add spec headers with units for default specs
  orderedSpecKeys.forEach(specKey => {
    let displayName = specKey;
    const lowerKey = specKey.toLowerCase();
    if (lowerKey === 'weight') {
      displayName = 'Weight (g)';
    } else if (lowerKey === 'height') {
      displayName = 'Height (cm)';
    } else if (lowerKey === 'length') {
      displayName = 'Length (cm)';
    } else if (lowerKey === 'width') {
      displayName = 'Width (cm)';
    }
    headerValues.push(displayName);
  });

  factoryColumns.forEach(col => headerValues.push(col.name)); // Add factory columns
  headerRow.values = headerValues;
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: theme.colors.header.text } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.colors.header.bg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  // Data rows: one row per product (starting at row 7)
  let currentRowIndex = 6; // Excel row index (0-based), row 7 in Excel

  for (const product of productList) {
    // Get specs for this product
    const productSpecs = product.specs && product.specs.length > 0
      ? product.specs.filter(spec => spec.value)
      : [];

    // Create a map of spec key -> value for this product
    const specMap = new Map();
    productSpecs.forEach(spec => {
      specMap.set(spec.key, spec.value);
    });

    // Build row values: Item Name | Image | spec values | factory fields
    const dataRowValues = [formatProductNameWithTranslation(product.name), ''];

    // Add spec values in order (use empty string if spec doesn't exist for this product)
    orderedSpecKeys.forEach(specKey => {
      const value = Array.from(specMap.entries()).find(
        ([key]) => key.toLowerCase() === specKey.toLowerCase()
      )?.[1] || '';
      dataRowValues.push(value);
    });

    // Add empty factory columns
    factoryColumns.forEach(() => dataRowValues.push(''));

    const dataRow = worksheet.addRow(dataRowValues);
    dataRow.height = 50; // Initial height, will adjust if image is present
    dataRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
    });

    // Embed image in the Image column (column C) if present
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
        dataRow.height = Math.max(50, rowHeightPt);

        // Insert image at column B (index 1), current row
        worksheet.addImage(imageId, {
          tl: { col: 1, row: currentRowIndex },
          ext: { width: targetWidth, height: targetHeight },
          editAs: 'oneCell'
        });
      } catch (error) {
        console.error(`Failed to embed image for ${product.name}:`, error);
        // Image cell remains empty on error - don't break the export
      }
    }

    currentRowIndex++; // Move to next row for next product
  }

  // Generate filename and export
  const filename = productList.length === 1
    ? `RFQ_${productList[0].name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
    : `RFQ_${productList.length}_items_${new Date().toISOString().split('T')[0]}.xlsx`;

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
  const { products } = state;

  const product = computed.getProductById(id);
  const quotes = computed.getProductQuotes(id); // Old quotes
  const [lineItems, setLineItems] = useState([]); // New line items

  // Combined and sorted quotes/line items (for display in table)
  // Sort by unit_price ONLY - MOQ has NO influence on ordering
  const sortedAllQuotes = useMemo(() => {
    const combined = [
      // Old quotes
      ...quotes.map(q => ({
        id: q.id,
        type: 'quote',
        supplierName: q.supplierName,
        unit_price: parseFloat(q.unitPrice) || 0,
        currency: q.currency,
        moq: q.moq,
        incoterm: q.incoterm,
        originalData: q
      })),
      // New line items
      ...lineItems.map(item => ({
        id: item.id,
        type: 'lineItem',
        supplierName: item.supplierName,
        product_name: item.product_name,
        unit_price: parseFloat(item.unit_price) || 0,
        currency: item.currency,
        moq: item.moq,
        incoterm: item.incoterm,
        originalData: item
      }))
    ];

    // Filter valid quotes (unit_price > 0 only, MOQ has no influence)
    const valid = combined.filter(q => q.unit_price > 0);

    // Sort by unit_price ascending (lowest first = best)
    return valid.sort((a, b) => a.unit_price - b.unit_price);
  }, [quotes, lineItems]);

  const [activeTab, setActiveTab] = useState('quotes'); // 'quotes' | 'documents'
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [editingQuote, setEditingQuote] = useState(null);
  const [showRFQThemeSelector, setShowRFQThemeSelector] = useState(false);
  const [selectedRFQTheme, setSelectedRFQTheme] = useState('vibrant');
  const [formData, setFormData] = useState({
    supplierName: '',
    unitPrice: '',
    currency: 'USD',
    moq: '',
    incoterm: 'FOB',
  });

  // RMB/USD conversion state
  const [exchangeRate, setExchangeRate] = useState(null);
  const [rmbPrice, setRmbPrice] = useState('');
  const [exchangeRateError, setExchangeRateError] = useState(false);

  // Edit buying intent modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', category: '', description: '', specs: [] });
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [customFieldName, setCustomFieldName] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');

  // Categories for edit modal
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [products]);

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter(cat =>
      cat.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categories, categorySearch]);

  // Fetch exchange rate when modal opens
  useEffect(() => {
    if (isQuoteModalOpen && !exchangeRate) {
      fetchExchangeRate();
    }
  }, [isQuoteModalOpen]);

  const fetchExchangeRate = async () => {
    try {
      const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=CNY');
      const data = await response.json();
      if (data && data.rates && data.rates.CNY) {
        setExchangeRate(data.rates.CNY);
        setExchangeRateError(false);
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      console.error('Failed to fetch exchange rate:', error);
      setExchangeRateError(true);
    }
  };

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
    setRmbPrice('');
    setEditingQuote(null);
  };

  // Handle USD price change (update RMB)
  const handleUsdChange = (value) => {
    setFormData({ ...formData, unitPrice: value });
    if (exchangeRate && value) {
      const rmbValue = (parseFloat(value) * exchangeRate).toFixed(2);
      setRmbPrice(rmbValue);
    } else {
      setRmbPrice('');
    }
  };

  // Handle RMB price change (update USD)
  const handleRmbChange = (value) => {
    setRmbPrice(value);
    if (exchangeRate && value) {
      const usdValue = (parseFloat(value) / exchangeRate).toFixed(2);
      setFormData({ ...formData, unitPrice: usdValue });
    } else {
      setFormData({ ...formData, unitPrice: '' });
    }
  };

  const handleOpenQuoteModal = (quote = null) => {
    if (quote) {
      setEditingQuote(quote);
      const usdPrice = quote.unitPrice || '';
      setFormData({
        supplierName: quote.supplierName || quote.supplier_name || '',
        unitPrice: usdPrice,
        currency: quote.currency || 'USD',
        moq: quote.moq || '',
        incoterm: quote.incoterm || 'FOB',
      });
      // Calculate RMB if rate available
      if (exchangeRate && usdPrice) {
        setRmbPrice((parseFloat(usdPrice) * exchangeRate).toFixed(2));
      }
    } else {
      resetForm();
    }
    setIsQuoteModalOpen(true);
  };

  const handleCloseQuoteModal = () => {
    setIsQuoteModalOpen(false);
    resetForm();
  };

  // Simple toast notification
  const showToast = (message, type = 'info') => {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-size: 0.875rem;
      max-width: 320px;
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  };

  const copyImageToClipboard = async () => {
    if (!product?.image_url) return;

    // Check if Clipboard API is available
    if (!navigator.clipboard || !navigator.clipboard.write) {
      showToast('Clipboard not supported. Requires HTTPS and modern browser.', 'error');
      return;
    }

    try {
      // Step 1: Fetch image as blob
      // For Supabase public storage, MUST omit credentials (CORS incompatible with credentials: 'include' when ACAO is '*')
      const isSupabasePublic = product.image_url.includes('/storage/v1/object/public/');

      const response = await fetch(product.image_url, {
        mode: 'cors',
        credentials: isSupabasePublic ? 'omit' : 'include',
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();

      // Validate blob type
      if (!blob.type || !blob.type.startsWith('image/')) {
        throw new Error(`Invalid content type: ${blob.type || 'unknown'}`);
      }

      // Step 2: Try direct clipboard write first (works for PNG in most browsers)
      let clipboardBlob = blob;
      let needsConversion = blob.type === 'image/jpeg' || blob.type === 'image/jpg';

      if (!needsConversion) {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ]);
          showToast('Image copied to clipboard!', 'success');
          return;
        } catch (directWriteError) {
          // If direct write fails, try PNG conversion
          console.log('Direct write failed, converting to PNG:', directWriteError);
          needsConversion = true;
        }
      }

      // Step 3: Convert to PNG if needed (JPEG or direct write failed)
      if (needsConversion) {
        const imageBitmap = await createImageBitmap(blob);

        const canvas = document.createElement('canvas');
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageBitmap, 0, 0);

        // Convert canvas to PNG blob
        const pngBlob = await new Promise((resolve) => {
          canvas.toBlob(resolve, 'image/png');
        });

        if (!pngBlob) {
          throw new Error('Failed to convert image to PNG');
        }

        // Try writing PNG to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': pngBlob
          })
        ]);

        showToast('Image copied to clipboard!', 'success');
      }

    } catch (error) {
      console.error('Image copy failed:', error);

      // FALLBACK: Copy URL instead with clear reason
      let reason = '';

      if (error.message.includes('HTTP')) {
        reason = 'Image fetch failed';
      } else if (error.message.includes('CORS') || error.name === 'TypeError') {
        reason = 'Image host blocks CORS';
      } else if (error.message.includes('content type') || error.message.includes('convert')) {
        reason = 'Image format not supported';
      } else if (error.name === 'NotAllowedError' && error.message.includes('permission')) {
        reason = 'Clipboard permission denied';
      } else if (error.name === 'NotAllowedError' || error.message.includes('not supported')) {
        reason = 'Image clipboard not supported on this browser/OS';
      } else {
        reason = 'Image copy failed';
      }

      try {
        await navigator.clipboard.writeText(product.image_url);
        showToast(`${reason}, copied link instead`, 'info');
      } catch (urlError) {
        console.error('URL copy also failed:', urlError);
        showToast(`${reason}. Please right-click image to copy.`, 'error');
      }
    }
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

  // Edit buying intent modal handlers
  const openEditModal = () => {
    const initialSpecs = product.specs && product.specs.length > 0
      ? product.specs
      : [
          { key: 'Weight', value: '' },
          { key: 'Height', value: '' },
          { key: 'Length', value: '' },
          { key: 'Width', value: '' }
        ];
    setEditFormData({
      name: product.name,
      category: product.category || '',
      description: product.description || '',
      specs: initialSpecs
    });
    if (product.image_url) {
      setImagePreview(product.image_url);
    }
    setIsEditModalOpen(true);
  };

  // Duplicate handler - navigate to Products page with duplicate state
  const handleDuplicate = () => {
    navigate('/products', {
      state: {
        duplicateProduct: product
      }
    });
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditFormData({ name: '', category: '', description: '', specs: [] });
    setSelectedImage(null);
    setImagePreview(null);
    setIsSubmitting(false);
    setShowCategoryDropdown(false);
    setCategorySearch('');
    setShowCreateCategory(false);
    setNewCategoryName('');
    setCustomFieldName('');
    setCustomFieldValue('');
  };

  const handleSelectCategory = (category) => {
    setEditFormData({ ...editFormData, category });
    setShowCategoryDropdown(false);
    setCategorySearch('');
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    // Just add it to the form data - category will be saved with product
    setEditFormData({ ...editFormData, category: newCategoryName.trim() });
    setShowCreateCategory(false);
    setNewCategoryName('');
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleSaveEdit = async () => {
    if (!editFormData.name.trim()) {
      alert('Please enter an intent name');
      return;
    }

    setIsSubmitting(true);
    try {
      let imageData = {};

      // Handle image upload if changed
      if (selectedImage) {
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const storagePath = `buying-intents/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('business-cards')
          .upload(storagePath, selectedImage);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('business-cards')
          .getPublicUrl(storagePath);

        imageData = {
          image_storage_path: storagePath,
          image_url: urlData?.publicUrl || null
        };
      }

      await actions.updateProduct({ ...product, ...editFormData, ...imageData });
      closeEditModal();
    } catch (error) {
      console.error('Error saving buying intent:', error);
      alert('Error saving buying intent');
    } finally {
      setIsSubmitting(false);
    }
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
          <button
            type="button"
            className="btn btn-secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openEditModal();
            }}
          >
            <Edit2 size={16} /> Edit
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDuplicate();
            }}
            title="Duplicate this buying intent"
          >
            <Copy size={16} /> Duplicate
          </button>
          {(quotes.length + lineItems.length) >= 2 && (
            <button className="btn btn-secondary" onClick={handleCompare}>
              Compare Quotes
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowRFQThemeSelector(true)}>
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
            // Collect all unit prices and filter valid ones (must be > 0)
            // MOQ has NO influence on best price calculation
            const allPrices = [
              ...quotes.map(q => parseFloat(q.unitPrice)),
              ...lineItems.map(i => parseFloat(i.unit_price))
            ].filter(price => price > 0); // Only valid prices, ignore MOQ completely

            // If no valid prices, don't show best price card
            if (allPrices.length === 0) return null;

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
                    background: 'white',
                    display: 'block',
                    marginBottom: '8px'
                  }}
                />
                <button
                  onClick={copyImageToClipboard}
                  className="btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    padding: '6px 12px'
                  }}
                >
                  <Copy size={14} />
                  Copy Image
                </button>
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
                  {/* Combined quotes sorted by unit_price ONLY (MOQ has no influence) */}
                  {sortedAllQuotes.map((item, index) => {
                    const isBest = index === 0; // First item = lowest price = best

                    if (item.type === 'quote') {
                      // Old quote
                      const quote = item.originalData;
                      return (
                        <tr
                          key={item.id}
                          style={isBest ? { background: '#f0fdf4', borderLeft: '3px solid #10b981' } : {}}
                        >
                          <td style={{ fontWeight: isBest ? 700 : 500 }}>
                            {item.supplierName}
                            {isBest && (
                              <span style={{
                                marginLeft: '8px',
                                fontSize: '0.7rem',
                                color: '#10b981',
                                fontWeight: 600
                              }}>
                                ⭐ BEST
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: isBest ? 700 : 400, color: isBest ? '#10b981' : 'inherit' }}>
                            {item.currency} {item.unit_price.toFixed(2)}
                          </td>
                          <td>{item.moq?.toLocaleString() || '-'}</td>
                          <td>{item.incoterm || '-'}</td>
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
                    } else {
                      // New line item
                      return (
                        <tr
                          key={item.id}
                          style={isBest ? { background: '#f0fdf4', borderLeft: '3px solid #10b981' } : { background: '#f9fafb' }}
                        >
                          <td style={{ fontWeight: isBest ? 700 : 500 }}>
                            {item.supplierName}
                            {isBest && (
                              <span style={{
                                marginLeft: '8px',
                                fontSize: '0.7rem',
                                color: '#10b981',
                                fontWeight: 600
                              }}>
                                ⭐ BEST
                              </span>
                            )}
                            <div style={{ fontSize: '0.85rem', color: '#059669', marginTop: '2px' }}>
                              {item.product_name}
                            </div>
                          </td>
                          <td style={{ fontWeight: isBest ? 700 : 400, color: isBest ? '#10b981' : 'inherit' }}>
                            {item.currency} {item.unit_price.toFixed(2)}
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
                    }
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
                {editingQuote ? 'Edit Quote' : 'New Quote'}{product?.name ? ` (${product.name})` : ''}
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

                {/* USD/RMB Price Conversion */}
                <div className="form-row" style={{ marginBottom: '20px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ height: '32px', display: 'block', lineHeight: '1.4' }}>
                      Unit Price (USD) *
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={formData.unitPrice}
                      onChange={(e) => handleUsdChange(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ height: '32px', display: 'block', lineHeight: '1.4' }}>
                      <div>Unit Price (RMB/CNY)</div>
                      {exchangeRate && (
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, marginTop: '2px' }}>
                          Rate: {exchangeRate.toFixed(4)}
                        </div>
                      )}
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      value={rmbPrice}
                      onChange={(e) => handleRmbChange(e.target.value)}
                      disabled={!exchangeRate}
                      style={{
                        background: !exchangeRate ? '#f1f5f9' : 'white',
                        fontStyle: 'italic',
                        color: '#64748b'
                      }}
                    />
                    {exchangeRateError && (
                      <p style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '4px' }}>
                        Rate unavailable - conversion disabled
                      </p>
                    )}
                  </div>
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

                <div className="form-row">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ height: '32px', display: 'block', lineHeight: '1.4' }}>MOQ (Minimum Order Qty)</label>
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
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ height: '32px', display: 'block', lineHeight: '1.4' }}>Incoterm</label>
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

      {/* RFQ Theme Selection Modal */}
      {showRFQThemeSelector && (
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
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            maxWidth: '900px',
            width: '90%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
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
                  Choose RFQ Export Theme
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  Select a theme for your RFQ Excel export
                </p>
              </div>
              <button
                onClick={() => setShowRFQThemeSelector(false)}
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
                onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                <X size={24} color="#64748b" />
              </button>
            </div>

            {/* Content */}
            <div style={{
              display: 'flex',
              overflow: 'hidden',
              flex: 1,
            }}>
              {/* Left: Theme List */}
              <div style={{
                width: '280px',
                borderRight: '1px solid #e5e7eb',
                padding: '16px',
                background: '#f8fafc',
                overflow: 'auto',
              }}>
                <div style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '8px',
                }}>
                  {Object.entries(EXPORT_THEMES).map(([key, theme]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedRFQTheme(key)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '16px',
                        marginBottom: '8px',
                        background: selectedRFQTheme === key ? '#eff6ff' : 'white',
                        border: `2px solid ${selectedRFQTheme === key ? '#3b82f6' : '#e5e7eb'}`,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedRFQTheme !== key) {
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          e.currentTarget.style.background = '#f9fafb';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedRFQTheme !== key) {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.background = 'white';
                        }
                      }}
                    >
                      {/* Radio Button */}
                      <div style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: `2px solid ${selectedRFQTheme === key ? '#3b82f6' : '#d1d5db'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {selectedRFQTheme === key && (
                          <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                          }} />
                        )}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontWeight: 600,
                          fontSize: '0.95rem',
                          color: '#1e293b',
                          marginBottom: '4px',
                        }}>
                          {theme.name}
                        </div>
                        <div style={{
                          fontSize: '0.85rem',
                          color: '#64748b',
                          marginBottom: '10px',
                        }}>
                          {theme.description}
                        </div>
                        {/* Color Preview */}
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {theme.preview.map((color, i) => (
                            <div
                              key={i}
                              style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '4px',
                                background: color,
                                border: '1px solid rgba(0,0,0,0.1)',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Preview */}
              <div style={{
                flex: 1,
                padding: '32px',
                overflow: 'auto',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
              }}>
                {/* Excel-Style Preview */}
                {(() => {
                  const theme = EXPORT_THEMES[selectedRFQTheme];
                  return (
                    <div style={{
                      background: 'white',
                      border: '2px solid #000',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      width: '100%',
                      maxWidth: '450px',
                    }}>
                      {/* Title Row */}
                      <div style={{
                        padding: '12px',
                        background: `#${theme.colors.title.bg.substring(2)}`,
                        color: `#${theme.colors.title.text.substring(2)}`,
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        textAlign: 'center',
                        borderBottom: '2px solid #000',
                      }}>
                        REQUEST FOR QUOTATION (RFQ)
                      </div>

                      {/* Product Info Rows */}
                      <div style={{
                        padding: '8px',
                        background: `#${theme.colors.productName.bg.substring(2)}`,
                        color: `#${theme.colors.productName.text.substring(2)}`,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        borderBottom: '1px solid #ddd',
                      }}>
                        Product: {product.name}
                      </div>
                      <div style={{
                        padding: '8px',
                        background: `#${theme.colors.category.bg.substring(2)}`,
                        color: `#${theme.colors.category.text.substring(2)}`,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        borderBottom: '1px solid #ddd',
                      }}>
                        Category: {product.category || 'General'}
                      </div>

                      {/* Header Row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        background: `#${theme.colors.header.bg.substring(2)}`,
                        color: `#${theme.colors.header.text.substring(2)}`,
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        borderBottom: '1px solid #000',
                      }}>
                        <div style={{ padding: '6px 8px', borderRight: '1px solid #555' }}>Item Name</div>
                        <div style={{ padding: '6px 8px', borderRight: '1px solid #555' }}>Specs</div>
                        <div style={{ padding: '6px 8px' }}>MOQ/Price</div>
                      </div>

                      {/* Sample Data Row */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        fontSize: '0.75rem',
                        borderBottom: '1px solid #ddd',
                      }}>
                        <div style={{ padding: '6px 8px', borderRight: '1px solid #ddd' }}>Sample Item</div>
                        <div style={{ padding: '6px 8px', borderRight: '1px solid #ddd' }}>Spec Value</div>
                        <div style={{ padding: '6px 8px' }}>-</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '20px 32px',
              borderTop: '1px solid #e5e7eb',
              background: '#f8fafc',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <button
                onClick={() => setShowRFQThemeSelector(false)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #cbd5e1',
                  background: 'white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  color: '#475569',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.borderColor = '#94a3b8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                }}
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  generateRFQExcel(product, selectedRFQTheme);
                  setShowRFQThemeSelector(false);
                }}
                style={{
                  padding: '10px 24px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
                }}
              >
                <FileDown size={18} />
                Export with {EXPORT_THEMES[selectedRFQTheme].name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Buying Intent Modal */}
      <EditBuyingIntentModal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        onSave={handleSaveEdit}
        editingProduct={product}
        formData={editFormData}
        setFormData={setEditFormData}
        imagePreview={imagePreview}
        setImagePreview={setImagePreview}
        selectedImage={selectedImage}
        setSelectedImage={setSelectedImage}
        isSubmitting={isSubmitting}
        showCategoryDropdown={showCategoryDropdown}
        setShowCategoryDropdown={setShowCategoryDropdown}
        categorySearch={categorySearch}
        setCategorySearch={setCategorySearch}
        showCreateCategory={showCreateCategory}
        setShowCreateCategory={setShowCreateCategory}
        newCategoryName={newCategoryName}
        setNewCategoryName={setNewCategoryName}
        filteredCategories={filteredCategories}
        handleSelectCategory={handleSelectCategory}
        handleCreateCategory={handleCreateCategory}
        handleRemoveImage={handleRemoveImage}
        customFieldName={customFieldName}
        setCustomFieldName={setCustomFieldName}
        customFieldValue={customFieldValue}
        setCustomFieldValue={setCustomFieldValue}
        handleAddCustomField={() => {
          if (customFieldName.trim()) {
            setEditFormData({
              ...editFormData,
              specs: [...editFormData.specs, { key: customFieldName, value: customFieldValue }]
            });
            setCustomFieldName('');
            setCustomFieldValue('');
          }
        }}
        handleRemoveSpec={(index) => {
          const newSpecs = editFormData.specs.filter((_, i) => i !== index);
          setEditFormData({ ...editFormData, specs: newSpecs });
        }}
        handleUpdateSpecValue={(index, value) => {
          const newSpecs = [...editFormData.specs];
          newSpecs[index] = { ...newSpecs[index], value };
          setEditFormData({ ...editFormData, specs: newSpecs });
        }}
      />
    </div>
  );
}

export default ProductDetail;
