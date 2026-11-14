import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../firebase';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../constants/civicData';
import {
  createOrUpdateUserProfile,
  ensureDefaultDepartments,
  fetchUserProfile,
  syncBootstrappedAdminRole,
} from '../services/firestoreService';
import type { PortalView, UserProfile } from '../types/domain';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  authReady: boolean;
  needsRegistration: boolean;
  isBootstrappedAdmin: boolean;
  activePortal: PortalView;
  setActivePortal: (portal: PortalView) => void;
  authError: string | null;
  clearAuthError: () => void;
  retryDepartmentInit: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  completeRegistration: (data: {
    fullName: string;
    phone: string;
    ward: string;
    city: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [activePortal, setActivePortal] = useState<PortalView>('citizen');
  const [authError, setAuthError] = useState<string | null>(null);

  const isBootstrappedAdmin =
    Boolean(firebaseUser?.emailVerified) &&
    firebaseUser?.email === BOOTSTRAPPED_ADMIN_EMAIL;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);

      if (!user) {
        setProfile(null);
        setNeedsRegistration(false);
        setActivePortal('citizen');
        setAuthReady(true);
        return;
      }

      try {
        const isEmailAdmin =
          Boolean(user.emailVerified) && user.email === BOOTSTRAPPED_ADMIN_EMAIL;
        const existing = await fetchUserProfile(user.uid);
        if (!existing) {
          const initialName = (
            user.displayName ||
            user.email?.split('@')[0] ||
            'Civic User'
          )
            .trim()
            .slice(0, 100);
          const createdInitial = await createOrUpdateUserProfile({
            uid: user.uid,
            fullName: initialName,
            email: user.email || '',
            photoURL: user.photoURL || '',
            isNew: true,
            roleOverride: isEmailAdmin ? 'admin' : 'citizen',
          });
          setProfile(createdInitial);
          setNeedsRegistration(true);
          if (isEmailAdmin) {
            setActivePortal('admin');
            try {
              await ensureDefaultDepartments(user.uid);
            } catch (deptErr) {
              const msg =
                deptErr instanceof Error
                  ? deptErr.message
                  : 'Failed to initialize default departments.';
              console.error('[JANASEVA Auth] Department seeding error:', deptErr);
              setAuthError(msg);
            }
          }
        } else {
          if (isEmailAdmin && existing.role !== 'admin') {
            await syncBootstrappedAdminRole(user.uid);
            existing.role = 'admin';
          }
          setProfile(existing);
          setNeedsRegistration(false);
          if (existing.role === 'admin' || isEmailAdmin) {
            setActivePortal('admin');
            try {
              await ensureDefaultDepartments(user.uid);
            } catch (deptErr) {
              const msg =
                deptErr instanceof Error
                  ? deptErr.message
                  : 'Failed to initialize default departments.';
              console.error('[JANASEVA Auth] Department seeding error:', deptErr);
              setAuthError(msg);
            }
          } else if (existing.role === 'officer') {
            setActivePortal('officer');
          } else {
            setActivePortal('citizen');
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load civic profile.';
        console.error('[JANASEVA Auth] Profile load/creation error:', err);
        setAuthError(msg);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      console.error('[JANASEVA Auth] signInWithPopup error:', err);
      setAuthError(msg);
      throw err;
    }
  };

  const completeRegistration = async (data: {
    fullName: string;
    phone: string;
    ward: string;
    city: string;
  }) => {
    if (!firebaseUser) {
      throw new Error('Authentication session expired. Please sign in with Google again.');
    }
    setAuthError(null);
    const updated = await createOrUpdateUserProfile({
      uid: firebaseUser.uid,
      fullName: data.fullName,
      email: firebaseUser.email || '',
      phone: data.phone,
      ward: data.ward,
      city: data.city,
      photoURL: firebaseUser.photoURL || '',
      isNew: !profile,
    });
    setProfile(updated);
    setNeedsRegistration(false);
    if (updated.role === 'admin' || isBootstrappedAdmin) {
      setActivePortal('admin');
      try {
        await ensureDefaultDepartments(firebaseUser.uid);
      } catch (deptErr) {
        const msg =
          deptErr instanceof Error
            ? deptErr.message
            : 'Failed to initialize default departments.';
        console.error('[JANASEVA Auth] Department seeding after registration failed:', deptErr);
        setAuthError(msg);
      }
    } else if (updated.role === 'officer') {
      setActivePortal('officer');
    } else {
      setActivePortal('citizen');
    }
  };

  const retryDepartmentInit = async () => {
    if (!firebaseUser) return;
    setAuthError(null);
    try {
      await ensureDefaultDepartments(firebaseUser.uid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Department initialization failed.';
      console.error('[JANASEVA Auth] retryDepartmentInit failed:', err);
      setAuthError(msg);
      throw err;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        authReady,
        needsRegistration,
        isBootstrappedAdmin,
        activePortal,
        setActivePortal,
        authError,
        clearAuthError: () => setAuthError(null),
        retryDepartmentInit,
        signInWithGoogle,
        completeRegistration,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
