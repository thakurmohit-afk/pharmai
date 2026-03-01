import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import {
    ShieldCheck, Activity, Package, AlertTriangle,
    Users, ShoppingCart, TrendingUp, Brain,
    Clock, CheckCircle2, XCircle, Zap, Loader2,
} from "lucide-react";
import {
    getAdminOverview, getAdminAlerts, getAdminSystemHealth, getAdminLiveTraces,
} from "@/services/api";

/* KPI Mini Card */
function KPICard({
    label, value, sub, icon: Icon, color, theme,
}: {
    label: string; value: string; sub: string; icon: any;
    color: string; theme: string;
}) {
    const colors: Record<string, { bg: string; text: string; icon: string }> = {
        emerald: {
            bg: theme === "dark" ? "bg-emerald-500/8 border-emerald-500/15" : "bg-emerald-50 border-emerald-200/50",
            text: "text-emerald-400",
            icon: theme === "dark" ? "bg-emerald-500/15" : "bg-emerald-100",
        },
        blue: {
            bg: theme === "dark" ? "bg-blue-500/8 border-blue-500/15" : "bg-blue-50 border-blue-200/50",
            text: "text-blue-400",
            icon: theme === "dark" ? "bg-blue-500/15" : "bg-blue-100",
        },
        amber: {
            bg: theme === "dark" ? "bg-amber-500/8 border-amber-500/15" : "bg-amber-50 border-amber-200/50",
            text: "text-amber-400",
            icon: theme === "dark" ? "bg-amber-500/15" : "bg-amber-100",
        },
        purple: {
            bg: theme === "dark" ? "bg-purple-500/8 border-purple-500/15" : "bg-purple-50 border-purple-200/50",
            text: "text-purple-400",
            icon: theme === "dark" ? "bg-purple-500/15" : "bg-purple-100",
        },
        red: {
            bg: theme === "dark" ? "bg-red-500/8 border-red-500/15" : "bg-red-50 border-red-200/50",
            text: "text-red-400",
            icon: theme === "dark" ? "bg-red-500/15" : "bg-red-100",
        },
        teal: {
            bg: theme === "dark" ? "bg-teal-500/8 border-teal-500/15" : "bg-teal-50 border-teal-200/50",
            text: "text-teal-400",
            icon: theme === "dark" ? "bg-teal-500/15" : "bg-teal-100",
        },
    };
    const c = colors[color] || colors.emerald;

    return (
        <div className={cn("rounded-xl border p-4 transition-all hover:scale-[1.02]", c.bg)}>
            <div className="flex items-start justify-between">
                <div>
                    <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", theme === "dark" ? "text-slate-600" : "text-stone-400")}>{label}</p>
                    <p className={cn("text-2xl font-black", c.text)}>{value}</p>
                    <p className={cn("text-[10px] mt-0.5", theme === "dark" ? "text-slate-600" : "text-stone-400")}>{sub}</p>
                </div>
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", c.icon)}>
                    <Icon className={cn("w-4 h-4", c.text)} />
                </div>
            </div>
        </div>
    );
}

/* Alert Row */
function AlertRow({ severity, message, time, theme }: { severity: "critical" | "warning" | "info"; message: string; time: string; theme: string; }) {
    const styles = {
        critical: { dot: "bg-red-400", bg: theme === "dark" ? "bg-red-500/5 border-red-500/10" : "bg-red-50 border-red-200/40" },
        warning: { dot: "bg-amber-400", bg: theme === "dark" ? "bg-amber-500/5 border-amber-500/10" : "bg-amber-50 border-amber-200/40" },
        info: { dot: "bg-blue-400", bg: theme === "dark" ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50 border-blue-200/40" },
    };
    const s = styles[severity] || styles.info;
    return (
        <div className={cn("flex items-center gap-3 px-4 py-2.5 rounded-lg border", s.bg)}>
            <span className={cn("w-2 h-2 rounded-full shrink-0", s.dot)} />
            <span className={cn("text-xs flex-1", theme === "dark" ? "text-slate-400" : "text-stone-600")}>{message}</span>
            <span className={cn("text-[10px] shrink-0", theme === "dark" ? "text-slate-700" : "text-stone-400")}>{time}</span>
        </div>
    );
}

/* Pipeline Step */
function PipelineStep({ label, status, ms, theme }: { label: string; status: string; ms: string; theme: string; }) {
    const icons: Record<string, any> = { completed: CheckCircle2, running: Clock, error: XCircle };
    const colors: Record<string, string> = {
        completed: "text-emerald-400", running: "text-amber-400", error: "text-red-400",
    };
    const Icon = icons[status] || CheckCircle2;
    return (
        <div className="flex items-center gap-2.5">
            <Icon className={cn("w-3.5 h-3.5", colors[status] || "text-slate-500")} />
            <span className={cn("text-[11px] flex-1", theme === "dark" ? "text-slate-400" : "text-stone-600")}>{label}</span>
            <span className={cn("text-[10px] font-mono", theme === "dark" ? "text-slate-600" : "text-stone-400")}>{ms}</span>
        </div>
    );
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function mapSeverity(confidence: number): "critical" | "warning" | "info" {
    if (confidence >= 0.8) return "critical";
    if (confidence >= 0.5) return "warning";
    return "info";
}

export default function AdminControlCenter() {
    const { theme } = useTheme();
    const t = theme;
    const [loading, setLoading] = useState(true);
    const [overview, setOverview] = useState<any>(null);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [health, setHealth] = useState<any>(null);
    const [traces, setTraces] = useState<any[]>([]);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const [ov, al, hl, tr] = await Promise.allSettled([
                    getAdminOverview(),
                    getAdminAlerts(),
                    getAdminSystemHealth(),
                    getAdminLiveTraces(5),
                ]);
                if (ov.status === "fulfilled") setOverview(ov.value);
                if (al.status === "fulfilled") setAlerts(Array.isArray(al.value) ? al.value : []);
                if (hl.status === "fulfilled") setHealth(hl.value);
                if (tr.status === "fulfilled") setTraces(Array.isArray(tr.value) ? tr.value : []);
                setLastFetched(new Date());
            } catch (err) {
                console.error("AdminControlCenter load failed:", err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    /* ── Derived KPI values from real API data ─── */
    const activeUsers = overview?.active_users ?? 0;
    const totalOrders = overview?.total_orders ?? 0;
    const ordersToday = overview?.orders_today ?? 0;
    const lowStockCount = overview?.low_stock_count ?? 0;
    const totalTraces = health?.total_traces ?? 0;
    const avgConfidence = health?.avg_confidence ?? 0;
    const errorRate = health?.error_rate ?? 0;
    const agentStats: any[] = health?.agent_stats ?? [];

    // Latest pipeline trace (first one from live traces)
    const latestTrace = traces.length > 0 ? traces[0] : null;
    const pipelineSteps: any[] = latestTrace?.pipeline_steps ?? [];
    const totalPipelineMs = pipelineSteps.reduce((s: number, step: any) => s + (step.duration_ms ?? 0), 0);

    // System vitals from agent_stats
    const avgLatency = agentStats.length > 0
        ? Math.round(agentStats.reduce((s, a) => s + (a.avg_latency_ms || 0), 0) / agentStats.length)
        : 0;
    const llmAgent = agentStats.find((a: any) => a.name?.toLowerCase().includes("pharmacist") || a.agent_id === "pharmacist_agent");
    const llmLatency = llmAgent?.avg_latency_ms ?? 0;

    const secsAgo = lastFetched ? Math.round((Date.now() - lastFetched.getTime()) / 1000) : 0;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h2 className="text-2xl font-heading font-bold bg-clip-text text-transparent bg-gradient-to-br from-emerald-400 to-teal-500">
                    Control Center
                </h2>
                <p className={cn("text-xs mt-0.5", t === "dark" ? "text-slate-600" : "text-stone-400")}>
                    Real-time operational overview &middot; Last updated {secsAgo}s ago
                </p>
            </div>

            {/* KPI Grid — all from real API data */}
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
                <KPICard
                    label="AI Confidence"
                    value={`${(avgConfidence * 100).toFixed(1)}%`}
                    sub={`${errorRate > 0 ? `${(errorRate * 100).toFixed(1)}% error rate` : "No errors detected"}`}
                    icon={ShieldCheck} color="emerald" theme={t}
                />
                <KPICard
                    label="Registered Users"
                    value={activeUsers.toLocaleString()}
                    sub={`${alerts.length} active alert${alerts.length !== 1 ? "s" : ""}`}
                    icon={Users} color="blue" theme={t}
                />
                <KPICard
                    label="Total Orders"
                    value={totalOrders.toLocaleString()}
                    sub={`${ordersToday} order${ordersToday !== 1 ? "s" : ""} today`}
                    icon={ShoppingCart} color="purple" theme={t}
                />
                <KPICard
                    label="Low Stock Items"
                    value={lowStockCount.toLocaleString()}
                    sub={lowStockCount > 0 ? "Action required" : "All stocked"}
                    icon={AlertTriangle} color="amber" theme={t}
                />
                <KPICard
                    label="AI Interactions"
                    value={totalTraces.toLocaleString()}
                    sub={`${avgLatency}ms avg latency`}
                    icon={Brain} color="teal" theme={t}
                />
            </div>

            {/* Two-column: Alerts + Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Global Alerts — from real /api/admin/alerts */}
                <div className={cn(
                    "rounded-xl border p-5",
                    t === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60"
                )}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={cn("text-sm font-bold", t === "dark" ? "text-slate-300" : "text-stone-700")}>Refill Alerts</h3>
                        <span className="min-w-[18px] h-[18px] px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold bg-red-500/20 text-red-400">
                            {alerts.length}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {alerts.length === 0 ? (
                            <p className={cn("text-xs text-center py-4", t === "dark" ? "text-slate-600" : "text-stone-400")}>
                                No active alerts
                            </p>
                        ) : (
                            alerts.slice(0, 5).map((alert: any, i: number) => (
                                <AlertRow
                                    key={alert.alert_id || i}
                                    severity={mapSeverity(alert.confidence ?? 0)}
                                    message={`${alert.medicine_name || "Medicine"} — ${alert.alert_type === "refill_due" ? "Refill recommended" : alert.alert_type || "Alert"} (${alert.user_name || "User"})`}
                                    time={timeAgo(alert.created_at)}
                                    theme={t}
                                />
                            ))
                        )}
                    </div>
                </div>

                {/* Last Pipeline Execution — from real /api/admin/traces/live */}
                <div className={cn(
                    "rounded-xl border p-5",
                    t === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60"
                )}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={cn("text-sm font-bold", t === "dark" ? "text-slate-300" : "text-stone-700")}>Last Agent Pipeline</h3>
                        <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full", t === "dark" ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600")}>
                            {totalPipelineMs > 0 ? `${totalPipelineMs}ms total` : "No traces yet"}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {pipelineSteps.length === 0 ? (
                            <p className={cn("text-xs text-center py-4", t === "dark" ? "text-slate-600" : "text-stone-400")}>
                                No pipeline runs yet — send a chat message to generate traces.
                            </p>
                        ) : (
                            pipelineSteps.map((step: any, i: number) => (
                                <PipelineStep
                                    key={step.id || i}
                                    label={`${i + 1}. ${step.name || step.id || "Agent"}`}
                                    status={step.status || "completed"}
                                    ms={step.duration_ms != null ? `${step.duration_ms}ms` : "—"}
                                    theme={t}
                                />
                            ))
                        )}
                    </div>
                    {latestTrace && (
                        <div className={cn(
                            "mt-4 pt-3 border-t flex items-center justify-between",
                            t === "dark" ? "border-white/[0.04]" : "border-stone-100"
                        )}>
                            <span className={cn("text-[10px]", t === "dark" ? "text-slate-600" : "text-stone-400")}>
                                Trace: {latestTrace.trace_id ? latestTrace.trace_id.slice(0, 12) + "…" : "N/A"}
                            </span>
                            <span className={cn("text-[10px] font-medium text-emerald-400")}>
                                {pipelineSteps.every((s: any) => s.status === "completed") ? "✓ All checks passed" : "⚠ Issues detected"}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* System Vitals — from real per-agent stats */}
            <div className={cn(
                "rounded-xl border p-4 flex items-center gap-6 flex-wrap",
                t === "dark" ? "bg-white/[0.015] border-white/[0.06]" : "bg-white border-stone-200/60"
            )}>
                <span className={cn("text-[9px] font-black uppercase tracking-wider", t === "dark" ? "text-slate-600" : "text-stone-400")}>
                    System Vitals
                </span>
                {[
                    { label: "Avg Latency", value: `${avgLatency}ms`, ok: avgLatency < 2000 },
                    { label: "LLM Response", value: `${llmLatency}ms`, ok: llmLatency < 5000 },
                    { label: "Total Traces", value: `${totalTraces}`, ok: true },
                    { label: "Error Rate", value: `${(errorRate * 100).toFixed(1)}%`, ok: errorRate < 0.05 },
                    { label: "Confidence", value: `${(avgConfidence * 100).toFixed(0)}%`, ok: avgConfidence > 0.7 },
                ].map((v) => (
                    <div key={v.label} className="flex items-center gap-2">
                        <span className={cn("w-1.5 h-1.5 rounded-full", v.ok ? "bg-emerald-400" : "bg-amber-400")} />
                        <span className={cn("text-[10px]", t === "dark" ? "text-slate-500" : "text-stone-500")}>
                            {v.label}: <span className={cn("font-semibold", v.ok ? "text-emerald-400" : "text-amber-400")}>{v.value}</span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
