import React, { useState, useRef } from 'react';
import { Upload, File, X, Check } from 'lucide-react';

function FileUpload({
  accept = '.xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg',
  onFileSelect,
  multiple = false,
  children,
  className = ''
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFiles = (files) => {
    const file = multiple ? Array.from(files) : files[0];
    setSelectedFile(multiple ? files[0] : file);
    if (onFileSelect) {
      onFileSelect(file);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div
      className={`upload-area ${isDragging ? 'dragover' : ''} ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInput}
        style={{ display: 'none' }}
      />

      {selectedFile ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--success)'
          }}>
            <Check size={24} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <File size={16} />
            <span style={{ color: 'var(--text-primary)' }}>{selectedFile.name}</span>
            <button
              onClick={handleClear}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : children ? (
        children
      ) : (
        <>
          <div className="upload-icon">
            <Upload size={48} />
          </div>
          <p className="upload-text">Drop your file here or click to browse</p>
          <p className="upload-hint">Supports Excel, PDF, and Images</p>
        </>
      )}
    </div>
  );
}

export default FileUpload;
