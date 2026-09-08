import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import translations from '../i18n/translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  // localStorage access throws outright in some privacy modes. An unguarded
  // read here white-screened the entire app before it rendered anything.
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('ha-tools-language') || 'en';
    } catch {
      return 'en';
    }
  });

  const isRTL = language === 'he';

  // Apply RTL direction to document
  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    try {
      localStorage.setItem('ha-tools-language', language);
    } catch {
      // Persisting the preference is best-effort
    }
  }, [language, isRTL]);

  const toggleLanguage = useCallback(() => {
    setLanguage(prev => prev === 'en' ? 'he' : 'en');
  }, []);

  // Translation helper: t('sidebar.dashboard') => 'Dashboard' or 'לוח בקרה'
  const t = useCallback((key) => {
    const keys = key.split('.');
    let value = translations[language];
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English
        let fallback = translations.en;
        for (const fk of keys) {
          if (fallback && typeof fallback === 'object' && fk in fallback) {
            fallback = fallback[fk];
          } else {
            return key; // Return key if not found
          }
        }
        return fallback;
      }
    }
    return value;
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, toggleLanguage, isRTL, t }),
    [language, toggleLanguage, isRTL, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
