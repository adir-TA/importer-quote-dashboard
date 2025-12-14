import { useState, useEffect, useCallback, useRef } from 'react';

export function useTypewriter(text, speed = 10, enabled = true) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const indexRef = useRef(0);
  const timeoutRef = useRef(null);

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    indexRef.current = 0;
    setDisplayedText('');
    setIsTyping(false);
    setIsComplete(false);
  }, []);

  const skipToEnd = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setDisplayedText(text);
    setIsTyping(false);
    setIsComplete(true);
    indexRef.current = text.length;
  }, [text]);

  useEffect(() => {
    if (!enabled || !text) {
      setDisplayedText(text || '');
      setIsComplete(true);
      return;
    }

    reset();
    setIsTyping(true);

    const typeChar = () => {
      if (indexRef.current < text.length) {
        setDisplayedText(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
        timeoutRef.current = setTimeout(typeChar, speed);
      } else {
        setIsTyping(false);
        setIsComplete(true);
      }
    };

    timeoutRef.current = setTimeout(typeChar, speed);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [text, speed, enabled, reset]);

  return {
    displayedText,
    isTyping,
    isComplete,
    reset,
    skipToEnd
  };
}

export default useTypewriter;
