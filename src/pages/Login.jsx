import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import logo from '../assets/logo.jpg';

function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { t } = useLanguage();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      // Handle specific Supabase auth errors
      const message = err.message || '';
      if (message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (message.includes('Email not confirmed')) {
        setError('Please verify your email address before signing in. Check your inbox.');
      } else if (message.includes('rate limit')) {
        setError('Too many login attempts. Please wait a few minutes and try again.');
      } else {
        setError('Failed to sign in. Please check your credentials.');
      }
    }
    
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <img src={logo} alt="HA Products" className="auth-logo-img" />
            <div className="sidebar-brand">
              <span className="sidebar-brand-name">HA Products</span>
              <span className="sidebar-brand-tagline">{t('login.importSmarter')}</span>
            </div>
          </div>
          <h1>{t('login.welcomeBack')}</h1>
          <p>{t('login.signInToContinue')}</p>
        </div>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">{t('login.email')}</label>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon" />
              <input
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('login.password')}</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary auth-btn" disabled={loading}>
            {loading ? <div className="spinner-small" /> : <LogIn size={18} />}
            {loading ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>

        <div className="auth-footer">
          {t('login.noAccount')} <Link to="/signup">{t('login.signUp')}</Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
