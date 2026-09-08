import * as XLSX from 'xlsx';

// Parse Excel files
export async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // Try to extract fields from Excel
        const fields = {};
        const headers = jsonData[0] || [];
        
        // Common field mappings
        const fieldMappings = {
          'price': ['price', 'unit price', 'price per unit', 'fob price', 'cost'],
          'moq': ['moq', 'minimum order', 'min qty', 'minimum quantity'],
          'leadTime': ['lead time', 'delivery time', 'production time', 'days'],
          'packaging': ['packaging', 'packing', 'pack'],
          'material': ['material', 'materials'],
          'size': ['size', 'dimension', 'dimensions'],
          'weight': ['weight', 'net weight', 'gross weight']
        };
        
        // Parse rows looking for key-value pairs
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row.length >= 2) {
            const key = String(row[0] || '').toLowerCase().trim();
            const value = row[1];
            
            if (key && value !== undefined && value !== '') {
              // Clean up the key name
              let fieldName = String(row[0]).trim();
              fields[fieldName] = String(value);
            }
          }
        }
        
        resolve({
          success: true,
          type: 'excel',
          fields,
          rawData: jsonData,
          sheetName
        });
      } catch (error) {
        reject(new Error('Failed to parse Excel file: ' + error.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

// Parse CSV files
export async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').map(line => 
          line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
        );
        
        const fields = {};
        for (let i = 0; i < lines.length; i++) {
          const row = lines[i];
          if (row.length >= 2 && row[0] && row[1]) {
            fields[row[0]] = row[1];
          }
        }
        
        resolve({
          success: true,
          type: 'csv',
          fields,
          rawData: lines
        });
      } catch (error) {
        reject(new Error('Failed to parse CSV file: ' + error.message));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Convert image to base64 for AI processing
export async function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({
        success: true,
        type: 'image',
        base64,
        mimeType: file.type,
        fileName: file.name
      });
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

// Convert PDF to base64 for AI processing
export async function pdfToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({
        success: true,
        type: 'pdf',
        base64,
        mimeType: 'application/pdf',
        fileName: file.name
      });
    };
    reader.onerror = () => reject(new Error('Failed to read PDF'));
    reader.readAsDataURL(file);
  });
}

// NOTE: extractWithAI() lived here and POSTed straight to api.anthropic.com
// from the browser (CORS-blocked, and it would have exposed the API key).
// Nothing referenced it. Quote extraction goes through the backend via
// src/utils/quoteExtractionService.js.

export async function parseFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  
  switch (extension) {
    case 'xlsx':
    case 'xls':
      return parseExcel(file);
    case 'csv':
      return parseCSV(file);
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return imageToBase64(file);
    case 'pdf':
      return pdfToBase64(file);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

export default {
  parseFile,
  parseExcel,
  parseCSV,
  imageToBase64,
  pdfToBase64,
};
