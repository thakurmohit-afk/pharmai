import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { getStockForecast, getSeasonalAlerts, getStockHeatmap } from "@/services/api";
import {
    TrendingUp, AlertTriangle, Calendar, BarChart3, CloudRain, Sun, Snowflake, Leaf,
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ── Stock Heatmap (GitHub-style) ──────────────────────────────────────── */
function StockHeatmap({ data, theme }: { data: any[]; theme: string }) {
    if (!data.length) {
        return (
            <div className={cn("text-center py-12 text-sm", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                No dispensing data available for heatmap
            </div>
        );
    }

    const maxCount = Math.max(...data.map((d) => d.count), 1);
    const getColor = (count: number) => {
        if (count === 0) return theme === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)";
        const intensity = count / maxCount;
        if (intensity > 0.75) return "rgb(16, 185, 129)";
        if (intensity > 0.5) return "rgba(16, 185, 129, 0.7)";
        if (intensity > 0.25) return "rgba(16, 185, 129, 0.4)";
        return "rgba(16, 185, 129, 0.15)";
    };

    // Group by week
    const weeks: any[][] = [];
    let currentWeek: any[] = [];
    data.forEach((d, i) => {
        currentWeek.push(d);
        if (currentWeek.length === 7 || i === data.length - 1) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });

    return (
        <div className="overflow-x-auto pb-2">
            <div className="flex gap-[3px] min-w-[750px]">
                {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[3px]">
                        {week.map((day, di) => (
                            <div
                                key={di}
                                title={day.date + ": " + day.count + " items dispensed"}
                                className="w-[13px] h-[13px] rounded-[2px] transition-colors cursor-pointer hover:ring-1 hover:ring-emerald-400"
                                style={{ background: getColor(day.count) }}
                            />
                        ))}
                    </div>
                ))}
            </div>
            {/* Legend */}
            <div className="flex items-center gap-2 mt-3">
                <span className={cn("text-[10px]", theme === "dark" ? "text-slate-600" : "text-stone-400")}>Less</span>
                {[0, 0.15, 0.4, 0.7, 1].map((level, i) => (
                    <div
                        key={i}
                        className="w-[11px] h-[11px] rounded-[2px]"
                        style={{ background: getColor(level * maxCount) }}
                    />
                ))}
                <span className={cn("text-[10px]", theme === "dark" ? "text-slate-600" : "text-stone-400")}>More</span>
            </div>
        </div>
    );
}

/* ── Season Emoji ───────────────────────────────────────────────────────── */
function SeasonIcon({ seasonKey }: { seasonKey: string }) {
    const iconMap: Record<string, any> = {
        winter: <Snowflake className="w-5 h-5 text-blue-400" />,
        summer: <Sun className="w-5 h-5 text-amber-400" />,
        monsoon: <CloudRain className="w-5 h-5 text-blue-500" />,
        post_monsoon: <Leaf className="w-5 h-5 text-orange-400" />,
    };
    return iconMap[seasonKey] || <Calendar className="w-5 h-5 text-emerald-400" />;
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function AdminAnalytics() {
    const { theme } = useTheme();
    const [forecast, setForecast] = useState<any[]>([]);
    const [seasonal, setSeasonal] = useState<any>(null);
    const [heatmap, setHeatmap] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMed, setSelectedMed] = useState<any>(null);

    useEffect(() => {
        const load = async () => {
            try {
                const [f, s, h] = await Promise.all([
                    getStockForecast(),
                    getSeasonalAlerts(),
                    getStockHeatmap(),
                ]);
                setForecast(f || []);
                setSeasonal(s);
                setHeatmap(h || []);
                if (f && f.length > 0) setSelectedMed(f[0]);
            } catch (err) {
                console.error("Analytics load failed:", err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const card = (title: string, icon: any, children: React.ReactNode) => (
        <div
            className={cn(
                "rounded-2xl p-6 border",
                theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
            )}
        >
            <div className="flex items-center gap-2.5 mb-4">
                {icon}
                <h3 className={cn("text-sm font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>{title}</h3>
            </div>
            {children}
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Forecast chart */}
            {card(
                "Predictive Stock Analysis",
                <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />,
                <div>
                    {/* Medicine selector */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {forecast.map((med: any) => (
                            <button
                                key={med.medicine_id}
                                onClick={() => setSelectedMed(med)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                                    selectedMed?.medicine_id === med.medicine_id
                                        ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                                        : theme === "dark"
                                            ? "bg-white/[0.04] text-slate-500 hover:text-slate-300"
                                            : "bg-stone-100 text-stone-500 hover:text-stone-700"
                                )}
                            >
                                {med.medicine_name}
                            </button>
                        ))}
                    </div>
                    {/* Forecast chart */}
                    {selectedMed && (
                        <>
                            <div className="flex items-center gap-4 mb-4">
                                <div>
                                    <p className={cn("text-[11px] font-medium", theme === "dark" ? "text-slate-500" : "text-stone-400")}>Current Stock</p>
                                    <p className={cn("text-xl font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>{selectedMed.current_stock}</p>
                                </div>
                                <div>
                                    <p className={cn("text-[11px] font-medium", theme === "dark" ? "text-slate-500" : "text-stone-400")}>Daily Avg</p>
                                    <p className={cn("text-xl font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>{selectedMed.daily_avg}</p>
                                </div>
                                <div>
                                    <p className={cn("text-[11px] font-medium", theme === "dark" ? "text-slate-500" : "text-stone-400")}>Depletion Date</p>
                                    <p className={cn(
                                        "text-xl font-bold",
                                        selectedMed.predicted_depletion_date ? "text-red-400" : "text-emerald-400"
                                    )}>
                                        {selectedMed.predicted_depletion_date || "Safe"}
                                    </p>
                                </div>
                            </div>
                            <div className="h-[220px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={selectedMed.forecast_30d}>
                                        <defs>
                                            <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="rgb(16,185,129)" stopOpacity={0.3} />
                                                <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)"} />
                                        <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={{ fontSize: 10, fill: theme === "dark" ? "#555" : "#999" }} />
                                        <YAxis tick={{ fontSize: 10, fill: theme === "dark" ? "#555" : "#999" }} />
                                        <Tooltip
                                            contentStyle={{
                                                background: theme === "dark" ? "#111" : "#fff",
                                                border: "1px solid " + (theme === "dark" ? "rgba(255,255,255,0.08)" : "#e5e7eb"),
                                                borderRadius: 12,
                                                fontSize: 12,
                                            }}
                                        />
                                        <Area type="monotone" dataKey="predicted_demand" stroke="rgb(16,185,129)" fill="url(#fg)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </>
                    )}
                    {forecast.length === 0 && (
                        <p className={cn("text-sm text-center py-8", theme === "dark" ? "text-slate-600" : "text-stone-400")}>
                            No forecast data — dispensing history needed
                        </p>
                    )}
                </div>
            )}

            {/* Heatmap + Seasonal side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Heatmap */}
                {card(
                    "Dispensing Activity (365 Days)",
                    <BarChart3 className="w-4.5 h-4.5 text-emerald-500" />,
                    <StockHeatmap data={heatmap} theme={theme} />
                )}

                {/* Seasonal Alerts */}
                {card(
                    seasonal ? seasonal.season + " — Demand Forecast" : "Seasonal Alerts",
                    seasonal ? <SeasonIcon seasonKey={seasonal.season_key} /> : <Calendar className="w-4.5 h-4.5 text-emerald-500" />,
                    seasonal ? (
                        <div className="space-y-2.5">
                            <p className={cn("text-xs mb-3", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                                {seasonal.current_month} — {seasonal.total_categories_affected} categories affected
                            </p>
                            {(seasonal.alerts || []).map((alert: any, i: number) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-3 rounded-xl border",
                                        alert.urgency === "high"
                                            ? theme === "dark" ? "bg-red-500/5 border-red-500/20" : "bg-red-50 border-red-200"
                                            : alert.urgency === "medium"
                                                ? theme === "dark" ? "bg-amber-500/5 border-amber-500/20" : "bg-amber-50 border-amber-200"
                                                : theme === "dark" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
                                    )}
                                >
                                    <div>
                                        <p className={cn("text-xs font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                                            {alert.category}
                                        </p>
                                        <p className={cn("text-[10px] mt-0.5", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                                            {alert.reason}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className={cn(
                                            "text-sm font-bold",
                                            alert.urgency === "high" ? "text-red-400" : alert.urgency === "medium" ? "text-amber-400" : "text-emerald-400"
                                        )}>
                                            +{alert.pct_increase}%
                                        </p>
                                        <p className={cn("text-[9px] uppercase font-semibold tracking-wide",
                                            alert.urgency === "high" ? "text-red-400/60" : alert.urgency === "medium" ? "text-amber-400/60" : "text-emerald-400/60"
                                        )}>
                                            {alert.urgency}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className={cn("text-sm", theme === "dark" ? "text-slate-600" : "text-stone-400")}>Loading...</p>
                    )
                )}
            </div>
        </div>
    );
}
