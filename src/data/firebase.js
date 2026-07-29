import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager
} from "firebase/firestore";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/setup#config-object
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};


// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
function createFirestore() {
  // Forzamos long-polling para evitar el error
  // "A ServiceWorker intercepted the request and encountered an unexpected error"
  // que se produce al combinar el HTTP/2 streaming nativo de Firestore
  // (canales /Write/channel) con el Service Worker generado por vite-plugin-pwa.
  // Long-polling funciona correctamente con cualquier Service Worker.
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      }),
      experimentalForceLongPolling: true
    });
  } catch (error) {
    console.warn("Firestore persistent cache unavailable, using memory cache:", error);
    try {
      return initializeFirestore(app, {
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true
      });
    } catch (fallbackError) {
      console.warn("Firestore memory cache fallback unavailable, reusing existing instance:", fallbackError);
      const fallback = getFirestore(app);
      try {
        fallback._delegate._settings = {
          ...(fallback._delegate?._settings || {}),
          experimentalForceLongPolling: true
        };
      } catch {
        // Si no se puede mutar la configuración (porque el SDK no expone
        // el flag en esta versión), simplemente devolvemos la instancia.
      }
      return fallback;
    }
  }
}

export const db = createFirestore();
