/* eslint-disable react-refresh/only-export-components */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
  type UserCredential,
  type Unsubscribe,
} from "firebase/auth";

const FIREBASE_PROJECT_ID = "prode-mundial-41d13";

type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
};

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("email");
googleProvider.addScope("profile");
googleProvider.setCustomParameters({
  prompt: "select_account",
});

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

function buildFirebaseConfig(): FirebaseWebConfig {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  if (!apiKey || !appId) {
    throw new Error(
      "Falta configurar Firebase. Defini VITE_FIREBASE_API_KEY y VITE_FIREBASE_APP_ID.",
    );
  }

  return {
    apiKey,
    appId,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? FIREBASE_PROJECT_ID,
    authDomain:
      import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
      `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
    storageBucket:
      import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
      `${FIREBASE_PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

export function isGoogleLoginConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_APP_ID,
  );
}

export function getFirebaseAppInstance(): FirebaseApp {
  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp =
    getApps().length > 0 ? getApp() : initializeApp(buildFirebaseConfig());

  return firebaseApp;
}

export function getFirebaseAuthInstance(): Auth {
  if (firebaseAuth) {
    return firebaseAuth;
  }

  firebaseAuth = getAuth(getFirebaseAppInstance());

  return firebaseAuth;
}

export async function signInWithGoogle(): Promise<UserCredential> {
  const auth = getFirebaseAuthInstance();

  await setPersistence(auth, browserLocalPersistence);

  return signInWithPopup(auth, googleProvider);
}

export async function signOutFromGoogle(): Promise<void> {
  await signOut(getFirebaseAuthInstance());
}

export function onGoogleAuthStateChanged(
  callback: (user: User | null) => void,
): Unsubscribe {
  return onAuthStateChanged(getFirebaseAuthInstance(), callback);
}

export function getCurrentGoogleUser(): User | null {
  return getFirebaseAuthInstance().currentUser;
}

export { FIREBASE_PROJECT_ID };
