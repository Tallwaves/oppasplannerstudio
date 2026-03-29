import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userName = document.getElementById('user-name');

loginBtn.addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(err => alert('Inloggen mislukt: ' + err.message));
});

logoutBtn.addEventListener('click', () => {
  signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = 'none';
    appScreen.style.display = 'block';
    userName.textContent = user.displayName;
    document.getElementById('main-content').innerHTML = `
      <h2 style="margin: 20px 0 8px;">Welkom, ${user.displayName}! 👋</h2>
      <p style="color:#888780;">Het rooster wordt hier geladen...</p>
    `;
  } else {
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
  }
});
