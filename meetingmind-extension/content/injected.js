// content/injected.js
console.log('[Injected] ========== INJECTED SCRIPT LOADED ==========')
console.log('[Injected] running in PAGE context!')
console.log('[Injected] Time:', new Date().toLocaleTimeString())

// Audio recording setup
console.log('[Injected] 🎛️ creating AudioContext...')
const audioContext = new AudioContext()
console.log('[Injected] ✅ AudioContext created, state:', audioContext.state)

const mixedDestination = audioContext.createMediaStreamDestination()
console.log('[Injected] ✅ mixer destination created')

let mediaRecorder = null
let recordedChunks = []
let isRecording = false
let trackCount = 0

// Resume AudioContext on first user click
document.addEventListener('click', () => {
    console.log('[Injected] 👆 user clicked, checking AudioContext state:', audioContext.state)
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('[Injected] ✅ AudioContext resumed!')
        })
    }
}, { once: true })

const OriginalRTCPeerConnection = window.RTCPeerConnection

window.RTCPeerConnection = function (...args) {
    console.log('[Injected] 🎯 RTCPeerConnection intercepted!')

    const pc = new OriginalRTCPeerConnection(...args)

    pc.addEventListener('track', (event) => {
        const track = event.track
        const stream = event.streams[0]

        console.log('[Injected] ========================================')
        console.log('[Injected] 🎵 TRACK RECEIVED!')
        console.log('[Injected] Kind:', track.kind)
        console.log('[Injected] ID:', track.id)
        console.log('[Injected] Label:', track.label)
        console.log('[Injected] State:', track.readyState)
        console.log('[Injected] Muted:', track.muted)
        console.log('[Injected] Enabled:', track.enabled)
        console.log('[Injected] Stream ID:', stream?.id)
        console.log('[Injected] Stream tracks:', stream?.getTracks().length)

        // Try to get track settings
        try {
            const settings = track.getSettings()
            console.log('[Injected] Settings:', settings)
        } catch (e) {
            console.log('[Injected] No settings available')
        }
        console.log('[Injected] ========================================')

        if (track.kind !== 'audio') {
            console.log('[Injected] ⏭️ skipping non-audio track')
            return
        }

        trackCount++
        console.log(`[Injected] 🎤 AUDIO TRACK #${trackCount} CAPTURED!`)
        console.log(`[Injected] Track muted: ${event.track.muted} (Google Meet marks all tracks as muted!)`)

        // Connect track to mixer - we need ALL tracks, even "muted" ones
        try {
            const stream = new MediaStream([event.track])
            const source = audioContext.createMediaStreamSource(stream)
            source.connect(mixedDestination)
            console.log('[Injected] 🎚️ track connected to mixer!')
            console.log('[Injected] Mixer stream tracks:', mixedDestination.stream.getTracks().length)
        } catch (err) {
            console.error('[Injected] ❌ failed to connect track:', err)
        }

        console.log('[Injected] ℹ️ Track added to mixer, waiting for meeting to start...')

        // Tell content.js
        window.dispatchEvent(new CustomEvent('MM_AUDIO_TRACK', {
            detail: { trackId: track.id, kind: track.kind }
        }))
        console.log('[Injected] 📤 sent MM_AUDIO_TRACK event to content.js')
    })

    return pc
}

window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype

function startRecording() {
    console.log('[Injected] ========================================')
    console.log('[Injected] ▶️ startRecording() called')
    console.log('[Injected] AudioContext state:', audioContext.state)
    console.log('[Injected] ========================================')

    // Resume if suspended
    audioContext.resume().then(() => {
        console.log('[Injected] ✅ AudioContext state after resume:', audioContext.state)

        recordedChunks = []
        console.log('[Injected] 🗑️ cleared previous chunks')

        const stream = mixedDestination.stream
        const audioTracks = stream.getAudioTracks()
        console.log('[Injected] 📊 mixer stream has', stream.getTracks().length, 'total tracks')
        console.log('[Injected] 📊 mixer stream has', audioTracks.length, 'AUDIO tracks')

        // Safety check: don't start if no audio tracks
        if (audioTracks.length === 0) {
            console.error('[Injected] ❌ No audio tracks in mixer! Cannot start recording.')
            console.log('[Injected] This usually means:')
            console.log('[Injected] - Audio tracks were not properly connected')
            console.log('[Injected] - Only video tracks were received')
            isRecording = false
            return
        }

        try {
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            })
            console.log('[Injected] ✅ MediaRecorder created')
        } catch (err) {
            console.error('[Injected] ❌ MediaRecorder creation failed:', err)
            return
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size === 0) {
                console.log('[Injected] ⚠️ chunk with 0 bytes received, skipping')
                return
            }
            recordedChunks.push(e.data)
            console.log('[Injected] 📦 chunk recorded:', e.data.size, 'bytes')
            console.log('[Injected] Total chunks:', recordedChunks.length)
        }

        mediaRecorder.onerror = (err) => {
            console.error('[Injected] ❌ MediaRecorder error:', err)
        }

        mediaRecorder.onstart = () => {
            console.log('[Injected] ✅ MediaRecorder started!')
        }

        mediaRecorder.start(5000) // chunk every 5 seconds
        console.log('[Injected] 🔴 recording started! (5 second chunks)')
        console.log('[Injected] MediaRecorder state:', mediaRecorder.state)
    }).catch(err => {
        console.error('[Injected] ❌ AudioContext resume failed:', err)
    })
}

// Start triggered by content.js when meeting actually starts
window.addEventListener('MM_START_RECORDING', () => {
    console.log('[Injected] ========================================')
    console.log('[Injected] ▶️ MM_START_RECORDING event received!')
    console.log('[Injected] Time:', new Date().toLocaleTimeString())
    console.log('[Injected] ========================================')

    if (isRecording) {
        console.log('[Injected] ⚠️ already recording!')
        return
    }

    isRecording = true
    console.log('[Injected] 🎬 Meeting started, waiting 2s for all tracks to connect...')

    // Wait 2 seconds for all audio tracks to be connected
    setTimeout(() => {
        console.log('[Injected] ⏰ 2 seconds elapsed, starting recording now!')
        startRecording()
    }, 2000)
})

// Stop triggered by content.js when meeting ends
window.addEventListener('MM_STOP_RECORDING', () => {
    console.log('[Injected] ========================================')
    console.log('[Injected] ⏹️ MM_STOP_RECORDING event received!')
    console.log('[Injected] Time:', new Date().toLocaleTimeString())
    console.log('[Injected] ========================================')

    if (!mediaRecorder) {
        console.error('[Injected] ❌ no mediaRecorder found!')
        console.log('[Injected] isRecording:', isRecording)
        return
    }

    console.log('[Injected] MediaRecorder state:', mediaRecorder.state)

    if (mediaRecorder.state === 'inactive') {
        console.error('[Injected] ❌ MediaRecorder already inactive!')
        return
    }

    console.log('[Injected] 🛑 stopping MediaRecorder...')
    mediaRecorder.stop()

    mediaRecorder.onstop = () => {
        console.log('[Injected] ========================================')
        console.log('[Injected] ✅ MediaRecorder stopped!')
        console.log('[Injected] Chunks collected:', recordedChunks.length)
        console.log('[Injected] ========================================')

        if (recordedChunks.length === 0) {
            console.error('[Injected] ❌ no chunks recorded!')
            console.log('[Injected] Possible reasons:')
            console.log('[Injected] - Meeting was too short (< 5 seconds)')
            console.log('[Injected] - AudioContext was suspended')
            console.log('[Injected] - No audio tracks were connected')
            return
        }

        console.log('[Injected] 📦 creating blob from chunks...')
        const blob = new Blob(recordedChunks, { type: 'audio/webm' })
        console.log('[Injected] ✅ blob created, size:', blob.size, 'bytes')

        console.log('[Injected] 🔗 creating download URL...')
        const url = URL.createObjectURL(blob)
        console.log('[Injected] ✅ URL created:', url)

        console.log('[Injected] 💾 triggering download...')
        const a = document.createElement('a')
        a.href = url
        a.download = `meeting-${Date.now()}.webm`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        console.log('[Injected] ========================================')
        console.log('[Injected] ✅ DOWNLOAD TRIGGERED!')
        console.log('[Injected] Filename:', a.download)
        console.log('[Injected] Size:', blob.size, 'bytes')
        console.log('[Injected] ========================================')

        isRecording = false
        console.log('[Injected] isRecording set to false')
    }
})

console.log('[Injected] ✅ RTCPeerConnection overridden!')
console.log('[Injected] ✅ MM_START_RECORDING listener registered!')
console.log('[Injected] ✅ MM_STOP_RECORDING listener registered!')
console.log('[Injected] ========== READY TO INTERCEPT ==========')

