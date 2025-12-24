import React, { useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';

export default function BusinessCardImageUpload({ images = [], onImagesChange, maxImages = 5 }) {
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  };

  const handleFiles = (files) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const remainingSlots = maxImages - images.length;
    const filesToAdd = imageFiles.slice(0, remainingSlots);

    if (filesToAdd.length > 0) {
      onImagesChange([...images, ...filesToAdd]);
    }
  };

  const handleRemove = (index) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();

    const files = imageItems.map(item => {
      const blob = item.getAsFile();
      if (!blob) return null;

      // Create a proper File object with a name
      const extension = blob.type.split('/')[1] || 'png';
      const fileName = `pasted-image-${Date.now()}.${extension}`;
      return new File([blob], fileName, { type: blob.type });
    }).filter(Boolean);

    if (files.length > 0) {
      handleFiles(files);
    }
  };

  useEffect(() => {
    const handleDocumentPaste = (e) => {
      // Only handle paste if the modal is open and user is focused on the upload section
      if (containerRef.current && images.length < maxImages) {
        handlePaste(e);
      }
    };

    document.addEventListener('paste', handleDocumentPaste);
    return () => {
      document.removeEventListener('paste', handleDocumentPaste);
    };
  }, [images.length, maxImages]);

  return (
    <div className="business-cards-image-upload" ref={containerRef}>
      {images.length < maxImages && (
        <div
          className="business-cards-upload-area"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Upload size={24} />
          <p>Click, drag, or paste to upload</p>
          <span className="business-cards-upload-hint">
            {maxImages - images.length} slot{maxImages - images.length !== 1 ? 's' : ''} remaining
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {images.length > 0 && (
        <div className="business-cards-image-preview-grid">
          {images.map((img, idx) => (
            <div key={idx} className="business-cards-image-preview">
              <img
                src={img instanceof File ? URL.createObjectURL(img) : img.url}
                alt={`Card ${idx + 1}`}
              />
              <div className="business-cards-image-preview-overlay">
                <span className="business-cards-image-order">#{idx + 1}</span>
                <button
                  type="button"
                  className="business-cards-image-remove"
                  onClick={() => handleRemove(idx)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
