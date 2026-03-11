"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { recordingsAPI } from "@/lib/api";
import {
    Loader2,
    Calendar,
    Clock,
    Play,
    Pause,
    RotateCcw,
    RotateCw,
    Volume2,
    VolumeX
} from "lucide-react";
import { format } from "date-fns";

export default function SharedRecordingPage() {
    const { token } = useParams();
    const [recording, setRecording] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const videoRef = (window as any).document ? null : null; // simplified for now

    useEffect(() => {
        const fetchShared = async () => {
            try {
                const data = await recordingsAPI.getSharedRecording(token as string);
                if (data.success) {
                    setRecording(data.recording);
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

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    );

    if (error || !recording) return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                <Clock className="w-10 h-10 text-red-500 opacity-50" />
            </div>
            <h1 className="text-2xl font-black mb-2 uppercase tracking-tighter italic">Link Expired</h1>
            <p className="text-muted-foreground max-w-md">{error || "This shared meeting recording has expired or the link is invalid."}</p>
        </div>
    );

    const streamUrl = `${process.env.NEXT_PUBLIC_API_URL || 'https://meetingmind-backend.100xsam.live'}/api/recordings/shared/${token}/stream`;

    return (
        <div className="min-h-screen bg-[#050505] text-white selection:bg-primary selection:text-white">
            <nav className="h-20 border-b border-white/5 flex items-center px-6 lg:px-12 backdrop-blur-xl bg-black/50 sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
                        <Play className="w-5 h-5 text-primary fill-primary" />
                    </div>
                    <div>
                        <h1 className="text-sm font-black uppercase tracking-widest">{recording.meeting_url?.split('/').pop() || "Shared Recording"}</h1>
                        <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Public View Mode</p>
                    </div>
                </div>
            </nav>

            <main className="max-w-[1200px] mx-auto p-6 lg:p-12 space-y-12">
                <div className="relative pt-[56.25%] bg-black rounded-[40px] overflow-hidden border border-white/5 shadow-2xl">
                    <video
                        src={streamUrl}
                        className="absolute inset-0 w-full h-full object-contain"
                        controls
                        playsInline
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <div className="space-y-4">
                            <h2 className="text-4xl font-black tracking-tighter italic uppercase">Transcript</h2>
                            <div className="p-8 lg:p-12 bg-white/5 border border-white/5 rounded-[40px] leading-relaxed text-lg text-white/80 whitespace-pre-wrap">
                                {recording.transcript_text || "No transcript available for this recording."}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="p-8 bg-white/5 border border-white/5 rounded-[40px] space-y-6">
                            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Session Info</h3>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-4 h-4 text-primary" />
                                    <div>
                                        <p className="text-[10px] font-black uppercase opacity-40">Recorded On</p>
                                        <p className="text-sm font-bold">{format(new Date(recording.created_at), 'MMMM dd, yyyy')}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Clock className="w-4 h-4 text-primary" />
                                    <div>
                                        <p className="text-[10px] font-black uppercase opacity-40">Duration</p>
                                        <p className="text-sm font-bold">{Math.floor(recording.duration / 60)}m {recording.duration % 60}s</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-primary/10 border border-primary/20 rounded-[40px]">
                            <p className="text-xs font-bold leading-relaxed">
                                This link was shared via <span className="text-primary tracking-tight">MeetingMind AI</span> and will remain active until its expiration.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
