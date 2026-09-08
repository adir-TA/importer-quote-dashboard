import React, { useState, useMemo } from 'react';
import { formatCurrency as formatMoney } from '../utils/currency';
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Check, Edit2, X } from 'lucide-react';

function OrderCostTracking({ order, onUpdate, currency = 'USD' }) {
  const [editing, setEditing] = useState(false);
  const [actualCosts, setActualCosts] = useState({
    unitPrice: order.actualUnitPrice || '',
    shippingCost: order.actualShipping || '',
    dutiesCost: order.actualDuties || '',
    otherCosts: order.actualOther || '',
  });

  // Parse quoted values
  const quotedTotal = useMemo(() => {
    const total = parseFloat(String(order.total || '0').replace(/[^0-9.]/g, '')) || 0;
    return total;
  }, [order.total]);

  const quantity = useMemo(() => {
    return parseFloat(String(order.quantity || '0').replace(/[^0-9.]/g, '')) || 0;
  }, [order.quantity]);

  // Calculate actual total
  const actualTotal = useMemo(() => {
    const unit = (parseFloat(actualCosts.unitPrice) || 0) * quantity;
    const shipping = parseFloat(actualCosts.shippingCost) || 0;
    const duties = parseFloat(actualCosts.dutiesCost) || 0;
    const other = parseFloat(actualCosts.otherCosts) || 0;
    return unit + shipping + duties + other;
  }, [actualCosts, quantity]);

  const variance = actualTotal > 0 ? actualTotal - quotedTotal : 0;
  const variancePercent = quotedTotal > 0 ? (variance / quotedTotal) * 100 : 0;

  const handleSave = () => {
    onUpdate?.({
      ...order,
      actualUnitPrice: actualCosts.unitPrice,
      actualShipping: actualCosts.shippingCost,
      actualDuties: actualCosts.dutiesCost,
      actualOther: actualCosts.otherCosts,
      actualTotal: actualTotal,
    });
    setEditing(false);
  };

  // Hardcoded 'USD' before, so a CNY order's costs were labelled with a
  // dollar sign. Falls back to USD only when the order has no currency.
  const formatCurrency = (val) => formatMoney(val, currency || 'USD');

  return (
    <div className="cost-tracking-card">
      <div className="cost-tracking-header">
        <h4><DollarSign size={18} /> Cost Tracking</h4>
        {!editing && order.status === 'delivered' && (
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            <Edit2 size={14} /> Enter Actuals
          </button>
        )}
      </div>

      <div className="cost-comparison">
        <div className="cost-column quoted">
          <div className="cost-column-header">Quoted</div>
          <div className="cost-main-value">{formatCurrency(quotedTotal)}</div>
          <div className="cost-per-unit">
            {quantity > 0 && `${formatCurrency(quotedTotal / quantity)}/unit`}
          </div>
        </div>

        <div className="cost-vs">
          {actualTotal > 0 ? (
            <div className={`variance-badge ${variance > 0 ? 'over' : variance < 0 ? 'under' : 'match'}`}>
              {variance > 0 ? <TrendingUp size={16} /> : variance < 0 ? <TrendingDown size={16} /> : <Check size={16} />}
              {variance !== 0 && `${variance > 0 ? '+' : ''}${variancePercent.toFixed(1)}%`}
              {variance === 0 && 'Match'}
            </div>
          ) : (
            <div className="variance-badge pending">
              <AlertTriangle size={16} />
              Pending
            </div>
          )}
        </div>

        <div className="cost-column actual">
          <div className="cost-column-header">Actual</div>
          {actualTotal > 0 ? (
            <>
              <div className="cost-main-value">{formatCurrency(actualTotal)}</div>
              <div className="cost-per-unit">
                {quantity > 0 && `${formatCurrency(actualTotal / quantity)}/unit`}
              </div>
            </>
          ) : (
            <div className="cost-pending">Not recorded</div>
          )}
        </div>
      </div>

      {editing && (
        <div className="cost-edit-form">
          <div className="cost-edit-row">
            <label>Unit Price (×{quantity})</label>
            <div className="input-with-prefix compact">
              <span className="input-prefix">$</span>
              <input
                type="number"
                step="0.01"
                value={actualCosts.unitPrice}
                onChange={(e) => setActualCosts({ ...actualCosts, unitPrice: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="cost-edit-row">
            <label>Shipping</label>
            <div className="input-with-prefix compact">
              <span className="input-prefix">$</span>
              <input
                type="number"
                step="0.01"
                value={actualCosts.shippingCost}
                onChange={(e) => setActualCosts({ ...actualCosts, shippingCost: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="cost-edit-row">
            <label>Duties & Taxes</label>
            <div className="input-with-prefix compact">
              <span className="input-prefix">$</span>
              <input
                type="number"
                step="0.01"
                value={actualCosts.dutiesCost}
                onChange={(e) => setActualCosts({ ...actualCosts, dutiesCost: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="cost-edit-row">
            <label>Other Fees</label>
            <div className="input-with-prefix compact">
              <span className="input-prefix">$</span>
              <input
                type="number"
                step="0.01"
                value={actualCosts.otherCosts}
                onChange={(e) => setActualCosts({ ...actualCosts, otherCosts: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="cost-edit-total">
            <span>Calculated Total:</span>
            <strong>{formatCurrency(actualTotal)}</strong>
          </div>
          <div className="cost-edit-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              <X size={14} /> Cancel
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave}>
              <Check size={14} /> Save
            </button>
          </div>
        </div>
      )}

      {actualTotal > 0 && !editing && (
        <div className="cost-breakdown">
          <div className="breakdown-title">Actual Breakdown</div>
          <div className="breakdown-items">
            {actualCosts.unitPrice && (
              <div className="breakdown-item">
                <span>Product Cost</span>
                <span>{formatCurrency(parseFloat(actualCosts.unitPrice) * quantity)}</span>
              </div>
            )}
            {actualCosts.shippingCost && (
              <div className="breakdown-item">
                <span>Shipping</span>
                <span>{formatCurrency(actualCosts.shippingCost)}</span>
              </div>
            )}
            {actualCosts.dutiesCost && (
              <div className="breakdown-item">
                <span>Duties & Taxes</span>
                <span>{formatCurrency(actualCosts.dutiesCost)}</span>
              </div>
            )}
            {actualCosts.otherCosts && (
              <div className="breakdown-item">
                <span>Other Fees</span>
                <span>{formatCurrency(actualCosts.otherCosts)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderCostTracking;
