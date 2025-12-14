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

// Extract data using AI (placeholder for API integration)
export async function extractWithAI(fileData, apiKey) {
  if (!apiKey) {
    throw new Error('API key is required for AI extraction');
  }

  // Build the message based on file type
  let content = [];
  
  if (fileData.type === 'image') {
    content = [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: fileData.mimeType,
          data: fileData.base64
        }
      },
      {
        type: 'text',
        text: `Extract all quote/pricing information from this image. Return a JSON object with field names as keys and values. Look for: supplier name, product details, price, MOQ, lead time, payment terms, shipping terms, packaging info, etc. Only return valid JSON, no explanation.`
      }
    ];
  } else if (fileData.type === 'pdf') {
    content = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fileData.base64
        }
      },
      {
        type: 'text',
        text: `Extract all quote/pricing information from this PDF. Return a JSON object with field names as keys and values. Look for: supplier name, product details, price, MOQ, lead time, payment terms, shipping terms, packaging info, etc. Only return valid JSON, no explanation.`
      }
    ];
  } else {
    // For Excel/CSV, we already have the data parsed
    return {
      success: true,
      fields: fileData.fields || {},
      supplier: ''
    };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content[0].text;
    
    // Try to parse as JSON
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: true,
          fields: parsed,
          supplier: parsed.supplier || parsed.Supplier || parsed['Supplier Name'] || ''
        };
      }
    } catch (e) {
      // If JSON parsing fails, return raw text
    }
    
    return {
      success: true,
      fields: { 'Raw Data': text },
      supplier: ''
    };
  } catch (error) {
    throw new Error('AI extraction failed: ' + error.message);
  }
}

// Main file parser function
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
  extractWithAI
};
