"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ChevronLeft,
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
    Share2
} from "lucide-react";
import { SidebarProvider, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { tokenManager } from "@/lib/auth/tokenManager";
import { recordingsAPI } from "@/lib/api";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function RecordingDetails() {
    const { id } = useParams();
    const router = useRouter();
    const [recording, setRecording] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    // Audio Player State
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);

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
                // We'll reuse getRecordings and find the specific one for now
                // In a real app, you'd have getRecordingById
                const data = await recordingsAPI.getRecordings();
                const found = data.find((r: any) => r.id === parseInt(id as string));
                if (found) {
                    setRecording(found);
                    if (found.duration) setDuration(found.duration);
                } else {
                    console.error("Recording not found");
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
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
        }
    };

    const skip = (amount: number) => {
        if (audioRef.current) {
            audioRef.current.currentTime += amount;
        }
    };

    const formatTime = (time: number) => {
        if (!isFinite(time) || isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    if (!user || loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    if (!recording) return null;

    return (
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
                            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/recordings/${id}/audio?token=${tokenManager.getToken()}`}
                            download={`meeting-${id}.webm`}
                            className="bg-primary text-white p-2 sm:px-4 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                        >
                            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
                        </a>
                    </div>
                </header>

                <div className="max-w-[1200px] mx-auto w-full p-6 lg:p-10">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-card border border-border/50 rounded-[24px] p-4 lg:p-5 mb-10 shadow-xl shadow-[#e0715508] sticky top-6 z-10 backdrop-blur-sm bg-card/90"
                    >
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    {/* Small Minimal Artwork */}
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#e07155] to-[#f1efd8] flex items-center justify-center shrink-0 shadow-lg shadow-[#e0715526]">
                                        <Play className={cn("w-6 h-6 text-white fill-current", isPlaying && "hidden")} />
                                        <div className={cn("flex items-center gap-1", !isPlaying && "hidden")}>
                                            {[1, 2, 3].map(i => (
                                                <motion.div
                                                    key={i}
                                                    animate={{ height: [8, 20, 10] }}
                                                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                                                    className="w-1 bg-white rounded-full"
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="min-w-0">
                                        <h2 className="text-base font-black text-foreground truncate leading-tight">
                                            {recording.meeting_url?.split('/').pop() || "Untitled Meeting"}
                                        </h2>
                                        <p className="text-[10px] font-bold text-[#e07155] uppercase tracking-widest mt-0.5">
                                            {recording.status === 'completed' ? 'Session Ready' : 'Processing...'}
                                        </p>
                                    </div>
                                </div>

                                <audio
                                    ref={audioRef}
                                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/recordings/${id}/audio?token=${tokenManager.getToken()}`}
                                    onTimeUpdate={handleTimeUpdate}
                                    onLoadedMetadata={handleLoadedMetadata}
                                    onEnded={() => setIsPlaying(false)}
                                />

                                <div className="flex items-center gap-4">
                                    <div className="hidden sm:flex items-center gap-2 mr-2">
                                        <button onClick={() => skip(-10)} className="p-2 hover:bg-muted rounded-lg transition-all text-muted-foreground hover:text-foreground">
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => skip(10)} className="p-2 hover:bg-muted rounded-lg transition-all text-muted-foreground hover:text-foreground">
                                            <RotateCw className="w-4 h-4" />
                                        </button>
                                    </div>

                                    <button
                                        onClick={togglePlay}
                                        className="w-12 h-12 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-lg"
                                    >
                                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                                    </button>
                                </div>
                            </div>

                            <div className="px-1 space-y-1">
                                <div className="relative group/seek">
                                    <input
                                        type="range"
                                        min="0"
                                        max={duration || 100}
                                        value={currentTime}
                                        onChange={handleSeek}
                                        className="w-full h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary group-hover/seek:h-1.5 transition-all"
                                    />
                                </div>
                                <div className="flex items-center justify-between text-[9px] font-bold tracking-tight text-muted-foreground uppercase">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatTime(duration)}</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Metadata & Transcript */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                        <div className="lg:col-span-2 space-y-8">
                            <div>
                                <h3 className="text-2xl font-black italic mb-6">Full Transcript</h3>
                                <div className="prose prose-slate dark:prose-invert max-w-none">
                                    <div className="bg-muted/30 border border-border/50 rounded-3xl p-8 lg:p-10 leading-relaxed text-lg font-medium">
                                        {recording.transcript_text ? (
                                            recording.transcript_text.split('\n').map((para: string, i: number) => (
                                                <p key={i} className="mb-4 last:mb-0 opacity-80 hover:opacity-100 transition-opacity">
                                                    {para}
                                                </p>
                                            ))
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                                                <FileText className="w-12 h-12 mb-4 opacity-20" />
                                                <p className="font-bold tracking-tight italic">Transcript is being processed...</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <h3 className="text-xl font-black italic">Session Details</h3>
                            <div className="bg-muted/20 border border-border/50 rounded-3xl p-6 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                        <Calendar className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Recorded On</p>
                                        <p className="font-bold">{format(new Date(recording.created_at), 'MMMM dd, yyyy')}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                                        <Clock className="w-5 h-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Duration</p>
                                        <p className="font-bold">{formatTime(duration)}</p>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-border/30">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Participants</p>
                                    <div className="flex -space-x-3">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="w-10 h-10 rounded-full bg-muted border-2 border-card flex items-center justify-center font-bold text-xs">
                                                U{i}
                                            </div>
                                        ))}
                                        <div className="w-10 h-10 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center font-black text-[10px] text-primary">
                                            +2
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </SidebarInset>
            <SidebarRail />
        </SidebarProvider>
    );
}
