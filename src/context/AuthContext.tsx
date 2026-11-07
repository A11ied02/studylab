import React, { createContext, useContext, useEffect, useState } from 'react';
import { GoogleAuthProvider, User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { firebaseAuth, isFirebaseConfigured } from '../services/firebaseClient';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firebaseAuth) {
      setLoading(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    }, () => {
      setUser(null);
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = async () => {
    if (!firebaseAuth || !isFirebaseConfigured) {
      throw new Error('Firebase is not configured. Copy src/services/.firebase-template to src/services/firebase.ts and add your Firebase web app config, or set the VITE_FIREBASE_* values in .env.local.');
    }
    await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
  };

  const signOutUser = async () => {
    if (firebaseAuth) await signOut(firebaseAuth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, configured: isFirebaseConfigured, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

