import * as XLSX from 'xlsx';

// Export quotes comparison to Excel
export function exportComparisonToExcel(quotes, filename = 'Quote_Comparison') {
  // Get all unique fields
  const allFields = new Set();
  quotes.forEach(q => {
    Object.keys(q.fields || {}).forEach(k => allFields.add(k));
  });
  const fields = Array.from(allFields);

  // Build worksheet data
  const wsData = [];
  
  // Title row
  wsData.push(['QUOTE COMPARISON REPORT']);
  wsData.push(['Generated: ' + new Date().toLocaleDateString()]);
  wsData.push([]);

  // Headers
  const headers = ['Field', ...quotes.map(q => q.supplier_name || q.supplierName)];
  wsData.push(headers);

  // Data rows
  fields.forEach(field => {
    const row = [field];
    quotes.forEach(q => {
      row.push(q.fields?.[field] || '');
    });
    wsData.push(row);
  });

  // Tags row
  const tagsRow = ['Tags'];
  quotes.forEach(q => {
    tagsRow.push((q.tags || []).join(', '));
  });
  wsData.push(tagsRow);

  // Notes row
  const notesRow = ['Notes'];
  quotes.forEach(q => {
    notesRow.push(q.notes || '');
  });
  wsData.push(notesRow);

  // Create workbook
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Set column widths
  ws['!cols'] = [{ wch: 20 }];
  quotes.forEach(() => ws['!cols'].push({ wch: 25 }));

  XLSX.utils.book_append_sheet(wb, ws, 'Comparison');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Export quotes comparison to CSV
export function exportComparisonToCSV(quotes, filename = 'Quote_Comparison') {
  const allFields = new Set();
  quotes.forEach(q => {
    Object.keys(q.fields || {}).forEach(k => allFields.add(k));
  });
  const fields = Array.from(allFields);

  const rows = [];
  
  // Headers
  rows.push(['Field', ...quotes.map(q => q.supplier_name || q.supplierName)].join(','));

  // Data rows
  fields.forEach(field => {
    const row = [field];
    quotes.forEach(q => {
      const value = q.fields?.[field] || '';
      row.push(`"${String(value).replace(/"/g, '""')}"`);
    });
    rows.push(row.join(','));
  });

  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Export to PDF (opens print dialog)
export function exportComparisonToPDF(quotes) {
  const allFields = new Set();
  quotes.forEach(q => {
    Object.keys(q.fields || {}).forEach(k => allFields.add(k));
  });
  const fields = Array.from(allFields);

  // Find best prices
  const bestPrices = {};
  fields.forEach(field => {
    if (field.toLowerCase().includes('price')) {
      let lowest = Infinity;
      let lowestIdx = -1;
      quotes.forEach((q, idx) => {
        const val = q.fields?.[field] || '';
        const numVal = parseFloat(String(val).replace(/[^0-9.]/g, ''));
        if (!isNaN(numVal) && numVal < lowest) {
          lowest = numVal;
          lowestIdx = idx;
        }
      });
      if (lowestIdx !== -1) bestPrices[field] = lowestIdx;
    }
  });

  let html = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
    h1 { color: #10b981; margin-bottom: 5px; }
    .date { color: #666; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background: #10b981; color: white; }
    th:first-child { background: #059669; }
    td:first-child { background: #f3f4f6; font-weight: 600; }
    .best { background: #d1fae5 !important; color: #059669; font-weight: bold; }
    tr:nth-child(even) { background: #f9fafb; }
  </style>
</head>
<body>
  <h1>Quote Comparison Report</h1>
  <div class="date">Generated: ${new Date().toLocaleString()}</div>
  <table>
    <thead>
      <tr>
        <th>Field</th>
        ${quotes.map(q => `<th>${q.supplier_name || q.supplierName}</th>`).join('')}
      </tr>
    </thead>
    <tbody>`;

  fields.forEach(field => {
    html += `<tr><td>${field}</td>`;
    quotes.forEach((q, idx) => {
      const val = q.fields?.[field] || '-';
      const isBest = bestPrices[field] === idx;
      html += `<td class="${isBest ? 'best' : ''}">${isBest ? '★ ' : ''}${val}</td>`;
    });
    html += '</tr>';
  });

  html += `
      <tr>
        <td>Tags</td>
        ${quotes.map(q => `<td>${(q.tags || []).join(', ')}</td>`).join('')}
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.print();
}

// Export products list
export function exportProductsToExcel(products, quotes) {
  const wsData = [];
  
  wsData.push(['PRODUCTS LIST']);
  wsData.push(['Generated: ' + new Date().toLocaleDateString()]);
  wsData.push([]);
  wsData.push(['Name', 'Category', 'Description', 'Quotes Count', 'Created']);

  products.forEach(p => {
    const quoteCount = quotes.filter(q => (q.product_id || q.productId) === p.id).length;
    wsData.push([
      p.name,
      p.category || '',
      p.description || '',
      quoteCount,
      new Date(p.created_at || p.createdAt).toLocaleDateString()
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 40 }, { wch: 12 }, { wch: 12 }];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  XLSX.writeFile(wb, `Products_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Export suppliers list
export function exportSuppliersToExcel(suppliers) {
  const wsData = [];
  
  wsData.push(['SUPPLIERS LIST']);
  wsData.push(['Generated: ' + new Date().toLocaleDateString()]);
  wsData.push([]);
  wsData.push(['Company', 'Contact', 'WeChat', 'Email', 'Website', 'Status']);

  suppliers.forEach(s => {
    wsData.push([
      s.company,
      s.contact || '',
      s.wechat || '',
      s.email || '',
      s.website || '',
      s.status || 'pending'
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 12 }];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Suppliers');
  XLSX.writeFile(wb, `Suppliers_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// Export orders list
export function exportOrdersToExcel(orders) {
  const wsData = [];
  
  wsData.push(['ORDERS LIST']);
  wsData.push(['Generated: ' + new Date().toLocaleDateString()]);
  wsData.push([]);
  wsData.push(['Order Name', 'Supplier', 'Status', 'Quantity', 'Total', 'Date']);

  orders.forEach(o => {
    wsData.push([
      o.name,
      o.supplier || '',
      o.status || 'pending',
      o.quantity || '',
      o.total || '',
      new Date(o.created_at || o.createdAt).toLocaleDateString()
    ]);
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Orders');
  XLSX.writeFile(wb, `Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export default {
  exportComparisonToExcel,
  exportComparisonToCSV,
  exportComparisonToPDF,
  exportProductsToExcel,
  exportSuppliersToExcel,
  exportOrdersToExcel
};
