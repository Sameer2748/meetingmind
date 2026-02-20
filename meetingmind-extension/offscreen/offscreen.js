// offscreen/offscreen.js
// Records tab audio + user's microphone, mixed into a single stream.

console.log('[Offscreen] ========== OFFSCREEN DOCUMENT LOADED ==========')

let mediaRecorder = null
let recordedChunks = []
let tabStream = null
let micStream = null
let audioContext = null

// Tell background we're ready
chrome.runtime.sendMessage({ action: 'OFFSCREEN_READY' }).catch(() => { })

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Offscreen] 📨 received:', message.action)

    if (message.action === 'START_CAPTURE') {
        startCapture(message.streamId)
        sendResponse({ ok: true, from: 'offscreen' })
    } else if (message.action === 'STOP_CAPTURE') {
        stopCapture()
        sendResponse({ ok: true, from: 'offscreen' })
    } else if (message.action === 'MERGE_AUDIO') {
        mergeAudioFiles(message.tabDataUrl, message.micDataUrl)
            .then(mergedDataUrl => {
                sendResponse({ ok: true, mergedDataUrl })
            })
            .catch(err => {
                console.error('[Offscreen] ❌ Merge failed:', err)
                sendResponse({ ok: false, error: err.message })
            })
        return true // async response
    }
    return true
})

async function startCapture(streamId) {
    console.log('[Offscreen] 🎙️ Starting capture...')

    try {
        // ── Step 1: Get tab audio stream ──────────────────
        console.log('[Offscreen] Getting tab audio...')
        tabStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: false
        })
        console.log('[Offscreen] ✅ Tab audio stream obtained!')
        logTracks('Tab', tabStream)

        // ── Step 2: Get user's microphone ──────────────────
        let hasMic = false
        try {
            console.log('[Offscreen] Getting microphone...')
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            })
            console.log('[Offscreen] ✅ Microphone stream obtained!')
            logTracks('Mic', micStream)
            hasMic = true
        } catch (micErr) {
            console.warn('[Offscreen] ⚠️ Mic not available:', micErr.message)
            console.log('[Offscreen] Will record tab audio only (no your voice)')
        }

        // ── Step 3: Mix tab + mic into one stream ──────────
        let recordStream

        if (hasMic) {
            console.log('[Offscreen] Mixing tab audio + mic...')
            audioContext = new AudioContext()

            const tabSource = audioContext.createMediaStreamSource(tabStream)
            const micSource = audioContext.createMediaStreamSource(micStream)
            const destination = audioContext.createMediaStreamDestination()

            // Adjust mic volume relative to tab (you can tweak this)
            const micGain = audioContext.createGain()
            micGain.gain.value = 1.0 // 1.0 = normal, increase if your voice is too quiet

            const tabGain = audioContext.createGain()
            tabGain.gain.value = 1.0

            tabSource.connect(tabGain)
            tabGain.connect(destination)

            micSource.connect(micGain)
            micGain.connect(destination)

            recordStream = destination.stream
            console.log('[Offscreen] ✅ Mixed stream created (tab + mic)')
        } else {
            recordStream = tabStream
            console.log('[Offscreen] Using tab-only stream')
        }

        // ── Step 4: Start MediaRecorder ──────────────────
        recordedChunks = []

        let mimeType = 'audio/webm;codecs=opus'
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm'
        console.log('[Offscreen] MIME:', mimeType)

        mediaRecorder = new MediaRecorder(recordStream, { mimeType })

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data)
                console.log(`[Offscreen] 📦 Chunk: ${e.data.size} bytes (total: ${recordedChunks.length})`)
            }
        }

        mediaRecorder.onerror = (err) => {
            console.error('[Offscreen] ❌ MediaRecorder error:', err)
        }

        mediaRecorder.onstart = () => {
            console.log('[Offscreen] ✅ 🔴 RECORDING STARTED!')
            console.log('[Offscreen] Sources:', hasMic ? 'Tab + Mic' : 'Tab only')
        }

        mediaRecorder.onstop = () => {
            console.log('[Offscreen] ✅ RECORDING STOPPED! Chunks:', recordedChunks.length)
            saveRecording()
        }

        mediaRecorder.start(3000)
        console.log('[Offscreen] 🔴 Recording... (3s chunks)')

    } catch (err) {
        console.error('[Offscreen] ❌ CAPTURE FAILED:', err.name, err.message)
    }
}

function stopCapture() {
    console.log('[Offscreen] 🛑 Stopping...')

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
    } else if (recordedChunks.length > 0) {
        saveRecording()
    }

    // Clean up streams
    if (tabStream) {
        tabStream.getTracks().forEach(t => t.stop())
        tabStream = null
    }
    if (micStream) {
        micStream.getTracks().forEach(t => t.stop())
        micStream = null
    }
    if (audioContext) {
        audioContext.close().catch(() => { })
        audioContext = null
    }
}

function saveRecording() {
    console.log('[Offscreen] 💾 Saving... Chunks:', recordedChunks.length)

    if (recordedChunks.length === 0) {
        console.error('[Offscreen] ❌ No chunks!')
        return
    }

    const blob = new Blob(recordedChunks, { type: 'audio/webm' })
    console.log('[Offscreen] Blob:', blob.size, 'bytes', `(${Math.round(blob.size / 1024)} KB)`)

    const reader = new FileReader()
    reader.onload = () => {
        const filename = `meeting-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`
        chrome.runtime.sendMessage({
            action: 'SAVE_RECORDING',
            dataUrl: reader.result,
            filename: filename,
            size: blob.size
        }).then(() => {
            console.log('[Offscreen] ✅ Sent to background for download!')
        }).catch(err => {
            console.error('[Offscreen] ❌ Send failed:', err)
        })
    }
    reader.onerror = (err) => console.error('[Offscreen] ❌ FileReader error:', err)
    reader.readAsDataURL(blob)
}

function logTracks(label, stream) {
    stream.getAudioTracks().forEach((t, i) => {
        console.log(`[Offscreen] ${label} Track ${i}:`, {
            label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState
        })
    })
}

// ── Audio Merging (tab + mic → single file) ───────────────
async function mergeAudioFiles(tabDataUrl, micDataUrl) {
    console.log('[Offscreen] 🔀 Merging tab + mic audio...')

    // Fetch both as array buffers
    const [tabRes, micRes] = await Promise.all([
        fetch(tabDataUrl), fetch(micDataUrl)
    ])
    const [tabBuf, micBuf] = await Promise.all([
        tabRes.arrayBuffer(), micRes.arrayBuffer()
    ])

    // Decode both audio files
    const ctx = new AudioContext()
    const [tabAudio, micAudio] = await Promise.all([
        ctx.decodeAudioData(tabBuf),
        ctx.decodeAudioData(micBuf)
    ])

    console.log('[Offscreen] Tab:', tabAudio.duration.toFixed(1) + 's', tabAudio.sampleRate + 'Hz')
    console.log('[Offscreen] Mic:', micAudio.duration.toFixed(1) + 's', micAudio.sampleRate + 'Hz')

    // Create offline context for mixing
    const sampleRate = tabAudio.sampleRate
    const duration = Math.max(tabAudio.duration, micAudio.duration)
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate)

    // Tab source
    const tabSource = offlineCtx.createBufferSource()
    tabSource.buffer = tabAudio
    tabSource.connect(offlineCtx.destination)
    tabSource.start(0)

    // Mic source with gain boost
    const micSource = offlineCtx.createBufferSource()
    micSource.buffer = micAudio
    const micGain = offlineCtx.createGain()
    micGain.gain.value = 1.3  // Boost mic slightly
    micSource.connect(micGain)
    micGain.connect(offlineCtx.destination)
    micSource.start(0)

    // Render mixed audio
    const mergedBuffer = await offlineCtx.startRendering()
    console.log('[Offscreen] ✅ Merged! Duration:', mergedBuffer.duration.toFixed(1) + 's')

    ctx.close()

    // Encode as WAV
    const wavBlob = audioBufferToWav(mergedBuffer)
    console.log('[Offscreen] WAV blob:', Math.round(wavBlob.size / 1024), 'KB')

    // Convert to data URL
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Failed to read merged audio'))
        reader.readAsDataURL(wavBlob)
    })
}

function audioBufferToWav(buffer) {
    const numChannels = 1
    const sampleRate = buffer.sampleRate
    const numSamples = buffer.length
    const bytesPerSample = 2
    const dataSize = numSamples * numChannels * bytesPerSample

    const wavBuf = new ArrayBuffer(44 + dataSize)
    const view = new DataView(wavBuf)

    // RIFF header
    writeStr(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeStr(view, 8, 'WAVE')
    // fmt chunk
    writeStr(view, 12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)  // PCM
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
    view.setUint16(32, numChannels * bytesPerSample, true)
    view.setUint16(34, bytesPerSample * 8, true)
    // data chunk
    writeStr(view, 36, 'data')
    view.setUint32(40, dataSize, true)

    const channelData = buffer.getChannelData(0)
    let offset = 44
    for (let i = 0; i < numSamples; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]))
        view.setInt16(offset, sample * 0x7FFF, true)
        offset += 2
    }

    return new Blob([wavBuf], { type: 'audio/wav' })
}

function writeStr(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
    }
}

console.log('[Offscreen] ========== READY ==========')
