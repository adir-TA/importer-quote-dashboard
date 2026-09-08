import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTypewriter } from '../hooks/useTypewriter';
import { Sparkles, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../utils/helpers';

function AIResponse({ text, isLoading = false, title = 'AI Analysis', showCopy = true }) {
  const { displayedText, isTyping, isComplete } = useTypewriter(text, 8, !isLoading);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="ai-summary">
        <div className="ai-summary-header">
          <Sparkles size={20} />
          {title}
        </div>
        <div className="ai-summary-text">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="spinner" style={{ width: 20, height: 20 }} />
            <span style={{ color: 'var(--text-muted)' }}>Analyzing...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!text) {
    return null;
  }

  return (
    <div className="ai-summary">
      <div className="ai-summary-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={20} />
          {title}
        </div>
        {showCopy && isComplete && (
          <button
            className="icon-btn"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <Check size={16} color="var(--accent)" /> : <Copy size={16} />}
          </button>
        )}
      </div>
      <div className="ai-summary-text">
        <ReactMarkdown
          components={{
            h1: ({node, ...props}) => <h3 style={{ color: 'var(--accent)', marginTop: '16px' }} {...props} />,
            h2: ({node, ...props}) => <h3 style={{ color: 'var(--accent)', marginTop: '16px' }} {...props} />,
            h3: ({node, ...props}) => <h3 style={{ color: 'var(--accent)', marginTop: '16px' }} {...props} />,
            strong: ({node, ...props}) => <strong style={{ color: 'var(--text-primary)' }} {...props} />,
            ul: ({node, ...props}) => <ul style={{ marginInlineStart: '20px', marginBottom: '12px' }} {...props} />,
            ol: ({node, ...props}) => <ol style={{ marginInlineStart: '20px', marginBottom: '12px' }} {...props} />,
            li: ({node, ...props}) => <li style={{ marginBottom: '4px' }} {...props} />,
            p: ({node, ...props}) => <p style={{ marginBottom: '12px' }} {...props} />,
            code: ({node, inline, ...props}) => 
              inline 
                ? <code style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 'var(--radius-xs)' }} {...props} />
                : <pre style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', overflow: 'auto' }}><code {...props} /></pre>
          }}
        >
          {displayedText}
        </ReactMarkdown>
        {isTyping && <span className="typewriter-cursor" />}
      </div>
    </div>
  );
}

export default AIResponse;
