import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Mail, Lock, UserPlus, AlertCircle, CheckCircle, Check, X } from 'lucide-react';
import logo from '../assets/logo.jpg';

// Password requirements - labels are translation keys
const PASSWORD_REQUIREMENTS = [
  { id: 'length', labelKey: 'signup.atLeast8', test: (pw) => pw.length >= 8 },
  { id: 'uppercase', labelKey: 'signup.oneUppercase', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lowercase', labelKey: 'signup.oneLowercase', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', labelKey: 'signup.oneNumber', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', labelKey: 'signup.oneSpecial', test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
];

function Signup() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const { t } = useLanguage();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);

  // Check password strength
  const passwordChecks = useMemo(() => {
    return PASSWORD_REQUIREMENTS.map(req => ({
      ...req,
      label: t(req.labelKey),
      passed: req.test(password),
    }));
  }, [password, t]);

  const passwordStrength = useMemo(() => {
    const passed = passwordChecks.filter(c => c.passed).length;
    if (passed === 0) return { level: 0, label: '', color: '' };
    if (passed <= 2) return { level: 1, label: t('signup.weak'), color: '#ef4444' };
    if (passed <= 3) return { level: 2, label: t('signup.fair'), color: '#f59e0b' };
    if (passed <= 4) return { level: 3, label: t('signup.good'), color: '#3b82f6' };
    return { level: 4, label: t('signup.strong'), color: '#22c55e' };
  }, [passwordChecks]);

  const allRequirementsMet = passwordChecks.every(c => c.passed);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate email format
    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    // Check all password requirements
    if (!allRequirementsMet) {
      setError('Please meet all password requirements');
      return;
    }

    // Check passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await signUp(email, password);
      setSuccess(true);
    } catch (err) {
      // Handle specific Supabase errors
      if (err.message.includes('already registered')) {
        setError('This email is already registered. Try signing in instead.');
      } else if (err.message.includes('rate limit')) {
        setError('Too many attempts. Please wait a few minutes and try again.');
      } else {
        setError(err.message || 'Failed to create account. Please try again.');
      }
    }
    
    setLoading(false);
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-success-icon">
              <CheckCircle size={48} />
            </div>
            <h1>{t('signup.checkEmail')}</h1>
            <p>{t('signup.sentConfirmation')} <strong>{email}</strong></p>
            <p style={{ marginTop: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {t('signup.clickLink')}
            </p>
            <p style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('signup.didntReceive')}
            </p>
          </div>
          <Link to="/login" className="btn btn-primary auth-btn" style={{ marginTop: '24px', textDecoration: 'none' }}>
            {t('signup.backToSignIn')}
          </Link>
        </div>
      </div>
    );
  }

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
          <h1>{t('signup.createAccount')}</h1>
          <p>{t('signup.startManaging')}</p>
        </div>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">{t('signup.email')}</label>
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
            <label className="form-label">{t('signup.password')}</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setShowRequirements(true)}
                autoComplete="new-password"
                required
              />
            </div>
            
            {/* Password Strength Indicator */}
            {password.length > 0 && (
              <div className="password-strength">
                <div className="strength-bars">
                  {[1, 2, 3, 4].map(level => (
                    <div
                      key={level}
                      className="strength-bar"
                      style={{
                        background: passwordStrength.level >= level ? passwordStrength.color : 'var(--border)',
                      }}
                    />
                  ))}
                </div>
                {passwordStrength.label && (
                  <span className="strength-label" style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                )}
              </div>
            )}

            {/* Password Requirements */}
            {showRequirements && (
              <div className="password-requirements">
                {passwordChecks.map(req => (
                  <div
                    key={req.id}
                    className={`requirement ${req.passed ? 'passed' : ''}`}
                  >
                    {req.passed ? (
                      <Check size={14} className="req-icon passed" />
                    ) : (
                      <X size={14} className="req-icon" />
                    )}
                    <span>{req.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">{t('signup.confirmPassword')}</label>
            <div className="input-with-icon">
              <Lock size={18} className="input-icon" />
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="field-error">{t('signup.passwordsDontMatch')}</p>
            )}
            {confirmPassword && password === confirmPassword && password.length > 0 && (
              <p className="field-success">{t('signup.passwordsMatch')} ✓</p>
            )}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary auth-btn" 
            disabled={loading || !allRequirementsMet || password !== confirmPassword}
          >
            {loading ? <div className="spinner-small" /> : <UserPlus size={18} />}
            {loading ? t('signup.creatingAccount') : t('signup.createAccountBtn')}
          </button>
        </form>

        <div className="auth-footer">
          {t('signup.alreadyHave')} <Link to="/login">{t('signup.signIn')}</Link>
        </div>

        <p className="auth-privacy">
          {t('signup.termsPrivacy')}
        </p>
      </div>
    </div>
  );
}

export default Signup;
