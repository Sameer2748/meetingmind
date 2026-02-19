"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GoogleLogin } from "@react-oauth/google";
import { toast } from "sonner";
import { Brain, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { authAPI } from "@/lib/api";
import { tokenManager } from "@/lib/auth/tokenManager";
import { jwtDecode } from "jwt-decode";

export default function SignInPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            toast.error("Please enter your email");
            return;
        }

        setLoading(true);
        try {
            console.log("[Auth] Attempting login for:", email);
            const data = await authAPI.login(email);
            console.log("[Auth] Login response:", data);

            if (data.success) {
                tokenManager.setToken(data.token);
                toast.success("Welcome back to MeetingMind!");
                console.log("[Auth] Redirecting to /dashboard...");
                // Force a full reload to the dashboard to avoid SPA routing issues
                window.location.href = "/dashboard";
            }
        } catch (err: any) {
            console.error("[Auth] Login error:", err);
            toast.error(err.response?.data?.error || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSuccess = async (credentialResponse: any) => {
        try {
            console.log("[Auth] Google sign-in successful, decoding token...");
            const decoded: any = jwtDecode(credentialResponse.credential);
            const email = decoded.email;

            if (email) {
                console.log("[Auth] Derived email from Google:", email);
                const data = await authAPI.login(email);
                if (data.success) {
                    tokenManager.setToken(data.token);
                    toast.success("Signed in with Google!");
                    window.location.href = "/dashboard";
                }
            }
        } catch (err) {
            console.error("[Auth] Google login failed:", err);
            toast.error("Failed to sync Google account");
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_top,_var(--primary)_0%,_transparent_40%)]">
            <Link
                href="/"
                className="absolute top-10 left-10 flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium"
            >
                <ArrowLeft className="w-4 h-4" /> Back to home
            </Link>

            <div className="absolute top-10 right-10">
                <ThemeToggle />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-[420px] glass-effect p-10 rounded-[32px] shadow-2xl space-y-8"
            >
                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-[22px] bg-primary flex items-center justify-center mb-6 shadow-xl shadow-primary/30">
                        <Brain className="w-9 h-9 text-white" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight mb-2">Welcome Back</h1>
                    <p className="text-muted-foreground">Log in to manage your meetings and insights.</p>
                </div>

                <div className="flex justify-center">
                    <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={() => toast.error("Google Sign-in failed")}
                        theme="filled_black"
                        shape="pill"
                        size="large"
                        width="340"
                    />
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                        <span className="bg-background/80 backdrop-blur-md px-4 text-muted-foreground">Or continue with email</span>
                    </div>
                </div>

                <form onSubmit={handleSignIn} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@company.com"
                            className="w-full bg-muted/30 border border-border focus:border-primary px-5 py-4 rounded-2xl outline-none transition-all focus:ring-4 focus:ring-primary/10"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-muted/30 border border-border focus:border-primary px-5 py-4 rounded-2xl outline-none transition-all focus:ring-4 focus:ring-primary/10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                            >
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={cn(
                            "w-full bg-primary text-white py-4 rounded-2xl font-black text-lg transition-all hover:translate-y-[-2px] hover:shadow-xl hover:shadow-primary/20",
                            loading && "opacity-70 cursor-not-allowed"
                        )}
                    >
                        {loading ? "Verifying..." : "Sign In"}
                    </button>
                </form>

                <p className="text-center text-sm text-muted-foreground">
                    Don&apos;t have an account?{" "}
                    <Link href="/signup" className="text-primary font-bold hover:underline underline-offset-4">
                        Create one free
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
