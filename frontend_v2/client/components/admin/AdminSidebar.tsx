import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import {
    ShieldCheck, HeartPulse, BellRing,
    UsersRound, UserRoundX, UserRoundCheck, FileClock, GitBranch, UserRoundCog,
    Receipt, FilePen, PhoneCall, OctagonAlert, ScrollText,
    Pill, PackageOpen, LineChart, PackagePlus,
    BrainCircuit, ShieldAlert, Scale, TriangleAlert, ListChecks,
    Sparkles, PanelLeftClose, Gauge, Cpu,
} from "lucide-react";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface NavItem {
    id: string;
    label: string;
    icon: any;
    badge?: number;
    critical?: boolean;
    status?: "green" | "yellow" | "red";
}

/* ── Section configs ────────────────────────────────────────────────────── */
const SECTION_ITEMS: Record<string, { title: string; items: NavItem[] }> = {
    control: {
        title: "Admin Panel",
        items: [
            { id: "overview", label: "Overview Dashboard", icon: Gauge },
            { id: "orders", label: "Orders & Alerts", icon: Receipt },
            { id: "users-overview", label: "Users", icon: UsersRound },
            { id: "inventory", label: "Medicine Inventory", icon: Pill },
            { id: "refill-calls", label: "Refill Calls", icon: PhoneCall },
            { id: "forecast", label: "Analytics & Forecast", icon: LineChart },
            { id: "ai-insights", label: "AI Insights", icon: BrainCircuit },
            { id: "trace", label: "Trace", icon: GitBranch },
            { id: "platform-health", label: "System Health", icon: HeartPulse },
        ],
    },
};

const SECTION_DEFAULTS: Record<string, string> = {
    control: "overview",
};

/* ── Status Dot ─────────────────────────────────────────────────────────── */
function StatusDot({ color }: { color: "green" | "yellow" | "red" }) {
    const bg = { green: "bg-emerald-400", yellow: "bg-amber-400", red: "bg-red-400" }[color];
    return (
        <span className="relative flex h-[7px] w-[7px]">
            <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-30", bg)} />
            <span className={cn("relative inline-flex rounded-full h-[7px] w-[7px]", bg)} />
        </span>
    );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function AdminSidebar({
    section,
    activeView,
    onViewChange,
}: {
    section: string;
    activeView: string;
    onViewChange: (v: string) => void;
}) {
    const { theme } = useTheme();
    const dark = theme === "dark";
    const [collapsed, setCollapsed] = useState(false);

    const config = SECTION_ITEMS[section] || SECTION_ITEMS.control;

    /* Collapsed state — thin strip with toggle */
    if (collapsed) {
        return (
            <div className={cn(
                "w-[40px] h-full flex flex-col items-center shrink-0 border-r select-none py-3",
                dark ? "bg-[#060606] border-white/[0.05]" : "bg-white/90 border-stone-200/50"
            )}>
                <button
                    onClick={() => setCollapsed(false)}
                    className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                        dark ? "hover:bg-white/[0.05] text-slate-600" : "hover:bg-stone-100 text-stone-400"
                    )}
                    title="Expand panel"
                >
                    <PanelLeftClose className="w-3.5 h-3.5 rotate-180" />
                </button>
            </div>
        );
    }

    return (
        <div className={cn(
            "w-[255px] h-full flex flex-col shrink-0 border-r select-none transition-all",
            dark ? "bg-[#060606] border-white/[0.05]" : "bg-white/90 border-stone-200/50 backdrop-blur-sm"
        )}>

            {/* Header */}
            <div className={cn("px-5 pt-5 pb-4 border-b", dark ? "border-white/[0.05]" : "border-stone-100")}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                            <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                            <p className={cn("text-[12px] font-bold tracking-tight", dark ? "text-slate-200" : "text-stone-800")}>
                                {config.title}
                            </p>
                            <p className={cn("text-[9px] tracking-wide", dark ? "text-slate-700" : "text-stone-400")}>
                                PharmAI Admin
                            </p>
                        </div>
                    </div>
                    {/* Collapse button */}
                    <button
                        onClick={() => setCollapsed(true)}
                        className={cn(
                            "w-6 h-6 rounded-md flex items-center justify-center transition-colors",
                            dark ? "hover:bg-white/[0.05] text-slate-700" : "hover:bg-stone-100 text-stone-400"
                        )}
                        title="Collapse panel"
                    >
                        <PanelLeftClose className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Safety Index — only on control center */}
                {section === "control" && (
                    <div className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-lg",
                        dark ? "bg-emerald-500/[0.06] border border-emerald-500/10" : "bg-emerald-50/80 border border-emerald-100"
                    )}>
                        <div className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span className={cn("text-[9px] font-extrabold uppercase tracking-[0.12em]", dark ? "text-emerald-400/70" : "text-emerald-600/80")}>
                                Platform Safety
                            </span>
                        </div>
                        <span className="text-[14px] font-black text-emerald-500 tabular-nums">98.2%</span>
                    </div>
                )}
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3 scrollbar-none">
                <div className="space-y-[2px]">
                    {config.items.map((item) => {
                        const active = activeView === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => onViewChange(item.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all relative group/item",
                                    active
                                        ? dark
                                            ? "bg-emerald-500/[0.08] text-emerald-400"
                                            : "bg-emerald-50 text-emerald-700"
                                        : dark
                                            ? "text-slate-500 hover:text-slate-300 hover:bg-white/[0.025]"
                                            : "text-stone-500 hover:text-stone-700 hover:bg-stone-50/70"
                                )}
                            >
                                {active && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                                )}
                                <item.icon className={cn(
                                    "w-[16px] h-[16px] shrink-0 stroke-[1.8]",
                                    active ? "text-emerald-500" : dark ? "text-slate-600 group-hover/item:text-slate-400" : "text-stone-400 group-hover/item:text-stone-500"
                                )} />
                                <span className="text-[12.5px] font-medium flex-1 truncate">{item.label}</span>
                                {item.status && <StatusDot color={item.status} />}
                                {item.badge && item.critical && (
                                    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold bg-red-500/15 text-red-400">
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* Footer */}
            <div className={cn("px-5 py-3 border-t", dark ? "border-white/[0.04]" : "border-stone-100")}>
                <div className="flex items-center gap-1.5">
                    <StatusDot color="green" />
                    <span className={cn("text-[10px] font-medium", dark ? "text-slate-700" : "text-stone-400")}>
                        All systems operational
                    </span>
                </div>
            </div>
        </div>
    );
}

export { SECTION_ITEMS, SECTION_DEFAULTS };
