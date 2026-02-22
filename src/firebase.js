// ═══════════════════════════════════════════════════════════════════════
//  FIREBASE CONFIGURATION
//  Sempre Semper — Staatsopernchor Dresden
// ═══════════════════════════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA2PpILD3yv7ibZab3Hvbk4rJJC_YglYGk",
  authDomain: "sempre-semper-1e528.firebaseapp.com",
  projectId: "sempre-semper-1e528",
  storageBucket: "sempre-semper-1e528.firebasestorage.app",
  messagingSenderId: "920074308813",
  appId: "1:920074308813:web:0f2f72f07f74f8dc5fad84",
};

const app      = initializeApp(firebaseConfig);
export const db       = getFirestore(app);
export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
