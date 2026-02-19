"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { GoogleLogin } from "@react-oauth/google";
import { toast } from "sonner";
import { Brain, Eye, EyeOff, ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { authAPI } from "@/lib/api";
import { tokenManager } from "@/lib/auth/tokenManager";
import { useEffect } from "react";

export default function SignUpPage() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            toast.error("Please enter your email");
            return;
        }

        setLoading(true);
        try {
            const data = await authAPI.login(email);
            if (data.success) {
                tokenManager.setToken(data.token);
                toast.success("Account created! Welcome to MeetingMind.");
                window.location.href = "/dashboard";
            }
        } catch (err: any) {
            toast.error(err.response?.data?.error || "Registration failed");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSuccess = (credentialResponse: any) => {
        toast.success("Google account linked successfully!");
        window.location.href = "/dashboard";
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_bottom_left,_var(--primary)_0%,_transparent_40%)]">
            <Link
                href="/"
                className="absolute top-10 left-10 flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors font-medium"
            >
                <ArrowLeft className="w-4 h-4" /> Back to home
            </Link>

            <div className="absolute top-10 right-10">
                <ThemeToggle />
            </div>

            <div className="w-full max-w-[1000px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                {/* Left Side: Benefits */}
                <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="hidden lg:block space-y-8"
                >
                    <div className="w-16 h-16 rounded-[22px] bg-primary flex items-center justify-center mb-10">
                        <Brain className="w-9 h-9 text-white" />
                    </div>
                    <h2 className="text-5xl font-black leading-[1.1]">Join the future of <span className="text-primary italic">Intelligence</span>.</h2>
                    <p className="text-xl text-muted-foreground leading-relaxed">
                        Create an account today and get access to the worlds most advanced AI meeting assistant.
                    </p>

                    <div className="space-y-4 pt-6">
                        {[
                            "High-fidelity local & cloud recording",
                            "Multilingual transcription (99+ languages)",
                            "Speaker diarization & identification",
                            "Secure AWS/S3 storage vault"
                        ].map((feature, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
                                    <Check className="w-4 h-4 text-primary" />
                                </div>
                                <span className="font-medium">{feature}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Right Side: Form */}
                <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="w-full max-w-[460px] glass-effect p-10 rounded-[40px] shadow-2xl space-y-8 mx-auto"
                >
                    <div className="text-center lg:text-left">
                        <h1 className="text-3xl font-black tracking-tight mb-2">Create Account</h1>
                        <p className="text-muted-foreground">Start capturing meeting insights in seconds.</p>
                    </div>

                    <div className="flex justify-center lg:justify-start">
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={() => toast.error("Google Registration failed")}
                            theme="filled_black"
                            shape="pill"
                            size="large"
                            width="380"
                        />
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border"></div>
                        </div>
                        <div className="relative flex justify-center text-xs uppercase tracking-widest font-bold">
                            <span className="bg-background/80 backdrop-blur-md px-4 text-muted-foreground">Or sign up with email</span>
                        </div>
                    </div>

                    <form onSubmit={handleSignUp} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Full Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="John Doe"
                                className="w-full bg-muted/30 border border-border focus:border-primary px-5 py-4 rounded-2xl outline-none transition-all focus:ring-4 focus:ring-primary/10"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Work Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="john@ace.com"
                                className="w-full bg-muted/30 border border-border focus:border-primary px-5 py-4 rounded-2xl outline-none transition-all focus:ring-4 focus:ring-primary/10"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Set Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Minimum 8 characters"
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
                            {loading ? "Creating Account..." : "Join Now"}
                        </button>
                    </form>

                    <p className="text-center text-sm text-muted-foreground">
                        Already a member?{" "}
                        <Link href="/signin" className="text-primary font-bold hover:underline underline-offset-4">
                            Sign in here
                        </Link>
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
