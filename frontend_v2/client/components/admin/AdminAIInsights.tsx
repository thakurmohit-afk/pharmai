import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { getPatientAIInsight, getAdminUsers } from "@/services/api";
import {
    BrainCircuit, ChevronRight, Sparkles,
    Activity, Pill, ShieldAlert, Search, User, Heart,
    TrendingUp, Zap,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */
interface PatientInsight {
    user_id: string;
    user_name: string;
    user_email: string;
    age: number | null;
    gender: string | null;
    gpt_narrative: string;
    summary: {
        inferred_conditions: Array<{ condition: string; supporting_medications: string[]; confidence: string }>;
        risk_factors: Array<{ risk: string; severity: string; detail: string; recommendation?: string }>;
        top_medications: Array<{ name: string; frequency: number }>;
        total_orders: number;
        total_unique_meds: number;
        adherence_score: number;
        prescriptions: { active: number; expired: number; total: number };
        ai_insights: string[];
    };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RISK DOT
   ═══════════════════════════════════════════════════════════════════════════ */
function RiskDot({ level }: { level: "high" | "medium" | "low" }) {
    const bg = { high: "bg-red-500", medium: "bg-amber-400", low: "bg-emerald-400" }[level];
    return <span className={cn("w-2 h-2 rounded-full shrink-0", bg)} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SKELETON LOADER
   ═══════════════════════════════════════════════════════════════════════════ */
function NarrativeSkeleton({ dark, userName }: { dark: boolean; userName: string }) {
    return (
        <div className="space-y-5">
            {/* Header skeleton */}
            <div className={cn("rounded-2xl border p-5", dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60")}>
                <div className="flex items-center gap-4">
                    <div className={cn("w-14 h-14 rounded-2xl animate-pulse", dark ? "bg-white/[0.06]" : "bg-stone-100")} />
                    <div className="flex-1 space-y-2">
                        <div className={cn("h-4 w-40 rounded-lg animate-pulse", dark ? "bg-white/[0.06]" : "bg-stone-100")} />
                        <div className={cn("h-3 w-56 rounded-lg animate-pulse", dark ? "bg-white/[0.04]" : "bg-stone-50")} />
                    </div>
                </div>
            </div>
            {/* Narrative skeleton */}
            <div className={cn(
                "rounded-2xl border p-6 border-l-4",
                dark ? "bg-white/[0.02] border-white/[0.06] border-l-emerald-500/30" : "bg-white border-stone-200/60 border-l-emerald-400/40",
            )}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-white" />
                    </div>
                    <span className={cn("text-[12px] font-bold", dark ? "text-slate-300" : "text-stone-600")}>Generating insight for {userName}...</span>
                </div>
                <div className="space-y-3">
                    {[90, 100, 75, 95, 60].map((w, i) => (
                        <div key={i} className={cn("h-3 rounded-lg animate-pulse", dark ? "bg-white/[0.04]" : "bg-stone-50")} style={{ width: `${w}%`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MED FREQUENCY BAR
   ═══════════════════════════════════════════════════════════════════════════ */
function MedBar({ name, freq, maxFreq, dark, index }: { name: string; freq: number; maxFreq: number; dark: boolean; index: number }) {
    const pct = maxFreq > 0 ? (freq / maxFreq) * 100 : 0;
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-3"
        >
            <span className={cn("text-[10px] font-medium w-28 truncate text-right", dark ? "text-slate-400" : "text-stone-500")}>{name}</span>
            <div className={cn("flex-1 h-5 rounded-lg overflow-hidden", dark ? "bg-white/[0.03]" : "bg-stone-50")}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ delay: 0.3 + index * 0.05, duration: 0.5, ease: "easeOut" }}
                    className="h-full rounded-lg bg-gradient-to-r from-emerald-500/80 to-teal-500/60"
                />
            </div>
            <span className={cn("text-[10px] font-bold w-6 text-right", dark ? "text-slate-500" : "text-stone-400")}>{freq}</span>
        </motion.div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function AdminAIInsights() {
    const { theme } = useTheme();
    const dark = theme === "dark";
    const [users, setUsers] = useState<any[]>([]);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [insight, setInsight] = useState<PatientInsight | null>(null);
    const [loading, setLoading] = useState(false);
    const [usersLoading, setUsersLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        getAdminUsers()
            .then((data) => setUsers(data || []))
            .catch(console.error)
            .finally(() => setUsersLoading(false));
    }, []);

    const loadInsight = async (userId: string) => {
        setLoading(true);
        setInsight(null);
        try {
            const data = await getPatientAIInsight(userId);
            setInsight(data);
        } catch (err) {
            console.error("Failed to load patient AI insight:", err);
            setInsight({
                user_id: userId,
                user_name: selectedUser?.name || "Unknown",
                user_email: selectedUser?.email || "",
                age: null,
                gender: null,
                gpt_narrative: "Unable to generate AI insight — the backend encountered an error. Please try again.",
                summary: {
                    inferred_conditions: [], risk_factors: [], top_medications: [],
                    total_orders: 0, total_unique_meds: 0, adherence_score: 0.5,
                    prescriptions: { active: 0, expired: 0, total: 0 }, ai_insights: [],
                },
            });
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u =>
        !searchQuery || (u.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || (u.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getUserRisk = (u: any) => {
        if (u.alert_count && u.alert_count > 0) return "high";
        if (u.order_count && u.order_count > 3) return "medium";
        return "low";
    };

    const s = insight?.summary;
    const adherenceColor = (s?.adherence_score ?? 0) >= 0.7 ? "emerald" : (s?.adherence_score ?? 0) >= 0.4 ? "amber" : "red";
    const maxFreq = Math.max(1, ...(s?.top_medications?.map(m => m.frequency) || [1]));

    return (
        <div className="flex gap-5 h-[calc(100vh-140px)]">
            {/* ── LEFT: Patient List ──────────────────────────────────────── */}
            <div className={cn(
                "w-[280px] shrink-0 rounded-2xl border flex flex-col overflow-hidden",
                dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
            )}>
                {/* Header */}
                <div className={cn("px-4 pt-4 pb-3 border-b", dark ? "border-white/[0.05]" : "border-stone-100")}>
                    <div className="flex items-center gap-2 mb-3">
                        <BrainCircuit className="w-4 h-4 text-emerald-500" />
                        <h3 className={cn("text-[13px] font-bold", dark ? "text-slate-200" : "text-slate-800")}>Patient Intelligence</h3>
                    </div>
                    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg", dark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-stone-50 border border-stone-200/60")}>
                        <Search className={cn("w-3 h-3 shrink-0", dark ? "text-slate-600" : "text-stone-400")} />
                        <input
                            type="text"
                            placeholder="Search patients..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className={cn("bg-transparent text-[11px] w-full outline-none placeholder:text-[11px]", dark ? "text-slate-300 placeholder:text-slate-700" : "text-stone-700 placeholder:text-stone-400")}
                        />
                    </div>
                </div>

                {/* User List */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 scrollbar-none">
                    {usersLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <p className={cn("text-[11px] text-center py-8", dark ? "text-slate-600" : "text-stone-400")}>No patients found</p>
                    ) : (
                        filteredUsers.map((u: any) => {
                            const isSelected = selectedUser?.user_id === u.user_id;
                            const risk = getUserRisk(u);
                            return (
                                <button
                                    key={u.user_id}
                                    onClick={() => { setSelectedUser(u); loadInsight(u.user_id); }}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                                        isSelected
                                            ? dark ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-emerald-50 ring-1 ring-emerald-300 shadow-sm"
                                            : dark ? "hover:bg-white/[0.03]" : "hover:bg-stone-50"
                                    )}
                                >
                                    <div className={cn(
                                        "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 relative",
                                        isSelected
                                            ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20"
                                            : dark ? "bg-white/[0.06] text-slate-400" : "bg-stone-100 text-stone-500"
                                    )}>
                                        {(u.name || "?")[0].toUpperCase()}
                                        <span className="absolute -top-0.5 -right-0.5"><RiskDot level={risk} /></span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn("text-[12px] font-semibold truncate", isSelected ? (dark ? "text-emerald-300" : "text-emerald-800") : dark ? "text-slate-300" : "text-slate-700")}>
                                            {u.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className={cn("text-[9px] truncate", dark ? "text-slate-600" : "text-stone-400")}>
                                                {u.order_count || 0} orders
                                            </span>
                                            {(u.alert_count || 0) > 0 && (
                                                <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 font-bold">
                                                    {u.alert_count} alert{u.alert_count > 1 ? "s" : ""}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <ChevronRight className={cn("w-3.5 h-3.5 shrink-0", isSelected ? "text-emerald-500" : "text-slate-500")} />
                                </button>
                            );
                        })
                    )}
                </div>

                <div className={cn("px-4 py-2 border-t text-center", dark ? "border-white/[0.05]" : "border-stone-100")}>
                    <span className={cn("text-[9px] font-medium", dark ? "text-slate-700" : "text-stone-400")}>
                        {filteredUsers.length} patient{filteredUsers.length !== 1 ? "s" : ""} indexed
                    </span>
                </div>
            </div>

            {/* ── RIGHT: Insight Panel ────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto scrollbar-none pr-1">
                {!selectedUser ? (
                    /* ── Empty state ──────────────────────────────────────── */
                    <div className={cn(
                        "h-full flex flex-col items-center justify-center rounded-2xl border",
                        dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60"
                    )}>
                        <div className={cn("w-16 h-16 rounded-2xl mb-4 flex items-center justify-center", dark ? "bg-white/[0.03]" : "bg-stone-50")}>
                            <BrainCircuit className={cn("w-8 h-8", dark ? "text-slate-700" : "text-stone-300")} />
                        </div>
                        <p className={cn("text-sm font-semibold mb-1", dark ? "text-slate-400" : "text-stone-500")}>Select a patient</p>
                        <p className={cn("text-[11px]", dark ? "text-slate-600" : "text-stone-400")}>View their AI-generated health intelligence</p>
                    </div>
                ) : loading ? (
                    /* ── Loading state ────────────────────────────────────── */
                    <NarrativeSkeleton dark={dark} userName={selectedUser.name} />
                ) : insight ? (
                    /* ── Insight content ──────────────────────────────────── */
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

                        {/* ── 1. User Header ────────────────────────────── */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                                "rounded-2xl border p-5 flex items-center gap-4",
                                dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                            )}
                        >
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-emerald-500/20">
                                {(insight.user_name || "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className={cn("text-base font-bold", dark ? "text-slate-200" : "text-stone-800")}>{insight.user_name}</h3>
                                <p className={cn("text-[11px] mt-0.5", dark ? "text-slate-500" : "text-stone-400")}>
                                    {insight.user_email}
                                    {insight.age && <> &middot; {insight.age} yrs</>}
                                    {insight.gender && <> &middot; {insight.gender}</>}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "text-[9px] px-2.5 py-1 rounded-full font-bold",
                                    adherenceColor === "emerald" ? (dark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600")
                                        : adherenceColor === "amber" ? (dark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600")
                                            : dark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"
                                )}>
                                    {Math.round((s?.adherence_score ?? 0) * 100)}% Adherence
                                </span>
                                {(s?.risk_factors?.length ?? 0) > 0 && (
                                    <span className={cn("text-[9px] px-2.5 py-1 rounded-full font-bold", dark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600")}>
                                        {s!.risk_factors.length} Risk{s!.risk_factors.length > 1 ? "s" : ""}
                                    </span>
                                )}
                            </div>
                        </motion.div>

                        {/* ── 2. Quick Stats ─────────────────────────────── */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 }}
                            className="grid grid-cols-4 gap-3"
                        >
                            {[
                                { icon: TrendingUp, label: "Total Orders", value: s?.total_orders ?? 0, color: "text-blue-500" },
                                { icon: Pill, label: "Unique Meds", value: s?.total_unique_meds ?? 0, color: "text-purple-500" },
                                { icon: Heart, label: "Active Rx", value: s?.prescriptions?.active ?? 0, color: "text-pink-500" },
                                { icon: ShieldAlert, label: "Risk Factors", value: s?.risk_factors?.length ?? 0, color: (s?.risk_factors?.length ?? 0) > 0 ? "text-red-500" : "text-emerald-500" },
                            ].map((stat, i) => (
                                <div key={i} className={cn(
                                    "rounded-xl border p-3.5 flex items-center gap-3",
                                    dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60"
                                )}>
                                    <stat.icon className={cn("w-4 h-4 shrink-0", stat.color)} />
                                    <div>
                                        <p className={cn("text-lg font-bold leading-none", dark ? "text-slate-200" : "text-stone-800")}>{stat.value}</p>
                                        <p className={cn("text-[9px] mt-1 font-medium", dark ? "text-slate-600" : "text-stone-400")}>{stat.label}</p>
                                    </div>
                                </div>
                            ))}
                        </motion.div>

                        {/* ── 3. GPT Narrative ───────────────────────────── */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className={cn(
                                "rounded-2xl border border-l-4 p-6",
                                dark
                                    ? "bg-gradient-to-br from-emerald-500/[0.03] to-teal-500/[0.02] border-white/[0.06] border-l-emerald-500/50"
                                    : "bg-gradient-to-br from-emerald-50/50 to-teal-50/30 border-stone-200/60 border-l-emerald-400 shadow-sm"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-4">
                                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
                                    <Sparkles className="w-3 h-3 text-white" />
                                </div>
                                <h4 className={cn("text-[13px] font-bold", dark ? "text-slate-200" : "text-stone-700")}>AI Clinical Narrative</h4>
                                <Zap className="w-3 h-3 text-amber-400 ml-1" />
                            </div>
                            <p className={cn(
                                "text-[13px] leading-[1.85] whitespace-pre-line",
                                dark ? "text-slate-300/90" : "text-stone-600"
                            )}>
                                {insight.gpt_narrative}
                            </p>
                            <div className={cn("mt-4 pt-3 border-t flex items-center justify-between", dark ? "border-white/[0.04]" : "border-stone-200/40")}>
                                <span className={cn("text-[9px] font-medium", dark ? "text-slate-700" : "text-stone-400")}>
                                    Powered by GPT-4o-mini
                                </span>
                                <span className={cn("text-[9px]", dark ? "text-slate-700" : "text-stone-400")}>
                                    Generated just now
                                </span>
                            </div>
                        </motion.div>

                        {/* ── 4. Two-Column: Conditions + Risks ──────────── */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Inferred Conditions */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className={cn(
                                    "rounded-2xl border p-5",
                                    dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <Activity className="w-3.5 h-3.5 text-pink-500" />
                                    <h4 className={cn("text-[11px] font-bold uppercase tracking-[0.08em]", dark ? "text-slate-400" : "text-stone-500")}>Inferred Conditions</h4>
                                </div>
                                {(s?.inferred_conditions?.length ?? 0) > 0 ? (
                                    <div className="space-y-2.5">
                                        {s!.inferred_conditions.map((c, i) => (
                                            <div key={i} className={cn("px-3 py-2.5 rounded-xl", dark ? "bg-white/[0.02]" : "bg-stone-50/80")}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className={cn("text-[12px] font-semibold", dark ? "text-slate-300" : "text-stone-700")}>{c.condition}</span>
                                                    <span className={cn(
                                                        "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                                                        c.confidence === "high"
                                                            ? dark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                                                            : dark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"
                                                    )}>{c.confidence}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {c.supporting_medications?.map((med, mi) => (
                                                        <span key={mi} className={cn(
                                                            "text-[9px] px-2 py-0.5 rounded-full",
                                                            dark ? "bg-blue-500/10 text-blue-400/80" : "bg-blue-50 text-blue-600"
                                                        )}>{med}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={cn("text-[11px] py-4 text-center", dark ? "text-slate-600" : "text-stone-400")}>No conditions inferred yet</p>
                                )}
                            </motion.div>

                            {/* Risk Factors */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className={cn(
                                    "rounded-2xl border p-5",
                                    dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                                    <h4 className={cn("text-[11px] font-bold uppercase tracking-[0.08em]", dark ? "text-slate-400" : "text-stone-500")}>Risk Factors</h4>
                                </div>
                                {(s?.risk_factors?.length ?? 0) > 0 ? (
                                    <div className="space-y-2.5">
                                        {s!.risk_factors.map((r, i) => (
                                            <div key={i} className={cn(
                                                "px-3 py-2.5 rounded-xl border",
                                                r.severity === "high"
                                                    ? dark ? "bg-red-500/[0.04] border-red-500/10" : "bg-red-50/60 border-red-200/60"
                                                    : dark ? "bg-amber-500/[0.04] border-amber-500/10" : "bg-amber-50/60 border-amber-200/60"
                                            )}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <RiskDot level={r.severity as "high" | "medium" | "low"} />
                                                    <span className={cn("text-[12px] font-semibold", dark ? "text-slate-300" : "text-stone-700")}>{r.risk}</span>
                                                </div>
                                                <p className={cn("text-[10px] leading-relaxed", dark ? "text-slate-500" : "text-stone-400")}>{r.detail}</p>
                                                {r.recommendation && (
                                                    <p className={cn("text-[9px] mt-1.5 font-medium", dark ? "text-emerald-400/60" : "text-emerald-600/80")}>
                                                        Rec: {r.recommendation}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center py-4">
                                        <User className={cn("w-5 h-5 mb-1.5", dark ? "text-slate-700" : "text-stone-300")} />
                                        <p className={cn("text-[11px]", dark ? "text-slate-600" : "text-stone-400")}>No risk factors detected</p>
                                    </div>
                                )}
                            </motion.div>
                        </div>

                        {/* ── 5. Top Medications Bar ─────────────────────── */}
                        {(s?.top_medications?.length ?? 0) > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25 }}
                                className={cn(
                                    "rounded-2xl border p-5",
                                    dark ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <Pill className="w-3.5 h-3.5 text-blue-500" />
                                    <h4 className={cn("text-[11px] font-bold uppercase tracking-[0.08em]", dark ? "text-slate-400" : "text-stone-500")}>
                                        Top Medications
                                    </h4>
                                    <span className={cn("text-[9px] ml-auto", dark ? "text-slate-600" : "text-stone-400")}>by order frequency</span>
                                </div>
                                <div className="space-y-2">
                                    {s!.top_medications.slice(0, 8).map((m, i) => (
                                        <MedBar key={i} name={m.name} freq={m.frequency} maxFreq={maxFreq} dark={dark} index={i} />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                ) : null}
            </div>
        </div>
    );
}
