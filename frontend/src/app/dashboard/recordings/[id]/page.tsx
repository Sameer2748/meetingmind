"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ChevronLeft,
    ChevronDown,
    ChevronUp,
    Play,
    Pause,
    RotateCcw,
    RotateCw,
    Volume2,
    Calendar,
    Clock,
    FileText,
    Loader2,
    Download,
    Share2,
    Brain,
    Search,
    X,
    Sparkles,
    MessageCircle,
    Send,
    Zap,
    Maximize,
    VolumeX,
    Volume1,
    ArrowRight
} from "lucide-react";
import { SidebarProvider, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { tokenManager } from "@/lib/auth/tokenManager";
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

function AudioVisualizer({ isPlaying, color = "#e07155" }: { isPlaying: boolean; color?: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 2.5, height: 32 }}>
            {VIZ_BARS.map((v, i) => (
                <AudioBar key={i} baseHeight={v} index={i} isPlaying={isPlaying} color={color} />
            ))}
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
                            {/* Top half */}
                            <div style={{
                                width: "100%",
                                height: halfH,
                                background: filled ? color : "rgba(150,150,150,0.22)",
                                borderRadius: "9999px 9999px 0 0",
                                transition: "background 0.08s ease",
                            }} />
                            {/* Bottom half — seamlessly joined, no gap */}
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

export default function RecordingDetails() {
    const { id } = useParams();
    const router = useRouter();
    const [recording, setRecording] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [participants, setParticipants] = useState<string[]>([]);

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

    // AI Chat State
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Load chat history from localStorage
    useEffect(() => {
        if (!id) return;
        try {
            const stored = localStorage.getItem(`chat_${id}`);
            if (stored) setChatMessages(JSON.parse(stored));
        } catch { }
    }, [id]);

    // Save chat history to localStorage
    useEffect(() => {
        if (!id || chatMessages.length === 0) return;
        try {
            localStorage.setItem(`chat_${id}`, JSON.stringify(chatMessages));
        } catch { }
    }, [chatMessages, id]);

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
        const decoded = tokenManager.getUser();
        if (!decoded) {
            router.replace("/signin");
            return;
        }

        setUser({
            name: decoded.email.split('@')[0],
            email: decoded.email,
            avatar: "/avatars/user.jpg"
        });

        const fetchRecording = async () => {
            try {
                const data = await recordingsAPI.getRecordings();
                const found = data.find((r: any) => r.id === parseInt(id as string));
                if (found) {
                    setRecording(found);
                    if (found.duration) setDuration(found.duration);
                    if (found.transcript_text) {
                        const speakerMatches = Array.from(found.transcript_text.matchAll(/Speaker ([A-Za-z0-9]+):/g));
                        const uniqueSpeakers = Array.from(new Set(speakerMatches.map((m: any) => m[1])));
                        setParticipants(uniqueSpeakers.length > 0 ? uniqueSpeakers : ["A"]);
                    } else {
                        setParticipants(["A"]);
                    }
                } else {
                    router.push("/dashboard");
                }
            } catch (err) {
                console.error("Failed to fetch recording:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchRecording();
    }, [id, router]);

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

    const handleVolumeChange = (newVolume: number) => {
        setVolume(newVolume);
        if (videoRef.current) {
            videoRef.current.volume = newVolume;
            videoRef.current.muted = newVolume === 0;
        }
        setIsMuted(newVolume === 0);
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

    // Auto-hide controls after 4s of no mouse movement inside the player
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

    // Start the initial timer
    useEffect(() => {
        resetControlsTimer();
        return () => {
            if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        };
    }, [resetControlsTimer]);

    const parseTranscript = (text: string) => {
        if (!text) return [];
        // Strip Deepgram header lines (e.g. "MEETING TRANSCRIPT..." and "====...")
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

    // Parse the time string "MM:SS" to seconds
    const timeToSeconds = (timeStr: string) => {
        const parts = timeStr.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    };

    // Seek video to exact seconds
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

    // Seek audio by time string (fallback for segment-level)
    const seekToTime = useCallback((timeStr: string) => {
        seekToSeconds(timeToSeconds(timeStr));
    }, [seekToSeconds]);

    // Build a word-level timestamp lookup from Deepgram's word data
    // Maps each word in the transcript to its exact start time in seconds
    const wordTimestampMap = useMemo(() => {
        const words = recording?.transcript_words;
        if (!words || !Array.isArray(words) || words.length === 0) return null;

        // Build a map: for each word occurrence, track its position in the full text
        // We'll use this to find the timestamp of a specific character offset
        return words as Array<{ word: string; start: number; end: number; speaker: number; confidence: number }>;
    }, [recording?.transcript_words]);

    // Find the exact timestamp for a word at a given character position in a segment's text
    const findWordTimestamp = useCallback((segmentText: string, charOffset: number, segmentTimeStr: string): number => {
        if (!wordTimestampMap) return timeToSeconds(segmentTimeStr);

        // Get the word at the charOffset position
        const beforeOffset = segmentText.substring(0, charOffset);
        const wordsBefore = beforeOffset.split(/\s+/).filter(w => w.length > 0).length;

        // Find this segment's words in the word map by matching the segment start time
        const segmentStartSec = timeToSeconds(segmentTimeStr);

        // Find the first word in wordTimestampMap that matches this segment's start time (within 1s tolerance)
        let segStartIdx = wordTimestampMap.findIndex(w => Math.abs(w.start - segmentStartSec) < 1.5);
        if (segStartIdx === -1) {
            // Fallback: try to find by matching text content
            segStartIdx = 0;
        }

        // Navigate to the word at wordsBefore offset from segment start
        const targetIdx = segStartIdx + wordsBefore;
        if (targetIdx < wordTimestampMap.length) {
            return wordTimestampMap[targetIdx].start;
        }

        return segmentStartSec; // fallback to segment start
    }, [wordTimestampMap]);

    const parsedTranscript = useMemo(() => {
        return recording?.transcript_text ? parseTranscript(recording.transcript_text) : [];
    }, [recording?.transcript_text]);

    // Pre-map each utterance's words to their Deepgram timestamps (for Spotify-style coloring)
    const wordTimes = useMemo(() => {
        if (!wordTimestampMap || parsedTranscript.length === 0) return null;
        const result: Array<Array<{ word: string; start: number; end: number }>> = [];
        let globalIdx = 0;
        parsedTranscript.forEach((utterance) => {
            // Healer: ensure spaces after punctuation if they were missing in the source
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

    // AI Chat handler
    const handleSendMessage = async () => {
        if (!chatInput.trim() || isChatLoading) return;
        const userMsg = { role: 'user', text: chatInput.trim() };
        setChatMessages(prev => [...prev, userMsg]);
        setChatInput("");
        setIsChatLoading(true);
        try {
            const data = await recordingsAPI.chat(
                parseInt(id as string),
                userMsg.text,
                chatMessages.slice(-10)
            );
            if (data.success) {
                setChatMessages(prev => [...prev, { role: 'ai', text: data.response }]);
            } else {
                setChatMessages(prev => [...prev, { role: 'ai', text: 'Error: ' + (data.error || 'Unknown error') }]);
            }
        } catch (err: any) {
            setChatMessages(prev => [...prev, { role: 'ai', text: 'Error: ' + (err.response?.data?.error || err.message || 'Failed to connect') }]);
        } finally {
            setIsChatLoading(false);
        }
    };

    // Scroll chat to bottom on new message
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages, isChatOpen]);

    if (!user || loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    if (!recording) return null;

    return (
        <>
            <SidebarProvider className="flex w-full min-h-screen">
                <AppSidebar user={user} />
                <SidebarInset className="bg-background flex-1 min-w-0">
                    <header className="sticky top-0 z-[200] flex h-16 shrink-0 items-center gap-4 border-b border-white/5 bg-black/50 backdrop-blur-xl px-6">
                        <button
                            onClick={() => router.back()}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col">
                            <h1 className="text-sm font-bold tracking-tight text-white/90">
                                {recording.meeting_url.split('/').pop() || "Untitled Meeting"}
                            </h1>
                            <span className="text-[10px] uppercase tracking-widest text-primary font-black">
                                Cinema Mode
                            </span>
                        </div>

                        {/* Session Metadata Badges */}
                        <div className="hidden xl:flex items-center gap-5 ml-8 pl-8 border-l border-white/10 text-white/50">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                                <Clock className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[11px] font-bold tabular-nums text-white/80">{formatTime(duration)}</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                                <Calendar className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[11px] font-bold text-white/80">{format(new Date(recording.created_at), 'MMM dd, yyyy')}</span>
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
                                <div className="flex -space-x-1 mr-2">
                                    {[...Array(Math.min(3, Array.from(new Set(parsedTranscript.map(u => u.speaker))).length))].map((_, i) => (
                                        <div key={i} className="w-3.5 h-3.5 rounded-full border border-background bg-primary/30 flex items-center justify-center text-[7px] font-bold text-primary">
                                            {String.fromCharCode(65 + i)}
                                        </div>
                                    ))}
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-tight text-primary">{Array.from(new Set(parsedTranscript.map(u => u.speaker))).length} Speakers</span>
                            </div>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <button className="hidden sm:flex items-center gap-2 px-4 py-2 hover:bg-white/10 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/70 hover:text-white">
                                <Share2 className="w-4 h-4" /> Share
                            </button>
                            <a
                                href={`${process.env.NEXT_PUBLIC_API_URL || 'https://meetingmind-backend.100xsam.live'}/api/recordings/${id}/audio?token=${tokenManager.getToken()}`}
                                download={`meeting-${id}.webm`}
                                className="bg-primary text-white p-2 sm:px-4 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                            >
                                <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
                            </a>
                        </div>
                    </header>

                    <div className="w-full bg-[#050505] dark:bg-[#0c0c0e] py-12 lg:py-20 border-b border-white/5 relative z-10">
                        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
                            {/* Video player: spacer div creates 16:9 height, fill div uses flex to push controls to bottom */}
                            <div
                                className="relative w-full rounded-[40px] border border-white/5 shadow-[0_0_100px_rgba(0,0,0,0.5)]"
                                style={{ background: '#000' }}
                            >
                                {/* Spacer: gives outer div its 16:9 height */}
                                <div style={{ paddingBottom: '56.25%' }} />

                                {/* Fill layer: absolute inset-0, uses flex-col to push controls to bottom */}
                                <div
                                    ref={playerContainerRef}
                                    className="absolute inset-0 rounded-[40px] flex flex-col"
                                    onMouseMove={handlePlayerMouseMove}
                                    onMouseLeave={handlePlayerMouseLeave}
                                    style={{ cursor: showControls ? 'default' : 'none' }}
                                >
                                    {/* Video behind everything — absolute fill */}
                                    <div className="absolute inset-0 rounded-[40px] overflow-hidden">
                                        <video
                                            ref={videoRef}
                                            onClick={togglePlay}
                                            src={`${process.env.NEXT_PUBLIC_API_URL || 'https://meetingmind-backend.100xsam.live'}/api/recordings/${id}/audio?token=${tokenManager.getToken()}`}
                                            onTimeUpdate={handleTimeUpdate}
                                            onLoadedMetadata={handleLoadedMetadata}
                                            onEnded={() => setIsPlaying(false)}
                                            className="w-full h-full object-contain cursor-pointer"
                                            playsInline
                                        />
                                    </div>

                                    {/* Flex spacer: pushes controls to bottom */}
                                    <div className="flex-1 cursor-pointer" onClick={togglePlay} />

                                    {/* Controls row: centered at bottom */}
                                    <div className="relative z-[200] flex justify-center mb-8 pointer-events-none">
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
                                            }}
                                            className="pointer-events-auto bg-white/90 dark:bg-black/80 rounded-2xl px-4 py-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] flex flex-col gap-2 overflow-hidden"
                                        >
                                            {/* Waveform seek bar */}
                                            <div className="px-1">
                                                <WaveformSeekBar
                                                    currentTime={currentTime}
                                                    duration={duration}
                                                    onSeek={handleSeek}
                                                    color="#f97316"
                                                />
                                            </div>

                                            {/* Controls Row */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <button onClick={() => skip(-10)} className="text-black/70 dark:text-white/60 hover:text-primary transition-all active:scale-90">
                                                        <RotateCcw className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={togglePlay}
                                                        className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30"
                                                    >
                                                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-px" />}
                                                    </button>
                                                    <button onClick={() => skip(10)} className="text-black/70 dark:text-white/60 hover:text-primary transition-all active:scale-90">
                                                        <RotateCw className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                <span className="text-[10px] font-mono text-black/60 dark:text-white/50 tabular-nums">
                                                    {formatTime(currentTime)} / {formatTime(duration)}
                                                </span>

                                                <div className="flex items-center gap-3">
                                                    <button onClick={toggleMute} className="text-black/70 dark:text-white/60 hover:text-primary transition-all">
                                                        {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
                                                    </button>
                                                    <div className="relative" ref={speedMenuRef}>
                                                        <button
                                                            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                                                            className="text-[10px] font-bold text-black/70 dark:text-white/60 hover:text-primary px-2 py-0.5 rounded-md border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:border-primary/40 transition-all uppercase tracking-widest"
                                                        >
                                                            {playbackRate}x
                                                        </button>
                                                        <AnimatePresence>
                                                            {showSpeedMenu && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                    exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                                                    style={{ backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }}
                                                                    className="absolute bottom-full right-0 mb-2 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl overflow-hidden z-[300] min-w-[72px] p-1 bg-white/95 dark:bg-[rgba(15,15,18,0.95)]"
                                                                >
                                                                    {speedOptions.map((speed) => (
                                                                        <button
                                                                            key={speed}
                                                                            onClick={() => changeSpeed(speed)}
                                                                            className={cn(
                                                                                "w-full px-3 py-1.5 text-[10px] font-bold text-left hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors",
                                                                                speed === playbackRate ? "text-primary bg-primary/10" : "text-black/70 dark:text-white/60"
                                                                            )}
                                                                        >
                                                                            {speed}x
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                    <button onClick={toggleFullscreen} className="text-black/70 dark:text-white/60 hover:text-primary transition-all">
                                                        <Maximize className={cn("w-4 h-4", isFullscreen && "text-primary")} />
                                                    </button>
                                                </div>
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

                                <div className="bg-white/50 dark:bg-[#0f0f12]/50 backdrop-blur-3xl border border-black/5 dark:border-white/5 rounded-[48px] p-8 lg:p-14 leading-relaxed shadow-xl">
                                    {recording.transcript_text ? (
                                        <div className="space-y-12">
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
                                                        <div className="flex items-center gap-4 mb-4">
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
                                                        <p className="text-xl font-medium leading-[1.8] text-foreground/90">
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
                                            <p className="text-xs font-black uppercase tracking-widest opacity-30">Generating Transcript...</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>{/* closes w-full bg-[#050505] section */}

                    {/* AI Chat Assistant */}
                    {mounted && (
                        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', pointerEvents: 'none' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', pointerEvents: 'auto' }}>
                                <AnimatePresence>
                                    {isChatOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                            style={{ width: '380px', minWidth: '380px', maxWidth: '380px', height: '520px', maxHeight: 'calc(100vh - 8rem)', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: '1rem' }}
                                            className="bg-card border border-border/40 rounded-[24px] shadow-2xl"
                                        >
                                            {/* Header */}
                                            <div className="p-4 border-b border-border/40 flex items-center justify-between bg-primary/5 shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                                                        <Sparkles className="w-4 h-4 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-semibold">MeetingMind AI</h4>
                                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Active Context: Transcript</p>
                                                    </div>
                                                </div>
                                                <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-muted rounded-full transition-colors">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Messages */}
                                            <div ref={chatContainerRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {chatMessages.length === 0 && (
                                                    <div className="text-center py-10 px-6">
                                                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                                            <Brain className="w-6 h-6 text-primary" />
                                                        </div>
                                                        <p className="text-sm font-medium">Hello! I've read the meeting transcript.</p>
                                                        <p className="text-xs text-muted-foreground mt-2">Ask me anything about what was discussed, action items, or a summary.</p>
                                                    </div>
                                                )}
                                                {chatMessages.map((msg: any, idx: number) => (
                                                    <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                                        <div
                                                            className={msg.role === 'user' ? 'text-white' : 'text-foreground'}
                                                            style={{ maxWidth: '75%', wordBreak: 'break-word', overflowWrap: 'break-word', padding: '10px 14px', borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px', fontSize: '0.875rem', lineHeight: '1.5', backgroundColor: msg.role === 'user' ? '#f97316' : 'rgba(128,128,128,0.15)', border: msg.role === 'user' ? 'none' : '1px solid rgba(128,128,128,0.2)' }}
                                                        >
                                                            {msg.text.split('\n').map((line: string, i: number) => (
                                                                <p key={i} style={{ margin: i > 0 ? '4px 0 0' : '0' }}>{line}</p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                                {isChatLoading && (
                                                    <div className="flex justify-start">
                                                        <div className="bg-muted p-3 rounded-2xl rounded-tl-none border border-border/20">
                                                            <div className="flex gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '200ms' }} />
                                                                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '400ms' }} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Input */}
                                            <div className="p-4 pt-2 border-t border-border/40 bg-card shrink-0">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={chatInput}
                                                        onChange={(e) => setChatInput(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                                        placeholder="Ask a question..."
                                                        disabled={isChatLoading}
                                                        className="flex-1 bg-muted/50 border border-border/40 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all disabled:opacity-50"
                                                    />
                                                    <button
                                                        onClick={handleSendMessage}
                                                        disabled={!chatInput.trim() || isChatLoading}
                                                        className="shrink-0 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-center text-muted-foreground mt-2">AI can make mistakes. Verify important info.</p>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Toggle Button */}
                                <div style={{ position: 'relative' }}>
                                    {!isChatOpen && <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-25" />}
                                    <button
                                        onClick={() => setIsChatOpen(!isChatOpen)}
                                        style={{ position: 'relative', zIndex: 99999 }}
                                        className={cn(
                                            "w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 hover:scale-110 active:scale-95",
                                            isChatOpen ? "bg-muted text-foreground border border-border/40" : "bg-primary text-white border-4 border-background ring-2 ring-primary/20"
                                        )}
                                    >
                                        {isChatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </SidebarInset >
                <SidebarRail />
            </SidebarProvider >
        </>
    );
}