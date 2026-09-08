import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
// Hardcoded '$' before, mislabelling every non-USD price.
import { formatCurrency } from '../utils/currency';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

function PriceChart({ quotes, productId, currency = 'USD' }) {
  const chartData = useMemo(() => {
    // Filter quotes for this product (handle both snake_case and camelCase)
    const productQuotes = quotes.filter(q => (q.product_id || q.productId) === productId);
    
    if (productQuotes.length < 2) {
      return null;
    }

    // Group by supplier and extract prices
    const supplierData = {};
    productQuotes.forEach(q => {
      // Try to find a price field
      const priceField = Object.keys(q.fields || {}).find(k => 
        k.toLowerCase().includes('price')
      );
      if (!priceField) return;
      
      const price = parseFloat(String(q.fields[priceField]).replace(/[^0-9.]/g, ''));
      if (isNaN(price)) return;

      const supplierName = q.supplier_name || q.supplierName;
      const createdAt = q.created_at || q.createdAt;
      
      if (!supplierData[supplierName]) {
        supplierData[supplierName] = [];
      }
      supplierData[supplierName].push({
        date: new Date(createdAt),
        price,
        formattedDate: new Date(createdAt).toLocaleDateString()
      });
    });

    // Sort each supplier's data by date
    Object.values(supplierData).forEach(arr => {
      arr.sort((a, b) => a.date - b.date);
    });

    const suppliers = Object.keys(supplierData);
    if (suppliers.length === 0) return null;

    // Create combined data points for the chart
    const allDates = new Set();
    Object.values(supplierData).forEach(arr => {
      arr.forEach(d => allDates.add(d.formattedDate));
    });

    const sortedDates = Array.from(allDates).sort((a, b) => 
      new Date(a) - new Date(b)
    );

    const data = sortedDates.map(date => {
      const point = { date };
      suppliers.forEach(supplier => {
        const entry = supplierData[supplier].find(d => d.formattedDate === date);
        if (entry) {
          point[supplier] = entry.price;
        }
      });
      return point;
    });

    return { data, suppliers };
  }, [quotes, productId]);

  if (!chartData) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title">Price History</span>
        </div>
        <div className="card-body">
          <div style={{ 
            height: '200px', 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            background: 'var(--bg-primary)',
            borderRadius: '8px',
            border: '2px dashed var(--border)'
          }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>
              Add more quotes to see price trends
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Compare prices from different suppliers over time
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Price History</span>
      </div>
      <div className="card-body">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={chartData.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis 
              dataKey="date" 
              stroke="var(--text-muted)"
              fontSize={12}
            />
            <YAxis 
              stroke="var(--text-muted)"
              fontSize={12}
              tickFormatter={(value) => formatCurrency(value, currency)}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '8px'
              }}
              formatter={(value) => [formatCurrency(value, currency), '']}
            />
            <Legend />
            {chartData.suppliers.map((supplier, idx) => (
              <Line
                key={supplier}
                type="monotone"
                dataKey={supplier}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default PriceChart;
