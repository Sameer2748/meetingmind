// worker/background.js
console.log('[Background] ========== SERVICE WORKER STARTED ==========')

// Store mic recording data URL (arrives from content script)
let pendingMicDataUrl = null

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') console.log('[Background] First time installed!')
  if (details.reason === 'update') console.log('[Background] Extension updated!')
})

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] 📨 ACTION RECEIVED:', message.action);

  if (message.action === 'PING') {
    sendResponse({ ok: true, pong: true });
    return true;

  } else if (message.action === 'START_RECORDING') {
    handleStartRecording(message.streamId, message.tabId, message.title)
      .then(() => sendResponse({ ok: true }))
      .catch(err => {
        console.error('[Background] ❌ Start failed:', err)
        sendResponse({ ok: false, error: err.message })
      })
    return true

  } else if (message.action === 'STOP_RECORDING') {
    handleStopRecording()
    sendResponse({ ok: true })

  } else if (message.action === 'SAVE_RECORDING') {
    handleSaveRecording(message)
    sendResponse({ ok: true })

  } else if (message.action === 'GET_RECORDING_STATE') {
    chrome.storage.session.get(['isRecording', 'recordingStartTime', 'recordingTitle'], (data) => {
      sendResponse(data)
    })
    return true

  } else if (message.action === 'SAVE_MIC_RECORDING') {
    console.log('[Background] 🎤 Mic recording received:', message.filename, `(${Math.round(message.size / 1024)} KB)`)
    // Store mic data URL for merging with tab audio
    pendingMicDataUrl = message.dataUrl
    console.log('[Background] 🎤 Stored mic data for merge')
    sendResponse({ ok: true })

    return true

  } else if (message.action === 'START_BOT') {
    console.log('[Background] 🤖 Requesting bot join for:', message.meetingUrl)

    chrome.storage.session.get(['isRecording', 'recordingUrl'], (session) => {
      if (session.isRecording && session.recordingUrl === message.meetingUrl) {
        console.log('[Background] ⚠️ Recording already in progress for this meeting.');
        sendResponse({ ok: false, error: 'Already recording' });
        return;
      }

      // Update session state so popup shows recording
      const startTime = Date.now();
      chrome.storage.session.set({
        isRecording: true,
        recordingStartTime: startTime,
        recordingTitle: message.meetingTitle || 'Meeting',
        recordingUrl: message.meetingUrl,
        recordingType: 'BOT'
      });

      chrome.action.setBadgeText({ text: 'BOT' })
      chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' })

      // Get user email and token to associate with recording
      chrome.storage.local.get(['userEmail', 'authToken'], (data) => {
        const userEmail = data.userEmail || 'anonymous';
        const authToken = data.authToken || '';

        fetch('http://localhost:5001/api/bot/join', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            meetingUrl: message.meetingUrl,
            userEmail: userEmail
          })
        })
          .then(res => res.json())
          .then(data => sendResponse({ ok: true, data }))
          .catch(err => {
            console.error('[Background] 🤖 Bot start failed:', err)
            // Revert state on error
            chrome.storage.session.set({ isRecording: false, recordingUrl: null });
            chrome.action.setBadgeText({ text: '' })
            sendResponse({ ok: false, error: err.message })
          })
      })
    })
    return true

  } else if (message.action === 'GOOGLE_LOGIN') {
    handleGoogleLogin(sendResponse);
    return true;

  } else if (message.action === 'STOP_BOT') {
    console.log('[Background] 🛑 Requesting bot stop for:', message.meetingUrl)

    // Clear session state
    chrome.storage.session.set({ isRecording: false });
    chrome.action.setBadgeText({ text: '' })

    chrome.storage.local.get('authToken', (data) => {
      fetch('http://localhost:5001/api/bot/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.authToken || ''}`
        },
        body: JSON.stringify({ meetingUrl: message.meetingUrl })
      })
        .then(res => res.json())
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => {
          console.error('[Background] 🛑 Bot stop failed:', err)
          sendResponse({ ok: false, error: err.message })
        })
    })
    return true

  } else if (message.action === 'GET_BOT_STATUS') {
    chrome.storage.local.get('authToken', (data) => {
      fetch(`http://localhost:5001/api/bot/status?meetingUrl=${encodeURIComponent(message.meetingUrl)}`, {
        headers: {
          'Authorization': `Bearer ${data.authToken || ''}`
        }
      })
        .then(res => res.json())
        .then(data => sendResponse({ ok: true, status: data.status }))
        .catch(err => sendResponse({ ok: false, error: err.message }))
    })
    return true

  } else {
    sendResponse({ ok: true })
  }

  return true
})

// ── Google Auth Flow ─────────────────────────────────────
async function handleGoogleLogin(sendResponse) {
  console.log('[Background] 🔑 Starting Google OAuth Flow...');
  const CLIENT_ID = '99496009159-1l11a7nj8samhopvrjgcfcer75q3ssh0.apps.googleusercontent.com';
  const REDIRECT_URI = chrome.identity.getRedirectURL();
  const SCOPE = encodeURIComponent('email profile openid');
  const AUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPE}`;

  chrome.identity.launchWebAuthFlow({
    url: AUTH_URL,
    interactive: true
  }, (responseUrl) => {
    if (chrome.runtime.lastError) {
      console.error('[Background] Auth Error:', chrome.runtime.lastError.message);
      sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      return;
    }

    if (!responseUrl) {
      sendResponse({ ok: false, error: 'No response from Google' });
      return;
    }

    const tokenMatch = responseUrl.match(/access_token=([^&]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (!token) {
      sendResponse({ ok: false, error: 'Token missing in response' });
      return;
    }

    // Fetch user profile
    fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(async data => {
        if (data.email) {
          console.log('[Background] ✅ User identified:', data.email);

          // Sync with backend
          const authRes = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: data.email })
          });
          const authData = await authRes.json();

          if (authData.token) {
            await chrome.storage.local.set({
              userEmail: data.email,
              authToken: authData.token
            });
            sendResponse({ ok: true, email: data.email });
          } else {
            sendResponse({ ok: false, error: 'Backend auth failed' });
          }
        } else {
          sendResponse({ ok: false, error: 'Email not shared' });
        }
      })
      .catch(err => {
        console.error('[Background] Profile sync failed:', err);
        sendResponse({ ok: false, error: err.message });
      });
  });
}

// ── Start Recording ──────────────────────────────────────
async function handleStartRecording(streamId, tabId, title) {
  console.log('[Background] 🎙️ Starting recording for:', title)

  await ensureOffscreenDocument()
  await new Promise(r => setTimeout(r, 300))

  const response = await chrome.runtime.sendMessage({
    action: 'START_CAPTURE',
    streamId, tabId
  })
  console.log('[Background] ✅ Offscreen:', response)

  const startTime = Date.now()
  await chrome.storage.session.set({
    isRecording: true,
    recordingStartTime: startTime,
    recordingTitle: title,
    recordingTabId: tabId
  })

  chrome.action.setBadgeText({ text: 'REC' })
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })

  chrome.tabs.sendMessage(tabId, {
    action: 'RECORDING_STARTED',
    title, startTime
  }).catch(() => { })

  chrome.notifications.create('recording-start', {
    type: 'basic',
    iconUrl: '../assets/icon128.png',
    title: 'MeetingMind',
    message: `Recording "${title}"...`
  })
}

// ── Stop Recording ──────────────────────────────────────
function handleStopRecording() {
  console.log('[Background] 🛑 Stopping...')

  chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' }).catch(err => {
    console.error('[Background] ❌ Stop message failed:', err)
  })

  chrome.storage.session.get('recordingTabId', (data) => {
    if (data.recordingTabId) {
      chrome.tabs.sendMessage(data.recordingTabId, {
        action: 'RECORDING_STOPPED'
      }).catch(() => { })
    }
  })
}

// ── Save Recording + Trigger Transcription ───────────────
async function handleSaveRecording(message) {
  console.log('[Background] 💾 Saving:', message.filename, `(${Math.round(message.size / 1024)} KB)`)

  // Download the file
  chrome.downloads.download({
    url: message.dataUrl,
    filename: message.filename,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[Background] ❌ Download error:', chrome.runtime.lastError)
    } else {
      console.log('[Background] ✅ Download started, ID:', downloadId)
    }
  })

  // Clear recording state
  chrome.storage.session.set({ isRecording: false })
  chrome.action.setBadgeText({ text: '' })

  // Notify content script about save
  const sessionData = await chrome.storage.session.get('recordingTabId')
  if (sessionData.recordingTabId) {
    chrome.tabs.sendMessage(sessionData.recordingTabId, {
      action: 'RECORDING_SAVED',
      filename: message.filename
    }).catch(() => { })
  }

  // ── Trigger Transcription with AssemblyAI ─────────────
  const syncData = await chrome.storage.sync.get('assemblyaiKey')
  if (!syncData.assemblyaiKey) {
    console.log('[Background] 🧠 Local transcription skipped (managed by backend)')
    if (sessionData.recordingTabId) {
      chrome.tabs.sendMessage(sessionData.recordingTabId, {
        action: 'TRANSCRIPTION_STATUS',
        status: 'completed',
        message: 'Recording saved! Transcription in progress on server...'
      }).catch(() => { })
    }
    return
  }

  console.log('[Background] 🧠 Starting transcription...')

  // Notify content script
  if (sessionData.recordingTabId) {
    chrome.tabs.sendMessage(sessionData.recordingTabId, {
      action: 'TRANSCRIPTION_STATUS',
      status: 'uploading',
      message: 'Merging & uploading audio...'
    }).catch(() => { })
  }

  try {
    // Wait briefly for mic recording to arrive (it comes from content script)
    if (!pendingMicDataUrl) {
      console.log('[Background] ⏳ Waiting for mic recording...')
      await new Promise(r => setTimeout(r, 3000))
    }

    let audioBlob

    if (pendingMicDataUrl) {
      // ── Merge tab + mic audio in offscreen document ──────
      console.log('[Background] 🔀 Merging tab + mic audio...')
      if (sessionData.recordingTabId) {
        chrome.tabs.sendMessage(sessionData.recordingTabId, {
          action: 'TRANSCRIPTION_STATUS',
          status: 'uploading',
          message: 'Merging your voice + tab audio...'
        }).catch(() => { })
      }

      try {
        const mergeResult = await chrome.runtime.sendMessage({
          action: 'MERGE_AUDIO',
          tabDataUrl: message.dataUrl,
          micDataUrl: pendingMicDataUrl
        })

        if (mergeResult?.ok && mergeResult.mergedDataUrl) {
          const mergedRes = await fetch(mergeResult.mergedDataUrl)
          audioBlob = await mergedRes.blob()
          console.log('[Background] ✅ Merged audio:', Math.round(audioBlob.size / 1024), 'KB')
        } else {
          console.warn('[Background] ⚠️ Merge failed, using tab audio only:', mergeResult?.error)
          const tabRes = await fetch(message.dataUrl)
          audioBlob = await tabRes.blob()
        }
      } catch (mergeErr) {
        console.warn('[Background] ⚠️ Merge error, using tab audio only:', mergeErr.message)
        const tabRes = await fetch(message.dataUrl)
        audioBlob = await tabRes.blob()
      }

      pendingMicDataUrl = null  // Clear after use
    } else {
      // No mic recording — use tab audio only
      console.log('[Background] No mic data — using tab audio only')
      const tabRes = await fetch(message.dataUrl)
      audioBlob = await tabRes.blob()
    }

    console.log('[Background] Audio blob for upload:', audioBlob.size, 'bytes')

    const apiKey = syncData.assemblyaiKey

    // Step 1: Upload audio to AssemblyAI
    console.log('[Background] Uploading to AssemblyAI...')
    const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'content-type': 'application/octet-stream'
      },
      body: audioBlob
    })

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text().catch(() => 'no body')
      throw new Error(`Upload failed: ${uploadRes.status} — ${errBody}`)
    }

    const uploadData = await uploadRes.json()
    console.log('[Background] ✅ Uploaded:', uploadData.upload_url)

    // Step 2: Request transcription with speaker diarization
    if (sessionData.recordingTabId) {
      chrome.tabs.sendMessage(sessionData.recordingTabId, {
        action: 'TRANSCRIPTION_STATUS',
        status: 'transcribing',
        message: 'Transcribing with speaker detection...'
      }).catch(() => { })
    }

    const transcriptBody = {
      audio_url: uploadData.upload_url,
      speaker_labels: true,
      language_detection: true,
      speech_models: ['universal-3-pro', 'universal-2']
    }
    console.log('[Background] Transcript request:', JSON.stringify(transcriptBody))

    const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(transcriptBody)
    })

    if (!transcriptRes.ok) {
      const errBody = await transcriptRes.text().catch(() => 'no body')
      console.error('[Background] Transcript API error body:', errBody)
      throw new Error(`Transcript request failed: ${transcriptRes.status} — ${errBody}`)
    }

    const transcriptData = await transcriptRes.json()
    console.log('[Background] ✅ Transcript queued, ID:', transcriptData.id)

    // Step 3: Poll for completion
    await pollTranscription(transcriptData.id, apiKey, sessionData.recordingTabId)

  } catch (err) {
    console.error('[Background] ❌ Transcription error:', err)
    if (sessionData.recordingTabId) {
      chrome.tabs.sendMessage(sessionData.recordingTabId, {
        action: 'TRANSCRIPTION_STATUS',
        status: 'error',
        message: 'Transcription failed: ' + err.message
      }).catch(() => { })
    }
  }
}

// ── Poll AssemblyAI for transcript result ─────────────────
async function pollTranscription(transcriptId, apiKey, tabId) {
  console.log('[Background] Polling transcript:', transcriptId)

  const maxAttempts = 60 // 5 minutes max (5s intervals)
  let attempts = 0

  while (attempts < maxAttempts) {
    attempts++
    await new Promise(r => setTimeout(r, 5000)) // wait 5s

    const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'authorization': apiKey }
    })
    const data = await res.json()

    console.log(`[Background] Poll #${attempts}: ${data.status}`)

    if (data.status === 'completed') {
      console.log('[Background] ✅ Transcription complete!')
      console.log('[Background] Text:', data.text?.substring(0, 100) + '...')
      console.log('[Background] Utterances:', data.utterances?.length)

      // Format the diarized transcript
      const transcript = formatTranscript(data)

      // Save transcript
      await chrome.storage.local.set({
        [`transcript_${transcriptId}`]: {
          id: transcriptId,
          text: data.text,
          utterances: data.utterances,
          formatted: transcript,
          timestamp: Date.now()
        }
      })

      // Notify content script
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: 'TRANSCRIPTION_COMPLETE',
          transcript: transcript,
          utterances: data.utterances,
          fullText: data.text,
          transcriptId: transcriptId
        }).catch(() => { })
      }

      // Download transcript as text file
      const txtBlob = new Blob([transcript], { type: 'text/plain' })
      const reader = new FileReader()
      reader.onload = () => {
        chrome.downloads.download({
          url: reader.result,
          filename: `transcript-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
          saveAs: false
        })
      }
      reader.readAsDataURL(txtBlob)

      return
    }

    if (data.status === 'error') {
      throw new Error(data.error || 'Transcription failed')
    }

    // Update status
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        action: 'TRANSCRIPTION_STATUS',
        status: 'transcribing',
        message: `Transcribing... (${attempts * 5}s)`
      }).catch(() => { })
    }
  }

  throw new Error('Transcription timed out')
}

// ── Format transcript with speaker labels ─────────────────
function formatTranscript(data) {
  if (!data.utterances || data.utterances.length === 0) {
    return data.text || 'No transcript available'
  }

  let output = '═══════════════════════════════════════\n'
  output += '  MEETING TRANSCRIPT — MeetingMind\n'
  output += `  ${new Date().toLocaleString()}\n`
  output += '═══════════════════════════════════════\n\n'

  data.utterances.forEach(u => {
    const startMin = Math.floor(u.start / 60000)
    const startSec = Math.floor((u.start % 60000) / 1000)
    const timestamp = `${String(startMin).padStart(2, '0')}:${String(startSec).padStart(2, '0')}`
    output += `[${timestamp}] Speaker ${u.speaker}:\n`
    output += `  ${u.text}\n\n`
  })

  output += '═══════════════════════════════════════\n'
  output += `  ${data.utterances.length} segments from ${new Set(data.utterances.map(u => u.speaker)).size} speakers\n`
  output += '═══════════════════════════════════════\n'

  return output
}

// ── Offscreen Document ───────────────────────────────────
async function ensureOffscreenDocument() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    })
    if (contexts.length > 0) return
  } catch (_) { }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording tab audio + mic'
    })
    console.log('[Background] ✅ Offscreen created!')
  } catch (err) {
    if (!err.message?.includes('already exists')) throw err
  }
}