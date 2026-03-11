"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Play,
    Pause,
    RotateCcw,
    RotateCw,
    Volume2,
    Calendar,
    Clock,
    FileText,
    Loader2,
    Sparkles,
    Maximize,
    VolumeX,
} from "lucide-react";
import { recordingsAPI } from "@/lib/api";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ─── Audio Visualizer ────────────────────────────────────────────────────────
const VIZ_BARS = [2, 4, 3, 6, 5, 3, 6, 4, 2, 3];

function AudioBar({ baseHeight, index, isPlaying, color }: {
    baseHeight: number;
    index: number;
    isPlaying: boolean;
    color: string;
}) {
    const [height, setHeight] = useState(baseHeight * 2);
    const rafRef = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isPlaying) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            startTimeRef.current = null;
            setHeight(baseHeight * 2);
            return;
        }

        const duration = (0.45 + index * 0.04) * 1000;
        const delay = index * 40;
        const keyframes = [
            baseHeight * 2,
            baseHeight * 4,
            baseHeight * 1.5,
            baseHeight * 3.5,
            baseHeight * 2,
        ];

        const animate = (timestamp: number) => {
            if (!startTimeRef.current) startTimeRef.current = timestamp - delay;
            const elapsed = (timestamp - startTimeRef.current) % duration;
            const progress = elapsed / duration;
            const segCount = keyframes.length - 1;
            const seg = Math.floor(progress * segCount);
            const segProgress = (progress * segCount) % 1;
            const from = keyframes[Math.min(seg, keyframes.length - 1)];
            const to = keyframes[Math.min(seg + 1, keyframes.length - 1)];
            const t =
                segProgress < 0.5
                    ? 2 * segProgress * segProgress
                    : -1 + (4 - 2 * segProgress) * segProgress;
            setHeight(from + (to - from) * t);
            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            startTimeRef.current = null;
        };
    }, [isPlaying, baseHeight, index]);

    const halfH = Math.max(height / 2, 2);

    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
                width: 3,
                height: halfH,
                background: color,
                borderRadius: "9999px 9999px 0 0",
                transition: isPlaying ? "none" : "height 0.4s ease",
            }} />
            <div style={{
                width: 3,
                height: halfH,
                background: color,
                borderRadius: "0 0 9999px 9999px",
                transition: isPlaying ? "none" : "height 0.4s ease",
            }} />
        </div>
    );
}

// ─── Waveform Seek Bar ────────────────────────────────────────────────────────
const WAVEFORM_BARS = [
    6, 10, 16, 12, 18, 24, 14, 20, 28, 16, 12, 22, 18, 26, 14, 10, 20, 24, 16, 12,
    18, 28, 22, 14, 10, 16, 24, 20, 12, 18, 26, 14, 22, 16, 10, 20, 28, 18, 12, 14,
    24, 16, 22, 10, 18, 26, 14, 20, 12, 16,
];

function WaveformSeekBar({
    currentTime,
    duration,
    onSeek,
    color = "#e07155",
}: {
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    color?: string;
}) {
    const progress = duration > 0 ? currentTime / duration : 0;

    return (
        <div style={{ position: "relative", width: "100%", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2.5, height: 48, width: "100%" }}>
                {WAVEFORM_BARS.map((h, i) => {
                    const barProgress = i / WAVEFORM_BARS.length;
                    const filled = barProgress < progress;
                    const halfH = Math.max(h / 2, 3);

                    return (
                        <div
                            key={i}
                            style={{
                                flex: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                height: "100%",
                            }}
                        >
                            <div style={{
                                width: "100%",
                                height: halfH,
                                background: filled ? color : "rgba(150,150,150,0.22)",
                                borderRadius: "9999px 9999px 0 0",
                                transition: "background 0.08s ease",
                            }} />
                            <div style={{
                                width: "100%",
                                height: halfH,
                                background: filled ? color : "rgba(150,150,150,0.22)",
                                borderRadius: "0 0 9999px 9999px",
                                transition: "background 0.08s ease",
                            }} />
                        </div>
                    );
                })}
            </div>
            <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.01}
                value={currentTime}
                onChange={(e) => onSeek(parseFloat(e.target.value))}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: "pointer",
                    margin: 0,
                }}
            />
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SharedRecordingPage() {
    const { token } = useParams();
    const router = useRouter();
    const [recording, setRecording] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Video Player State
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const speedMenuRef = useRef<HTMLDivElement>(null);
    const playerContainerRef = useRef<HTMLDivElement>(null);
    const [syncEnabled, setSyncEnabled] = useState(true);
    const [showControls, setShowControls] = useState(true);
    const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
                setShowSpeedMenu(false);
            }
        };
        if (showSpeedMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSpeedMenu]);

    useEffect(() => {
        const fetchShared = async () => {
            try {
                const data = await recordingsAPI.getSharedRecording(token as string);
                if (data.success) {
                    setRecording(data.recording);
                    if (data.recording.duration) setDuration(data.recording.duration);
                } else {
                    setError(data.error || "Failed to load recording");
                }
            } catch (err: any) {
                setError(err.response?.data?.error || "Expired or invalid shared link");
            } finally {
                setLoading(false);
            }
        };
        if (token) fetchShared();
    }, [token]);

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
        if (videoRef.current && isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
            setDuration(videoRef.current.duration);
        }
    };

    const skip = (amount: number) => {
        if (videoRef.current) videoRef.current.currentTime += amount;
    };

    const formatTime = (time: number) => {
        if (!isFinite(time) || isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleSeek = (time: number) => {
        if (videoRef.current) videoRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const toggleMute = () => {
        if (videoRef.current) {
            const nextMuted = !isMuted;
            videoRef.current.muted = nextMuted;
            setIsMuted(nextMuted);
            if (!nextMuted && volume === 0) {
                setVolume(0.5);
                videoRef.current.volume = 0.5;
            }
        }
    };

    const changeSpeed = (rate: number) => {
        setPlaybackRate(rate);
        if (videoRef.current) videoRef.current.playbackRate = rate;
        setShowSpeedMenu(false);
    };

    const toggleFullscreen = () => {
        if (!playerContainerRef.current) return;
        if (!document.fullscreenElement) {
            playerContainerRef.current.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message}`);
            });
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const resetControlsTimer = useCallback(() => {
        setShowControls(true);
        if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        hideControlsTimer.current = setTimeout(() => {
            setShowControls(false);
        }, 4000);
    }, []);

    const handlePlayerMouseMove = useCallback(() => {
        resetControlsTimer();
    }, [resetControlsTimer]);

    const handlePlayerMouseLeave = useCallback(() => {
        if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        hideControlsTimer.current = setTimeout(() => {
            setShowControls(false);
        }, 1500);
    }, []);

    useEffect(() => {
        resetControlsTimer();
        return () => {
            if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        };
    }, [resetControlsTimer]);

    const parseTranscript = (text: string) => {
        if (!text) return [];
        const cleaned = text.replace(/^MEETING TRANSCRIPT[^\n]*\n(Date:[^\n]*\n)?=+\n*/i, '').trim();
        const segments = cleaned.split(/(\[?\d{2}:\d{2}\]? Speaker [^:]+:)/g);
        const result = [];
        for (let i = 1; i < segments.length; i += 2) {
            const header = segments[i];
            const content = segments[i + 1]?.trim();
            if (header && content) {
                const match = header.match(/\[?(\d{2}:\d{2})\]? Speaker ([^:]+):/);
                result.push({
                    time: match ? match[1] : "0:00",
                    speaker: match ? match[2] : "Unknown",
                    text: content
                });
            }
        }
        return result.length > 0 ? result : [{ text: cleaned, speaker: "System", time: "0:00" }];
    };

    const timeToSeconds = (timeStr: string) => {
        const parts = timeStr.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    };

    const seekToSeconds = useCallback((seconds: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = seconds;
            setCurrentTime(seconds);
            if (!isPlaying) {
                videoRef.current.play().catch(() => { });
                setIsPlaying(true);
            }
        }
    }, [isPlaying]);

    const seekToTime = useCallback((timeStr: string) => {
        seekToSeconds(timeToSeconds(timeStr));
    }, [seekToSeconds]);

    const wordTimestampMap = useMemo(() => {
        const words = recording?.transcript_words;
        if (!words || !Array.isArray(words) || words.length === 0) return null;
        return words as Array<{ word: string; start: number; end: number }>;
    }, [recording?.transcript_words]);

    const parsedTranscript = useMemo(() => {
        return recording?.transcript_text ? parseTranscript(recording.transcript_text) : [];
    }, [recording?.transcript_text]);

    const wordTimes = useMemo(() => {
        if (!wordTimestampMap || parsedTranscript.length === 0) return null;
        const result: Array<Array<{ word: string; start: number; end: number }>> = [];
        let globalIdx = 0;
        parsedTranscript.forEach((utterance) => {
            const healedText = utterance.text.replace(/([,.!?;:])([A-Za-z])/g, '$1 $2');
            const words = healedText.trim().split(/\s+/).filter(w => w.length > 0);
            const mapped = words.map((word) => {
                if (globalIdx < wordTimestampMap.length) {
                    const entry = wordTimestampMap[globalIdx++];
                    return { word, start: entry.start, end: entry.end };
                }
                return { word, start: 0, end: 0 };
            });
            result.push(mapped);
        });
        return result;
    }, [wordTimestampMap, parsedTranscript]);


    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center -translate-y-12">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    if (error || !recording) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center text-foreground -translate-y-12">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                    <Clock className="w-10 h-10 text-red-500 opacity-50" />
                </div>
                <h1 className="text-2xl font-black mb-2 uppercase tracking-tighter italic">Link Expired</h1>
                <p className="text-muted-foreground max-w-md">{error || "This shared meeting recording has expired or the link is invalid."}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col font-sans">
            <header className="sticky top-0 z-[1001] flex h-16 shrink-0 items-center justify-between border-b border-border/40 bg-background/80 backdrop-blur-xl px-6">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
                        <Play className="w-4 h-4 text-primary fill-primary" />
                    </div>
                    <div className="flex flex-col">
                        <h1 className="text-sm font-bold tracking-tight text-foreground">
                            {recording.meeting_url?.split('/').pop() || "Untitled Meeting"}
                        </h1>
                        <span className="text-[10px] uppercase tracking-widest text-primary font-black">
                            Public Shared View
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-5 text-muted-foreground mr-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted border border-border/40">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] font-bold tabular-nums text-foreground">{formatTime(duration)}</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted border border-border/40">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[11px] font-bold text-foreground">{format(new Date(recording.created_at), 'MMM dd, yyyy')}</span>
                    </div>
                </div>
            </header>

            <div className="w-full bg-background py-8 lg:py-12 border-b border-border/40">
                <div className="max-w-[1000px] mx-auto px-6 lg:px-10">
                    <div
                        ref={playerContainerRef}
                        onMouseMove={handlePlayerMouseMove}
                        onMouseLeave={handlePlayerMouseLeave}
                        style={{
                            position: 'relative',
                            width: '100%',
                            paddingBottom: '56.25%',
                            background: '#000',
                            borderRadius: '40px',
                            zIndex: 0,
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: '0 0 100px rgba(0,0,0,0.5)',
                            cursor: showControls ? 'default' : 'none',
                        }}
                    >
                        <div style={{ position: 'absolute', inset: 0, zIndex: 0, borderRadius: '40px', overflow: 'hidden' }}>
                            <video
                                ref={videoRef}
                                src={`${process.env.NEXT_PUBLIC_API_URL || 'https://meetingmind-backend.100xsam.live'}/api/recordings/shared/${token}/stream`}
                                onTimeUpdate={handleTimeUpdate}
                                onLoadedMetadata={handleLoadedMetadata}
                                onEnded={() => setIsPlaying(false)}
                                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                playsInline
                            />
                        </div>

                        <div style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'pointer' }} onClick={togglePlay} />

                        <div
                            style={{ position: 'absolute', bottom: '2.5rem', left: 0, right: 0, zIndex: 20, display: 'flex', justifyContent: 'center' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div
                                style={{
                                    width: '42%',
                                    minWidth: '320px',
                                    maxWidth: '500px',
                                    opacity: showControls ? 1 : 0,
                                    transform: showControls ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
                                    transition: 'all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
                                    backdropFilter: showControls ? 'blur(20px)' : 'blur(0px)',
                                    WebkitBackdropFilter: showControls ? 'blur(20px)' : 'blur(0px)',
                                    pointerEvents: showControls ? 'auto' : 'none',
                                }}
                                className="bg-black/60 rounded-2xl px-4 py-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col gap-2 overflow-visible"
                            >
                                <div className="px-1">
                                    <WaveformSeekBar
                                        currentTime={currentTime}
                                        duration={duration}
                                        onSeek={handleSeek}
                                        color="#f97316"
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4 text-white">
                                        <button onClick={() => skip(-10)} className="opacity-80 hover:opacity-100 transition-all active:scale-90">
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={togglePlay}
                                            className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30"
                                        >
                                            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-px" />}
                                        </button>
                                        <button onClick={() => skip(10)} className="opacity-80 hover:opacity-100 transition-all active:scale-90">
                                            <RotateCw className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <span className="text-[10px] font-mono text-white opacity-70 tabular-nums">
                                        {formatTime(currentTime)} / {formatTime(duration)}
                                    </span>

                                    <div className="flex items-center gap-3 text-white">
                                        <button onClick={toggleMute} className="opacity-80 hover:opacity-100 transition-all">
                                            {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                                        </button>
                                        <div className="relative" ref={speedMenuRef}>
                                            <button
                                                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                                                className="text-[10px] font-bold text-white opacity-90 hover:opacity-100 px-2 py-0.5 rounded-md border border-white/20 bg-white/10 hover:border-white/40 transition-all uppercase tracking-widest"
                                            >
                                                {playbackRate}x
                                            </button>
                                            <AnimatePresence>
                                                {showSpeedMenu && (
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.9, y: 4 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.9, y: 4 }}
                                                        style={{ backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)', position: 'absolute', bottom: 'calc(100% + 8px)', right: 0, zIndex: 9999, minWidth: '80px', padding: '4px', background: 'rgba(20,20,22,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}
                                                    >
                                                        {speedOptions.map((speed) => (
                                                            <button
                                                                key={speed}
                                                                onClick={() => changeSpeed(speed)}
                                                                className={cn(
                                                                    "w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-white/10 rounded-lg transition-colors",
                                                                    speed === playbackRate ? "text-primary bg-primary/10" : "text-white opacity-80"
                                                                )}
                                                            >
                                                                {speed}x
                                                            </button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <button onClick={toggleFullscreen} className="opacity-80 hover:opacity-100 transition-all">
                                            <Maximize className={cn("w-4 h-4", isFullscreen && "text-primary")} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-[1400px] mx-auto w-full p-6 lg:px-12 lg:pb-24 lg:pt-6">
                    <div className="space-y-6 group/transcript">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <h3 className="text-3xl font-bold tracking-tight">Transcript</h3>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Deepgram AI Generated</p>
                            </div>
                            {recording.transcript_text && (
                                <button
                                    onClick={() => setSyncEnabled(v => !v)}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all border shadow-lg",
                                        syncEnabled
                                            ? "bg-primary text-white border-primary shadow-primary/20"
                                            : "bg-muted text-muted-foreground border-border/40 hover:border-primary/30"
                                    )}
                                >
                                    <Sparkles className={cn("w-4 h-4", syncEnabled && "fill-white")} />
                                    {syncEnabled ? "Sync Active" : "Enable Sync"}
                                </button>
                            )}
                        </div>

                        <div className="bg-card/30 dark:bg-card/50 backdrop-blur-3xl border border-border/40 rounded-[48px] p-8 lg:p-14 leading-relaxed shadow-xl">
                            {recording.transcript_text ? (
                                <div className="space-y-4">
                                    {parsedTranscript.map((utterance, i) => {
                                        const colors = [
                                            'bg-primary/10 text-primary',
                                            'bg-blue-500/10 text-blue-600',
                                            'bg-emerald-500/10 text-emerald-600',
                                            'bg-violet-500/10 text-violet-600',
                                            'bg-amber-500/10 text-amber-600',
                                        ];
                                        const speakerIdx = isNaN(parseInt(utterance.speaker))
                                            ? utterance.speaker.charCodeAt(0) % colors.length
                                            : parseInt(utterance.speaker) % colors.length;
                                        const utteranceWords = wordTimes?.[i];

                                        return (
                                            <div key={i} className="group/para">
                                                <div className="flex items-center gap-4 mb-2">
                                                    <div className={`w-10 h-10 rounded-xl ${colors[speakerIdx]} flex items-center justify-center text-[11px] font-black shadow-sm`}>
                                                        S{utterance.speaker}
                                                    </div>
                                                    <button
                                                        onClick={() => seekToTime(utterance.time)}
                                                        className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-30 group-hover/para:opacity-100 transition-opacity hover:text-primary cursor-pointer"
                                                    >
                                                        SPEAKER {utterance.speaker} &nbsp;•&nbsp; {utterance.time}
                                                    </button>
                                                </div>
                                                <p className="text-lg font-medium leading-[1.6] text-foreground/90">
                                                    {syncEnabled && utteranceWords ? (
                                                        utteranceWords.map((w, wi) => {
                                                            const isPlayed = currentTime >= w.end && w.end > 0;
                                                            const isCurrent = currentTime >= w.start && currentTime < w.end && w.end > 0;
                                                            const progress = isCurrent
                                                                ? Math.min(1, (currentTime - w.start) / Math.max(0.01, w.end - w.start))
                                                                : isPlayed ? 1 : 0;
                                                            const splitAt = Math.round(progress * w.word.length);
                                                            return (
                                                                <span key={wi}>
                                                                    <span
                                                                        onClick={() => seekToSeconds(w.start)}
                                                                        className="cursor-pointer hover:text-primary transition-colors"
                                                                    >
                                                                        {splitAt > 0 && (
                                                                            <span style={{ color: '#f97316' }}>
                                                                                {w.word.substring(0, splitAt)}
                                                                            </span>
                                                                        )}
                                                                        <span style={{ opacity: isCurrent ? 1 : isPlayed ? 0.35 : 0.85 }}>
                                                                            {w.word.substring(splitAt)}
                                                                        </span>
                                                                    </span>
                                                                    {' '}
                                                                </span>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="opacity-70">{utterance.text}</span>
                                                    )}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                                    <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center mb-6">
                                        <FileText className="w-10 h-10 opacity-10" />
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-widest opacity-30">No Transcript Available</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
