import { auth, db } from './firebase.js';
import { onAuthStateChanged }          from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { collection, getDocs }         from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

const { ipcRenderer } = window.require('electron');

// ---- Keycode → A-Z index map ------------------------------------------------

const KEY_MAP = {
    30: 0,  48: 1,  46: 2,  32: 3,  18: 4,  33: 5,  34: 6,  35: 7,
    23: 8,  36: 9,  37: 10, 38: 11, 50: 12, 49: 13, 24: 14, 25: 15,
    16: 16, 19: 17, 31: 18, 20: 19, 22: 20, 47: 21, 17: 22, 45: 23,
    21: 24, 44: 25
};

const MAX_FLIGHT_MS = 2000;

// ---- Elements ---------------------------------------------------------------

const identityDisplay = document.getElementById('identity-display');
const confidenceFill  = document.getElementById('confidence-fill');
const statusText      = document.getElementById('status-text');

// ---- State ------------------------------------------------------------------

let profiles    = [];
let scores      = {};
let activeKeys  = new Map();
let lastRelease = { index: null, time: null };
let eventCount  = 0;

// ---- Auth guard -------------------------------------------------------------

onAuthStateChanged(auth, async (user) => {
    if (!user || !user.emailVerified) {
        window.location.href = 'login.html';
        return;
    }

    await loadProfiles();
    document.getElementById('mainHtml').style.visibility = 'visible';
});

// ---- Load all user profiles from Firestore ----------------------------------

const loadProfiles = async () => {
    const snapshot = await getDocs(collection(db, 'users'));

    snapshot.forEach((doc) => {
        const d = doc.data();
        if (!d.hold || !d.holdSD || !d.flight || !d.flightSD) return;

        profiles.push({
            name:     d.username,
            hold:     JSON.parse(d.hold),
            holdSD:   JSON.parse(d.holdSD),
            flight:   JSON.parse(d.flight),
            flightSD: JSON.parse(d.flightSD)
        });

        scores[d.username] = 0;
    });

    statusText.innerText = `${profiles.length} profile${profiles.length !== 1 ? 's' : ''} loaded — start typing`;
};

// ---- Log likelihood scoring -------------------------------------------------

const logLikelihood = (value, mean, sd) => {
    if (mean === 0) return 0;
    const floorSD = Math.max(sd, 1);
    return -0.5 * Math.pow((value - mean) / floorSD, 2);
};

const scoreEvent = (metric, i, j, value) => {
    eventCount++;

    profiles.forEach((p) => {
        const mean = metric === 'hold' ? p.hold[i]       : p.flight[i][j];
        const sd   = metric === 'hold' ? p.holdSD[i]     : p.flightSD[i][j];
        scores[p.name] += logLikelihood(value, mean, sd);
    });

    updateUI();
};

// ---- Update display ---------------------------------------------------------

const updateUI = () => {
    if (profiles.length === 0 || eventCount < 5) return;

    const sorted     = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const gap        = sorted.length > 1 ? sorted[0][1] - sorted[1][1] : 0;
    const confidence = Math.min(100, Math.max(0, (gap + 5) * 10));

    confidenceFill.style.width  = confidence + '%';
    identityDisplay.innerText   = sorted[0][0];
    statusText.innerText        = `Confidence: ${Math.round(confidence)}%`;
};

// ---- Key listeners ----------------------------------------------------------

ipcRenderer.on('keydown', (_, { keyCode, time }) => {
    const i = KEY_MAP[keyCode];
    if (i === undefined || activeKeys.has(i)) return;

    if (activeKeys.size === 0 && lastRelease.index !== null) {
        const flight = time - lastRelease.time;
        if (flight < MAX_FLIGHT_MS) {
            scoreEvent('flight', lastRelease.index, i, flight);
        }
    }

    activeKeys.set(i, time);
});

ipcRenderer.on('keyup', (_, { keyCode, time }) => {
    const i = KEY_MAP[keyCode];
    if (i === undefined || !activeKeys.has(i)) return;

    const pressTime = activeKeys.get(i);
    scoreEvent('hold', i, null, time - pressTime);
    activeKeys.delete(i);
    lastRelease = { index: i, time };

    // Rollover partner
    let oldestKey  = null;
    let oldestTime = Infinity;

    for (const [j, jPressTime] of activeKeys) {
        if (jPressTime > pressTime && jPressTime < oldestTime) {
            oldestKey  = j;
            oldestTime = jPressTime;
        }
    }

    if (oldestKey !== null) {
        scoreEvent('flight', i, oldestKey, oldestTime - time);
    }
});