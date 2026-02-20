import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
    return (
        <div className={cn("w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20", className)}>
            <Brain className="w-6 h-6 text-white" />
        </div>
    );
}
