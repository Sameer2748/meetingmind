"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Clock,
    Calendar,
    Plus,
    Search,
    Play,
    Pause,
    FileText,
    Loader2,
    MoreVertical,
    Trash2,
    BarChart3,
    ChevronRight,
    AlertCircle
} from "lucide-react";
import { SidebarProvider, SidebarTrigger, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { tokenManager } from "@/lib/auth/tokenManager";
import { recordingsAPI } from "@/lib/api";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Dashboard() {
    const [recordings, setRecordings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [recordingToDelete, setRecordingToDelete] = useState<any>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState("");
    const router = useRouter();

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

        const fetchData = async () => {
            try {
                const data = await recordingsAPI.getRecordings();
                setRecordings(data);
            } catch (err) {
                console.error("[Dashboard] Failed to fetch recordings:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [router]);

    const handleDelete = async () => {
        if (deleteConfirmId !== recordingToDelete.id.toString()) {
            toast.error("Meeting ID does not match");
            return;
        }

        try {
            await recordingsAPI.deleteRecording(recordingToDelete.id);
            setRecordings(recordings.filter(r => r.id !== recordingToDelete.id));
            setDeleteModalOpen(false);
            setRecordingToDelete(null);
            setDeleteConfirmId("");
            toast.success("Recording deleted successfully");
        } catch (err) {
            toast.error("Failed to delete recording");
        }
    };

    if (!user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <SidebarProvider className="flex w-full min-h-screen">
            <AppSidebar user={user} />
            <SidebarInset className="bg-background flex-1 min-w-0">
                <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border/10 bg-background/50 backdrop-blur-md px-6 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2">
                        <SidebarTrigger className="-ml-1" />
                        <div className="w-[1px] h-4 bg-border mx-2" />
                        <h1 className="text-sm font-bold tracking-tight text-muted-foreground uppercase">My Meetings</h1>
                    </div>

                    <div className="ml-auto flex items-center gap-4">
                        <div className="relative group hidden md:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder="Search sessions..."
                                className="bg-muted/30 border border-border/20 px-10 py-2 rounded-full text-xs outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all w-56 font-medium"
                            />
                        </div>
                    </div>
                </header>

                <div className="p-6 lg:p-10 max-w-[1400px] mx-auto w-full">
                    <div className="mb-10">
                        <h2 className="text-4xl font-black tracking-tighter mb-2 italic">Meeting Intelligence</h2>
                        <p className="text-muted-foreground font-medium">Automatic summaries and high-fidelity transcripts for every call.</p>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-40 space-y-4">
                            <Loader2 className="w-10 h-10 text-primary animate-spin" />
                            <p className="text-muted-foreground font-bold tracking-widest text-[10px] uppercase opacity-50">Syncing Sessions</p>
                        </div>
                    ) : recordings.length === 0 ? (
                        <div className="text-center py-24 px-6 rounded-[32px] border border-border/50 bg-muted/5 flex flex-col items-center">
                            <div className="w-16 h-16 rounded-3xl bg-muted/40 flex items-center justify-center mb-6">
                                <Calendar className="w-8 h-8 text-primary/40" />
                            </div>
                            <h3 className="text-xl font-bold mb-1">No meeting history yet</h3>
                            <p className="text-muted-foreground max-w-sm mx-auto mb-6 text-sm font-medium">
                                Connect the extension and join a Google Meet session to see your processed insights here.
                            </p>
                            <button className="bg-muted hover:bg-muted/80 text-foreground px-6 py-2 rounded-xl text-xs font-bold transition-all">
                                View Help Guide
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between px-2 mb-2">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground opacity-40">Recent Sessions</h3>
                                <div className="text-[10px] font-bold text-muted-foreground/40">{recordings.length} total</div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {recordings.map((recording, i) => (
                                    <RecordingCard
                                        key={recording.id}
                                        recording={recording}
                                        index={i}
                                        onDelete={() => {
                                            setRecordingToDelete(recording);
                                            setDeleteModalOpen(true);
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="text-2xl font-black italic">Delete Recording?</DialogTitle>
                            <DialogDescription>
                                This action is permanent. To confirm, please type the meeting ID <span className="text-foreground font-bold underline select-all">{recordingToDelete?.id}</span> below.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <input
                                type="text"
                                value={deleteConfirmId}
                                onChange={(e) => setDeleteConfirmId(e.target.value)}
                                placeholder="Enter meeting ID"
                                className="w-full bg-muted/50 border border-border/50 p-4 rounded-2xl outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500/50 transition-all font-bold tracking-tight"
                            />
                        </div>
                        <DialogFooter>
                            <button
                                onClick={() => {
                                    setDeleteModalOpen(false);
                                    setDeleteConfirmId("");
                                }}
                                className="px-6 py-2 rounded-xl text-xs font-bold hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                            >
                                <Trash2 className="w-4 h-4" /> Delete Permanently
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </SidebarInset>
            <SidebarRail />
        </SidebarProvider >
    );
}

function RecordingCard({ recording, index, onDelete }: { recording: any; index: number; onDelete: () => void }) {
    const router = useRouter();
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(recording.duration || 0);

    const formatTime = (time: number) => {
        if (!isFinite(time) || isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        if (audioRef.current) {
            const time = parseFloat(e.target.value);
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            className="group"
        >
            <div className="p-3 rounded-2xl bg-card border border-border/50 flex flex-col gap-2 hover:border-[#e071554d] hover:bg-card/80 transition-all shadow-sm hover:shadow-lg hover:shadow-[#e071550a] cursor-pointer relative overflow-hidden group/card"
                onClick={() => router.push(`/dashboard/recordings/${recording.id}`)}>

                <audio
                    ref={audioRef}
                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001'}/api/recordings/${recording.id}/audio?token=${tokenManager.getToken()}`}
                    onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                    onLoadedMetadata={() => {
                        if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
                            setDuration(audioRef.current.duration);
                        }
                    }}
                    onEnded={() => setIsPlaying(false)}
                />

                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#e07155] to-[#f1efd8] flex items-center justify-center shrink-0 shadow-md shadow-[#e0715520]">
                            <Play className={cn("w-4 h-4 text-white fill-current", isPlaying && "hidden")} />
                            <div className={cn("flex items-center gap-0.5", !isPlaying && "hidden")}>
                                {[1, 2, 3].map(i => (
                                    <motion.div
                                        key={i}
                                        animate={{ height: [6, 14, 6] }}
                                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                                        className="w-0.5 bg-white rounded-full"
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="min-w-0">
                            <h3 className="text-sm font-black text-foreground truncate group-hover/card:text-[#e07155] transition-colors">
                                {recording.meeting_url.split('/').pop() || "Untitled Meeting"}
                            </h3>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                {recording.created_at ? format(new Date(recording.created_at), 'MMM dd, yyyy') : 'Recent Session'}
                                {duration > 0 && <span className="ml-2 text-[#e07155]">· {formatTime(duration)}</span>}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="hidden sm:flex bg-[#e0715510] px-2.5 py-1 rounded-full items-center gap-1.5 border border-[#e0715515]">
                            <div className="w-1 h-1 rounded-full bg-[#e07155]" />
                            <span className="text-[9px] font-black text-[#e07155] tracking-widest uppercase">
                                {recording.status === 'completed' ? 'Ready' : 'Syncing'}
                            </span>
                        </div>
                        <button
                            onClick={togglePlay}
                            className="w-9 h-9 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-md"
                        >
                            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                        </button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    className="w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-all"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <MoreVertical className="w-4 h-4" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
                                <DropdownMenuItem
                                    className="rounded-lg flex items-center gap-2 p-2.5 font-bold text-xs"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/dashboard/recordings/${recording.id}`);
                                    }}
                                >
                                    <BarChart3 className="w-3.5 h-3.5" /> View Insights
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="rounded-lg flex items-center gap-2 p-2.5 font-bold text-xs text-red-500 hover:text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-600"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete();
                                    }}
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete Session
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div className="px-0.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold text-muted-foreground/60 w-6">{formatTime(currentTime)}</span>
                        <div className="flex-1 relative group/seek">
                            <input
                                type="range"
                                min="0"
                                max={duration || 100}
                                value={currentTime}
                                onChange={handleSeek}
                                className="w-full h-0.5 bg-muted rounded-full appearance-none cursor-pointer accent-[#e07155] group-hover/seek:h-1 transition-all"
                            />
                        </div>
                        <span className="text-[8px] font-bold text-muted-foreground/60 w-6 text-right">{formatTime(duration)}</span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
