// ui/popup.js — Recording trigger + mic permission + settings + transcription
console.log('[Popup] loaded')

const notOnMeet = document.getElementById('not-on-meet')
const meetIdle = document.getElementById('meet-idle')
const meetRecording = document.getElementById('meet-recording')
const btnRecord = document.getElementById('btn-record')
const btnStop = document.getElementById('btn-stop')
const meetingTitle = document.getElementById('meeting-title')
const recordingTitle = document.getElementById('recording-title')
const timerEl = document.getElementById('timer')
const settingsBtn = document.getElementById('settings-btn')
const settingsPanel = document.getElementById('settings-panel')
const apiKeyInput = document.getElementById('api-key-input')
const btnSaveKey = document.getElementById('btn-save-key')
const keyStatus = document.getElementById('key-status')

let timerInterval = null

// ── Settings Toggle ─────────────────────────────────────
settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden')
})

// ── Load saved API key ──────────────────────────────────
chrome.storage.sync.get('assemblyaiKey', (data) => {
    if (data.assemblyaiKey) {
        apiKeyInput.value = data.assemblyaiKey
        keyStatus.innerHTML = '<span style="color: #10b981">✅ Key saved</span>'
    } else {
        keyStatus.innerHTML = '<span style="color: #f59e0b">⚠️ No key — transcription disabled</span>'
    }
})

// ── Save API key ────────────────────────────────────────
btnSaveKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim()
    if (!key) {
        keyStatus.innerHTML = '<span style="color: #ef4444">❌ Please enter a key</span>'
        return
    }

    btnSaveKey.disabled = true
    btnSaveKey.textContent = 'Saving...'

    chrome.storage.sync.set({ assemblyaiKey: key }, () => {
        keyStatus.innerHTML = '<span style="color: #10b981">✅ Key saved successfully!</span>'
        btnSaveKey.disabled = false
        btnSaveKey.textContent = 'Save Key'
        setTimeout(() => settingsPanel.classList.add('hidden'), 1000)
    })
})

// ── Auth Handling ──────────────────────────────────────
const loggedOutView = document.getElementById('logged-out-view')
const loggedInView = document.getElementById('logged-in-view')
const btnGoogleLogin = document.getElementById('btn-google-login')
const btnLogout = document.getElementById('btn-logout')
const userEmailEl = document.getElementById('user-email')
const userAvatarEl = document.getElementById('user-avatar')

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

    if (btnRecord) {
        btnRecord.disabled = false
        btnRecord.title = 'Start Cloud Recording'
    }
}

function showLoggedOut() {
    if (!loggedOutView || !loggedInView) return;

    loggedOutView.classList.remove('hidden')
    loggedInView.classList.add('hidden')

    chrome.storage.local.remove(['userEmail', 'authToken'])

    if (btnRecord) {
        btnRecord.disabled = true;
        btnRecord.title = 'Please sign in to record';
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
        recordingTitle.textContent = state.recordingTitle || title
        startTimer(state.recordingStartTime)
    } else {
        notOnMeet.classList.add('hidden')
        meetIdle.classList.remove('hidden')
        meetRecording.classList.add('hidden')
        meetingTitle.textContent = title
    }
}

// ── Start Recording ────────────────────────────────────
btnRecord.addEventListener('click', async () => {
    btnRecord.disabled = true
    btnRecord.innerHTML = '⏳ Starting...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id })
        const title = tab.title?.replace(' - Google Meet', '').trim() || 'Meeting'

        const response = await chrome.runtime.sendMessage({
            action: 'START_RECORDING',
            streamId, tabId: tab.id, title
        })

        if (!response?.ok) throw new Error(response?.error || 'Failed to start');

        meetIdle.classList.add('hidden')
        meetRecording.classList.remove('hidden')
        recordingTitle.textContent = title
        startTimer(Date.now())

    } catch (err) {
        btnRecord.disabled = false
        btnRecord.innerHTML = '<span style="width: 12px; height: 12px; background: white; border-radius: 50%;"></span>Start Recording';
        alert('Recording Error: ' + err.message)
    }
})

// ── Stop Recording ─────────────────────────────────────
btnStop.addEventListener('click', async () => {
    btnStop.disabled = true
    btnStop.innerHTML = '⏳ Finishing...';

    try {
        await chrome.runtime.sendMessage({ action: 'STOP_RECORDING' })
        if (timerInterval) clearInterval(timerInterval)
        setTimeout(() => window.close(), 500)
    } catch (err) {
        btnStop.disabled = false
        btnStop.innerHTML = '<span style="width: 12px; height: 12px; background: #ef4444; border-radius: 2px;"></span>Stop Recording';
    }
})

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
