"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Camera, MessageSquare, Zap, Bot, Cloud, Menu, X, Github } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { tokenManager } from "@/lib/auth/tokenManager";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (tokenManager.isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/30">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-effect border-b border-white/10 px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <span className="text-lg sm:text-xl font-bold tracking-tight">MeetingMind</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <a
            href="https://github.com/Sameer2748"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-muted-foreground hover:text-primary transition-all duration-300 transform hover:scale-110"
          >
            <Github className="w-5 h-5" />
          </a>
          <ThemeToggle />

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-4">
            <div className="w-[1px] h-6 bg-white/10 mx-2" />
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

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 text-foreground hover:bg-white/10 rounded-lg transition-colors"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-[72px] left-0 w-full z-40 md:hidden glass-effect border-b border-white/10 p-6 flex flex-col gap-4 shadow-2xl"
          >
            <Link
              href="/signin"
              onClick={() => setIsMenuOpen(false)}
              className="text-lg font-bold py-3 px-4 rounded-2xl hover:bg-primary/10 hover:text-primary transition-all text-center"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              onClick={() => setIsMenuOpen(false)}
              className="bg-primary text-white py-4 rounded-2xl text-center font-black text-lg shadow-xl shadow-primary/20"
            >
              Get Started
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center pt-24 sm:pt-32 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-5xl w-full text-center relative">
          {/* Animated Background Gradient */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] sm:w-[800px] h-[300px] sm:h-[400px] bg-primary/20 blur-[60px] sm:blur-[120px] -z-10 rounded-full" />

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] sm:text-xs font-bold tracking-widest uppercase mb-6 border border-primary/20">
              Future of Meetings
            </span>
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-black tracking-tight mb-6 sm:mb-8 leading-[1.1] sm:leading-[0.9]">
              Never Miss a <span className="text-primary italic">Detail</span> Again.
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-2 sm:px-0">
              MeetingMind AI joins your calls, records high-fidelity audio, and generates perfect multilingual transcripts while you focus on the conversation.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="w-full sm:w-auto bg-primary text-white px-8 sm:px-10 py-4 rounded-full text-base sm:text-lg font-bold shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                Start Recording Free <Zap className="w-5 h-5 fill-current" />
              </Link>
              <Link
                href="/signin"
                className="w-full sm:w-auto glass-effect px-8 sm:px-10 py-4 rounded-full text-base sm:text-lg font-bold hover:bg-white/10 transition-all border border-white/20 flex items-center justify-center"
              >
                Sign In
              </Link>
            </div>
          </motion.div>

          {/* YouTube Demo Video */}
          <motion.div
            className="mt-16 sm:mt-20 w-full"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.9, ease: "easeOut" }}
          >
            <p className="text-[10px] sm:text-xs font-bold tracking-widest uppercase text-muted-foreground mb-4">See It In Action</p>
            <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-border shadow-2xl shadow-primary/10" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/hl2RDk9Zr2U"
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
                Our bot joins meetings silently without being intrusive, capturing high-fidelity video and audio in real-time.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <Brain className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">AI Intelligence</h3>
              <p className="text-muted-foreground leading-relaxed">
                Transcribes meeting videos using Deepgram Universal models to detect 99+ languages with perfect precision.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <MessageSquare className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Smart Summary</h3>
              <p className="text-muted-foreground leading-relaxed">
                Get more than just text. We generate structured action items and summaries for every video session.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <Bot className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">AI Chat Assistant</h3>
              <p className="text-muted-foreground leading-relaxed">
                Ask anything about your meeting. Our AI analyzes the video transcript and answers in seconds.
              </p>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all duration-500 group">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 border border-primary/20 group-hover:bg-primary transition-all duration-500">
                <Cloud className="w-6 h-6 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-xl font-bold mb-3">Secure Cloud Storage</h3>
              <p className="text-muted-foreground leading-relaxed">
                All meeting videos and transcripts are encrypted and stored securely on AWS S3, accessible anytime.
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
                  Join thousands of teams using MeetingMind to record video meetings and capture every insight.
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
        <p className="text-sm text-muted-foreground">© 2026 MeetingMind. Made by sameer with love.</p>
      </footer>
    </div>
  );
}
