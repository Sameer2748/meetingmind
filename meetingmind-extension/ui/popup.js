// ui/popup.js — Recording trigger + mic permission + settings + transcription
console.log('[Popup] loaded')

const notOnMeet = document.getElementById('not-on-meet')
const meetIdle = document.getElementById('meet-idle')
const meetRecording = document.getElementById('meet-recording')
const meetingTitle = document.getElementById('meeting-title')

let timerInterval = null



// ── Auth Handling ──────────────────────────────────────
const loggedOutView = document.getElementById('logged-out-view')
const loggedInView = document.getElementById('logged-in-view')
const btnGoogleLogin = document.getElementById('btn-google-login')
const btnLogout = document.getElementById('btn-logout')
const userEmailEl = document.getElementById('user-email')
const userAvatarEl = document.getElementById('user-avatar')

// Stats elements
const planStatusCard = document.getElementById('plan-status-card')
const planNameEl = document.getElementById('plan-name')
const planUsageEl = document.getElementById('plan-usage')
const planProgressEl = document.getElementById('plan-progress')
const limitReachedMsg = document.getElementById('limit-reached-msg')
const btnUpgrade = document.getElementById('btn-upgrade')

async function checkAuth() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['userEmail', 'authToken'], (data) => {
            if (data.userEmail && data.authToken) {
                showLoggedIn(data.userEmail)
                resolve(true)
            } else {
                showLoggedOut()
                resolve(false)
            }
        })
    })
}

function showLoggedIn(email) {
    if (!loggedOutView || !loggedInView) return;

    loggedOutView.classList.add('hidden')
    loggedInView.classList.remove('hidden')

    userEmailEl.textContent = email
    userAvatarEl.textContent = email.charAt(0).toUpperCase()

    // Fetch limits immediately
    updatePlanStatus();
}

function showLoggedOut() {
    if (!loggedOutView || !loggedInView) return;

    loggedOutView.classList.remove('hidden')
    loggedInView.classList.add('hidden')
    if (planStatusCard) planStatusCard.classList.add('hidden')

    chrome.storage.local.remove(['userEmail', 'authToken', 'userStats'])
}

async function updatePlanStatus() {
    chrome.storage.local.get(['authToken', 'userEmail'], async (data) => {
        if (!data.authToken) return;

        try {
            const response = await fetch(`${self.CONFIG.API_BASE_URL}/api/auth/status`, {
                headers: {
                    'Authorization': `Bearer ${data.authToken}`
                }
            });

            if (response.ok) {
                const stats = await response.json();
                renderPlanStatus(stats);
                chrome.storage.local.set({ userStats: stats });
            }
        } catch (err) {
            console.error('[Popup] Status check failed:', err);
        }
    });
}

function renderPlanStatus(stats) {
    if (!planStatusCard) return;

    planStatusCard.classList.remove('hidden');

    const isPro = stats.plan === 'pro';
    planNameEl.textContent = isPro ? 'Pro Plan' : 'Starter Plan';

    if (isPro) {
        planUsageEl.textContent = `${stats.recordingsCount} Recordings`;
        planProgressEl.style.width = '100%';
        limitReachedMsg.classList.add('hidden');
        btnUpgrade.classList.add('hidden');
    } else {
        const count = stats.recordingsCount || 0;
        const limit = stats.limit || 5;
        planUsageEl.textContent = `${count} / ${limit} Meetings`;

        const percent = Math.min((count / limit) * 100, 100);
        planProgressEl.style.width = `${percent}%`;

        if (count >= limit) {
            limitReachedMsg.classList.remove('hidden');
            planProgressEl.style.background = '#ef4444';
        } else {
            limitReachedMsg.classList.add('hidden');
            planProgressEl.style.background = '#e07155';
        }
    }
}

// ── Google Login Logic (BACKGROUND FLOW) ──────────
btnGoogleLogin.addEventListener('click', async () => {
    btnGoogleLogin.textContent = 'Connecting...';
    btnGoogleLogin.disabled = true;

    chrome.runtime.sendMessage({ action: 'GOOGLE_LOGIN' }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
            alert('Login failed. Please try again.');
            resetLoginButton();
        } else {
            showLoggedIn(response.email);
        }
    });
});

function resetLoginButton() {
    btnGoogleLogin.innerHTML = `<img src="https://www.google.com/favicon.ico" style="width:18px; height:18px;"> Sign in with Google`;
    btnGoogleLogin.disabled = false;
}

btnLogout.addEventListener('click', () => {
    showLoggedOut()
})

// ── Init ────────────────────────────────────────────────
async function init() {
    await checkAuth()
    updatePlanStatus()

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const isGoogleMeet = tab?.url?.startsWith('https://meet.google.com/')
    const title = tab?.title?.replace(' - Google Meet', '').trim() || 'Meeting'

    const state = await chrome.storage.session.get(['isRecording', 'recordingStartTime', 'recordingTitle'])

    if (!isGoogleMeet) {
        notOnMeet.classList.remove('hidden')
        meetIdle.classList.add('hidden')
        meetRecording.classList.add('hidden')
        return
    }

    if (state.isRecording) {
        notOnMeet.classList.add('hidden')
        meetIdle.classList.add('hidden')
        meetRecording.classList.remove('hidden')
    } else {
        notOnMeet.classList.add('hidden')
        meetIdle.classList.remove('hidden')
        meetRecording.classList.add('hidden')
        meetingTitle.textContent = title
    }
}

// ── Timer ──────────────────────────────────────────────
function startTimer(startTime) {
    if (timerInterval) clearInterval(timerInterval)
    function update() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0')
        const secs = String(elapsed % 60).padStart(2, '0')
        timerEl.textContent = `${mins}:${secs}`
    }
    update()
    timerInterval = setInterval(update, 1000)
}

init()
