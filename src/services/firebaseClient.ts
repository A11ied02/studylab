import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

type PrivateFirebaseModule = { firebaseConfig?: FirebaseOptions };

// A local src/services/firebase.ts is ignored by Git and may provide the Firebase web config.
const privateFirebaseModules = import.meta.glob<PrivateFirebaseModule>('./firebase.ts', { eager: true });
const privateFirebaseConfig = Object.values(privateFirebaseModules)[0]?.firebaseConfig;
const environmentFirebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasRequiredConfig = (config?: FirebaseOptions): boolean => Boolean(
  config?.apiKey && config.authDomain && config.projectId && config.appId,
);

const firebaseConfig = hasRequiredConfig(privateFirebaseConfig)
  ? privateFirebaseConfig as FirebaseOptions
  : environmentFirebaseConfig;

export const isFirebaseConfigured = hasRequiredConfig(firebaseConfig);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

if (isFirebaseConfigured) {
  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app);
}

export const firebaseAuth = auth;
export const firebaseDb = firestore;

