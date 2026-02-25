"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Brain, Camera, MessageSquare, Zap, Bot, Cloud } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect } from "react";
import { tokenManager } from "@/lib/auth/tokenManager";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (tokenManager.isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-effect border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">MeetingMind</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="w-[1px] h-6 bg-white/10 mx-2 hidden sm:block" />
          <Link href="/signin" className="text-sm font-medium hover:text-primary transition-colors">
            Sign In
          </Link>
          <Link
            href="/signup"
            className="bg-primary text-white px-5 py-2 rounded-full text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center pt-32 px-6 overflow-hidden">
        <div className="max-w-5xl w-full text-center relative">
          {/* Animated Background Gradient */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] -z-10 rounded-full" />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-widest uppercase mb-6 border border-primary/20">
              Future of Meetings
            </span>
            <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-8 leading-[0.9]">
              Never Miss a <span className="text-primary italic">Detail</span> Again.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              MeetingMind AI joins your calls, records high-fidelity audio, and generates perfect multilingual transcripts while you focus on the conversation.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto bg-primary text-white px-10 py-4 rounded-full text-lg font-bold shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                Start Recording Free <Zap className="w-5 h-5 fill-current" />
              </Link>
              <Link
                href="/signin"
                className="w-full sm:w-auto glass-effect px-10 py-4 rounded-full text-lg font-bold hover:bg-white/10 transition-all border border-white/20"
              >
                Sign In
              </Link>
            </div>
          </motion.div>

          {/* YouTube Demo Video */}
          <motion.div
            className="mt-20 w-full"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.9, ease: "easeOut" }}
          >
            <p className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-4">See It In Action</p>
            <div className="relative w-full rounded-3xl overflow-hidden border border-border shadow-2xl shadow-primary/10" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/Cps805yI3m0"  
                title="MeetingMind Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </motion.div>

          {/* Feature Grid */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-24 text-left"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <Camera className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Deep-Stealth Bot</h3>
              <p className="text-muted-foreground leading-relaxed">
                Our bot joins meetings silently without being intrusive, capturing premium audio in real-time.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <Brain className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">AI Intelligence</h3>
              <p className="text-muted-foreground leading-relaxed">
                Uses Deepgram Universal models to detect 99+ languages and separate speakers with perfect precision.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <MessageSquare className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Smart Summary</h3>
              <p className="text-muted-foreground leading-relaxed">
                Get more than just text. We generate structured action items and summaries for every session.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <Bot className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">AI Chat Assistant</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ask anything about your meeting. Our AI reads the full transcript and answers in seconds, with full context.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <Cloud className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Secure Cloud Storage</h3>
              <p className="text-muted-foreground leading-relaxed">
                All recordings and transcripts are encrypted and stored securely on AWS S3, accessible anytime, anywhere.
              </p>
            </div>

            {/* CTA card */}
            <div className="p-8 rounded-3xl bg-primary border border-primary hover:opacity-90 transition-all duration-500 group flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6">
                  <Zap className="w-6 h-6 text-white fill-white" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">Ready to Start?</h3>
                <p className="text-white/80 leading-relaxed">
                  Join thousands of teams using MeetingMind to capture every insight from every meeting.
                </p>
              </div>
              <Link
                href="/signup"
                className="mt-6 inline-block bg-white text-primary px-6 py-3 rounded-full text-sm font-bold hover:scale-105 transition-all text-center"
              >
                Get Started Free →
              </Link>
            </div>
          </motion.div>
        </div>
      </main>

      <footer className="py-12 border-t border-border mt-24 text-center">
        <p className="text-sm text-muted-foreground">© 2026 MeetingMind. Built with Premium AI technology.</p>
      </footer>
    </div>
  );
}
