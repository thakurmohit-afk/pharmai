import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import RefillAlertsWidget from "@/components/RefillAlertsWidget";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getMyDashboard } from "@/services/api";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, AlertCircle, Clock } from "lucide-react";

export default function RefillsPage() {
    const { theme } = useTheme();
    const { user } = useAuth();
    const [dashboard, setDashboard] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        getMyDashboard()
            .then(setDashboard)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user]);

    const alerts = dashboard?.active_alerts || [];
    const urgentCount = alerts.filter((a: any) => {
        if (!a.estimated_run_out) return false;
        const days = Math.ceil((new Date(a.estimated_run_out).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return days <= 7;
    }).length;

    if (loading) {
        return (
            <div className={cn("min-h-screen w-full flex items-center justify-center", theme === "dark" ? "bg-[#050505]" : "bg-slate-50")}>
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className={cn("min-h-screen w-full flex font-sans overflow-hidden", theme === "dark" ? "bg-[#050505]" : "bg-slate-50")}>
            <Sidebar />
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <TopNavbar onOpenProfileDrawer={() => { }} />
                <main className="flex-1 p-6 md:p-8 xl:p-10 max-w-[1600px] w-full mx-auto overflow-y-auto">
                    <div className="space-y-6 pb-10">
                        {/* Header */}
                        <div>
                            <h2 className={cn("text-2xl font-bold", theme === "dark" ? "text-white" : "text-slate-900")}>
                                Refill Center
                            </h2>
                            <p className={cn("mt-1 text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                Track medication supply levels and reorder before you run out.
                            </p>
                        </div>

                        {/* Summary cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className={cn(
                                "rounded-2xl p-5 border",
                                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
                            )}>
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50")}>
                                        <RefreshCw className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <p className={cn("text-2xl font-bold", theme === "dark" ? "text-white" : "text-slate-900")}>{alerts.length}</p>
                                        <p className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Active Alerts</p>
                                    </div>
                                </div>
                            </div>

                            {urgentCount > 0 && (
                                <div className={cn(
                                    "rounded-2xl p-5 border",
                                    theme === "dark" ? "bg-red-500/5 border-red-500/15" : "bg-red-50/50 border-red-200/60 shadow-sm"
                                )}>
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", theme === "dark" ? "bg-red-500/10" : "bg-red-50")}>
                                            <AlertCircle className="w-5 h-5 text-red-500" />
                                        </div>
                                        <div>
                                            <p className={cn("text-2xl font-bold", theme === "dark" ? "text-red-400" : "text-red-600")}>{urgentCount}</p>
                                            <p className={cn("text-xs", theme === "dark" ? "text-red-400/60" : "text-red-500/70")}>Urgent (≤7 days)</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Refill risk indicators */}
                        {alerts.length > 0 && (
                            <div className={cn(
                                "rounded-2xl p-6 border",
                                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
                            )}>
                                <h3 className={cn("text-sm font-semibold mb-4", theme === "dark" ? "text-slate-300" : "text-slate-700")}>
                                    Supply Level Timeline
                                </h3>
                                <div className="space-y-3">
                                    {alerts.map((alert: any, i: number) => {
                                        const daysLeft = alert.estimated_run_out
                                            ? Math.max(0, Math.ceil((new Date(alert.estimated_run_out).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                                            : 30;
                                        const pct = Math.min(100, (daysLeft / 30) * 100);
                                        const color = daysLeft <= 7 ? "bg-red-500" : daysLeft <= 14 ? "bg-amber-500" : "bg-emerald-500";

                                        return (
                                            <div key={alert.alert_id || i} className="flex items-center gap-4">
                                                <span className={cn("text-xs font-medium w-28 truncate", theme === "dark" ? "text-slate-400" : "text-slate-600")}>
                                                    {alert.medicine_name || "Medicine"}
                                                </span>
                                                <div className={cn("flex-1 h-2 rounded-full overflow-hidden", theme === "dark" ? "bg-white/5" : "bg-stone-100")}>
                                                    <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className={cn("text-xs font-semibold w-16 text-right", daysLeft <= 7 ? "text-red-500" : daysLeft <= 14 ? "text-amber-500" : (theme === "dark" ? "text-slate-400" : "text-slate-500"))}>
                                                    {daysLeft}d left
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Full alerts widget */}
                        <RefillAlertsWidget alerts={alerts} />
                    </div>
                </main>
            </div>
        </div>
    );
}
