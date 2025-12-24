import React, { useState } from 'react';
import { FileText, Languages, MessageCircle, FileSearch, DollarSign, Sparkles, Copy, Check, Send, Plus, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { AIResponse } from '../components';
import { generateRFQ, translateText, generateNegotiationMessage, analyzeContract, convertCurrency } from '../utils/aiService';
import { copyToClipboard } from '../utils/helpers';

const TABS = [
  { id: 'rfq', label: 'RFQ Generator', icon: FileText },
  { id: 'translator', label: 'Translator', icon: Languages },
  { id: 'negotiator', label: 'Negotiator', icon: MessageCircle },
  { id: 'contract', label: 'Contract Analyzer', icon: FileSearch },
  { id: 'currency', label: 'Currency', icon: DollarSign }
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'ILS', 'JPY'];

function AIHelpers() {
  const { state } = useAppContext();
  const { settings } = state;

  const [activeTab, setActiveTab] = useState('rfq');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState('');
  const [copied, setCopied] = useState(false);

  // RFQ state
  const [rfqProducts, setRfqProducts] = useState([{ name: '', quantity: '', specs: '' }]);
  const [companyInfo, setCompanyInfo] = useState({ name: '', details: '' });

  // Translator state
  const [translateInput, setTranslateInput] = useState('');
  const [targetLang, setTargetLang] = useState('zh');

  // Negotiator state
  const [currentPrice, setCurrentPrice] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [negotiateContext, setNegotiateContext] = useState('');

  // Contract state
  const [contractText, setContractText] = useState('');

  // Currency state
  const [currencyAmount, setCurrencyAmount] = useState('');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('CNY');
  const [convertedAmount, setConvertedAmount] = useState(null);

  const handleCopy = async () => {
    const success = await copyToClipboard(result);
    if (success) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const handleGenerateRFQ = async () => {
    if (!settings.apiKey) { alert('Please set your API key in Settings'); return; }
    const validProducts = rfqProducts.filter(p => p.name.trim());
    if (validProducts.length === 0) { alert('Please add at least one product'); return; }
    setIsLoading(true);
    setResult('');
    try {
      const response = await generateRFQ(validProducts, companyInfo, settings.apiKey);
      setResult(response);
    } catch (error) { alert('Error: ' + error.message); }
    setIsLoading(false);
  };

  const handleTranslate = async () => {
    if (!settings.apiKey) { alert('Please set your API key in Settings'); return; }
    if (!translateInput.trim()) { alert('Please enter text to translate'); return; }
    setIsLoading(true);
    setResult('');
    try {
      const response = await translateText(translateInput, targetLang, settings.apiKey);
      setResult(response);
    } catch (error) { alert('Error: ' + error.message); }
    setIsLoading(false);
  };

  const handleNegotiate = async () => {
    if (!settings.apiKey) { alert('Please set your API key in Settings'); return; }
    if (!currentPrice.trim() || !targetPrice.trim()) { alert('Please enter both prices'); return; }
    setIsLoading(true);
    setResult('');
    try {
      const response = await generateNegotiationMessage(currentPrice, targetPrice, negotiateContext, settings.apiKey);
      setResult(response);
    } catch (error) { alert('Error: ' + error.message); }
    setIsLoading(false);
  };

  const handleAnalyzeContract = async () => {
    if (!settings.apiKey) { alert('Please set your API key in Settings'); return; }
    if (!contractText.trim()) { alert('Please enter contract text'); return; }
    setIsLoading(true);
    setResult('');
    try {
      const response = await analyzeContract(contractText, settings.apiKey);
      setResult(response);
    } catch (error) { alert('Error: ' + error.message); }
    setIsLoading(false);
  };

  const handleConvertCurrency = async () => {
    const amount = parseFloat(currencyAmount);
    if (isNaN(amount) || amount <= 0) { alert('Please enter a valid amount'); return; }
    try {
      const result = await convertCurrency(amount, fromCurrency, toCurrency);
      setConvertedAmount(result);
    } catch (error) { alert('Error: ' + error.message); }
  };

  const addRfqProduct = () => setRfqProducts([...rfqProducts, { name: '', quantity: '', specs: '' }]);
  const removeRfqProduct = (idx) => setRfqProducts(rfqProducts.filter((_, i) => i !== idx));
  const updateRfqProduct = (idx, field, value) => {
    const updated = [...rfqProducts];
    updated[idx][field] = value;
    setRfqProducts(updated);
  };

  return (
    <div className="page">
      <div className="header">
        <h2>AI Helpers</h2>
      </div>

      <div className="content">
        {/* Stats Summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          marginBottom: '28px',
        }}>
          {TABS.map((tab, idx) => (
            <div key={tab.id} className="stat-card" style={{ '--stat-color': activeTab === tab.id ? '#6366F1' : '#64748b', '--stat-bg': activeTab === tab.id ? 'rgba(99, 102, 241, 0.1)' : 'rgba(100, 116, 139, 0.05)' }}>
              <div className="stat-icon-wrapper" style={{ background: activeTab === tab.id ? 'rgba(99, 102, 241, 0.1)' : 'rgba(100, 116, 139, 0.05)' }}>
                <tab.icon size={20} color={activeTab === tab.id ? '#6366F1' : '#64748b'} />
              </div>
              <div className="stat-content">
                <div className="stat-label" style={{ fontSize: '0.75rem' }}>{tab.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setResult(''); }} className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}>
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Input Panel */}
          <div className="card">
            <div className="card-header"><span className="card-title">Input</span></div>
            <div className="card-body">
              {activeTab === 'rfq' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Company Name</label>
                    <input type="text" className="form-input" placeholder="Your company name" value={companyInfo.name} onChange={e => setCompanyInfo({ ...companyInfo, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Products</label>
                    {rfqProducts.map((p, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input type="text" className="form-input" placeholder="Product name" value={p.name} onChange={e => updateRfqProduct(idx, 'name', e.target.value)} style={{ flex: 2 }} />
                        <input type="text" className="form-input" placeholder="Qty" value={p.quantity} onChange={e => updateRfqProduct(idx, 'quantity', e.target.value)} style={{ flex: 1 }} />
                        {rfqProducts.length > 1 && <button className="icon-btn" onClick={() => removeRfqProduct(idx)}><X size={16} /></button>}
                      </div>
                    ))}
                    <button className="btn btn-ghost" onClick={addRfqProduct}><Plus size={16} /> Add Product</button>
                  </div>
                  <button className="btn btn-primary" onClick={handleGenerateRFQ} disabled={isLoading}><Sparkles size={16} /> Generate RFQ</button>
                </>
              )}

              {activeTab === 'translator' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Text to Translate</label>
                    <textarea className="form-input" rows={6} placeholder="Enter text..." value={translateInput} onChange={e => setTranslateInput(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Target Language</label>
                    <select className="form-select" value={targetLang} onChange={e => setTargetLang(e.target.value)}>
                      <option value="en">English</option>
                      <option value="zh">Chinese</option>
                      <option value="he">Hebrew</option>
                    </select>
                  </div>
                  <button className="btn btn-primary" onClick={handleTranslate} disabled={isLoading}><Languages size={16} /> Translate</button>
                </>
              )}

              {activeTab === 'negotiator' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Current Price</label>
                      <input type="text" className="form-input" placeholder="$2.50" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Target Price</label>
                      <input type="text" className="form-input" placeholder="$2.20" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Context (Optional)</label>
                    <textarea className="form-input" rows={3} placeholder="e.g., Long-term partnership, large order..." value={negotiateContext} onChange={e => setNegotiateContext(e.target.value)} />
                  </div>
                  <button className="btn btn-primary" onClick={handleNegotiate} disabled={isLoading}><Send size={16} /> Generate Message</button>
                </>
              )}

              {activeTab === 'contract' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Contract Text</label>
                    <textarea className="form-input" rows={10} placeholder="Paste contract or agreement text here..." value={contractText} onChange={e => setContractText(e.target.value)} />
                  </div>
                  <button className="btn btn-primary" onClick={handleAnalyzeContract} disabled={isLoading}><FileSearch size={16} /> Analyze Contract</button>
                </>
              )}

              {activeTab === 'currency' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Amount</label>
                    <input type="number" className="form-input" placeholder="1000" value={currencyAmount} onChange={e => setCurrencyAmount(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">From</label>
                      <select className="form-select" value={fromCurrency} onChange={e => setFromCurrency(e.target.value)}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">To</label>
                      <select className="form-select" value={toCurrency} onChange={e => setToCurrency(e.target.value)}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary" onClick={handleConvertCurrency}><DollarSign size={16} /> Convert</button>
                  {convertedAmount && (
                    <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '12px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{currencyAmount} {fromCurrency} =</div>
                      <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>{convertedAmount.amount.toFixed(2)} {toCurrency}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>Rate: 1 {fromCurrency} = {convertedAmount.rate.toFixed(4)} {toCurrency}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Output Panel */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Output</span>
              {result && (
                <button className="btn btn-ghost" onClick={handleCopy}>
                  {copied ? <Check size={16} color="var(--accent)" /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              )}
            </div>
            <div className="card-body">
              {activeTab !== 'currency' && (
                <AIResponse text={result} isLoading={isLoading} title="" showCopy={false} />
              )}
              {!result && !isLoading && activeTab !== 'currency' && (
                <div className="empty-state" style={{ padding: '40px' }}>
                  <Sparkles size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                  <p>AI response will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIHelpers;
