import { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';
import { collection, doc, setDoc, getDoc, onSnapshot, addDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const USERS = {
  'gizan.ezra@gmail.com': { name: 'Gizan', cls: 'gizan', short: 'GZ' },
};

const DAYS = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag'];
const DAY_SHORT = ['Ma','Di','Wo','Do','Vr'];

const SCHOOL = [
  { label: '🏫 Lauren 08:30–15:00' },
  { label: '🏫 Lauren 08:30–15:00' },
  { label: '🏫 Lauren 08:30–12:30' },
  { label: '🏫 Lauren 08:30–15:00' },
  { label: '🏫 Lauren 08:30–15:00' },
];

const CRECHE = [false, true, false, true, false];

let currentUser = null;
let currentWeekOffset = 0;
let scheduleData = {};
let swapData = [];

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userNameEl = document.getElementById('user-name');

loginBtn.addEventListener('click', () => {
  signInWithPopup(auth, provider).catch(err => alert('Inloggen mislukt: ' + err.message));
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, user => {
  if (user) {
    currentUser = user;
    loginScreen.style.display = 'none';
    appScreen.style.display = 'block';
    userNameEl.textContent = user.displayName;
    loadApp();
  } else {
    currentUser = null;
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
  }
});

function getWeekKey(offset) {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff + offset * 7);
  return monday.toISOString().split('T')[0];
}

function getWeekDates(offset) {
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(today);
  monday.setDate(diff + offset * 7);
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(d) {
  return d.getDate() + ' ' + ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()];
}

function isToday(d) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function loadApp() {
  const weekKey = getWeekKey(currentWeekOffset);
  const scheduleRef = doc(db, 'schedules', weekKey);

  onSnapshot(scheduleRef, snap => {
    scheduleData = snap.exists() ? snap.data() : {};
    renderAll();
  });

  const swapsRef = collection(db, 'swaps');
  onSnapshot(query(swapsRef, orderBy('createdAt', 'desc')), snap => {
    swapData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSwaps();
  });
}

function renderAll() {
  renderWeekLabel();
  renderGrid();
  renderSwaps();
}

function renderWeekLabel() {
  const dates = getWeekDates(currentWeekOffset);
  document.getElementById('week-label').textContent = formatDate(dates[0]) + ' – ' + formatDate(dates[4]);
}

function renderGrid() {
  const dates = getWeekDates(currentWeekOffset);
  const grid = document.getElementById('week-grid');

  let html = '<div class="grid-corner">Dag</div>';
  dates.forEach((d, i) => {
    html += `<div class="grid-header ${isToday(d) ? 'today' : ''}">
      <div class="day-name">${DAY_SHORT[i]}</div>
      <div class="day-date">${formatDate(d)}</div>
    </div>`;
  });

  html += '<div class="row-label">Ochtend</div>';
  dates.forEach((d, i) => {
    html += `<div class="day-cell">
      <span class="school-badge">${SCHOOL[i].label}</span>
      ${CRECHE[i] ? '<span class="creche-badge">🧸 Sarah 09:00–17:00</span>' : ''}
    </div>`;
  });

  html += '<div class="row-label">Middag</div>';
  dates.forEach((d, i) => {
    const key = 'day_' + i;
    const entry = scheduleData[key];
    const userInfo = entry ? getUserInfo(entry.email) : null;
    html += `<div class="day-cell middag">
      ${entry ? `
        <div class="oppas-block ${userInfo.cls}" onclick="openEdit(${i})">
          <div class="oppas-name">${userInfo.name}</div>
          <div class="oppas-time">${entry.time || '15:00–18:00'}</div>
        </div>` : `
        <div class="oppas-block open" onclick="openAdd(${i})">
          <div class="oppas-name">Onbezet</div>
          <div class="oppas-time">klik om in te vullen</div>
        </div>`
      }
    </div>`;
  });

  grid.innerHTML = html;
}

function getUserInfo(email) {
  return USERS[email] || { name: email.split('@')[0], cls: 'gizan', short: '??' };
}

function renderSwaps() {
  const list = document.getElementById('swap-list');
  if (!swapData.length) {
    list.innerHTML = '<div class="empty-swaps">Geen ruilverzoeken.</div>';
    return;
  }
  list.innerHTML = swapData.map(s => `
    <div class="swap-row">
      <div class="swap-info">
        <div class="swap-from">${s.fromName} wil ruilen: ${s.fromDay} ↔ ${s.toName} ${s.toDay}</div>
        <div class="swap-note">${s.note || ''}</div>
      </div>
      <span class="swap-status ${s.status === 'pending' ? 'status-pending' : 'status-accepted'}">
        ${s.status === 'pending' ? 'In afwachting' : 'Geaccepteerd'}
      </span>
      ${s.status === 'pending' && s.toEmail === currentUser.email ? `
        <button class="swap-accept" onclick="acceptSwap('${s.id}')">Accepteren</button>` : ''}
    </div>`).join('');
}

window.openAdd = function(dayIndex) {
  showModal(`
    <div class="modal-title">Oppas instellen – ${DAYS[dayIndex]}</div>
    <div class="modal-row">
      <label class="modal-label">Wie doet oppas?</label>
      <select class="modal-select" id="m-user">
        ${Object.entries(USERS).map(([email, u]) =>
          `<option value="${email}" ${email === currentUser.email ? 'selected' : ''}>${u.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="modal-row">
      <label class="modal-label">Tijdstip</label>
      <input class="modal-input" id="m-time" value="15:00–18:00" />
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Annuleren</button>
      <button class="btn-primary" onclick="saveDay(${dayIndex})">Opslaan</button>
    </div>`);
};

window.openEdit = function(dayIndex) {
  const entry = scheduleData['day_' + dayIndex];
  showModal(`
    <div class="modal-title">Bewerk – ${DAYS[dayIndex]}</div>
    <div class="modal-row">
      <label class="modal-label">Wie doet oppas?</label>
      <select class="modal-select" id="m-user">
        ${Object.entries(USERS).map(([email, u]) =>
          `<option value="${email}" ${entry?.email === email ? 'selected' : ''}>${u.name}</option>`
        ).join('')}
      </select>
    </div>
    <div class="modal-row">
      <label class="modal-label">Tijdstip</label>
      <input class="modal-input" id="m-time" value="${entry?.time || '15:00–18:00'}" />
    </div>
    <div class="modal-actions">
      <button class="btn-danger" onclick="deleteDay(${dayIndex})">Verwijderen</button>
      <button class="btn-secondary" onclick="closeModal()">Annuleren</button>
      <button class="btn-primary" onclick="saveDay(${dayIndex})">Opslaan</button>
    </div>`);
};

window.saveDay = async function(dayIndex) {
  const email = document.getElementById('m-user').value;
  const time = document.getElementById('m-time').value;
  const weekKey = getWeekKey(currentWeekOffset);
  const ref = doc(db, 'schedules', weekKey);
  await setDoc(ref, { ['day_' + dayIndex]: { email, time } }, { merge: true });
  closeModal();
};

window.deleteDay = async function(dayIndex) {
  const weekKey = getWeekKey(currentWeekOffset);
  const ref = doc(db, 'schedules', weekKey);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    delete data['day_' + dayIndex];
    await setDoc(ref, data);
  }
  closeModal();
};

window.openSwapModal = function() {
  showModal(`
    <div class="modal-title">Ruil aanvragen</div>
    <div class="modal-row">
      <label class="modal-label">Mijn dag</label>
      <select class="modal-select" id="m-myday">
        ${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}
      </select>
    </div>
    <div class="modal-row">
      <label class="modal-label">Ruilen met</label>
      <select class="modal-select" id="m-other">
        ${Object.entries(USERS).filter(([e]) => e !== currentUser.email)
          .map(([email, u]) => `<option value="${email}">${u.name}</option>`).join('')}
      </select>
    </div>
    <div class="modal-row">
      <label class="modal-label">Hun dag</label>
      <select class="modal-select" id="m-theirday">
        ${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}
      </select>
    </div>
    <div class="modal-row">
      <label class="modal-label">Bericht (optioneel)</label>
      <input class="modal-input" id="m-note" placeholder="bijv. Ik moet die dag werken" />
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Annuleren</button>
      <button class="btn-primary" onclick="sendSwap()">Verstuur</button>
    </div>`);
};

window.sendSwap = async function() {
  const myDayIndex = document.getElementById('m-myday').value;
  const otherEmail = document.getElementById('m-other').value;
  const theirDayIndex = document.getElementById('m-theirday').value;
  const note = document.getElementById('m-note').value;
  await addDoc(collection(db, 'swaps'), {
    fromEmail: currentUser.email,
    fromName: currentUser.displayName,
    fromDay: DAYS[myDayIndex],
    toEmail: otherEmail,
    toName: getUserInfo(otherEmail).name,
    toDay: DAYS[theirDayIndex],
    note,
    status: 'pending',
    createdAt: new Date()
  });
  closeModal();
};

window.acceptSwap = async function(id) {
  await updateDoc(doc(db, 'swaps', id), { status: 'accepted' });
};

function showModal(content) {
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal-overlay').style.display = 'flex';
}

window.closeModal = function() {
  document.getElementById('modal-overlay').style.display = 'none';
};

document.getElementById('prev-week').addEventListener('click', () => {
  currentWeekOffset--;
  loadApp();
});

document.getElementById('next-week').addEventListener('click', () => {
  currentWeekOffset++;
  loadApp();
});
