"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Camera, MessageSquare, Zap, Bot, Cloud, Menu, X, Github, Check, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { tokenManager } from "@/lib/auth/tokenManager";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export default function Home() {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (tokenManager.isAuthenticated()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleBuy = (planId: string) => {
    const targetUrl = `/dashboard?buy=${planId}`;
    if (!tokenManager.isAuthenticated()) {
      router.push(`/signin?callbackUrl=${encodeURIComponent(targetUrl)}`);
    } else {
      router.push(targetUrl);
    }
  };

  const scrollToPricing = () => {
    const pricing = document.getElementById('pricing');
    if (pricing) pricing.scrollIntoView({ behavior: 'smooth' });
  };

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
          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8 mr-8">
            <button onClick={scrollToPricing} className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              Pricing
            </button>
            <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              Features
            </Link>
          </div>

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
            <button
              onClick={() => { setIsMenuOpen(false); scrollToPricing(); }}
              className="text-lg font-bold py-3 px-4 rounded-2xl hover:bg-primary/10 hover:text-primary transition-all text-center"
            >
              Pricing
            </button>
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
              <button
                onClick={scrollToPricing}
                className="w-full sm:w-auto glass-effect px-8 sm:px-10 py-4 rounded-full text-base sm:text-lg font-bold hover:bg-white/10 transition-all border border-white/20 flex items-center justify-center"
              >
                View Plans
              </button>
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

          {/* Pricing Section */}
          <section id="pricing" className="mt-40 mb-20 w-full max-w-6xl mx-auto px-4">
            <div className="text-center mb-16">
              <h2 className="text-4xl sm:text-5xl font-black mb-4">Simple, Transparent <span className="text-primary italic">Pricing</span></h2>
              <p className="text-muted-foreground text-lg sm:text-xl max-w-2xl mx-auto">
                Whether you're a solo pro or a global team, we have a plan that fits your growth.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  id: "starter",
                  name: "Starter",
                  price: "0",
                  description: "For individuals just getting started with AI meeting assistance.",
                  features: ["5 Meetings / month", "Cloud recording (720p)", "Basic AI Transcripts", "Community Support", "1 month storage"],
                  buttonText: "Join for Free",
                  popular: false
                },
                {
                  id: "pro",
                  name: "Pro",
                  price: "1",
                  description: "For professionals who need unlimited high-fidelity recording.",
                  features: ["Unlimited Meetings", "Full HD 1080p recording", "Advanced Multilingual AI", "Priority Email Support", "Lifetime storage"],
                  buttonText: "Go Pro Now",
                  popular: true
                },
                {
                  id: "enterprise",
                  name: "Enterprise",
                  price: "49",
                  description: "For teams requiring custom branding and priority security.",
                  features: ["Team Workspaces", "Custom Bot Name & Avatar", "API Access", "Dedicated Success Manager", "SAML SSO Auth"],
                  buttonText: "Scale Up",
                  popular: false
                }
              ].map((plan) => (
                <div
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col p-8 rounded-[40px] border transition-all duration-500 hover:translate-y-[-8px]",
                    plan.popular
                      ? "bg-primary text-white border-primary shadow-2xl shadow-primary/30 scale-105 z-10"
                      : "bg-card border-border hover:border-primary/50"
                  )}
                >
                  {plan.popular && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white text-primary text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-xl">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-8">
                    <h3 className={cn("text-2xl font-black mb-2", plan.popular ? "text-white" : "text-foreground")}>{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-4xl font-black">${plan.price}</span>
                      <span className={cn("text-sm font-medium", plan.popular ? "text-white/80" : "text-muted-foreground")}>/month</span>
                    </div>
                    <p className={cn("text-sm leading-relaxed", plan.popular ? "text-white/80" : "text-muted-foreground")}>
                      {plan.description}
                    </p>
                  </div>

                  <div className="space-y-4 mb-10 flex-1">
                    {plan.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <Check className={cn("w-5 h-5", plan.popular ? "text-white" : "text-primary")} />
                        <span className={cn("text-sm font-medium", plan.popular ? "text-white/90" : "text-foreground/90")}>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleBuy(plan.id)}
                    className={cn(
                      "w-full py-4 rounded-2xl font-black text-lg transition-all shadow-lg",
                      plan.popular
                        ? "bg-white text-primary hover:bg-white/90 hover:shadow-xl"
                        : "bg-primary text-white hover:bg-primary/90 hover:shadow-primary/20"
                    )}
                  >
                    {plan.buttonText}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-20 text-center glass-effect p-12 rounded-[50px] border border-white/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-20 transition-transform duration-700 group-hover:rotate-12">
                <Sparkles className="w-32 h-32 text-primary" />
              </div>
              <h3 className="text-3xl font-black mb-4">Enterprise Needs?</h3>
              <p className="text-muted-foreground max-w-xl mx-auto mb-8">
                Looking for white-labeled solutions, on-premise deployments, or custom volume agreements? Let's talk about it.
              </p>
              <button className="bg-foreground text-background px-10 py-4 rounded-full font-black text-lg hover:bg-foreground/90 transition-all">
                Contact Sales
              </button>
            </div>
          </section>
        </div>
      </main>

      <footer className="py-12 border-t border-border mt-24 text-center">
        <p className="text-sm text-muted-foreground">© 2026 MeetingMind. Made by sameer with love.</p>
      </footer>
    </div>
  );
}
