import { useState, useEffect, useMemo } from "react";
import {
    Phone, Loader2, CheckCircle, AlertCircle,
    Clock, PhoneCall, Search, ToggleLeft, ToggleRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getAdminUsers, getAdminAlerts } from "@/services/api";
import type { AdminUser, AdminAlert } from "@/types/admin";

const API_BASE = (import.meta.env.DEV
    ? (import.meta.env.VITE_API_BASE || "/api")
    : "/api")
    .replace(/\/api$/, "")
    .replace(/\/$/, "");

function initials(name: string) {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function daysFromNow(dateStr: string | null): number {
    if (!dateStr) return 0;
    const now = new Date();
    const target = new Date(dateStr);
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000));
}

interface UserWithAlerts extends AdminUser {
    alerts: AdminAlert[];
}

export default function AdminRefillCalls() {
    const { theme } = useTheme();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [alerts, setAlerts] = useState<AdminAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [selectedUser, setSelectedUser] = useState<UserWithAlerts | null>(null);
    const [calling, setCalling] = useState<string | null>(null);
    const [callResult, setCallResult] = useState<{ success: boolean; message: string } | null>(null);
    const [autoRefill, setAutoRefill] = useState<Record<string, boolean>>({});
    const [autoRefillFrom, setAutoRefillFrom] = useState<Record<string, string>>({});
    const [autoRefillTo, setAutoRefillTo] = useState<Record<string, string>>({});

    useEffect(() => {
        async function load() {
            try {
                const [usersData, alertsData] = await Promise.all([
                    getAdminUsers(),
                    getAdminAlerts(),
                ]);
                setUsers(usersData);
                setAlerts(alertsData);
            } catch (err) {
                console.error("Failed to load data", err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    // Merge users with their alerts
    const usersWithAlerts = useMemo(() => {
        return users.map((user) => ({
            ...user,
            alerts: alerts.filter((a) => a.user_id === user.user_id),
        }));
    }, [users, alerts]);

    const filtered = useMemo(() => {
        if (!search) return usersWithAlerts;
        const q = search.toLowerCase();
        return usersWithAlerts.filter(
            (u) =>
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                u.alerts.some((a) => a.medicine_name.toLowerCase().includes(q))
        );
    }, [usersWithAlerts, search]);

    const handleCall = async (user: UserWithAlerts, alert: AdminAlert) => {
        const callKey = `${user.user_id}-${alert.alert_id}`;
        setCalling(callKey);
        setCallResult(null);

        // Mock call — simulate a 1.5s delay then show success
        await new Promise((r) => setTimeout(r, 1500));

        setCallResult({
            success: true,
            message: `AI call initiated to ${user.name} about ${alert.medicine_name} via ElevenLabs`,
        });
        setCalling(null);
    };

    const toggleAutoRefill = (userId: string) => {
        setAutoRefill((prev) => ({ ...prev, [userId]: !prev[userId] }));
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-40">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
            </div>
        );
    }

    // ── Detail panel for selected user ──
    if (selectedUser) {
        const demoPhone = selectedUser.phone || "+917083577011";
        const isAutoOn = autoRefill[selectedUser.user_id] || false;
        const fromVal = autoRefillFrom[selectedUser.user_id] || "09:00";
        const toVal = autoRefillTo[selectedUser.user_id] || "12:00";

        return (
            <div className="space-y-5">
                {/* Back button */}
                <button
                    onClick={() => { setSelectedUser(null); setCallResult(null); }}
                    className={cn(
                        "flex items-center gap-2 text-sm font-medium transition-colors",
                        theme === "dark" ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
                    )}
                >
                    ← Back to patients
                </button>

                {/* User Header */}
                <div className={cn(
                    "rounded-2xl p-6 flex items-center gap-5",
                    theme === "dark"
                        ? "bg-white/[0.03] border border-white/[0.06]"
                        : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                )}>
                    <Avatar className="w-14 h-14">
                        <AvatarImage src={selectedUser.avatar_url || undefined} />
                        <AvatarFallback className={cn(
                            "text-base font-bold",
                            theme === "dark" ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                        )}>
                            {initials(selectedUser.name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <h3 className={cn("text-xl font-bold", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
                            {selectedUser.name}
                        </h3>
                        <p className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                            {selectedUser.email}  •  {demoPhone}
                        </p>
                    </div>
                    <Badge variant="outline" className={cn(
                        "text-xs",
                        selectedUser.alerts.length > 0
                            ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
                            : "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
                    )}>
                        {selectedUser.alerts.length} active alert{selectedUser.alerts.length !== 1 ? "s" : ""}
                    </Badge>
                </div>

                {/* Auto-Refill Toggle */}
                <div className={cn(
                    "rounded-2xl p-5 flex items-center justify-between",
                    theme === "dark"
                        ? "bg-white/[0.03] border border-white/[0.06]"
                        : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                )}>
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center",
                            theme === "dark" ? "bg-indigo-500/15" : "bg-indigo-50"
                        )}>
                            <Clock className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                            <p className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-200" : "text-slate-700")}>
                                Auto Refill Calls
                            </p>
                            <p className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                {isAutoOn
                                    ? `Calls randomly between ${fromVal} – ${toVal} when medication is low`
                                    : "Automatically call when medication is running low"}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isAutoOn && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="time"
                                    value={fromVal}
                                    onChange={(e) => setAutoRefillFrom((prev) => ({ ...prev, [selectedUser.user_id]: e.target.value }))}
                                    className={cn(
                                        "rounded-lg px-3 py-1.5 text-sm outline-none w-28",
                                        theme === "dark"
                                            ? "bg-white/[0.04] border border-white/[0.08] text-slate-200"
                                            : "bg-slate-50 border border-slate-200 text-slate-700"
                                    )}
                                />
                                <span className={cn("text-xs font-medium", theme === "dark" ? "text-slate-500" : "text-slate-400")}>to</span>
                                <input
                                    type="time"
                                    value={toVal}
                                    onChange={(e) => setAutoRefillTo((prev) => ({ ...prev, [selectedUser.user_id]: e.target.value }))}
                                    className={cn(
                                        "rounded-lg px-3 py-1.5 text-sm outline-none w-28",
                                        theme === "dark"
                                            ? "bg-white/[0.04] border border-white/[0.08] text-slate-200"
                                            : "bg-slate-50 border border-slate-200 text-slate-700"
                                    )}
                                />
                            </div>
                        )}
                        <button
                            onClick={() => toggleAutoRefill(selectedUser.user_id)}
                            className="transition-colors"
                        >
                            {isAutoOn ? (
                                <ToggleRight className="w-10 h-10 text-emerald-500" />
                            ) : (
                                <ToggleLeft className={cn("w-10 h-10", theme === "dark" ? "text-slate-600" : "text-slate-300")} />
                            )}
                        </button>
                    </div>
                </div>

                {/* Medication Alerts with Call Buttons */}
                <div className="space-y-3">
                    <h4 className={cn("text-sm font-bold uppercase tracking-wide", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                        Medication Alerts
                    </h4>

                    {selectedUser.alerts.length === 0 ? (
                        <p className={cn("text-sm py-6 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                            No active refill alerts for this patient.
                        </p>
                    ) : (
                        selectedUser.alerts.map((alert) => {
                            const daysLeft = daysFromNow(alert.estimated_run_out);
                            const callKey = `${selectedUser.user_id}-${alert.alert_id}`;
                            const isCalling = calling === callKey;
                            const urgency = daysLeft <= 2 ? "critical" : daysLeft <= 5 ? "warning" : "normal";

                            return (
                                <motion.div
                                    key={alert.alert_id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={cn(
                                        "rounded-2xl p-5 flex items-center justify-between",
                                        theme === "dark"
                                            ? "bg-white/[0.03] border border-white/[0.06]"
                                            : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center text-base",
                                            urgency === "critical"
                                                ? "bg-red-500/15 text-red-500"
                                                : urgency === "warning"
                                                    ? "bg-amber-500/15 text-amber-500"
                                                    : "bg-emerald-500/15 text-emerald-500"
                                        )}>
                                            💊
                                        </div>
                                        <div>
                                            <p className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-200" : "text-slate-700")}>
                                                {alert.medicine_name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <Badge variant="outline" className={cn(
                                                    "text-[10px]",
                                                    urgency === "critical"
                                                        ? "bg-red-500/15 text-red-500 border-red-500/20"
                                                        : urgency === "warning"
                                                            ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
                                                            : "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
                                                )}>
                                                    {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
                                                </Badge>
                                                <span className={cn("text-[10px]", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                                                    {Math.round(alert.confidence * 100)}% confidence
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Call Button */}
                                    <button
                                        onClick={() => handleCall(selectedUser, alert)}
                                        disabled={isCalling}
                                        className={cn(
                                            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                                            isCalling
                                                ? "opacity-50 cursor-not-allowed"
                                                : "hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]",
                                            "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md"
                                        )}
                                    >
                                        {isCalling ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <PhoneCall className="w-4 h-4" />
                                        )}
                                        {isCalling ? "Calling..." : "Call Now"}
                                    </button>
                                </motion.div>
                            );
                        })
                    )}
                </div>

                {/* Call Result */}
                <AnimatePresence>
                    {callResult && (
                        <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={cn(
                                "flex items-start gap-3 rounded-xl px-4 py-3 text-sm",
                                callResult.success
                                    ? theme === "dark"
                                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                        : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                                    : theme === "dark"
                                        ? "bg-red-500/10 border border-red-500/20 text-red-400"
                                        : "bg-red-50 border border-red-200 text-red-700"
                            )}
                        >
                            {callResult.success ? (
                                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            ) : (
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            )}
                            <span>{callResult.message}</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    // ── User list view ──
    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    theme === "dark" ? "bg-emerald-500/15" : "bg-emerald-50"
                )}>
                    <Phone className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                    <h3 className={cn("text-lg font-bold", theme === "dark" ? "text-slate-200" : "text-slate-700")}>
                        AI Refill Calls
                    </h3>
                    <p className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                        Select a patient to call about their medication refill
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2.5 max-w-md",
                theme === "dark"
                    ? "bg-white/[0.04] border border-white/[0.08]"
                    : "bg-white border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            )}>
                <Search className={cn("w-4 h-4 shrink-0", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search patients or medications..."
                    className={cn(
                        "flex-1 bg-transparent text-sm outline-none",
                        theme === "dark" ? "text-slate-200 placeholder-slate-600" : "text-slate-700 placeholder-slate-400"
                    )}
                />
            </div>

            {/* User Cards */}
            {filtered.length === 0 ? (
                <p className={cn("text-sm py-8 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                    No patients found.
                </p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map((user, i) => (
                        <motion.button
                            key={user.user_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                            onClick={() => setSelectedUser(user)}
                            className={cn(
                                "rounded-2xl p-5 text-left flex flex-col gap-3 transition-all hover:scale-[1.01]",
                                theme === "dark"
                                    ? "bg-white/[0.03] border border-white/[0.06] hover:border-emerald-500/30"
                                    : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-emerald-300"
                            )}
                        >
                            {/* User info */}
                            <div className="flex items-center gap-3">
                                <Avatar className="w-10 h-10">
                                    <AvatarImage src={user.avatar_url || undefined} />
                                    <AvatarFallback className={cn(
                                        "text-xs font-semibold",
                                        theme === "dark" ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                    )}>
                                        {initials(user.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className={cn("text-sm font-semibold truncate", theme === "dark" ? "text-slate-200" : "text-slate-700")}>
                                        {user.name}
                                    </p>
                                    <p className={cn("text-[11px] truncate", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                        {user.phone || user.email}
                                    </p>
                                </div>
                            </div>

                            {/* Alert pills */}
                            {user.alerts.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {user.alerts.slice(0, 3).map((alert) => {
                                        const days = daysFromNow(alert.estimated_run_out);
                                        return (
                                            <Badge
                                                key={alert.alert_id}
                                                variant="outline"
                                                className={cn(
                                                    "text-[10px]",
                                                    days <= 2
                                                        ? "bg-red-500/15 text-red-500 border-red-500/20"
                                                        : days <= 5
                                                            ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
                                                            : "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
                                                )}
                                            >
                                                {alert.medicine_name} • {days}d
                                            </Badge>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                                    No active alerts
                                </p>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-between">
                                <span className={cn("text-[10px]", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                                    {user.alerts.length} alert{user.alerts.length !== 1 ? "s" : ""}
                                </span>
                                <span className={cn(
                                    "flex items-center gap-1 text-[11px] font-medium",
                                    theme === "dark" ? "text-emerald-400" : "text-emerald-600"
                                )}>
                                    <PhoneCall className="w-3 h-3" /> View & Call
                                </span>
                            </div>
                        </motion.button>
                    ))}
                </div>
            )}
        </div>
    );
}
