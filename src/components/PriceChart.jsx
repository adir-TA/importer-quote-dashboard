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

// Categorical series palette, assigned in fixed order and never cycled, so a
// supplier keeps its colour when the set is filtered. Validated for
// colour-vision deficiency separation and lightness band against a light
// surface. Three of these sit below 3:1 contrast, which is why the legend and
// the dot markers are mandatory rather than decorative.
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTHER_COLOR = 'var(--text-subtle)';

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
            borderRadius: 'var(--radius-md)',
            border: '2px dashed var(--border)'
          }}>
            <p style={{ color: 'var(--text-muted)', marginBottom: '8px' }}>
              Add more quotes to see price trends
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
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
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                fontSize: 'var(--text-sm)',
              }}
              formatter={(value) => [formatCurrency(value, currency), '']}
            />
            <Legend iconType="line" wrapperStyle={{ fontSize: 12 }} />
            {chartData.suppliers.map((supplier, idx) => (
              <Line
                key={supplier}
                type="monotone"
                dataKey={supplier}
                // Past the palette a series is grey rather than a recycled hue:
                // two suppliers sharing a colour is worse than one being muted.
                stroke={SERIES_COLORS[idx] || OTHER_COLOR}
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
