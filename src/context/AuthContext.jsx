import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;

        if (error) throw error;
        setUser(data?.session?.user ?? null);
        setAuthError(null);
      } catch (error) {
        // Previously this promise had no rejection handler, so a network blip
        // left `loading` true forever and the app stuck on the spinner.
        if (cancelled) return;
        console.error('[AuthContext] Failed to restore session:', error);
        setUser(null);
        setAuthError(error.message || 'Could not reach the authentication service');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      // Compare by id: Supabase hands back a fresh user object on every token
      // refresh, which otherwise re-triggered a full data reload every hour.
      setUser(prev => (prev?.id === session?.user?.id ? prev : session?.user ?? null));
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    return data;
  };

  const value = useMemo(
    () => ({ user, loading, authError, signUp, signIn, signOut, resetPassword }),
    [user, loading, authError]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
