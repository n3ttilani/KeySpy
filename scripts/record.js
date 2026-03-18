import { auth, db } from './firebase.js';
import { onAuthStateChanged }  from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

const { ipcRenderer } = window.require('electron');

// ---- English keycode → index ------------------------------------------------

const EN_KEY_MAP = {
    30: 0,  48: 1,  46: 2,  32: 3,  18: 4,  33: 5,  34: 6,  35: 7,
    23: 8,  36: 9,  37: 10, 38: 11, 50: 12, 49: 13, 24: 14, 25: 15,
    16: 16, 19: 17, 31: 18, 20: 19, 22: 20, 47: 21, 17: 22, 45: 23,
    21: 24, 44: 25, 57: 26
};

// ---- Hebrew keycode → index -------------------------------------------------

const HE_KEY_MAP = {
    20: 0,  46: 1,  32: 2,  31: 3,  47: 4,  22: 5,  44: 6,  36: 7,
    21: 8,  35: 9,  33: 10, 37: 11, 49: 12, 48: 13, 45: 14, 34: 15,
    25: 16, 50: 17, 18: 18, 19: 19, 30: 20, 51: 21, 38: 22, 24: 23,
    23: 24, 39: 25, 52: 26, 57: 27
};

const EN_SIZE = 27; 
const HE_SIZE = 28; 

const MAX_FLIGHT_MS = 2000;

// ---- Elements ---------------------------------------------------------------

const micIcon     = document.getElementById('micIcon');
const pauseIcon   = document.getElementById('pauseIcon');
const statusText  = document.getElementById('status-text');
const deleteModal = document.getElementById('deleteModal');
const uploadModal = document.getElementById('uploadModal');
const toast       = document.getElementById('toast');

// ---- State ------------------------------------------------------------------

let currentUser = null;
let isPaused    = false;
let isEnglish   = true;
let lastRelease = { index: null, time: null };
let activeKeys  = new Map();
let stats       = emptyStats();

function emptyStats() {
    return {
        en: emptyLangStats(EN_SIZE),
        he: emptyLangStats(HE_SIZE)
    };
}

function emptyLangStats(size) {
    return {
        hold:        Array(size).fill(0),
        holdM2:      Array(size).fill(0),
        holdCount:   Array(size).fill(0),
        flight:      Array.from({ length: size }, () => Array(size).fill(0)),
        flightM2:    Array.from({ length: size }, () => Array(size).fill(0)),
        flightCount: Array.from({ length: size }, () => Array(size).fill(0))
    };
}

// ---- Current language stats & keymap ----------------------------------------

const getLang    = () => isEnglish ? stats.en      : stats.he;
const getKeyMap  = () => isEnglish ? EN_KEY_MAP    : HE_KEY_MAP;

// ---- Welford online algorithm -----------------------------------------------

function welford(avgArr, m2Arr, countArr, i, value, j = null) {
    const mat    = j !== null;
    const oldAvg = mat ? avgArr[i][j]     : avgArr[i];
    const oldM2  = mat ? m2Arr[i][j]      : m2Arr[i];
    const n      = mat ? ++countArr[i][j] : ++countArr[i];
    const delta  = value - oldAvg;
    const newAvg = oldAvg + delta / n;
    const newM2  = oldM2  + delta * (value - newAvg);

    if (mat) { avgArr[i][j] = newAvg; m2Arr[i][j] = newM2; }
    else     { avgArr[i]    = newAvg; m2Arr[i]    = newM2; }
}

// ---- Firestore helpers ------------------------------------------------------

const serializeLang = (s) =>
    Object.fromEntries(Object.entries(s).map(([k, v]) => [k, JSON.stringify(v)]));

const deserializeLang = (data) => {
    const lang = {};
    for (const key of ['hold', 'holdM2', 'holdCount', 'flight', 'flightM2', 'flightCount']) {
        lang[key] = JSON.parse(data[key]);
    }
    return lang;
};

const deserialize = (data) => {
    const requiredKeys = ['hold', 'holdM2', 'holdCount', 'flight', 'flightM2', 'flightCount', 'holdSD', 'flightSD'];
    const enData = data.en || {};
    const heData = data.he || {};

    if (requiredKeys.some(k => !enData[k]) || requiredKeys.some(k => !heData[k])) {
        stats = emptyStats();
        return;
    }

    stats.en = deserializeLang(enData);
    stats.he = deserializeLang(heData);
};

// ---- SD computation ---------------------------------------------------------

const computeSDForLang = (lang) => {
    const holdSD   = lang.holdCount.map((n, i) =>
        n > 1 ? Math.sqrt(lang.holdM2[i] / (n - 1)) : 0
    );
    const flightSD = lang.flightM2.map((row, i) =>
        row.map((m2, j) =>
            lang.flightCount[i][j] > 1 ? Math.sqrt(m2 / (lang.flightCount[i][j] - 1)) : 0
        )
    );
    return { holdSD, flightSD };
};

// ---- UI state ---------------------------------------------------------------

const setRecordingState = (recording) => {
    isPaused = !recording;
    micIcon.className    = recording ? 'fas fa-microphone mic-active' : 'fas fa-microphone mic-paused';
    pauseIcon.className  = recording ? 'fas fa-pause'                 : 'fas fa-play';
    statusText.innerText = recording ? 'Recording your typing patterns...' : 'Paused';
};

// ---- Toast ------------------------------------------------------------------

const showToast = (msg, color = '#4a9eff') => {
    toast.innerText        = msg;
    toast.style.background = color;
    toast.className        = 'show';
    setTimeout(() => { toast.className = ''; }, 4000);
};

// ---- Auth guard + load stats ------------------------------------------------

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) deserialize(snap.data());

    document.getElementById('mainHtml').style.visibility = 'visible';
    setRecordingState(true);
});

// ---- Keyboard language check ------------------------------------------------

ipcRenderer.on('keyboard-language', (_, eng) => {
    if (isEnglish === eng) return;
    isEnglish = eng;
    lastRelease = { index: null, time: null };
    activeKeys.clear();
});

// ---- Key listeners ----------------------------------------------------------

ipcRenderer.on('keydown', (_, { keyCode, time }) => {
    const i = getKeyMap()[keyCode];
    if (isPaused || i === undefined || activeKeys.has(i)) return;

    const lang = getLang();

    if (activeKeys.size === 0 && lastRelease.index !== null) {
        const flight = time - lastRelease.time;
        if (flight < MAX_FLIGHT_MS) {
            welford(lang.flight, lang.flightM2, lang.flightCount, lastRelease.index, flight, i);
        }
    }

    activeKeys.set(i, time);
});

ipcRenderer.on('keyup', (_, { keyCode, time }) => {
    const i = getKeyMap()[keyCode];
    if (isPaused || i === undefined || !activeKeys.has(i)) return;

    const lang      = getLang();
    const pressTime = activeKeys.get(i);

    welford(lang.hold, lang.holdM2, lang.holdCount, i, time - pressTime);
    activeKeys.delete(i);
    lastRelease = { index: i, time };

    let oldestKey  = null;
    let oldestTime = Infinity;

    for (const [j, jPressTime] of activeKeys) {
        if (jPressTime > pressTime && jPressTime < oldestTime) {
            oldestKey  = j;
            oldestTime = jPressTime;
        }
    }

    if (oldestKey !== null) {
        welford(lang.flight, lang.flightM2, lang.flightCount, i, oldestTime - time, oldestKey);
    }
});

// ---- Button keyboard prevention ---------------------------------------------

['deleteBtn', 'pauseBtn', 'uploadBtn'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => e.preventDefault());
});

// ---- Pause ------------------------------------------------------------------

document.getElementById('pauseBtn').addEventListener('click', () => {
    setRecordingState(isPaused);
});

// ---- Delete -----------------------------------------------------------------

document.getElementById('deleteBtn')    .addEventListener('click', () => { deleteModal.style.display = 'flex'; });
document.getElementById('cancelDelete') .addEventListener('click', () => { deleteModal.style.display = 'none'; });
document.getElementById('confirmDelete').addEventListener('click', () => {
    stats       = emptyStats();
    activeKeys  = new Map();
    lastRelease = { index: null, time: null };
    deleteModal.style.display = 'none';
    showToast('Session data cleared', '#e74c3c');
});

// ---- Upload -----------------------------------------------------------------

document.getElementById('uploadBtn').addEventListener('click', () => {
    uploadModal.style.display = 'flex';
});

document.getElementById('cancelUpload').addEventListener('click', () => {
    uploadModal.style.display = 'none';
});

document.getElementById('confirmUpload').addEventListener('click', async () => {
    if (!currentUser) return;

    const { holdSD: enHoldSD, flightSD: enFlightSD } = computeSDForLang(stats.en);
    const { holdSD: heHoldSD, flightSD: heFlightSD } = computeSDForLang(stats.he);

    await setDoc(
        doc(db, 'users', currentUser.uid),
        {
            en: {
                ...serializeLang(stats.en),
                holdSD:   JSON.stringify(enHoldSD),
                flightSD: JSON.stringify(enFlightSD)
            },
            he: {
                ...serializeLang(stats.he),
                holdSD:   JSON.stringify(heHoldSD),
                flightSD: JSON.stringify(heFlightSD)
            },
            lastUpdated: Date.now()
        },
        { merge: true }
    );

    uploadModal.style.display = 'none';
    showToast('Uploaded successfully');
});