"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Clock,
    Calendar as CalendarIcon,
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
    AlertCircle,
    X
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
import { format, isSameDay } from "date-fns";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ─── Compact Waveform Seek Bar for Dashboard Cards ─────────────────────────────

const CARD_WAVEFORM_BARS = [
    6, 10, 16, 12, 18, 24, 14, 20, 28, 16, 12, 22, 18, 26, 14, 10, 20, 24, 16, 12,
    18, 28, 22, 14, 10, 16, 24, 20, 12, 18,
];

function CardWaveformSeekBar({
    currentTime,
    duration,
    onSeek,
    color = "#e07155",
}: {
    currentTime: number;
    duration: number;
    onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
    color?: string;
}) {
    const progress = duration > 0 ? currentTime / duration : 0;

    return (
        <div style={{ position: "relative", width: "100%", userSelect: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, height: 32, width: "100%" }}>
                {CARD_WAVEFORM_BARS.map((h, i) => {
                    const barProgress = i / CARD_WAVEFORM_BARS.length;
                    const filled = barProgress < progress;
                    const halfH = Math.max(h / 2, 2);

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
                                background: filled ? color : "rgba(150,150,150,0.18)",
                                borderRadius: "9999px 9999px 0 0",
                                transition: "background 0.08s ease",
                            }} />
                            <div style={{
                                width: "100%",
                                height: halfH,
                                background: filled ? color : "rgba(150,150,150,0.18)",
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
                onChange={onSeek}
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

export default function Dashboard() {
    const [recordings, setRecordings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [recordingToDelete, setRecordingToDelete] = useState<any>(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
    const [calendarOpen, setCalendarOpen] = useState(false);
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

    const getMeetingTitle = (rec: any) => rec?.meeting_url?.split('/').pop() || "Untitled Meeting";

    const handleDelete = async () => {
        if (deleteConfirmText !== getMeetingTitle(recordingToDelete)) {
            toast.error("Meeting title does not match");
            return;
        }

        try {
            await recordingsAPI.deleteRecording(recordingToDelete.id);
            setRecordings(recordings.filter(r => r.id !== recordingToDelete.id));
            setDeleteModalOpen(false);
            setRecordingToDelete(null);
            setDeleteConfirmText("");
            toast.success("Recording deleted successfully");
        } catch (err) {
            toast.error("Failed to delete recording");
        }
    };

    const filteredRecordings = useMemo(() => {
        if (!selectedDate) return recordings;
        return recordings.filter((r) => {
            if (!r.created_at) return false;
            return isSameDay(new Date(r.created_at), selectedDate);
        });
    }, [recordings, selectedDate]);

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

                </header>

                <div className="p-6 lg:p-10 max-w-[1400px] mx-auto w-full">
                    <div className="mb-8 flex items-center justify-between">
                        <h2 className="text-4xl font-black tracking-tighter italic">Meeting Intelligence</h2>
                        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    className={cn(
                                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 hover:scale-105 active:scale-95",
                                        selectedDate
                                            ? "bg-primary text-white border-primary shadow-md shadow-primary/20"
                                            : "bg-card border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground shadow-sm"
                                    )}
                                >
                                    <CalendarIcon className="w-4 h-4" />
                                    <span>{selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'Filter by date'}</span>
                                    {selectedDate && (
                                        <X
                                            className="w-3.5 h-3.5 ml-0.5 hover:text-white/80"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedDate(undefined);
                                            }}
                                        />
                                    )}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 rounded-2xl border-border/50 shadow-xl" align="start">
                                <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={(date) => {
                                        setSelectedDate(date);
                                        setCalendarOpen(false);
                                    }}
                                    className="rounded-2xl"
                                    classNames={{
                                        today: "bg-primary/10 text-primary rounded-md",
                                    }}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-40 space-y-4">
                            <Loader2 className="w-10 h-10 text-primary animate-spin" />
                            <p className="text-muted-foreground font-bold tracking-widest text-[10px] uppercase opacity-50">Syncing Sessions</p>
                        </div>
                    ) : recordings.length === 0 ? (
                        <div className="text-center py-24 px-6 rounded-[32px] border border-border/50 bg-muted/5 flex flex-col items-center">
                            <div className="w-16 h-16 rounded-3xl bg-muted/40 flex items-center justify-center mb-6">
                                <CalendarIcon className="w-8 h-8 text-primary/40" />
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
                                <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground opacity-40">
                                    {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'All Sessions'}
                                </h3>
                                <div className="text-[10px] font-bold text-muted-foreground/40">
                                    {filteredRecordings.length}{selectedDate ? ` of ${recordings.length}` : ' total'}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredRecordings.map((recording, i) => (
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
                                {filteredRecordings.length === 0 && (
                                    <div className="col-span-full text-center py-16">
                                        <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
                                            <CalendarIcon className="w-6 h-6 text-muted-foreground/30" />
                                        </div>
                                        <p className="text-sm font-medium text-muted-foreground/50">No recordings found for this period</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <Dialog open={deleteModalOpen} onOpenChange={(open) => {
                    setDeleteModalOpen(open);
                    if (!open) setDeleteConfirmText("");
                }}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold tracking-tight">Delete this recording?</DialogTitle>
                            <DialogDescription className="text-sm leading-relaxed pt-1">
                                This action is permanent and cannot be undone. To confirm, type the meeting title{' '}
                                <span className="text-foreground font-semibold bg-muted/80 px-1.5 py-0.5 rounded-md select-all text-xs font-mono">{getMeetingTitle(recordingToDelete)}</span>{' '}
                                below.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-3">
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                placeholder="Enter meeting title to confirm"
                                className="w-full bg-muted/30 border border-border/40 p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-rose-500/15 focus:border-rose-400/40 transition-all text-sm font-medium tracking-tight placeholder:text-muted-foreground/40"
                            />
                        </div>
                        <DialogFooter className="gap-2 sm:gap-2">
                            <button
                                onClick={() => {
                                    setDeleteModalOpen(false);
                                    setDeleteConfirmText("");
                                }}
                                className="px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-muted border border-border/30 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleteConfirmText !== getMeetingTitle(recordingToDelete)}
                                className={cn(
                                    "text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 active:scale-95 transition-all",
                                    deleteConfirmText === getMeetingTitle(recordingToDelete)
                                        ? "bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-600/15"
                                        : "bg-rose-600/40 cursor-not-allowed opacity-60"
                                )}
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Delete Permanently
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, type: "spring", stiffness: 100 }}
            className="group"
            onClick={() => router.push(`/dashboard/recordings/${recording.id}`)}
        >
            <div className="relative bg-card border border-border/50 rounded-[32px] overflow-hidden flex flex-col h-full transition-all duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 cursor-pointer group/card">
                {/* Visual Header / Thumbnail */}
                <div className="h-40 bg-muted/20 relative flex items-center justify-center overflow-hidden border-b border-border/10">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent transition-opacity group-hover/card:opacity-100 opacity-60" />
                    <div className="relative w-16 h-16 rounded-[24px] bg-primary flex items-center justify-center shadow-xl shadow-primary/20 group-hover/card:scale-110 transition-transform duration-500">
                        <Play className={cn("w-7 h-7 text-white fill-current", isPlaying && "hidden")} />
                        <div className={cn("flex items-center gap-1", !isPlaying && "hidden")}>
                            {[1, 2, 3].map(i => (
                                <motion.div
                                    key={i}
                                    animate={{ height: [8, 20, 8] }}
                                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                                    className="w-1 bg-white rounded-full"
                                />
                            ))}
                        </div>
                    </div>

                    {/* Status Badge */}
                    <div className="absolute top-4 right-4">
                        <div className="bg-background/80 backdrop-blur-md px-3 py-1 rounded-full border border-border/20 flex items-center gap-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full", recording.status === 'completed' ? "bg-green-500" : "bg-orange-500 animate-pulse")} />
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/80">
                                {recording.status === 'completed' ? 'Ready' : 'Syncing'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="p-6 flex flex-col flex-1">
                    <div className="flex-1 mb-6">
                        <h3 className="text-xl font-black text-foreground tracking-tight line-clamp-2 mb-3 group-hover/card:text-primary transition-colors">
                            {recording.meeting_url?.split('/').pop() || "Untitled Meeting"}
                        </h3>

                        <div className="flex flex-wrap gap-4">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <CalendarIcon className="w-3.5 h-3.5" />
                                <span className="text-[11px] font-bold uppercase tracking-wider">
                                    {recording.created_at ? format(new Date(recording.created_at), 'MMM dd, yyyy') : 'Recent'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-primary">
                                <Clock className="w-3.5 h-3.5" />
                                <span className="text-[11px] font-bold uppercase tracking-wider">
                                    {formatTime(duration)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Audio Controls */}
                    <div className="space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-muted-foreground/50 w-8">{formatTime(currentTime)}</span>
                            <div className="flex-1">
                                <CardWaveformSeekBar
                                    currentTime={currentTime}
                                    duration={duration}
                                    onSeek={handleSeek}
                                />
                            </div>
                            <span className="text-[10px] font-black text-muted-foreground/50 w-8 text-right">{formatTime(duration)}</span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-border/10">
                            <audio
                                ref={audioRef}
                                src={`${process.env.NEXT_PUBLIC_API_URL || 'https://meetingmind-backend.100xsam.live'}/api/recordings/${recording.id}/audio?token=${tokenManager.getToken()}`}
                                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                                onLoadedMetadata={() => {
                                    if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
                                        setDuration(audioRef.current.duration);
                                    }
                                }}
                                onEnded={() => setIsPlaying(false)}
                            />

                            <button
                                onClick={togglePlay}
                                className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                            >
                                {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                            </button>

                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        router.push(`/dashboard/recordings/${recording.id}`);
                                    }}
                                    className="p-2.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                    title="View Analysis"
                                >
                                    <BarChart3 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete();
                                    }}
                                    className="p-2.5 rounded-xl hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all font-bold"
                                    title="Delete Session"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
