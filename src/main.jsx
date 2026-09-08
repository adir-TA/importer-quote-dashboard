import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ModalProvider } from './context/ModalContext';
import { LanguageProvider } from './context/LanguageContext';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { setAccessTokenProvider } from './utils/apiHelpers';
import { supabase } from './lib/supabase';
import './styles/globals.css';
import './styles/sidebar.css';
import './styles/modal.css';
import './styles/auth.css';

// Teach apiHelpers how to fetch the current access token. Doing it here keeps
// apiHelpers importable from Node tests without pulling in the browser client.
setAccessTokenProvider(async () => {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token || null;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <LanguageProvider>
          <AuthProvider>
            <AppProvider>
              <ModalProvider>
                <App />
              </ModalProvider>
            </AppProvider>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
