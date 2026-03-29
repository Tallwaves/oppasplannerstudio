import { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';
import { collection, doc, setDoc, getDoc, onSnapshot, addDoc, updateDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const PROXY = 'https://ical-proxy.hello-cf8.workers.dev/';

const USERS = {
  'gizan.ezra@gmail.com': { name: 'Gizan', cls: 'gizan', short: 'GZ' },
  'charlottedekker90@gmail.com': { name: 'Charlotte', cls: 'charlotte', short: 'CH' },
  'poldermanp@gmail.com': { name: 'Paula', cls: 'paula', short: 'PL' },
};

const DAYS = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag'];
const DAY_SHORT = ['Ma','Di','Wo','Do','Vr'];
const MONTHS = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
const SCHOOL = [
  { label: '🏫 Lauren 08:30–15:00' },
  { label: '🏫 Lauren 08:30–15:00' },
  { label: '🏫 Lauren 08:30–12:30' },
  { label: '🏫 Lauren 08:30–15:00' },
  { label: '🏫 Lauren 08:30–15:00' },
];
const CRECHE = [false, true, false, true, false];
const VRIJ_KEYWORDS = ['vrij','vakantie','paasdag','hemelvaart','pinkster','koningsdag','bevrijding','studiedag'];

let currentUser = null;
let currentWeekOffset = 0;
let currentMonthOffset = 0;
let currentYear = new Date().getFullYear();
let view = 'week';
let scheduleCache = {};
let swapData = [];
let icalEvents = [];

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
    listenSwaps();
    loadSavedIcal();
    renderAll();
  } else {
    currentUser = null;
    loginScreen.style.display = 'flex';
    appScreen.style.display = 'none';
  }
});

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}

function getWeekDates(offset) {
  const monday = getMonday(new Date());
  monday.setDate(monday.getDate() + offset * 7);
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getWeekKey(date) {
  const m = getMonday(date);
  return m.toISOString().split('T')[0];
}

function formatDate(d) {
  return d.getDate() + ' ' + ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()];
}

function isToday(d) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
function getDayOfWeekIndex(d) { return d.getDay() === 0 ? 6 : d.getDay() - 1; }
function getUserInfo(email) {
  return USERS[email] || { name: email.split('@')[0], cls: 'gizan', short: '??' };
}

function dateToIcalStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return y + m + day;
}

function getEventsForDate(date) {
  const ds = dateToIcalStr(date);
  return icalEvents.filter(e => {
    if (!e.start) return false;
    if (e.end) return ds >= e.start && ds < e.end;
    return ds === e.start;
  });
}

function isVrijeDag(date) {
  return getEventsForDate(date).some(e =>
    VRIJ_KEYWORDS.some(k => (e.summary||'').toLowerCase().includes(k))
  );
}

function getVrijLabel(date) {
  const match = getEventsForDate(date).find(e =>
    VRIJ_KEYWORDS.some(k => (e.summary||'').toLowerCase().includes(k))
  );
  return match ? match.summary : null;
}

function getActiviteitenForDate(date) {
  return getEventsForDate(date).filter(e =>
    !VRIJ_KEYWORDS.some(k => (e.summary||'').toLowerCase().includes(k))
  );
}

async function getScheduleForWeek(weekKey) {
  if (scheduleCache[weekKey]) return scheduleCache[weekKey];
  const snap = await getDoc(doc(db, 'schedules', weekKey));
  const data = snap.exists() ? snap.data() : {};
  scheduleCache[weekKey] = data;
  return data;
}

function listenSwaps() {
  onSnapshot(query(collection(db, 'swaps'), orderBy('createdAt', 'desc')), snap => {
    swapData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSwaps();
  });
}

async function loadSavedIcal() {
  const snap = await getDoc(doc(db, 'settings', 'ical'));
  if (snap.exists() && snap.data().events) {
    icalEvents = snap.data().events;
    const urlInput = document.getElementById('ical-url');
    if (urlInput && snap.data().url) urlInput.value = snap.data().url;
    renderIcalEvents(icalEvents);
    renderAll();
  }
}

function renderAll() {
  updateNavLabel();
  if (view === 'week') renderWeekView();
  else if (view === 'month') renderMonthView();
  else renderYearView();
}

function updateNavLabel() {
  const label = document.getElementById('nav-label');
  if (view === 'week') {
    const dates = getWeekDates(currentWeekOffset);
    label.textContent = formatDate(dates[0]) + ' – ' + formatDate(dates[4]);
  } else if (view === 'month') {
    const d = new Date();
    d.setMonth(d.getMonth() + currentMonthOffset);
    label.textContent = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  } else {
    label.textContent = currentYear;
  }
}

function renderWeekView() {
  const dates = getWeekDates(currentWeekOffset);
  const weekKey = getWeekKey(dates[0]);
  const content = document.getElementById('main-content');

  onSnapshot(doc(db, 'schedules', weekKey), snap => {
    const sched = snap.exists() ? snap.data() : {};
    scheduleCache[weekKey] = sched;

    let html = '<div class="week-grid">';
    html += '<div class="grid-corner">Dag</div>';
    dates.forEach((d, i) => {
      html += `<div class="grid-header ${isToday(d) ? 'today' : ''}">
        <div class="day-name">${DAY_SHORT[i]}</div>
        <div class="day-date">${formatDate(d)}</div>
      </div>`;
    });

    html += '<div class="row-label">Ochtend</div>';
    dates.forEach((d, i) => {
      const vrij = isVrijeDag(d);
      const vrijLabel = getVrijLabel(d);
      const activiteiten = getActiviteitenForDate(d);
      html += `<div class="day-cell">
        ${vrij
          ? `<span class="vrij-badge">🎉 ${vrijLabel || 'Vrije dag'}</span>`
          : `<span class="school-badge">${SCHOOL[i].label}</span>`
        }
        ${CRECHE[i] ? '<span class="creche-badge">🧸 Sarah 09:00–17:00</span>' : ''}
        ${activiteiten.map(a => `<span class="activiteit-badge">📌 ${a.summary}</span>`).join('')}
      </div>`;
    });

    html += '<div class="row-label">Middag</div>';
    dates.forEach((d, i) => {
      const entry = sched['day_' + i];
      const u = entry ? getUserInfo(entry.email) : null;
      html += `<div class="day-cell middag">
        ${entry
          ? `<div class="oppas-block ${u.cls}" onclick="openEdit(${i})"><div class="oppas-name">${u.name}</div><div class="oppas-time">${entry.time || '15:00–18:00'}</div></div>`
          : `<div class="oppas-block open" onclick="openAdd(${i})"><div class="oppas-name">Onbezet</div><div class="oppas-time">klik om in te vullen</div></div>`
        }
      </div>`;
    });
    html += '</div>';
    content.innerHTML = html;
  });
}

async function renderMonthView() {
  const content = document.getElementById('main-content');
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + currentMonthOffset, 1);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

  const weeksNeeded = new Set();
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    if (!isWeekend(date)) weeksNeeded.add(getWeekKey(date));
  }
  const schedules = {};
  await Promise.all([...weeksNeeded].map(async wk => {
    schedules[wk] = await getScheduleForWeek(wk);
  }));

  const DAY_HEADERS = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  let html = '<div class="month-grid">';
  DAY_HEADERS.forEach(ds => { html += `<div class="month-header">${ds}</div>`; });
  for (let i = 0; i < startDow; i++) html += '<div class="month-cell empty"></div>';

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dow = getDayOfWeekIndex(date);
    const isWe = isWeekend(date);
    const isTod = isToday(date);
    const vrij = !isWe && isVrijeDag(date);
    const activiteiten = !isWe ? getActiviteitenForDate(date) : [];
    const wk = getWeekKey(date);
    const entry = !isWe && schedules[wk] ? schedules[wk]['day_' + dow] : null;
    const u = entry ? getUserInfo(entry.email) : null;

    html += `<div class="month-cell ${isTod ? 'month-today' : ''} ${isWe ? 'month-weekend' : ''}">
      <div class="month-day-num">${day}</div>
      ${vrij ? '<div class="month-badge vrij-m">🎉 Vrij</div>' : ''}
      ${CRECHE[dow] && !isWe ? '<div class="month-badge creche-m">🧸</div>' : ''}
      ${!isWe && !vrij ? '<div class="month-badge school-m">🏫</div>' : ''}
      ${activiteiten.map(a => `<div class="month-badge activiteit-m">📌 ${a.summary.length > 10 ? a.summary.slice(0,10)+'…' : a.summary}</div>`).join('')}
      ${entry ? `<div class="month-badge oppas-m ${u.cls}-m">${u.name}</div>` : ''}
    </div>`;
  }
  html += '</div>';
  content.innerHTML = html;
}

async function renderYearView() {
  const content = document.getElementById('main-content');
  let html = '<div class="year-grid">';
  for (let m = 0; m < 12; m++) {
    const firstDay = new Date(currentYear, m, 1);
    const lastDay = new Date(currentYear, m + 1, 0);
    const startDow = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    html += `<div class="year-month">
      <div class="year-month-title">${MONTHS[m]}</div>
      <div class="year-mini-grid">`;
    ['M','D','W','D','V','Z','Z'].forEach(ds => { html += `<div class="year-mini-header">${ds}</div>`; });
    for (let i = 0; i < startDow; i++) html += '<div class="year-mini-cell"></div>';
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(currentYear, m, day);
      const isWe = isWeekend(date);
      const isTod = isToday(date);
      const vrij = !isWe && isVrijeDag(date);
      const heeftActiviteit = !isWe && !vrij && getActiviteitenForDate(date).length > 0;
      const title = heeftActiviteit ? getActiviteitenForDate(date).map(a => a.summary).join(', ') : '';
      html += `<div class="year-mini-cell ${isTod ? 'year-today' : ''} ${isWe ? 'year-weekend' : ''} ${vrij ? 'year-vrij' : ''} ${heeftActiviteit ? 'year-activiteit' : ''}" title="${title}">${day}</div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  content.innerHTML = html;
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
  const dates = getWeekDates(currentWeekOffset);
  const weekKey = getWeekKey(dates[0]);
  const entry = (scheduleCache[weekKey] || {})['day_' + dayIndex];
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
  const dates = getWeekDates(currentWeekOffset);
  const weekKey = getWeekKey(dates[0]);
  await setDoc(doc(db, 'schedules', weekKey), { ['day_' + dayIndex]: { email, time } }, { merge: true });
  if (scheduleCache[weekKey]) scheduleCache[weekKey]['day_' + dayIndex] = { email, time };
  closeModal();
};

window.deleteDay = async function(dayIndex) {
  const dates = getWeekDates(currentWeekOffset);
  const weekKey = getWeekKey(dates[0]);
  const snap = await getDoc(doc(db, 'schedules', weekKey));
  if (snap.exists()) {
    const data = snap.data();
    delete data['day_' + dayIndex];
    await setDoc(doc(db, 'schedules', weekKey), data);
    scheduleCache[weekKey] = data;
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

window.setView = function(v) {
  view = v;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + v).classList.add('active');
  renderAll();
};

window.navPrev = function() {
  if (view === 'week') currentWeekOffset--;
  else if (view === 'month') currentMonthOffset--;
  else currentYear--;
  renderAll();
};

window.navNext = function() {
  if (view === 'week') currentWeekOffset++;
  else if (view === 'month') currentMonthOffset++;
  else currentYear++;
  renderAll();
};

window.importCalendar = async function() {
  const url = document.getElementById('ical-url').value.trim();
  if (!url) return;
  const btn = document.getElementById('ical-import-btn');
  btn.textContent = 'Laden...';
  btn.disabled = true;
  try {
    const res = await fetch(PROXY + '?url=' + encodeURIComponent(url));
    const text = await res.text();
    const events = parseIcal(text);
    icalEvents = events;
    await setDoc(doc(db, 'settings', 'ical'), { url, events, updatedAt: new Date() }, { merge: true });
    renderIcalEvents(events);
    renderAll();
    showToast(events.length + ' evenementen geïmporteerd!');
  } catch(e) {
    showToast('Fout bij laden: ' + e.message);
  }
  btn.textContent = 'Importeren';
  btn.disabled = false;
};

function parseIcal(text) {
  const events = [];
  const lines = text.split('\n').map(l => l.trim());
  let current = null;
  lines.forEach(line => {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT' && current) { events.push(current); current = null; }
    else if (current) {
      if (line.startsWith('SUMMARY:')) current.summary = line.slice(8).replace(/\\,/g, ',').replace(/\\n/g, ' ');
      if (line.startsWith('DTSTART;VALUE=DATE:')) current.start = line.slice(19);
      if (line.startsWith('DTSTART:')) current.start = line.slice(8, 16);
      if (line.startsWith('DTEND;VALUE=DATE:')) current.end = line.slice(17);
    }
  });
  return events;
}

function renderIcalEvents(events) {
  const container = document.getElementById('ical-events');
  if (!container) return;
  const today = dateToIcalStr(new Date());
  const upcoming = events.filter(e => e.start && e.start >= today).slice(0, 10);
  if (!upcoming.length) {
    container.innerHTML = '<div style="font-size:12px;color:#888780;margin-top:8px;">Geen aankomende evenementen.</div>';
    return;
  }
  container.innerHTML = '<div style="margin-top:10px;">' + upcoming.map(e => {
    const isVrij = VRIJ_KEYWORDS.some(k => (e.summary||'').toLowerCase().includes(k));
    return `<div class="ical-event">
      <div class="ical-date">${formatIcalDate(e.start)}</div>
      <div class="ical-summary ${isVrij ? 'ical-vrij' : ''}">${isVrij ? '🎉' : '📌'} ${e.summary}</div>
    </div>`;
  }).join('') + '</div>';
}

function formatIcalDate(d) {
  if (!d || d.length < 8) return d;
  return d.slice(6,8) + ' ' + ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][parseInt(d.slice(4,6))-1];
}

window.syncToGoogleCalendar = async function() {
  const btn = document.getElementById('gcal-sync-btn');
  const status = document.getElementById('gcal-status');
  btn.textContent = 'Bezig...';
  btn.disabled = true;
  try {
    const weekKey = getWeekKey(new Date());
    const snap = await getDoc(doc(db, 'schedules', weekKey));
    const sched = snap.exists() ? snap.data() : {};
    const dates = getWeekDates(currentWeekOffset);
    const myDays = [];
    dates.forEach((d, i) => {
      const entry = sched['day_' + i];
      if (entry && entry.email === currentUser.email) {
        myDays.push({ date: d, day: DAYS[i], time: entry.time });
      }
    });
    if (!myDays.length) {
      status.innerHTML = '<div class="gcal-status-row">Geen oppasdagen gevonden voor jou deze week.</div>';
    } else {
      const icsContent = generateIcs(myDays);
      downloadIcs(icsContent, 'oppasdagen.ics');
      status.innerHTML = '<div class="gcal-status-row">✓ Bestand gedownload! Open het om je oppasdagen toe te voegen aan Google Calendar.</div>';
    }
  } catch(e) {
    status.innerHTML = '<div class="gcal-status-row" style="color:#a32d2d;">Fout: ' + e.message + '</div>';
  }
  btn.textContent = 'Sync mijn oppasdagen';
  btn.disabled = false;
};

function generateIcs(myDays) {
  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//OppasPlanner//NL\n';
  myDays.forEach(day => {
    const dateStr = dateToIcalStr(day.date);
    ics += 'BEGIN:VEVENT\n';
    ics += 'UID:oppas-' + dateStr + '@oppasplanner\n';
    ics += 'SUMMARY:Oppas Lauren & Sarah\n';
    ics += 'DTSTART;VALUE=DATE:' + dateStr + '\n';
    ics += 'DTEND;VALUE=DATE:' + dateStr + '\n';
    ics += 'DESCRIPTION:' + (day.time || '') + '\n';
    ics += 'END:VEVENT\n';
  });
  ics += 'END:VCALENDAR';
  return ics;
}

function downloadIcs(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showModal(content) {
  document.getElementById('modal-body').innerHTML = content;
  document.getElementById('modal-overlay').style.display = 'flex';
}

window.closeModal = function() {
  document.getElementById('modal-overlay').style.display = 'none';
};

function renderSwaps() {
  const list = document.getElementById('swap-list');
  if (!list) return;
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
      ${s.status === 'pending' && s.toEmail === currentUser.email
        ? `<button class="swap-accept" onclick="acceptSwap('${s.id}')">Accepteren</button>` : ''}
    </div>`).join('');
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#2c2c2a;color:white;padding:10px 20px;border-radius:8px;font-size:13px;z-index:999;transition:opacity 0.3s;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; }, 2800);
}
