"use client"

import * as React from "react"
import {
    CalendarIcon,
    LayoutDashboardIcon,
    MoonIcon,
    SettingsIcon,
    SunIcon,
} from "lucide-react"
import { Logo } from "@/components/logo"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { useTheme } from "next-themes";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
} from "@/components/ui/sidebar"

const data = {
    navMain: [
        {
            title: "All Meetings",
            url: "/dashboard",
            icon: CalendarIcon,
        },
        {
            title: "Settings",
            url: "/dashboard/settings",
            icon: SettingsIcon,
        },
    ],
}

export function AppSidebar({ user, ...props }: any) {
    const { theme, setTheme } = useTheme();

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
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar pt-2" {...props}>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            asChild
                            className="data-[slot=sidebar-menu-button]:!p-1.5"
                        >
                            <a href="/dashboard" className="flex items-center gap-3">
                                <Logo className="w-8 h-8 shrink-0" />
                                <span className="text-lg font-bold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">MeetingMind</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>
            <SidebarContent>
                <NavMain items={data.navMain} />

                <div className="mt-auto px-2 mb-4 group-data-[collapsible=icon]:px-0">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                onClick={toggleTheme}
                                tooltip="Toggle Theme"
                                className="bg-sidebar-accent/50 border border-sidebar-border rounded-xl hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all py-6 group-data-[collapsible=icon]:py-2"
                            >
                                {theme === 'dark' ? <SunIcon className="size-4 text-primary" /> : <MoonIcon className="size-4 text-primary" />}
                                <span className="font-medium text-sidebar-foreground group-data-[collapsible=icon]:hidden">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </div>
            </SidebarContent>
            <SidebarFooter>
                <NavUser user={user} />
            </SidebarFooter>
        </Sidebar>
    )
}
