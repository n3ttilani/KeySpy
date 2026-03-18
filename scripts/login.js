import { auth, db } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { doc, setDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';

// ---- Elements ---------------------------------------------------------------

const formTitle       = document.getElementById('formTitle');
const instructionText = document.getElementById('instructionText');
const toggleLink      = document.getElementById('toggleLink');
const usernameInput   = document.getElementById('username');
const emailInput      = document.getElementById('email');
const passwordInput   = document.getElementById('password');
const actionBtn       = document.getElementById('actionBtn');
const toast           = document.getElementById('toast');

// ---- State ------------------------------------------------------------------

let isSignUp = false;

// ---- Auth guard -------------------------------------------------------------

onAuthStateChanged(auth, (user) => {
    if (user && user.emailVerified) {
        window.location.href = 'hub.html';
    } else {
        document.getElementById('mainHtml').style.visibility = 'visible';
    }
});

// ---- Toast ------------------------------------------------------------------

const showToast = (msg, color = '#e74c3c') => {
    toast.innerText        = msg;
    toast.style.background = color;
    toast.className        = 'show';
    setTimeout(() => { toast.className = ''; }, 4000);
};

// ---- Submit -----------------------------------------------------------------

const handleSubmit = async () => {
    if (actionBtn.disabled) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const email    = emailInput.value.trim();

    if (!username || !password || (isSignUp && !email)) {
        return showToast('Please fill all fields');
    }

    actionBtn.innerText = 'LOADING...';
    actionBtn.disabled  = true;

    try {
        const snapshot = await getDocs(
            query(collection(db, 'users'), where('username', '==', username))
        );

        if (isSignUp) {
            if (!snapshot.empty) throw new Error('Username taken!');

            const { user } = await createUserWithEmailAndPassword(auth, email, password);

            await setDoc(doc(db, 'users', user.uid), {
                username,
                email,
                createdAt: new Date()
            });

            await sendEmailVerification(user);
            await signOut(auth);

            showToast('Verify your email!', '#3498db');
            toggleLink.click();

        } else {
            if (snapshot.empty) throw new Error('User not found');

            const { email: userEmail } = snapshot.docs[0].data();
            const { user } = await signInWithEmailAndPassword(auth, userEmail, password);

            if (!user.emailVerified) {
                await signOut(auth);
                showToast('Verify your email first!', '#f39c12');
                return;
            }

            window.location.href = 'hub.html';
        }

    } catch (err) {
        showToast(err.message);
    } finally {
        actionBtn.disabled  = false;
        actionBtn.innerText = isSignUp ? 'CREATE ACCOUNT' : 'LOG IN';
    }
};

// ---- Toggle sign in / sign up -----------------------------------------------

const toggleForm = (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;

    formTitle.innerText       = isSignUp ? 'Sign Up'                  : 'Sign In';
    actionBtn.innerText       = isSignUp ? 'CREATE ACCOUNT'           : 'LOG IN';
    instructionText.innerText = isSignUp ? 'Already have an account?' : "Don't have an account?";
    toggleLink.innerText      = isSignUp ? 'Log In'                   : 'Sign Up';
    emailInput.classList.toggle('hidden', !isSignUp);

    usernameInput.value = '';
    passwordInput.value = '';
    emailInput.value    = '';
};

// ---- Event listeners --------------------------------------------------------

actionBtn .addEventListener('click',    handleSubmit);
toggleLink.addEventListener('click',    toggleForm);
document  .addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSubmit(); });