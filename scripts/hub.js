import { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { doc, getDoc }                 from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

// ---- Elements ---------------------------------------------------------------

const welcomeHeader = document.getElementById('welcomeHeader');
const userDisplay   = document.getElementById('userDisplay');
const logoutLink    = document.getElementById('logoutLink');
const recordBtn     = document.getElementById('recordBtn');
const monitorBtn    = document.getElementById('monitorBtn');

// ---- Auth guard -------------------------------------------------------------

onAuthStateChanged(auth, async (user) => {
    if (!user || !user.emailVerified) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const snap            = await getDoc(doc(db, 'users', user.uid));
        userDisplay.innerText = snap.exists() ? (snap.data().username ?? 'User') : 'User';

        welcomeHeader.style.visibility                        = 'visible';
        document.getElementById('mainHtml').style.visibility = 'visible';

    } catch (err) {
        console.error('Failed to load user data:', err);
        window.location.href = 'login.html';
    }
});

// ---- Event listeners --------------------------------------------------------

recordBtn .addEventListener('click', () => window.location.href = 'record.html');
monitorBtn.addEventListener('click', () => window.location.href = 'monitor.html');

logoutLink.addEventListener('click', async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = 'login.html';
});