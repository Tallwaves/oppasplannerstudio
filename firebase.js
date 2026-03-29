import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAWlN6WPF077B3GUeCVBBwUT6PNnz4RA3Y",
  authDomain: "oppasplannerstudio.firebaseapp.com",
  projectId: "oppasplannerstudio",
  storageBucket: "oppasplannerstudio.firebasestorage.app",
  messagingSenderId: "653916685021",
  appId: "1:653916685021:web:1eea486c660d6825ea1134"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
export { signInWithPopup, signOut, onAuthStateChanged };
