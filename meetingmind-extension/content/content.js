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
    btnWrapper.style.cssText = `
        display: inline-flex !important; 
        align-items: center !important; 
        justify-content: center !important; 
        width: 44px !important; 
        height: 48px !important; 
        flex-shrink: 0 !important; 
        margin: 0 4px !important;
        position: relative !important; 
        z-index: 1000 !important;
    `;

    const button = document.createElement('button');
    button.id = 'mm-button-element';
    button.title = 'Start Recording with MeetingMind';

    // Make the ACTUAL button transparent so Meet can't turn it white
    button.style.cssText = `
        background: transparent !important;
        background-color: transparent !important;
        border: none !important;
        padding: 0 !important;
        margin: 0 !important;
        width: 40px !important;
        height: 40px !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        outline: none !important;
        position: relative !important;
    `;

    const iconBox = document.createElement('div');
    iconBox.style.cssText = `
        background: #e07155 !important;
        background-color: #e07155 !important;
        width: 40px !important;
        height: 40px !important;
        border-radius: 12px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
        transition: all 0.2s !important;
        box-shadow: 0 4px 12px rgba(224, 113, 85, 0.2) !important;
    `;

    const img = document.createElement('img');
    img.id = 'mm-main-logo';
    img.src = chrome.runtime.getURL('assets/icon128.png');
    img.style.cssText = `
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        display: block !important;
        pointer-events: none !important;
        transition: transform 0.3s !important;
    `;

    button.onmouseover = () => {
        img.style.transform = 'scale(1.1)';
        iconBox.style.backgroundColor = '#ec7f65';
        iconBox.style.boxShadow = '0 6px 16px rgba(224, 113, 85, 0.3)';
    };
    button.onmouseout = () => {
        img.style.transform = 'scale(1)';
        iconBox.style.backgroundColor = '#e07155';
        iconBox.style.boxShadow = '0 4px 12px rgba(224, 113, 85, 0.2)';
    };

    const statusDot = document.createElement('div');
    statusDot.id = 'mm-status-dot';
    Object.assign(statusDot.style, {
        position: 'absolute',
        top: '2px',
        right: '2px',
        width: '10px',
        height: '10px',
        background: '#ef4444',
        borderRadius: '50%',
        display: 'none',
        border: '2px solid white',
        boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)',
        zIndex: '10001'
    });
    statusDot.style.animation = 'mm-pulse 1.5s infinite';

    iconBox.appendChild(img);
    button.appendChild(iconBox);
    button.appendChild(statusDot);

    const style = document.createElement('style');
    style.textContent = `
        @keyframes mm-pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
    `;

    btnWrapper.appendChild(button);
    btnWrapper.appendChild(style);

    const btn = button;
    const dot = statusDot;

    btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (btn.disabled) return;

        chrome.storage.local.get('userEmail', (data) => {
            if (!data.userEmail) {
                alert('Please sign in via the MeetingMind extension popup before recording.');
                return;
            }

            if (!isRecording) {
                const title = document.title?.replace(' - Google Meet', '').trim() || 'Meeting';
                btn.disabled = true;
                btn.style.opacity = '0.7';

                chrome.runtime.sendMessage({
                    action: 'START_BOT',
                    meetingUrl: window.location.href,
                    meetingTitle: title
                }, (response) => {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    if (response?.ok) {
                        isRecording = true;
                        updateUIState();
                        showOverlay('joining');
                        startBotStatusPolling();
                    } else if (response?.error === 'Already recording') {
                        isRecording = true;
                        updateUIState();
                    }
                });
            } else {
                btn.disabled = true;
                btn.style.opacity = '0.7';
                chrome.runtime.sendMessage({
                    action: 'STOP_BOT',
                    meetingUrl: window.location.href
                }, () => {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    isRecording = false;
                    stopBotStatusPolling();
                    updateUIState();
                    showOverlay('saved');
                    setTimeout(() => removeOverlay(), 4000);
                });
            }
        });
    };

    // Prepend to toolbar
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

    const container = document.createElement('div');
    Object.assign(container.style, {
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(16px)',
        padding: '18px 24px',
        borderRadius: '24px',
        border: '1px solid rgba(1, 11, 79, 0.08)',
        boxShadow: '0 25px 50px -12px rgba(1, 11, 79, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '18px',
        minWidth: '300px',
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        pointerEvents: 'auto',
        transformOrigin: 'bottom left'
    });

    const iconBox = document.createElement('div');
    Object.assign(iconBox.style, {
        width: '48px',
        height: '48px',
        background: isSaved ? '#10b981' : '#e07155',
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 8px 16px ${isSaved ? 'rgba(16, 185, 129, 0.2)' : 'rgba(224, 113, 85, 0.2)'} `,
        flexShrink: '0'
    });

    const iconImg = document.createElement('img');
    iconImg.src = chrome.runtime.getURL('assets/icon128.png');
    Object.assign(iconImg.style, {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: '12px',
        display: 'block'
    });
    iconBox.appendChild(iconImg);

    const textBox = document.createElement('div');
    Object.assign(textBox.style, { display: 'flex', flexDirection: 'column', flexGrow: '1' });

    const titleEl = document.createElement('div');
    titleEl.textContent = isSaved ? 'Meeting Saved' : (isRecording ? 'Live Recording' : (isWaiting ? 'Waiting for Host' : 'Bot Joining...'));
    Object.assign(titleEl.style, {
        color: '#01114f', fontWeight: '850', fontSize: '14px',
        letterSpacing: '0.8px', marginBottom: '2px', textTransform: 'uppercase'
    });

    const descEl = document.createElement('div');
    descEl.textContent = isSaved ? 'Conversation stored in dashboard' : (isRecording ? 'MeetingMind is listening...' : (isWaiting ? 'Please admit the bot now' : 'Launching AI notetaker...'));
    Object.assign(descEl.style, { color: '#01114f', opacity: '0.6', fontSize: '12px', fontWeight: '500' });

    textBox.appendChild(titleEl);
    textBox.appendChild(descEl);

    container.appendChild(iconBox);
    container.appendChild(textBox);

    if (isRecording) {
        const pulse = document.createElement('div');
        Object.assign(pulse.style, {
            width: '8px', height: '8px', background: '#ef4444', borderRadius: '50%',
            boxShadow: '0 0 12px #ef4444', marginLeft: '10px'
        });
        pulse.style.animation = 'mm-pulse-ring 1.5s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite';
        container.appendChild(pulse);
    }

    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
@keyframes mm - pulse - ring {
    0 % { transform: scale(0.8); opacity: 0.5; }
    50 % { transform: scale(1.2); opacity: 1; }
    100 % { transform: scale(0.8); opacity: 0.5; }
}
`;

    overlayEl.appendChild(container);
    overlayEl.appendChild(styleSheet);
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
    console.log('[MeetingMind] 🔍 Starting status polling...');
    botStatusInterval = setInterval(() => {
        chrome.runtime.sendMessage({
            action: 'GET_BOT_STATUS',
            meetingUrl: window.location.href
        }, (res) => {
            if (res?.ok && res.status) {
                console.log('[MeetingMind] 🤖 Bot Status:', res.status);
                if (res.status === 'recording') {
                    if (!isRecording) {
                        isRecording = true;
                        updateUIState();
                        showOverlay('recording');
                    }
                } else if (res.status === 'waiting_admit') {
                    showOverlay('waiting_admit');
                } else if (res.status === 'joining') {
                    showOverlay('joining');
                } else if (res.status === 'not_found' && isRecording) {
                    // Only reset if it's been 'not_found' for multiple polls to handle Redis lag
                    console.log('[MeetingMind] ⚠️ Bot not found, but we think we are recording. Ignoring for now...');
                }
            }
        });
    }, 3000);
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
    const btn = document.querySelector('#mm-button-element');

    if (!dot || !btn) return;

    if (isRecording) {
        console.log('[MeetingMind] UI Update: Showing RED DOT (Recording is TRUE)');
        dot.style.display = 'block';
        btn.style.borderColor = '#ef4444';
        btn.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.2)';
    } else {
        dot.style.display = 'none';
        btn.style.borderColor = 'rgba(1, 11, 79, 0.1)';
        btn.style.boxShadow = '0 4px 12px rgba(1, 11, 79, 0.05)';
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
    console.log('[MeetingMind] 📨 Message received:', msg.action);
    if (msg.action === 'RECORDING_STARTED') {
        isRecording = true;
        updateUIState();
        showOverlay('recording');
        startBotStatusPolling();
    } else if (msg.action === 'RECORDING_STOPPED') {
        isRecording = false;
        updateUIState();
        showOverlay('saved');
        stopBotStatusPolling();
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