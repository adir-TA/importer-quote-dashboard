import React, { useState, useRef } from 'react';
import { Upload, Camera, Sparkles, Check, AlertCircle, Loader, FileText, Plus, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

function QuoteCapture() {
  const { state, actions } = useAppContext();
  const { products, suppliers, settings } = state;
  const fileInputRef = useRef(null);
  
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Form state for editing extracted data
  const [selectedProduct, setSelectedProduct] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [fields, setFields] = useState([]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    
    setImage(file);
    setError('');
    setExtractedData(null);
    setSuccess(false);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setImage(file);
      setError('');
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  const extractQuoteData = async () => {
    if (!image) return;
    
    const apiKey = settings.apiKey;
    if (!apiKey) {
      setError('Please add your OpenAI API key in Settings to use AI extraction');
      return;
    }

    setExtracting(true);
    setError('');

    try {
      // Convert image to base64
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(image);
      });

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a quote data extractor. Extract supplier quote information from images.
              Return ONLY valid JSON in this exact format:
              {
                "supplierName": "company name",
                "fields": [
                  {"name": "Unit Price", "value": "$X.XX"},
                  {"name": "MOQ", "value": "1000 pcs"},
                  {"name": "Lead Time", "value": "X days"},
                  {"name": "Payment Terms", "value": "..."},
                  {"name": "Shipping", "value": "FOB/CIF location"}
                ],
                "productDescription": "brief product description if visible",
                "notes": "any other relevant info"
              }
              Extract all pricing, quantity, timing, and terms information you can find.
              If a field is not visible, omit it from the array.`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Extract all quote data from this image:' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }
              ]
            }
          ],
          max_tokens: 1000,
        }),
      });

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      const content = data.choices[0]?.message?.content;
      
      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse extracted data');
      }
      
      const extracted = JSON.parse(jsonMatch[0]);
      setExtractedData(extracted);
      setSupplierName(extracted.supplierName || '');
      setFields(extracted.fields || []);
      
    } catch (err) {
      console.error('Extraction error:', err);
      setError(err.message || 'Failed to extract quote data');
    }
    
    setExtracting(false);
  };

  const addField = () => {
    setFields([...fields, { name: '', value: '' }]);
  };

  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const updateField = (index, key, value) => {
    setFields(fields.map((f, i) => i === index ? { ...f, [key]: value } : f));
  };

  const saveQuote = async () => {
    if (!selectedProduct) {
      setError('Please select a product');
      return;
    }
    if (!supplierName.trim()) {
      setError('Please enter supplier name');
      return;
    }

    // Convert fields array to object
    const fieldsObj = {};
    fields.forEach(f => {
      if (f.name.trim()) {
        fieldsObj[f.name] = f.value;
      }
    });

    // Check if supplier exists or create new
    let supplierId = null;
    const existingSupplier = suppliers.find(s => 
      s.company.toLowerCase() === supplierName.toLowerCase()
    );
    
    if (existingSupplier) {
      supplierId = existingSupplier.id;
    } else {
      // Create new supplier
      const newSupplier = await actions.addSupplier({
        company: supplierName,
        status: 'active',
      });
      supplierId = newSupplier?.id;
    }

    // Create quote
    await actions.addQuote({
      productId: selectedProduct,
      supplierId,
      supplierName,
      fields: fieldsObj,
      tags: [],
      notes: extractedData?.notes || '',
    });

    setSuccess(true);
    
    // Reset form after delay
    setTimeout(() => {
      setImage(null);
      setImagePreview(null);
      setExtractedData(null);
      setSelectedProduct('');
      setSupplierName('');
      setFields([]);
      setSuccess(false);
    }, 2000);
  };

  const resetForm = () => {
    setImage(null);
    setImagePreview(null);
    setExtractedData(null);
    setSelectedProduct('');
    setSupplierName('');
    setFields([]);
    setError('');
    setSuccess(false);
  };

  return (
    <div className="page">
      <div className="header">
        <div>
          <h2>Quote Capture</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Upload a screenshot and AI will extract the quote data
          </p>
        </div>
      </div>

      <div className="content">
        {success ? (
          <div className="capture-success">
            <div className="success-icon">
              <Check size={48} />
            </div>
            <h3>Quote Saved!</h3>
            <p>The quote has been added to your product</p>
          </div>
        ) : (
          <div className="capture-layout">
            {/* Upload Area */}
            <div className="capture-upload-section">
              <div 
                className={`upload-zone ${imagePreview ? 'has-image' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => !imagePreview && fileInputRef.current?.click()}
              >
                {imagePreview ? (
                  <div className="image-preview-container">
                    <img src={imagePreview} alt="Quote screenshot" className="image-preview" />
                    <button className="remove-image-btn" onClick={(e) => { e.stopPropagation(); resetForm(); }}>
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <div className="upload-icon">
                      <Camera size={48} />
                    </div>
                    <h3>Drop quote screenshot here</h3>
                    <p>or click to browse</p>
                    <p className="upload-hint">Supports PNG, JPG, WEBP</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              {imagePreview && !extractedData && (
                <button 
                  className="btn btn-primary extract-btn"
                  onClick={extractQuoteData}
                  disabled={extracting}
                >
                  {extracting ? (
                    <>
                      <Loader size={18} className="spinner" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Extract Quote Data
                    </>
                  )}
                </button>
              )}

              {error && (
                <div className="capture-error">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}
            </div>

            {/* Extracted Data Form */}
            {extractedData && (
              <div className="capture-form-section">
                <div className="card">
                  <div className="card-header">
                    <span className="card-title"><FileText size={18} /> Extracted Data</span>
                    <span className="extracted-badge">
                      <Sparkles size={14} /> AI Extracted
                    </span>
                  </div>
                  <div className="card-body">
                    <div className="form-group">
                      <label className="form-label">Product *</label>
                      <select 
                        className="form-select"
                        value={selectedProduct}
                        onChange={(e) => setSelectedProduct(e.target.value)}
                      >
                        <option value="">Select a product...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Supplier Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        placeholder="Company name"
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Quote Fields</label>
                      <div className="extracted-fields">
                        {fields.map((field, idx) => (
                          <div key={idx} className="field-row">
                            <input
                              type="text"
                              className="form-input"
                              value={field.name}
                              onChange={(e) => updateField(idx, 'name', e.target.value)}
                              placeholder="Field name"
                            />
                            <input
                              type="text"
                              className="form-input"
                              value={field.value}
                              onChange={(e) => updateField(idx, 'value', e.target.value)}
                              placeholder="Value"
                            />
                            <button className="icon-btn" onClick={() => removeField(idx)}>
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                        <button className="btn btn-ghost" onClick={addField}>
                          <Plus size={16} /> Add Field
                        </button>
                      </div>
                    </div>

                    {extractedData.productDescription && (
                      <div className="extracted-note">
                        <strong>Detected:</strong> {extractedData.productDescription}
                      </div>
                    )}

                    <div className="form-actions">
                      <button className="btn btn-secondary" onClick={resetForm}>
                        Cancel
                      </button>
                      <button className="btn btn-primary" onClick={saveQuote}>
                        <Check size={16} /> Save Quote
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuoteCapture;
