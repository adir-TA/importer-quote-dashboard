import React, { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, UserPlus, AlertCircle, CheckCircle, Check, X } from 'lucide-react';

// Password requirements
const PASSWORD_REQUIREMENTS = [
  { id: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'lowercase', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { id: 'number', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (pw) => /[!@#$%^&*(),.?":{}|<>]/.test(pw) },
];

function Signup() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  
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
      passed: req.test(password),
    }));
  }, [password]);

  const passwordStrength = useMemo(() => {
    const passed = passwordChecks.filter(c => c.passed).length;
    if (passed === 0) return { level: 0, label: '', color: '' };
    if (passed <= 2) return { level: 1, label: 'Weak', color: '#ef4444' };
    if (passed <= 3) return { level: 2, label: 'Fair', color: '#f59e0b' };
    if (passed <= 4) return { level: 3, label: 'Good', color: '#3b82f6' };
    return { level: 4, label: 'Strong', color: '#22c55e' };
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
            <h1>Check your email</h1>
            <p>We've sent a confirmation link to <strong>{email}</strong></p>
            <p style={{ marginTop: '12px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Click the link in the email to activate your account, then come back here to sign in.
            </p>
            <p style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Didn't receive it? Check your spam folder or wait a minute and try again.
            </p>
          </div>
          <Link to="/login" className="btn btn-primary auth-btn" style={{ marginTop: '24px', textDecoration: 'none' }}>
            Back to Sign In
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
            <div className="auth-logo-icon">📦</div>
            <div className="sidebar-brand">
              <span className="sidebar-brand-name">HA Tools</span>
              <span className="sidebar-brand-tagline">Import Smarter</span>
            </div>
          </div>
          <h1>Create an account</h1>
          <p>Start managing your import quotes today</p>
        </div>

        {error && (
          <div className="auth-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Email</label>
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
            <label className="form-label">Password</label>
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
            <label className="form-label">Confirm Password</label>
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
              <p className="field-error">Passwords do not match</p>
            )}
            {confirmPassword && password === confirmPassword && password.length > 0 && (
              <p className="field-success">Passwords match ✓</p>
            )}
          </div>

          <button 
            type="submit" 
            className="btn btn-primary auth-btn" 
            disabled={loading || !allRequirementsMet || password !== confirmPassword}
          >
            {loading ? <div className="spinner-small" /> : <UserPlus size={18} />}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>

        <p className="auth-privacy">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

export default Signup;
