"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const toggleTheme = (e: React.MouseEvent) => {
        // Audio effect
        const audio = new Audio('/audio/nakime_biwa.mp3');
        audio.play().catch(err => console.log('Audio play failed:', err));

        const x = e.clientX;
        const y = e.clientY;
        document.documentElement.style.setProperty("--click-x", `${x}px`);
        document.documentElement.style.setProperty("--click-y", `${y}px`);

        if (!(document as any).startViewTransition) {
            setTheme(theme === "dark" ? "light" : "dark");
            return;
        }

        (document as any).startViewTransition(() => {
            setTheme(theme === "dark" ? "light" : "dark");
        });
    };

    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleTheme}
            className="p-2.5 rounded-xl bg-muted/50 border border-border hover:border-primary/50 transition-colors"
            aria-label="Toggle theme"
        >
            {theme === "dark" ? (
                <Sun className="w-5 h-5 text-primary" />
            ) : (
                <Moon className="w-5 h-5 text-primary" />
            )}
        </motion.button>
    );
}
