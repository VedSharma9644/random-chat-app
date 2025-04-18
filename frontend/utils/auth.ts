import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, signInWithPopup, GoogleAuthProvider, signInWithRedirect } from "firebase/auth";

// Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDDmo10etCeaTndjOB4ir2F_rYzzXyei-A",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "random-chat-app-250b6.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "random-chat-app-250b6",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "random-chat-app-250b6.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "467390475273",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:467390475273:web:321d51f0fe115fa7f75cd8",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-PHLPPDX8FD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Track whether a popup is already open
let popupOpen = false;

// Function for Google Sign-In
export const signInWithGoogle = async () => {
  if (popupOpen) return; // Prevent multiple popups
  popupOpen = true;

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error: any) {
    if (error.code === "auth/cancelled-popup-request") {
      console.warn("Popup was closed or another popup was already open.");
    } else {
      console.error("Error signing in with Google:", error);
    }
    throw error;
  } finally {
    popupOpen = false; // Reset after attempt
  }
};

// Export Firebase instances
export { auth, provider, analytics };
export default app;
