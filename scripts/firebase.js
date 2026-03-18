import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import { getAuth }       from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { getFirestore }  from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

const app = initializeApp({
    apiKey:            'AIzaSyBtMgSBCDuciH_hgaLaIO9xZjGDGb_snFg',
    authDomain:        'keyboard-recognition-1d67d.firebaseapp.com',
    projectId:         'keyboard-recognition-1d67d',
    storageBucket:     'keyboard-recognition-1d67d.firebasestorage.app',
    messagingSenderId: '127101624667',
    appId:             '1:127101624667:web:e12323914e359fb3b97a7e'
});

export const auth = getAuth(app);
export const db   = getFirestore(app);