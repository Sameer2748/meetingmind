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
    Zap
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

    // Audio Player State
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    const speedMenuRef = useRef<HTMLDivElement>(null);

    // Transcript Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const matchRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [syncEnabled, setSyncEnabled] = useState(true);

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
        if (audioRef.current) {
            if (isPlaying) audioRef.current.pause();
            else audioRef.current.play();
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
        }
    };

    const skip = (amount: number) => {
        if (audioRef.current) audioRef.current.currentTime += amount;
    };

    const formatTime = (time: number) => {
        if (!isFinite(time) || isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleSeek = (time: number) => {
        if (audioRef.current) audioRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const changeSpeed = (rate: number) => {
        setPlaybackRate(rate);
        if (audioRef.current) audioRef.current.playbackRate = rate;
        setShowSpeedMenu(false);
    };

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

    // Seek audio to exact seconds
    const seekToSeconds = useCallback((seconds: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime = seconds;
            setCurrentTime(seconds);
            if (!isPlaying) {
                audioRef.current.play();
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

    // Count total matches for search
    const parsedTranscript = useMemo(() => {
        return recording?.transcript_text ? parseTranscript(recording.transcript_text) : [];
    }, [recording?.transcript_text]);

    const totalMatches = useMemo(() => {
        if (!searchQuery.trim()) return 0;
        const query = searchQuery.toLowerCase();
        let count = 0;
        parsedTranscript.forEach((u) => {
            const text = u.text.toLowerCase();
            let idx = text.indexOf(query);
            while (idx !== -1) {
                count++;
                idx = text.indexOf(query, idx + 1);
            }
        });
        return count;
    }, [searchQuery, parsedTranscript]);

    // Reset match index when query changes
    useEffect(() => {
        setCurrentMatchIndex(0);
        matchRefs.current = [];
    }, [searchQuery]);

    // Scroll to current match
    useEffect(() => {
        if (totalMatches > 0 && matchRefs.current[currentMatchIndex]) {
            matchRefs.current[currentMatchIndex]?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [currentMatchIndex, totalMatches]);

    const goToNextMatch = () => {
        if (totalMatches > 0) setCurrentMatchIndex((prev) => (prev + 1) % totalMatches);
    };

    const goToPrevMatch = () => {
        if (totalMatches > 0) setCurrentMatchIndex((prev) => (prev - 1 + totalMatches) % totalMatches);
    };

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
                    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b border-border/10 bg-background/50 backdrop-blur-md px-6">
                        <button
                            onClick={() => router.back()}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col">
                            <h1 className="text-sm font-bold tracking-tight truncate max-w-[200px] md:max-w-md">
                                {recording.meeting_url.split('/').pop() || "Untitled Meeting"}
                            </h1>
                            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">
                                Session Insights
                            </span>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <button className="hidden sm:flex items-center gap-2 px-4 py-2 hover:bg-muted rounded-xl text-xs font-bold transition-all border border-border/50">
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

                    <div className="max-w-[1400px] mx-auto w-full p-6 lg:p-10">
                        <audio
                            ref={audioRef}
                            src={`${process.env.NEXT_PUBLIC_API_URL || 'https://meetingmind-backend.100xsam.live'}/api/recordings/${id}/audio?token=${tokenManager.getToken()}`}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleLoadedMetadata}
                            onEnded={() => setIsPlaying(false)}
                        />

                        {/* Row 1: Session Details + Player side by side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">

                            {/* Session Details Card */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 }}
                                className="bg-card border border-border/50 rounded-[28px] p-6 shadow-lg h-full hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/30 hover:-translate-y-1 transition-all duration-300 cursor-default"
                            >
                                <h3 className="text-lg font-bold mb-6 tracking-tight">Session Details</h3>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                                    {/* Recorded On */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                            <Calendar className="w-5 h-5 text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">Recorded On</p>
                                            <p className="font-semibold text-sm truncate">{format(new Date(recording.created_at), 'MMM dd, yyyy')}</p>
                                        </div>
                                    </div>

                                    {/* Duration */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                            <Clock className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">Duration</p>
                                            <p className="font-semibold text-sm">{formatTime(duration)}</p>
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                            <Volume2 className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1">Status</p>
                                            <div className="flex items-center gap-1.5">
                                                <div className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                </div>
                                                <p className="font-semibold text-sm capitalize">{recording.status || 'Ready'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Participants */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                                            <FileText className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">Participants</p>
                                            <div className="flex -space-x-2">
                                                {participants.map((speaker, i) => {
                                                    const colors = [
                                                        'bg-primary/15 text-primary',
                                                        'bg-blue-500/15 text-blue-600',
                                                        'bg-emerald-500/15 text-emerald-600',
                                                        'bg-violet-500/15 text-violet-600',
                                                        'bg-amber-500/15 text-amber-600',
                                                    ];
                                                    const colorClass = colors[i % colors.length];
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`w-8 h-8 rounded-full ${colorClass} border-2 border-card flex items-center justify-center font-bold text-[10px] shadow-sm hover:z-10 transition-transform hover:-translate-y-1 cursor-default`}
                                                            title={`Speaker ${speaker}`}
                                                        >
                                                            S{speaker}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* Player Card */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="bg-card dark:bg-[#1c1c1e] border border-border/50 dark:border-white/10 rounded-[28px] p-6 shadow-lg flex flex-col justify-between h-full hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/30 dark:hover:border-primary/20 hover:-translate-y-1 transition-all duration-300"
                            >
                                {/* Row 1: Artwork + Title + Speed Control */}
                                <div className="flex items-center gap-4 mb-6">
                                    <div
                                        className="rounded-2xl flex items-center justify-center shrink-0 w-16 h-16"
                                        style={{ background: 'linear-gradient(135deg, #e07155, #f09070, #c8a0e8)' }}
                                    >
                                        <Brain className="w-8 h-8 text-white drop-shadow-sm" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-base font-semibold text-foreground dark:text-white truncate leading-tight mb-0.5">
                                            {recording.meeting_url?.split('/').pop() || "Untitled Meeting"}
                                        </h2>
                                        <p className="text-xs text-muted-foreground dark:text-white/50">MeetingMind Session</p>
                                    </div>
                                    <div className="relative shrink-0" ref={speedMenuRef}>
                                        <button
                                            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                                            className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold border transition-all hover:scale-105 active:scale-95 shadow-sm bg-white/80 dark:bg-white/10 text-foreground dark:text-white gap-1.5"
                                            style={{
                                                borderColor: playbackRate !== 1 ? '#e07155' : 'rgba(150,150,150,0.25)',
                                                color: playbackRate !== 1 ? '#e07155' : undefined,
                                            }}
                                        >
                                            <ChevronDown
                                                className="w-3.5 h-3.5 transition-transform duration-200"
                                                style={{ transform: showSpeedMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                            />
                                            <span>{playbackRate}x</span>
                                        </button>
                                        <AnimatePresence>
                                            {showSpeedMenu && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                                    transition={{ duration: 0.15 }}
                                                    className="absolute top-full right-0 mt-2 bg-card dark:bg-[#2a2a2e] border border-border/50 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden z-50"
                                                    style={{ minWidth: 100 }}
                                                >
                                                    {speedOptions.map((speed) => (
                                                        <button
                                                            key={speed}
                                                            onClick={() => changeSpeed(speed)}
                                                            className={cn(
                                                                "w-full px-4 py-2.5 text-sm font-medium text-left transition-colors",
                                                                speed === playbackRate
                                                                    ? "text-white"
                                                                    : "text-foreground/70 dark:text-white/70 hover:bg-muted dark:hover:bg-white/10"
                                                            )}
                                                            style={speed === playbackRate ? { backgroundColor: '#e07155' } : {}}
                                                        >
                                                            {speed}x
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Row 2: Waveform Seek Bar */}
                                <div className="mt-8 mb-6">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[11px] font-medium text-muted-foreground dark:text-white/40 tabular-nums w-10 text-left shrink-0">
                                            {formatTime(currentTime)}
                                        </span>
                                        <WaveformSeekBar
                                            currentTime={currentTime}
                                            duration={duration}
                                            onSeek={handleSeek}
                                            color="#e07155"
                                        />
                                        <span className="text-[11px] font-medium text-muted-foreground dark:text-white/40 tabular-nums w-12 text-right shrink-0">
                                            -{formatTime(Math.max(0, duration - currentTime))}
                                        </span>
                                    </div>
                                </div>

                                {/* Row 3: Speed + Controls */}
                                <div className="flex items-center">
                                    {/* Controls — center */}
                                    <div className="flex items-center justify-center w-full" style={{ gap: '40px' }}>
                                        <button
                                            onClick={() => skip(-10)}
                                            className="relative flex items-center justify-center text-foreground/80 dark:text-white/80 hover:text-foreground dark:hover:text-white transition-all active:scale-90"
                                        >
                                            <RotateCcw className="w-10 h-10 stroke-[1.5px]" />
                                            <span className="absolute text-[10px] font-bold mt-[2.5px]">10</span>
                                        </button>

                                        <button
                                            onClick={togglePlay}
                                            className="w-16 h-16 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg active:shadow-md shrink-0"
                                            style={{ backgroundColor: '#e07155' }}
                                        >
                                            {isPlaying ? (
                                                <Pause className="w-8 h-8 text-white fill-white" />
                                            ) : (
                                                <Play className="w-8 h-8 text-white fill-white translate-x-1" />
                                            )}
                                        </button>

                                        <button
                                            onClick={() => skip(10)}
                                            className="relative flex items-center justify-center text-foreground/80 dark:text-white/80 hover:text-foreground dark:hover:text-white transition-all active:scale-90"
                                        >
                                            <RotateCw className="w-10 h-10 stroke-[1.5px]" />
                                            <span className="absolute text-[10px] font-bold mt-[2.5px]">10</span>
                                        </button>
                                    </div>


                                </div>
                            </motion.div>
                        </div>

                        {/* Row 2: Full Transcript */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-semibold tracking-tight">Full Transcript</h3>
                                {recording.transcript_text && (
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex items-center">
                                            <input
                                                ref={searchInputRef}
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search transcript..."
                                                className="bg-card border border-border/40 px-5 pr-8 py-2 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary/40 transition-all w-52 font-medium placeholder:text-muted-foreground/40"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') goToNextMatch();
                                                    if (e.key === 'Escape') { setSearchQuery(''); searchInputRef.current?.blur(); }
                                                }}
                                            />
                                            {searchQuery && (
                                                <button
                                                    onClick={() => setSearchQuery('')}
                                                    className="absolute right-2.5 p-0.5 rounded-full hover:bg-muted transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5 text-muted-foreground/60" />
                                                </button>
                                            )}
                                        </div>
                                        {searchQuery && (
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs font-medium text-muted-foreground tabular-nums min-w-[3.5rem] text-center">
                                                    {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : '0/0'}
                                                </span>
                                                <button
                                                    onClick={goToPrevMatch}
                                                    disabled={totalMatches === 0}
                                                    className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
                                                >
                                                    <ChevronUp className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={goToNextMatch}
                                                    disabled={totalMatches === 0}
                                                    className="p-1 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="bg-card border border-border/40 rounded-[32px] p-6 lg:p-12 leading-relaxed text-lg font-medium shadow-lg hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300">
                                {recording.transcript_text ? (
                                    <div className="space-y-10">
                                        {(() => {
                                            let globalMatchCounter = 0;
                                            return parsedTranscript.map((utterance, i) => (
                                                <div key={i} className="group/para">
                                                    <div className="flex items-center gap-3 mb-3">
                                                        {(() => {
                                                            const colors = [
                                                                'bg-primary/15 text-primary',
                                                                'bg-blue-500/15 text-blue-600',
                                                                'bg-emerald-500/15 text-emerald-600',
                                                                'bg-violet-500/15 text-violet-600',
                                                                'bg-amber-500/15 text-amber-600',
                                                            ];
                                                            // Fallback logic to pick a color based on speaker ID (e.g. "0", "1", or "A")
                                                            const speakerIdx = isNaN(parseInt(utterance.speaker))
                                                                ? utterance.speaker.charCodeAt(0) % colors.length
                                                                : parseInt(utterance.speaker) % colors.length;
                                                            const colorClass = colors[speakerIdx];

                                                            return (
                                                                <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center text-[10px] font-bold uppercase`}>
                                                                    S{utterance.speaker}
                                                                </div>
                                                            );
                                                        })()}
                                                        <button
                                                            onClick={() => seekToTime(utterance.time)}
                                                            className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground opacity-50 group-hover/para:opacity-100 transition-opacity hover:text-primary cursor-pointer"
                                                        >
                                                            Speaker {utterance.speaker} &bull; {utterance.time}
                                                        </button>
                                                    </div>
                                                    <p className="opacity-80 group-hover/para:opacity-100 transition-opacity leading-relaxed font-normal">
                                                        {(() => {
                                                            if (!searchQuery.trim()) return utterance.text;

                                                            const query = searchQuery.toLowerCase();
                                                            const text = utterance.text;
                                                            const parts: React.ReactNode[] = [];
                                                            let lastIndex = 0;
                                                            let lowerText = text.toLowerCase();
                                                            let idx = lowerText.indexOf(query);

                                                            while (idx !== -1) {
                                                                if (idx > lastIndex) {
                                                                    parts.push(text.substring(lastIndex, idx));
                                                                }
                                                                const matchIdx = globalMatchCounter;
                                                                const isCurrentMatch = matchIdx === currentMatchIndex;
                                                                const matchCharOffset = idx;
                                                                parts.push(
                                                                    <span
                                                                        key={`match-${i}-${idx}`}
                                                                        ref={(el) => { matchRefs.current[matchIdx] = el; }}
                                                                        onClick={() => {
                                                                            const exactTime = findWordTimestamp(text, matchCharOffset, utterance.time);
                                                                            seekToSeconds(exactTime);
                                                                        }}
                                                                        className={cn(
                                                                            "px-0.5 rounded cursor-pointer transition-all",
                                                                            isCurrentMatch
                                                                                ? "bg-primary text-white font-semibold shadow-sm shadow-primary/30"
                                                                                : "bg-primary/20 text-foreground hover:bg-primary/30"
                                                                        )}
                                                                    >
                                                                        {text.substring(idx, idx + searchQuery.length)}
                                                                    </span>
                                                                );
                                                                globalMatchCounter++;
                                                                lastIndex = idx + searchQuery.length;
                                                                idx = lowerText.indexOf(query, lastIndex);
                                                            }

                                                            if (lastIndex < text.length) {
                                                                parts.push(text.substring(lastIndex));
                                                            }

                                                            return parts;
                                                        })()}
                                                    </p>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                        <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                                            <FileText className="w-10 h-10 opacity-20" />
                                        </div>
                                        {recording.status === 'completed' ? (
                                            <p className="font-medium tracking-wider uppercase text-xs opacity-40">No speech detected in this recording</p>
                                        ) : (
                                            <p className="font-medium tracking-wider uppercase text-xs opacity-40">Transcript is being processed...</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </SidebarInset>
                <SidebarRail />
            </SidebarProvider>

            {/* AI Chat Assistant */}
            {
                mounted && (
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
                )
            }
        </>
    );
}