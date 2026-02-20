// content/content.js — Fathom-style panel + MIC CAPTURE
console.log('[Content] ========== MeetingMind loaded ==========')

let isOnMeetPage = false
let wasInMeeting = false
let overlayEl = null
let isRecording = false
let botStatusInterval = null

// ── Toolbar Button Injection (Fathom Style) ─────────────────
function injectToolbarButton() {
    const btnId = 'mm-toolbar-btn';
    if (document.getElementById(btnId)) return;

    // 1. Target the main control bar (jsname="K9vOnd" is the central bank of buttons)
    const toolbar = document.querySelector('[jsname="K9vOnd"]') ||
        document.querySelector('div[jscontroller="T697de"]') ||
        document.querySelector('[aria-label="Leave call"]')?.parentElement?.parentElement;

    if (!toolbar) return;

    console.log('[MeetingMind] 🛠️ Injecting toolbar button...');

    const btnWrapper = document.createElement('div');
    btnWrapper.id = btnId;

    // Use clear, standard styling to prevent stacking/overlapping
    // A 16px-20px margin is used to guarantee it stays clear of the mic button
    btnWrapper.style = `
        display: inline-flex !important; 
        align-items: center; 
        justify-content: center; 
        width: 44px; 
        height: 48px; 
        flex-shrink: 0; 
        margin-right: 20px; 
        margin-left: 10px;
        position: relative; 
        z-index: 1000;
        order: -1;
    `;

    btnWrapper.innerHTML = `
        <button style="background: white; border: 1px solid rgba(1, 11, 79, 0.1); border-radius: 12px; width: 40px; height: 40px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; outline: none; position: relative; box-shadow: 0 4px 12px rgba(1, 11, 79, 0.05);"
                title="Start Recording with MeetingMind"
                onmouseover="this.style.background='#fdfcf5'; this.style.borderColor='#e0715533'; this.style.transform='translateY(-1px)'"
                onmouseout="this.style.background='white'; this.style.borderColor='rgba(1, 11, 79, 0.1)'; this.style.transform='none'">
            <svg viewBox="0 0 24 24" fill="none" style="width: 20px; height: 20px;">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="#01114f"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="#e07155" stroke-width="2" stroke-linecap="round"/>
                <line x1="12" y1="19" x2="12" y2="23" stroke="#e07155" stroke-width="2" stroke-linecap="round"/>
                <line x1="8" y1="23" x2="16" y2="23" stroke="#e07155" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <div id="mm-status-dot" style="position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; background: #e07155; border-radius: 50%; display: none; border: 2px solid white; box-shadow: 0 0 8px #e0715566;"></div>
        </button>
    `;

    const btn = btnWrapper.querySelector('button');
    const dot = btnWrapper.querySelector('#mm-status-dot');

    btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        chrome.storage.local.get('userEmail', (data) => {
            if (!data.userEmail) {
                alert('Please sign in via the MeetingMind extension popup before recording.');
                return;
            }

            if (!isRecording) {
                const title = document.title?.replace(' - Google Meet', '').trim() || 'Meeting';
                btn.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.4)';
                chrome.runtime.sendMessage({
                    action: 'START_BOT',
                    meetingUrl: window.location.href,
                    meetingTitle: title
                }, (response) => {
                    if (response?.ok) {
                        isRecording = true; // Still using this for UI state purposes
                        updateUIState();
                        showOverlay('joining');
                        startBotStatusPolling();
                    }
                });
            } else {
                chrome.runtime.sendMessage({
                    action: 'STOP_BOT',
                    meetingUrl: window.location.href
                }, () => {
                    isRecording = false;
                    stopBotStatusPolling();
                    updateUIState();
                    showOverlay('saved');
                    setTimeout(() => removeOverlay(), 4000);
                });
            }
        });
    };

    // Prepend to the toolbar to place it at the far left of the central bank
    toolbar.prepend(btnWrapper);
}

// ── Overlay UI (Premium Dark Mode) ──────────────────────────
function showOverlay(state) {
    removeOverlay();
    overlayEl = document.createElement('div');
    overlayEl.style = "position: fixed; bottom: 100px; left: 24px; z-index: 10000; font-family: sans-serif; pointer-events: none;";

    const isRecording = state === 'recording';
    const isSaved = state === 'saved';
    const isWaiting = state === 'waiting_admit';
    const isJoining = state === 'joining';

    overlayEl.innerHTML = `
        <div style="background: rgba(241, 239, 216, 0.95); backdrop-filter: blur(12px); padding: 16px 24px; border-radius: 20px; border: 1px solid rgba(224, 113, 85, 0.4); box-shadow: 0 20px 40px rgba(1, 17, 79, 0.2); display: flex; align-items: center; gap: 16px; min-width: 280px; transition: 0.3s; pointer-events: auto;">
            <div style="width: 44px; height: 44px; background: ${isSaved ? '#10b981' : (isRecording ? '#e07155' : '#3b82f6')}; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 0 15px rgba(224, 113, 85, 0.2);">
                ${isSaved ? '✅' : '🤖'}
            </div>
            <div style="display: flex; flex-direction: column;">
                <div style="color: #01114f; font-weight: 800; font-size: 15px; letter-spacing: 0.5px; margin-bottom: 2px;">
                    ${isSaved ? 'MEETING SAVED' : (isRecording ? 'LIVE RECORDING' : (isWaiting ? 'WAITING FOR HOST' : 'BOT JOINING...'))}
                </div>
                <div style="color: #01114f; opacity: 0.6; font-size: 13px;">
                    ${isSaved ? 'Audio saved to backend folder' : (isRecording ? 'MeetingMind is listening...' : (isWaiting ? 'Please admit the bot now' : 'Launching AI notetaker...'))}
                </div>
            </div>
            ${isRecording ? '<div style="width: 10px; height: 10px; background: #e07155; border-radius: 50%; animation: pulse 1s infinite; margin-left: auto;"></div>' : ''}
        </div>
        <style>
            @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }
        </style>
    `;
    document.body.appendChild(overlayEl);
}

function removeOverlay() {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }
}

// ── Bot Status Polling ──────────────────────────────────────
function startBotStatusPolling() {
    if (botStatusInterval) clearInterval(botStatusInterval);
    botStatusInterval = setInterval(() => {
        chrome.runtime.sendMessage({
            action: 'GET_BOT_STATUS',
            meetingUrl: window.location.href
        }, (res) => {
            if (res?.ok && res.status) {
                if (res.status === 'recording') {
                    showOverlay('recording');
                    stopBotStatusPolling();
                } else if (res.status === 'waiting_admit') {
                    showOverlay('waiting_admit');
                } else if (res.status === 'joining') {
                    showOverlay('joining');
                } else if (res.status === 'not_found' && isRecording) {
                    // Bot probably died or finished
                    isRecording = false;
                    updateUIState();
                    removeOverlay();
                    stopBotStatusPolling();
                }
            }
        });
    }, 2000);
}

function stopBotStatusPolling() {
    if (botStatusInterval) {
        clearInterval(botStatusInterval);
        botStatusInterval = null;
    }
}

// ── Lifecycle & Sync ─────────────────────────────────────────
function updateUIState() {
    const dot = document.querySelector('#mm-status-dot');
    const btnContainer = document.querySelector('#mm-toolbar-btn');
    const btn = btnContainer?.querySelector('button');
    if (!dot || !btn) return;

    if (isRecording) {
        dot.style.display = 'block';
        btn.style.boxShadow = '0 0 12px rgba(59, 130, 246, 0.4)';
    } else {
        dot.style.display = 'none';
        btn.style.boxShadow = 'none';
    }
}

// Initial Sync from session
chrome.runtime.sendMessage({ action: 'GET_RECORDING_STATE' }, (state) => {
    if (state?.isRecording) {
        isRecording = true;
        updateUIState();
        startBotStatusPolling();
    }
});

// Listener for state changes (from popup or background)
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'RECORDING_STARTED') {
        isRecording = true;
        updateUIState();
        showOverlay('recording');
    } else if (msg.action === 'RECORDING_STOPPED') {
        isRecording = false;
        updateUIState();
        showOverlay('saved');
        setTimeout(() => removeOverlay(), 4000);
    }
});

function checkMeeting() {
    const isMeeting = window.location.href.includes('meet.google.com/') && window.location.href.length > 30;
    if (isMeeting && !wasInMeeting) {
        wasInMeeting = true;
        console.log('[Content] 🟢 Meeting started');
    }
}

setInterval(checkMeeting, 2000);
setInterval(() => {
    injectToolbarButton();
    updateUIState();
}, 3000);