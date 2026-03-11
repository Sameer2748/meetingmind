"use client";

import { useEffect, useState } from "react";
import {
    User as UserIcon,
    Mail,
    CreditCard,
    Zap,
    History,
    Settings as SettingsIcon,
    Loader2,
    LogOut,
    CheckCircle2,
    Video,
    Receipt
} from "lucide-react";
import { SidebarProvider, SidebarTrigger, SidebarInset, SidebarRail } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { tokenManager } from "@/lib/auth/tokenManager";
import { authAPI, paymentAPI } from "@/lib/api";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
    const [user, setUser] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [payments, setPayments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
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
                const [statsData, paymentsData] = await Promise.all([
                    authAPI.getStatus(),
                    paymentAPI.getPayments()
                ]);
                setStats(statsData);
                setPayments(paymentsData);
                setUser((prev: any) => ({ ...prev, plan: statsData.plan }));
            } catch (err) {
                console.error("[Settings] Failed to fetch data:", err);
                toast.error("Failed to load account details");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [router]);

    const handleLogout = () => {
        tokenManager.removeToken();
        router.push("/signin");
        toast.success("Logged out successfully");
    };

    if (loading || !user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        );
    }

    const isPro = stats?.plan === 'pro';

    return (
        <SidebarProvider className="flex w-full min-h-screen">
            <AppSidebar user={user} />
            <SidebarInset className="bg-background flex-1 min-w-0">
                <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border/10 bg-background/50 backdrop-blur-md px-6 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                    <div className="flex items-center gap-2">
                        <SidebarTrigger className="-ml-1" />
                        <div className="w-[1px] h-4 bg-border mx-2" />
                        <h1 className="text-sm font-bold tracking-tight text-muted-foreground uppercase flex items-center gap-2">
                            <SettingsIcon className="w-4 h-4" /> Account Settings
                        </h1>
                    </div>
                </header>

                <div className="p-4 sm:p-6 lg:p-10 max-w-[800px] mx-auto w-full">
                    <div className="mb-10 text-center sm:text-left">
                        <h2 className="text-3xl sm:text-5xl font-black tracking-tighter italic mb-4">Account Workspace</h2>
                        <p className="text-muted-foreground font-medium">Manage your personal information, subscription, and meeting preferences.</p>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        {/* Profile Section */}
                        <div className="bg-card border border-border/50 rounded-[32px] p-6 sm:p-8 shadow-sm">
                            <div className="flex items-center gap-4 mb-8">
                                <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-primary/20">
                                    <div className="w-full h-full bg-primary/5 flex items-center justify-center text-primary text-2xl font-black uppercase">
                                        {user.name.charAt(0)}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black tracking-tight">{user.name}</h3>
                                    <p className="text-muted-foreground font-medium flex items-center gap-2 text-sm italic">
                                        <Mail className="w-3.5 h-3.5" /> {user.email}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-5 rounded-2xl bg-muted/30 border border-border/20">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60 mb-1">
                                        <UserIcon className="w-3 h-3 text-primary" /> Full Name
                                    </div>
                                    <div className="text-sm font-bold truncate">{user.name}</div>
                                </div>
                                <div className="p-5 rounded-2xl bg-muted/30 border border-border/20">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60 mb-1">
                                        <Mail className="w-3 h-3 text-primary" /> Login Email
                                    </div>
                                    <div className="text-sm font-bold truncate">{user.email}</div>
                                </div>
                            </div>
                        </div>

                        {/* Subscription Section */}
                        <div className="bg-card border border-border/50 rounded-[32px] p-6 sm:p-8 shadow-sm relative overflow-hidden">
                            {isPro && (
                                <div className="absolute top-6 right-6 p-2 bg-primary/10 rounded-xl">
                                    <Zap className="w-5 h-5 text-primary" />
                                </div>
                            )}

                            <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                                <CreditCard className="w-5 h-5 text-primary" />
                                Subscription Plan
                            </h3>

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 p-6 rounded-3xl bg-muted/30 border border-border/20">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center",
                                        isPro ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                                    )}>
                                        <CheckCircle2 className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-lg font-black tracking-tight uppercase italic">{stats?.plan || 'Starter'}</div>
                                        <div className="text-xs font-medium text-muted-foreground">Current monthly subscription</div>
                                    </div>
                                </div>
                                {!isPro && (
                                    <button
                                        onClick={() => router.push('/dashboard?buy=pro')}
                                        className="bg-primary text-white px-6 py-2.5 rounded-xl font-black text-sm shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Upgrade to Pro
                                    </button>
                                )}
                            </div>

                            <div className="mt-6 flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                                <Video className="w-4 h-4 text-primary" />
                                <div className="text-sm font-bold text-foreground/80">
                                    You have used <span className="text-primary">{stats?.recordingsCount || 0}</span>
                                    {isPro ? " meetings (Unlimited)" : ` of ${stats?.limit || 5} meetings`}
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity Mock / Stats */}
                        <div className="bg-card border border-border/50 rounded-[32px] p-6 sm:p-8 shadow-sm">
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                                <History className="w-5 h-5 text-primary" />
                                Usage Statistics
                            </h3>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/20 text-center">
                                    <div className="text-3xl font-black tracking-tighter text-primary mb-1 italic">{stats?.recordingsCount || 0}</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Total Sessions</div>
                                </div>
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/20 text-center">
                                    <div className="text-3xl font-black tracking-tighter text-primary mb-1 italic">HD</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Max Quality</div>
                                </div>
                                <div className="p-6 rounded-3xl bg-muted/30 border border-border/20 text-center col-span-2 sm:col-span-1">
                                    <div className="text-3xl font-black tracking-tighter text-primary mb-1 italic">Cloud</div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Storage Sync</div>
                                </div>
                            </div>
                        </div>

                        {/* Payment History Section */}
                        <div className="bg-card border border-border/50 rounded-[32px] p-6 sm:p-8 shadow-sm">
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                                <Receipt className="w-5 h-5 text-primary" />
                                Payment History
                            </h3>

                            <div className="space-y-3">
                                {payments.length > 0 ? (
                                    payments.map((payment) => (
                                        <div key={payment.id} className="flex items-center justify-between p-4 rounded-2xl bg-muted/30 border border-border/10">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                                    <CreditCard className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold uppercase italic">{payment.plan} Plan</div>
                                                    <div className="text-[10px] text-muted-foreground font-medium">
                                                        {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(payment.created_at))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-black text-foreground">
                                                ₹{payment.amount}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-10 rounded-3xl bg-muted/20 border border-dashed border-border/30 text-center">
                                        <Receipt className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">No transactions yet</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-center sm:justify-start gap-4 mt-4">
                            <p className="text-[10px] font-bold text-muted-foreground opacity-40 uppercase tracking-widest">
                                All changes are automatically synced with Google Cloud Workspace.
                            </p>
                        </div>
                    </div>
                </div>
            </SidebarInset>
            <SidebarRail />
        </SidebarProvider>
    );
}
