import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Plus, Package, X, Check, ChevronDown, Search, ChevronRight, Grid, List, Table2, TrendingUp, TrendingDown, Edit2, Trash2, Upload, Image as ImageIcon, FileDown, Clock, Type, Filter, Copy } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useModal } from '../context/ModalContext';
import { ProductCard, SearchInput, EditBuyingIntentModal } from '../components';
import MultiItemQuoteUploadModal from '../components/MultiItemQuoteUploadModal';
import { filterBySearch } from '../utils/helpers';
import { supabase } from '../lib/supabase';
import { EXPORT_THEMES } from '../utils/exportThemes';
import { generateRFQExcel } from './ProductDetail';
import ExcelJS from 'exceljs';

// Helper to get image dimensions
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

// Export Buying Intents to Excel
async function exportBuyingIntentsToExcel(intents, themeName = 'vibrant') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HA Tools';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Buying Intents');
  const theme = EXPORT_THEMES[themeName];

  // Group intents by category
  const grouped = {};
  intents.forEach(intent => {
    const category = intent.category || 'Uncategorized';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(intent);
  });

  // Define fixed image size (larger for better visibility)
  const IMAGE_WIDTH = 100;
  const IMAGE_HEIGHT = 100;

  // Set column widths - fixed columns only
  worksheet.columns = [
    { key: 'image', width: 14 },           // Image column
    { key: 'name', width: 30 },            // Buying Intent Name
    { key: 'category', width: 18 },        // Category
    { key: 'specifications', width: 40 },  // Specifications (single column)
  ];

  let currentRow = 1;
  const totalColumns = 4; // Image, Name, Category, Specifications

  // Add title row
  const titleRow = worksheet.getRow(currentRow);
  titleRow.values = ['BUYING INTENTS EXPORT'];
  worksheet.mergeCells(currentRow, 1, currentRow, totalColumns);
  titleRow.font = { bold: true, size: 16, color: { argb: theme.colors.title.text } };
  titleRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: theme.colors.title.bg }
  };
  titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
  titleRow.height = 35;
  currentRow++;

  // Add metadata row
  const metaRow = worksheet.getRow(currentRow);
  metaRow.values = [`${new Date().toLocaleDateString()} • ${intents.length} Buying Intent${intents.length > 1 ? 's' : ''}`];
  worksheet.mergeCells(currentRow, 1, currentRow, totalColumns);
  metaRow.font = { size: 10, color: { argb: theme.colors.infoRow.text } };
  metaRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: theme.colors.infoRow.bg }
  };
  metaRow.alignment = { vertical: 'middle', horizontal: 'center' };
  metaRow.height = 20;
  currentRow++;

  // Add column headers
  const headerRow = worksheet.getRow(currentRow);
  headerRow.values = ['Image', 'Buying Intent Name', 'Category', 'Specifications'];
  headerRow.font = { bold: true, size: 11, color: { argb: theme.colors.header.text } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: theme.colors.header.bg }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 25;

  // Add borders to all header cells
  for (let i = 1; i <= totalColumns; i++) {
    const colLetter = String.fromCharCode(64 + i); // A, B, C, D
    worksheet.getCell(`${colLetter}${currentRow}`).border = {
      top: { style: 'medium', color: { argb: theme.colors.header.bg } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      bottom: { style: 'medium', color: { argb: theme.colors.header.bg } },
      right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
    };
  }

  // Freeze header rows
  worksheet.views = [{ state: 'frozen', ySplit: currentRow }];

  currentRow++;

  // Iterate through categories
  const sortedCategories = Object.keys(grouped).sort();
  let rowIndex = 0;

  for (let catIdx = 0; catIdx < sortedCategories.length; catIdx++) {
    const category = sortedCategories[catIdx];
    const categoryIntents = grouped[category];

    // Add category separator row (full-width merged cells)
    const categoryRow = worksheet.getRow(currentRow);
    categoryRow.values = [category.toUpperCase()];
    worksheet.mergeCells(currentRow, 1, currentRow, totalColumns);
    categoryRow.font = { bold: true, size: 11, color: { argb: theme.colors.category.text || theme.colors.header.text } };
    categoryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: theme.colors.category.bg || 'FFF1F5F9' }
    };
    categoryRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    categoryRow.height = 22;

    // Border for category row
    for (let i = 1; i <= totalColumns; i++) {
      const colLetter = String.fromCharCode(64 + i);
      worksheet.getCell(`${colLetter}${currentRow}`).border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      };
    }

    currentRow++;

    // Add intents for this category
    for (const intent of categoryIntents) {
      const row = worksheet.getRow(currentRow);

      // Format specifications as multi-line text
      let specificationsText = '';
      if (intent.specs && intent.specs.length > 0) {
        // Group specs by category for better readability
        const dimensionKeys = ['height', 'width', 'length', 'depth', 'diameter', 'top out', 'top in', 'bottom out', 'bottom in', 'weight'];
        const packagingKeys = ['packaging', 'packing', 'package', 'moq', 'box', 'carton', 'pallet'];

        const dimensionSpecs = [];
        const packagingSpecs = [];
        const otherSpecs = [];

        intent.specs.forEach(spec => {
          if (!spec.value) return;

          const keyLower = spec.key.toLowerCase();
          if (dimensionKeys.some(dk => keyLower.includes(dk))) {
            dimensionSpecs.push(spec);
          } else if (packagingKeys.some(pk => keyLower.includes(pk))) {
            packagingSpecs.push(spec);
          } else {
            otherSpecs.push(spec);
          }
        });

        // Build formatted text
        const sections = [];

        if (dimensionSpecs.length > 0) {
          sections.push('Dimensions:\n' + dimensionSpecs.map(s => `  • ${s.key}: ${s.value}`).join('\n'));
        }

        if (packagingSpecs.length > 0) {
          sections.push('Packaging:\n' + packagingSpecs.map(s => `  • ${s.key}: ${s.value}`).join('\n'));
        }

        if (otherSpecs.length > 0) {
          if (dimensionSpecs.length > 0 || packagingSpecs.length > 0) {
            sections.push('Other:\n' + otherSpecs.map(s => `  • ${s.key}: ${s.value}`).join('\n'));
          } else {
            // If no grouped specs, just list them without a header
            sections.push(otherSpecs.map(s => `• ${s.key}: ${s.value}`).join('\n'));
          }
        }

        specificationsText = sections.join('\n\n');
      }

      // Build row values: fixed columns only
      const rowValues = [
        '', // Image will be added separately
        intent.name,
        intent.category || 'Uncategorized',
        specificationsText || '' // Empty if no specs
      ];

      row.values = rowValues;

      // Calculate dynamic row height based on specifications text
      // Count lines in specifications text
      const specLineCount = specificationsText ? (specificationsText.match(/\n/g) || []).length + 1 : 1;
      // Excel line height: ~15 points per line for 10pt font with wrapping
      const textHeightPoints = Math.max(specLineCount * 15, 30); // Minimum 30 points
      // Image height in points: IMAGE_HEIGHT pixels ≈ 75 points (1px ≈ 0.75pt in Excel)
      const imageHeightPoints = IMAGE_HEIGHT * 0.75 + 10; // Add padding
      // Row height must accommodate both image and text
      const calculatedRowHeight = Math.max(textHeightPoints, imageHeightPoints, 75);

      // Row styling
      const isOdd = rowIndex % 2 === 0;
      row.height = calculatedRowHeight; // Dynamic height based on content
      row.alignment = { vertical: 'middle', wrapText: true };
      row.font = { size: 10 };

      // Apply styling to each cell
      for (let i = 1; i <= totalColumns; i++) {
        const colLetter = String.fromCharCode(64 + i);
        const cell = worksheet.getCell(`${colLetter}${currentRow}`);

        // Background color
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isOdd ? theme.colors.alternatingRow.odd : theme.colors.alternatingRow.even }
        };

        // Borders
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };

        // Bold name column (column B)
        if (i === 2) {
          cell.font = { size: 10, bold: true };
        }

        // Left alignment for text columns
        if (i > 1) {
          // Specifications column (D) should align to top for multi-line content
          if (i === 4) {
            cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
          } else {
            cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
          }
        }
      }

      // Embed image if exists, otherwise add placeholder
      if (intent.image_url) {
        try {
          const response = await fetch(intent.image_url);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const dimensions = await getImageDimensions(arrayBuffer);

            let extension = 'png';
            if (intent.image_url.toLowerCase().includes('.jpg') || intent.image_url.toLowerCase().includes('.jpeg')) {
              extension = 'jpeg';
            }

            const imageId = workbook.addImage({
              buffer: arrayBuffer,
              extension: extension
            });

            // Calculate scaling to fit fixed size while maintaining aspect ratio
            const widthRatio = IMAGE_WIDTH / dimensions.width;
            const heightRatio = IMAGE_HEIGHT / dimensions.height;
            const ratio = Math.min(widthRatio, heightRatio, 1); // Never upscale

            const targetWidth = Math.floor(dimensions.width * ratio);
            const targetHeight = Math.floor(dimensions.height * ratio);

            // Center image in cell with padding
            const cellPadding = 8;
            const colOffset = cellPadding;
            const rowOffset = (row.height * 1.33 - targetHeight) / 2; // Excel units conversion

            worksheet.addImage(imageId, {
              tl: {
                col: 0,
                row: currentRow - 1,
                colOff: colOffset,
                rowOff: rowOffset
              },
              ext: { width: targetWidth, height: targetHeight },
              editAs: 'oneCell'
            });
          } else {
            // Failed to fetch - add placeholder text
            const cell = worksheet.getCell(`A${currentRow}`);
            cell.value = '[No Image]';
            cell.font = { size: 8, color: { argb: 'FF9CA3AF' }, italic: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        } catch (error) {
          console.error(`Failed to embed image for ${intent.name}:`, error);
          // Add placeholder text on error
          const cell = worksheet.getCell(`A${currentRow}`);
          cell.value = '[No Image]';
          cell.font = { size: 8, color: { argb: 'FF9CA3AF' }, italic: true };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      } else {
        // No image - add placeholder with border
        const cell = worksheet.getCell(`A${currentRow}`);
        cell.value = '[No Image]';
        cell.font = { size: 8, color: { argb: 'FF9CA3AF' }, italic: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          ...cell.border,
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      }

      currentRow++;
      rowIndex++;
    }

    // Add empty spacer row after each category (except last)
    if (catIdx < sortedCategories.length - 1) {
      const separatorRow = worksheet.getRow(currentRow);
      separatorRow.height = 10; // Small spacer
      for (let i = 1; i <= totalColumns; i++) {
        const colLetter = String.fromCharCode(64 + i);
        worksheet.getCell(`${colLetter}${currentRow}`).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFFFFF' } // White background
        };
      }
      currentRow++;
    }
  }

  // Generate filename
  const filename = intents.length === 1
    ? `Buying_Intent_${intents[0].name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`
    : `Buying_Intents_${intents.length}_items_${new Date().toISOString().split('T')[0]}.xlsx`;

  // Download file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function Products() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state, actions, computed } = useAppContext();
  const { confirm } = useModal();
  const { products } = state;

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({ name: '', category: '', description: '', specs: [] });
  const [quoteCounts, setQuoteCounts] = useState({});
  const [isUploadQuoteModalOpen, setIsUploadQuoteModalOpen] = useState(false);

  // Mobile filters drawer state
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Image upload state
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Specs editor state
  const [customFieldName, setCustomFieldName] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');

  // Category dropdown states (for modal)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Category filter for main page
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState([]);

  // View and sorting options
  const [viewMode, setViewMode] = useState(() => {
    // Initialize from localStorage if user has manually set a preference
    const saved = localStorage.getItem('buyingIntentsViewMode');
    return saved || 'grid'; // Default to grid initially, will auto-adjust based on count
  });
  const [sortBy, setSortBy] = useState('name'); // 'name', 'quotes', 'recent'
  const [collapsedCategories, setCollapsedCategories] = useState({}); // track which categories are collapsed
  const [loadingCounts, setLoadingCounts] = useState(true); // track loading state
  const [viewModeManuallySet, setViewModeManuallySet] = useState(() => {
    // Track if user has manually overridden the view mode
    return localStorage.getItem('buyingIntentsViewMode') !== null;
  });

  // Bulk selection
  const [selectedProducts, setSelectedProducts] = useState(new Set());

  // RFQ export state
  const [showRFQThemeSelector, setShowRFQThemeSelector] = useState(false);
  const [selectedRFQTheme, setSelectedRFQTheme] = useState('vibrant');

  // Buying Intents Excel export state
  const [showExcelThemeSelector, setShowExcelThemeSelector] = useState(false);
  const [selectedExcelTheme, setSelectedExcelTheme] = useState('vibrant');

  // Submission guard
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load quote counts for all products
  useEffect(() => {
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

  // Handle URL-based category filtering (from Global Search)
  useEffect(() => {
    const categoryParam = searchParams.get('category');
    if (categoryParam) {
      setSelectedCategoryFilters([categoryParam]);
      // Clear URL param after setting filter
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  // Handle duplicate from ProductDetail page
  useEffect(() => {
    if (location.state?.duplicateProduct) {
      const product = location.state.duplicateProduct;
      handleDuplicate(product);
      // Clear the navigation state to prevent duplicate on refresh
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  // Auto-default to compact view when many intents exist (if user hasn't manually set preference)
  useEffect(() => {
    if (!viewModeManuallySet && products.length > 15) {
      setViewMode('compact');
    } else if (!viewModeManuallySet && products.length <= 15) {
      setViewMode('grid');
    }
  }, [products.length, viewModeManuallySet]);

  const filteredProducts = useMemo(() => {
    let result = filterBySearch(products, search, ['name', 'category', 'description']);

    // Apply category filters
    if (selectedCategoryFilters.length > 0) {
      result = result.filter(p => selectedCategoryFilters.includes(p.category));
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (sortBy === 'quotes') {
        return (quoteCounts[b.id] || 0) - (quoteCounts[a.id] || 0);
      } else if (sortBy === 'recent') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      return 0;
    });

    return result;
  }, [products, search, selectedCategoryFilters, sortBy, quoteCounts]);

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups = {};
    filteredProducts.forEach(product => {
      const cat = product.category || 'Uncategorized';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(product);
    });
    return groups;
  }, [filteredProducts]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalWithQuotes = Object.values(quoteCounts).filter(count => count > 0).length;
    const totalWithoutQuotes = totalProducts - totalWithQuotes;
    const categoryBreakdown = {};
    products.forEach(p => {
      const cat = p.category || 'Uncategorized';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
    });
    return { totalProducts, totalWithQuotes, totalWithoutQuotes, categoryBreakdown };
  }, [products, quoteCounts]);

  // Get unique categories from all products
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

  const handleOpenModal = (product = null) => {
    if (product) {
      setEditingProduct(product);
      // Initialize with existing specs or default structure
      const initialSpecs = product.specs && product.specs.length > 0
        ? product.specs
        : [
            { key: 'Weight', value: '' },
            { key: 'Height', value: '' },
            { key: 'Length', value: '' },
            { key: 'Width', value: '' }
          ];
      setFormData({
        name: product.name,
        category: product.category || '',
        description: product.description || '',
        specs: initialSpecs
      });
      // Set existing image preview if product has an image
      if (product.image_url) {
        setImagePreview(product.image_url);
      }
    } else {
      setEditingProduct(null);
      // Initialize with default spec fields
      setFormData({
        name: '',
        category: '',
        description: '',
        specs: [
          { key: 'Weight', value: '' },
          { key: 'Height', value: '' },
          { key: 'Length', value: '' },
          { key: 'Width', value: '' }
        ]
      });
    }
    setIsModalOpen(true);
  };

  const handleDuplicate = (product) => {
    // Duplicate opens Create flow (not Edit) with pre-filled data
    setEditingProduct(null); // Important: null means Create, not Edit

    // Copy all fields from source product
    const initialSpecs = product.specs && product.specs.length > 0
      ? product.specs.map(spec => ({ ...spec })) // Deep copy specs
      : [
          { key: 'Weight', value: '' },
          { key: 'Height', value: '' },
          { key: 'Length', value: '' },
          { key: 'Width', value: '' }
        ];

    setFormData({
      name: product.name, // Pre-filled, user can edit
      category: product.category || '',
      description: product.description || '',
      specs: initialSpecs
    });

    // Copy image preview if exists (but as preview only, will need to re-upload)
    if (product.image_url) {
      setImagePreview(product.image_url);
      // Note: selectedImage stays null - user will need to re-upload or we fetch it
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData({ name: '', category: '', description: '', specs: [] });
    setShowCategoryDropdown(false);
    setCategorySearch('');
    setShowCreateCategory(false);
    setNewCategoryName('');
    setIsSubmitting(false); // Reset submission guard
    setSelectedImage(null); // Reset image state
    setImagePreview(null);
    setCustomFieldName(''); // Reset custom field state
    setCustomFieldValue('');
  };

  const handleSelectCategory = (category) => {
    setFormData({ ...formData, category });
    setShowCategoryDropdown(false);
    setCategorySearch('');
  };

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      alert('Please enter a category name');
      return;
    }
    setFormData({ ...formData, category: newCategoryName.trim() });
    setShowCreateCategory(false);
    setShowCategoryDropdown(false);
    setNewCategoryName('');
    setCategorySearch('');
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setSelectedImage(file);
    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  // Specs management handlers
  const handleSpecChange = (index, value) => {
    const updatedSpecs = [...formData.specs];
    updatedSpecs[index] = { ...updatedSpecs[index], value };
    setFormData({ ...formData, specs: updatedSpecs });
  };

  const handleAddCustomField = () => {
    if (!customFieldName.trim()) {
      alert('Please enter a field name');
      return;
    }

    // Check for duplicate field names (case-insensitive)
    const isDuplicate = formData.specs.some(
      spec => spec.key.toLowerCase() === customFieldName.trim().toLowerCase()
    );

    if (isDuplicate) {
      alert('A field with this name already exists');
      return;
    }

    const newSpec = { key: customFieldName.trim(), value: customFieldValue.trim() };
    setFormData({ ...formData, specs: [...formData.specs, newSpec] });
    setCustomFieldName('');
    setCustomFieldValue('');
  };

  const handleRemoveSpec = (index) => {
    const updatedSpecs = formData.specs.filter((_, i) => i !== index);
    setFormData({ ...formData, specs: updatedSpecs });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) { alert('Please enter a buying intent name'); return; }

    // Guard: prevent duplicate submissions
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      let imageData = {};

      // Upload image if a new one was selected
      if (selectedImage) {
        console.log('🔵 Starting image upload process...');
        console.log('Selected image:', selectedImage.name, selectedImage.type, selectedImage.size);

        // Correct destructuring: getUser() returns { data: { user }, error }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          console.error('❌ Auth error:', authError);
          throw new Error('User not authenticated');
        }

        console.log('✅ User authenticated for image upload:', user.id);

        // Generate unique filename
        const fileExt = selectedImage.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const storagePath = `${user.id}/products/${fileName}`;

        console.log('🔵 Upload path:', storagePath);
        console.log('🔵 Bucket:', 'business-cards');
        console.log('🔵 Attempting storage.upload()...');

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('business-cards')
          .upload(storagePath, selectedImage);

        if (uploadError) {
          console.error('❌ Storage upload error:', uploadError);
          console.error('Error details:', {
            message: uploadError.message,
            statusCode: uploadError.statusCode,
            error: uploadError.error,
            path: storagePath,
            bucket: 'business-cards',
            userId: user.id
          });
          throw new Error(`Image upload failed: ${uploadError.message}`);
        }

        console.log('✅ Image uploaded successfully:', uploadData);

        // Generate public URL
        console.log('🔵 Getting public URL...');
        const { data: urlData } = supabase.storage
          .from('business-cards')
          .getPublicUrl(storagePath);

        console.log('✅ Public URL generated:', urlData?.publicUrl);

        imageData = {
          image_storage_path: storagePath,
          image_url: urlData?.publicUrl || null
        };
      }

      const productData = { ...formData, ...imageData };
      console.log('🔵 Product data to save:', {
        name: productData.name,
        category: productData.category,
        hasImage: !!productData.image_url,
        imageStoragePath: productData.image_storage_path,
        isEdit: !!editingProduct
      });

      if (editingProduct) {
        console.log('🔵 Calling updateProduct for ID:', editingProduct.id);
        await actions.updateProduct({ ...editingProduct, ...productData });
        console.log('✅ Product updated successfully');
      } else {
        console.log('🔵 Calling addProduct...');
        const newProduct = await actions.addProduct(productData);
        if (newProduct?.id) {
          console.log('✅ Product created successfully:', newProduct.id);
          handleCloseModal();
          navigate(`/products/${newProduct.id}`);
          return;
        }
      }
      console.log('✅ Save complete');
      handleCloseModal();
    } catch (error) {
      console.error('Error saving buying intent:', error);
      alert('Error saving buying intent');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (productId) => {
    const quoteCount = quoteCounts[productId] || 0;
    const confirmed = await confirm({
      title: 'Delete Buying Intent',
      message: `Are you sure you want to delete this buying intent${quoteCount > 0 ? ` and its ${quoteCount} linked quotes` : ''}?`,
      type: 'danger',
      confirmText: 'Delete'
    });
    if (confirmed) actions.deleteProduct(productId);
  };

  // Bulk selection handlers
  const toggleSelection = (productId) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
  };

  const deselectAll = () => {
    setSelectedProducts(new Set());
  };

  const handleBulkDelete = async () => {
    const count = selectedProducts.size;
    const totalQuotes = Array.from(selectedProducts).reduce((sum, id) => sum + (quoteCounts[id] || 0), 0);

    const confirmed = await confirm({
      title: `Delete ${count} Buying Intent${count > 1 ? 's' : ''}`,
      message: `Are you sure you want to delete ${count} buying intent${count > 1 ? 's' : ''}${totalQuotes > 0 ? ` and ${totalQuotes} linked quotes` : ''}? This action cannot be undone.`,
      type: 'danger',
      confirmText: `Delete ${count} Item${count > 1 ? 's' : ''}`
    });

    if (confirmed) {
      for (const productId of selectedProducts) {
        await actions.deleteProduct(productId);
      }
      deselectAll();
    }
  };

  const handleExportToExcel = () => {
    if (selectedProducts.size === 0) return;
    setShowExcelThemeSelector(true);
  };

  const handleConfirmExcelExport = async () => {
    const selectedIntents = Array.from(selectedProducts)
      .map(id => products.find(p => p.id === id))
      .filter(Boolean);

    if (selectedIntents.length === 0) return;

    setShowExcelThemeSelector(false);
    await exportBuyingIntentsToExcel(selectedIntents, selectedExcelTheme);
  };

  const toggleCategory = (category) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return (
    <div className="page">
      <div className="header">
        <h2>Buying Intents</h2>
        <div className="header-actions" style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={() => setIsUploadQuoteModalOpen(true)}>
            <Upload size={16} /> Upload Quote
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={16} /> New Buying Intent
          </button>
        </div>
      </div>

      <div className="content content-fixed">
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
        {/* Stats - Prominent at top */}
        {products.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '28px',
            flexShrink: 0,
          }}>
            <div className="stat-card" style={{ '--stat-color': '#6366F1', '--stat-bg': 'rgba(99, 102, 241, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)' }}>
                <Package size={22} color="#6366F1" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Total Intents</div>
                <div className="stat-value">{stats.totalProducts}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': '#10b981', '--stat-bg': 'rgba(16, 185, 129, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                <TrendingUp size={22} color="#10b981" />
              </div>
              <div className="stat-content">
                <div className="stat-label">With Quotes</div>
                <div className="stat-value">{stats.totalWithQuotes}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': '#f59e0b', '--stat-bg': 'rgba(245, 158, 11, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                <TrendingDown size={22} color="#f59e0b" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Without Quotes</div>
                <div className="stat-value">{stats.totalWithoutQuotes}</div>
              </div>
            </div>
            <div className="stat-card" style={{ '--stat-color': '#8b5cf6', '--stat-bg': 'rgba(139, 92, 246, 0.1)' }}>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                <Grid size={22} color="#8b5cf6" />
              </div>
              <div className="stat-content">
                <div className="stat-label">Categories</div>
                <div className="stat-value">{Object.keys(stats.categoryBreakdown).length}</div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Filters Button */}
        <button
          className="mobile-filters-btn"
          onClick={() => setIsMobileFiltersOpen(true)}
          style={{
            display: 'none',
            marginBottom: '16px',
            padding: '12px 16px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 600,
            alignItems: 'center',
            gap: '8px',
            width: '100%',
          }}
        >
          <Filter size={16} /> Filters & Options
        </button>

        {/* Two-column layout: Filters sidebar + Main content */}
        <div className="products-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Left Sidebar: Filters & Options */}
          <div className="filters-sidebar" style={{
            background: 'white',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            overflowY: 'auto',
          }}>
            {/* Search */}
            <div style={{ marginBottom: '20px' }}>
              <SearchInput value={search} onChange={setSearch} placeholder="Search buying intents..." />
            </div>

            {/* Select All Control */}
            {filteredProducts.length > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '20px',
              }}>
                <input
                  type="checkbox"
                  checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.has(p.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectAll();
                    } else {
                      deselectAll();
                    }
                  }}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = selectedProducts.size > 0 && !filteredProducts.every(p => selectedProducts.has(p.id));
                    }
                  }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Select All
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  {selectedProducts.size > 0 ? `${selectedProducts.size} selected` : `${filteredProducts.length}`}
                </span>
              </div>
            )}

            <h3 style={{
              fontSize: '0.875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              marginBottom: '20px'
            }}>
              Filters & View
            </h3>

            {/* View Mode */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                View Mode
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={() => {
                    setViewMode('grid');
                    localStorage.setItem('buyingIntentsViewMode', 'grid');
                    setViewModeManuallySet(true);
                  }}
                  style={{
                    padding: '12px 8px',
                    background: viewMode === 'grid' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <Grid size={16} />
                  Cards
                </button>
                <button
                  onClick={() => {
                    setViewMode('compact');
                    localStorage.setItem('buyingIntentsViewMode', 'compact');
                    setViewModeManuallySet(true);
                  }}
                  style={{
                    padding: '12px 8px',
                    background: viewMode === 'compact' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: viewMode === 'compact' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <Table2 size={16} />
                  Table
                </button>
              </div>
            </div>

            {/* Sort By */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                Sort By
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={() => setSortBy('name')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'name' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'name' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <Type size={16} />
                  Name (A-Z)
                </button>
                <button
                  onClick={() => setSortBy('quotes')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'quotes' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'quotes' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <TrendingDown size={16} />
                  Quotes (High-Low)
                </button>
                <button
                  onClick={() => setSortBy('recent')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'recent' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'recent' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <Clock size={16} />
                  Recently Added
                </button>
              </div>
            </div>

            {/* Category Filters */}
            {categories.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Categories
                  </label>
                  {selectedCategoryFilters.length > 0 && (
                    <button
                      onClick={() => setSelectedCategoryFilters([])}
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--error)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {categories.map(category => (
                    <label
                      key={category}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: selectedCategoryFilters.includes(category) ? 'var(--accent-light)' : 'var(--bg-secondary)',
                        border: selectedCategoryFilters.includes(category) ? '1px solid var(--accent)' : '1px solid transparent',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategoryFilters.includes(category)}
                        onChange={() => {
                          setSelectedCategoryFilters(prev =>
                            prev.includes(category)
                              ? prev.filter(c => c !== category)
                              : [...prev, category]
                          );
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{category}</span>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        background: 'white',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {stats.categoryBreakdown[category] || 0}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Bulk Actions */}
            {selectedProducts.size > 0 && (
              <div style={{
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--error)',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--error)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {selectedProducts.size} Selected
                </div>
                <button
                  onClick={() => setShowRFQThemeSelector(true)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <FileDown size={16} />
                  Generate RFQ ({selectedProducts.size})
                </button>
                <button
                  onClick={handleExportToExcel}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <FileDown size={16} />
                  Export to Excel ({selectedProducts.size})
                </button>
                <button
                  onClick={handleBulkDelete}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'var(--error)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '8px',
                  }}
                >
                  <Trash2 size={16} />
                  Delete Selected
                </button>
                <button
                  onClick={deselectAll}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'transparent',
                    color: 'var(--error)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginTop: '8px',
                    textDecoration: 'underline',
                  }}
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>

          {/* Right: Main Content */}
          <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <Package size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
            <h3>{search ? 'No buying intents match your search' : 'No buying intents yet'}</h3>
            <p>{search ? 'Try a different search term' : 'Define what you want to buy to start comparing quotes'}</p>
            {!search && (
              <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => handleOpenModal()}>
                <Plus size={16} /> New Buying Intent
              </button>
            )}
          </div>
        ) : (
          <div>
            {Object.entries(groupedProducts).map(([category, products]) => (
              <div key={category} style={{ marginBottom: '32px' }}>
                {/* Category Header */}
                <div
                  onClick={() => toggleCategory(category)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px 20px',
                    background: '#f5f7fa',
                    borderRadius: '12px',
                    marginBottom: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  {collapsedCategories[category] ? (
                    <ChevronRight size={20} style={{ color: '#64748b' }} />
                  ) : (
                    <ChevronDown size={20} style={{ color: '#64748b' }} />
                  )}
                  <Package size={20} style={{ color: '#64748b' }} />
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', flex: 1 }}>
                    {category}
                  </h3>
                  <span style={{
                    padding: '4px 12px',
                    background: 'rgba(255, 255, 255, 0.9)',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: '#64748b',
                  }}>
                    {products.length} {products.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {/* Products in Category */}
                {!collapsedCategories[category] && (
                  viewMode === 'grid' ? (
                    <div className="products-grid">
                      {products.map(product => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          quoteCount={quoteCounts[product.id] || 0}
                          onClick={() => navigate(`/products/${product.id}`)}
                          onEdit={() => handleOpenModal(product)}
                          onDuplicate={() => handleDuplicate(product)}
                          onDelete={() => handleDelete(product.id)}
                          isSelected={selectedProducts.has(product.id)}
                          onToggleSelect={toggleSelection}
                        />
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      {/* Table Header */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '44px minmax(200px, 1fr) 140px 90px 90px 100px',
                        gap: '12px',
                        padding: '10px 16px',
                        background: 'var(--bg-secondary)',
                        borderBottom: '1px solid var(--border)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}>
                        <div></div>
                        <div>Name</div>
                        <div>Category</div>
                        <div style={{ textAlign: 'center' }}>Quotes</div>
                        <div style={{ textAlign: 'center' }}>Status</div>
                        <div style={{ textAlign: 'right' }}>Actions</div>
                      </div>
                      {/* Table Rows */}
                      {products.map((product, idx) => {
                        const quoteCount = quoteCounts[product.id] || 0;
                        const hasQuotes = quoteCount > 0;
                        const isDraft = product.status === 'draft';

                        return (
                          <div
                            key={product.id}
                            onClick={() => navigate(`/products/${product.id}`)}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '44px minmax(200px, 1fr) 140px 90px 90px 100px',
                              gap: '12px',
                              padding: '8px 16px',
                              alignItems: 'center',
                              background: selectedProducts.has(product.id) ? '#eff6ff' : (idx % 2 === 0 ? 'white' : 'var(--bg-primary)'),
                              borderBottom: idx < products.length - 1 ? '1px solid var(--border-light)' : 'none',
                              cursor: 'pointer',
                              transition: 'background 0.15s',
                              fontSize: '0.875rem',
                            }}
                            onMouseEnter={(e) => {
                              if (!selectedProducts.has(product.id)) {
                                e.currentTarget.style.background = 'var(--bg-hover)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectedProducts.has(product.id)) {
                                e.currentTarget.style.background = idx % 2 === 0 ? 'white' : 'var(--bg-primary)';
                              }
                            }}
                          >
                            {/* Forgiving checkbox click area */}
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                toggleSelection(product.id);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedProducts.has(product.id)}
                                onChange={() => toggleSelection(product.id)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer',
                                  pointerEvents: 'none',
                                }}
                              />
                            </div>

                            {/* Name */}
                            <div style={{
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {product.name}
                            </div>

                            {/* Category */}
                            <div style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-secondary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {product.category || '-'}
                            </div>

                            {/* Quotes Count */}
                            <div style={{
                              textAlign: 'center',
                              fontWeight: 600,
                              color: hasQuotes ? 'var(--success)' : 'var(--text-muted)',
                            }}>
                              {quoteCount}
                            </div>

                            {/* Status */}
                            <div style={{ textAlign: 'center' }}>
                              {isDraft ? (
                                <span style={{
                                  padding: '3px 8px',
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                }}>
                                  Draft
                                </span>
                              ) : (
                                <span style={{
                                  padding: '3px 8px',
                                  background: 'var(--success-light)',
                                  color: 'var(--success)',
                                  borderRadius: 'var(--radius-sm)',
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                }}>
                                  Active
                                </span>
                              )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenModal(product);
                                }}
                                style={{
                                  padding: '6px',
                                  background: 'transparent',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  color: 'var(--text-secondary)',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-secondary)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-secondary)';
                                }}
                                title="Edit"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicate(product);
                                }}
                                style={{
                                  padding: '6px',
                                  background: 'transparent',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  color: 'var(--text-secondary)',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--bg-secondary)';
                                  e.currentTarget.style.color = 'var(--accent)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-secondary)';
                                }}
                                title="Duplicate"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(product.id);
                                }}
                                style={{
                                  padding: '6px',
                                  background: 'transparent',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  color: 'var(--text-secondary)',
                                  transition: 'all 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = 'var(--error-light)';
                                  e.currentTarget.style.color = 'var(--error)';
                                  e.currentTarget.style.borderColor = 'var(--error)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.color = 'var(--text-secondary)';
                                  e.currentTarget.style.borderColor = 'var(--border)';
                                }}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
          </div>
          {/* End right content area */}
        </div>
        {/* End two-column layout */}
        </>
        )}
      </div>

      {/* Mobile Filters Drawer */}
      {isMobileFiltersOpen && (
        <>
          <div
            className="mobile-filters-overlay"
            onClick={() => setIsMobileFiltersOpen(false)}
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
            boxShadow: '-4px 0 12px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Filters & View</h3>
              <button
                onClick={() => setIsMobileFiltersOpen(false)}
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

            {/* View Mode */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                View Mode
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  onClick={() => {
                    setViewMode('grid');
                    localStorage.setItem('buyingIntentsViewMode', 'grid');
                    setViewModeManuallySet(true);
                  }}
                  style={{
                    padding: '12px 8px',
                    background: viewMode === 'grid' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <Grid size={16} />
                  Cards
                </button>
                <button
                  onClick={() => {
                    setViewMode('compact');
                    localStorage.setItem('buyingIntentsViewMode', 'compact');
                    setViewModeManuallySet(true);
                  }}
                  style={{
                    padding: '12px 8px',
                    background: viewMode === 'compact' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: viewMode === 'compact' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <Table2 size={16} />
                  Table
                </button>
              </div>
            </div>

            {/* Sort By */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                Sort By
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={() => setSortBy('name')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'name' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'name' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <Type size={16} />
                  Name (A-Z)
                </button>
                <button
                  onClick={() => setSortBy('quotes')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'quotes' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'quotes' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <TrendingDown size={16} />
                  Quotes (High-Low)
                </button>
                <button
                  onClick={() => setSortBy('recent')}
                  style={{
                    padding: '10px 12px',
                    background: sortBy === 'recent' ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: sortBy === 'recent' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                >
                  <Clock size={16} />
                  Recently Added
                </button>
              </div>
            </div>

            {/* Category Filters */}
            {categories.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Categories
                  </label>
                  {selectedCategoryFilters.length > 0 && (
                    <button
                      onClick={() => setSelectedCategoryFilters([])}
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--error)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                        textDecoration: 'underline',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {categories.map(category => (
                    <label
                      key={category}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        background: selectedCategoryFilters.includes(category) ? 'var(--accent-light)' : 'var(--bg-secondary)',
                        border: selectedCategoryFilters.includes(category) ? '1px solid var(--accent)' : '1px solid transparent',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategoryFilters.includes(category)}
                        onChange={() => {
                          setSelectedCategoryFilters(prev =>
                            prev.includes(category)
                              ? prev.filter(c => c !== category)
                              : [...prev, category]
                          );
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ flex: 1, color: 'var(--text-primary)' }}>{category}</span>
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        background: 'white',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}>
                        {stats.categoryBreakdown[category] || 0}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Bulk Actions */}
            {selectedProducts.size > 0 && (
              <div style={{
                padding: '16px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--error)',
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--error)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {selectedProducts.size} Selected
                </div>
                <button
                  onClick={() => {
                    setShowRFQThemeSelector(true);
                    setIsMobileFiltersOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <FileDown size={16} />
                  Generate RFQ ({selectedProducts.size})
                </button>
                <button
                  onClick={() => {
                    handleBulkDelete();
                    setIsMobileFiltersOpen(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: 'var(--error)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '8px',
                  }}
                >
                  <Trash2 size={16} />
                  Delete Selected
                </button>
                <button
                  onClick={deselectAll}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'transparent',
                    color: 'var(--error)',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    marginTop: '8px',
                    textDecoration: 'underline',
                  }}
                >
                  Deselect All
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <EditBuyingIntentModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        editingProduct={editingProduct}
        formData={formData}
        setFormData={setFormData}
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
            setFormData({
              ...formData,
              specs: [...formData.specs, { key: customFieldName, value: customFieldValue }]
            });
            setCustomFieldName('');
            setCustomFieldValue('');
          }
        }}
        handleRemoveSpec={(index) => {
          const newSpecs = formData.specs.filter((_, i) => i !== index);
          setFormData({ ...formData, specs: newSpecs });
        }}
        handleUpdateSpecValue={(index, value) => {
          const newSpecs = [...formData.specs];
          newSpecs[index] = { ...newSpecs[index], value };
          setFormData({ ...formData, specs: newSpecs });
        }}
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
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0, marginBottom: '4px' }}>
                  Choose RFQ Export Theme
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  Generating RFQ for {selectedProducts.size} item{selectedProducts.size > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setShowRFQThemeSelector(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}>
                <X size={24} color="#64748b" />
              </button>
            </div>
            <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
              <div style={{ width: '280px', borderRight: '1px solid #e5e7eb', padding: '24px 16px', background: '#f8fafc', overflow: 'auto' }}>
                {Object.entries(EXPORT_THEMES).map(([key, theme]) => (
                  <button key={key} onClick={() => setSelectedRFQTheme(key)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', marginBottom: '8px', background: selectedRFQTheme === key ? '#eff6ff' : 'white', border: `2px solid ${selectedRFQTheme === key ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${selectedRFQTheme === key ? '#3b82f6' : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedRFQTheme === key && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', marginBottom: '4px' }}>{theme.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px' }}>{theme.description}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {theme.preview.map((color, i) => <div key={i} style={{ width: '24px', height: '24px', borderRadius: '4px', background: color, border: '1px solid rgba(0,0,0,0.1)' }} />)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, padding: '32px', overflow: 'auto', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                  <FileDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>Multi-Item RFQ Export</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '8px' }}>Excel file will include {selectedProducts.size} buying intent{selectedProducts.size > 1 ? 's' : ''}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '20px 32px', borderTop: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setShowRFQThemeSelector(false)} style={{ padding: '10px 20px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.95rem', color: '#475569' }}>Cancel</button>
              <button onClick={async () => { const selectedProductList = Array.from(selectedProducts).map(id => products.find(p => p.id === id)).filter(Boolean); await generateRFQExcel(selectedProductList, selectedRFQTheme); setShowRFQThemeSelector(false); }} style={{ padding: '10px 24px', border: 'none', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', color: 'white', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileDown size={18} />Export with {EXPORT_THEMES[selectedRFQTheme].name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buying Intents Excel Export Theme Selection Modal */}
      {showExcelThemeSelector && (
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
            <div style={{ padding: '24px 32px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0, marginBottom: '4px' }}>
                  Choose Excel Export Theme
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                  Exporting {selectedProducts.size} Buying Intent{selectedProducts.size > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setShowExcelThemeSelector(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}>
                <X size={24} color="#64748b" />
              </button>
            </div>
            <div style={{ display: 'flex', overflow: 'hidden', flex: 1 }}>
              <div style={{ width: '280px', borderRight: '1px solid #e5e7eb', padding: '24px 16px', background: '#f8fafc', overflow: 'auto' }}>
                {Object.entries(EXPORT_THEMES).map(([key, theme]) => (
                  <button key={key} onClick={() => setSelectedExcelTheme(key)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', marginBottom: '8px', background: selectedExcelTheme === key ? '#eff6ff' : 'white', border: `2px solid ${selectedExcelTheme === key ? '#3b82f6' : '#e5e7eb'}`, borderRadius: '10px', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${selectedExcelTheme === key ? '#3b82f6' : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedExcelTheme === key && <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b', marginBottom: '4px' }}>{theme.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '10px' }}>{theme.description}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {theme.preview.map((color, i) => <div key={i} style={{ width: '24px', height: '24px', borderRadius: '4px', background: color, border: '1px solid rgba(0,0,0,0.1)' }} />)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, padding: '32px', overflow: 'auto', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', color: '#64748b' }}>
                  <FileDown size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600 }}>Buying Intents Export</div>
                  <div style={{ fontSize: '0.875rem', marginTop: '8px' }}>
                    Excel file with images, specifications, and categories
                  </div>
                  <div style={{ fontSize: '0.875rem', marginTop: '4px', opacity: 0.7 }}>
                    {selectedProducts.size} item{selectedProducts.size > 1 ? 's' : ''} selected
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '20px 32px', borderTop: '1px solid #e5e7eb', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
              <button onClick={() => setShowExcelThemeSelector(false)} style={{ padding: '10px 20px', border: '1px solid #cbd5e1', background: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: 500, fontSize: '0.95rem', color: '#475569' }}>Cancel</button>
              <button onClick={handleConfirmExcelExport} style={{ padding: '10px 24px', border: 'none', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem', color: 'white', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileDown size={18} />Export with {EXPORT_THEMES[selectedExcelTheme].name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Quote Modal - only render when open */}
      {isUploadQuoteModalOpen && (
        <MultiItemQuoteUploadModal
          isOpen={isUploadQuoteModalOpen}
          onClose={() => setIsUploadQuoteModalOpen(false)}
          onSuccess={() => {
            setIsUploadQuoteModalOpen(false);
            // Reload quote counts after successful upload
            const loadQuoteCounts = async () => {
              const counts = {};
              for (const product of products) {
                const oldQuotes = computed.getProductQuotes(product.id);
                const newLineItems = await computed.getLineItemsForBuyingIntent(product.id);
                counts[product.id] = oldQuotes.length + newLineItems.length;
              }
              setQuoteCounts(counts);
            };
            loadQuoteCounts();
          }}
        />
      )}
    </div>
  );
}

export default Products;
