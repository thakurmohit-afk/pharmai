import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { adminNlpSearch } from "@/services/api";
import {
    Search, Sparkles, AlertTriangle, Package, Users, FileText, Pill, Loader2, TrendingDown,
} from "lucide-react";

const SUGGESTED_QUERIES = [
    { label: "Low stock meds", icon: <Package className="w-3.5 h-3.5" />, color: "text-red-400" },
    { label: "Users at high refill risk", icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-amber-400" },
    { label: "Users with expired prescriptions", icon: <FileText className="w-3.5 h-3.5" />, color: "text-rose-400" },
    { label: "High polypharmacy cases", icon: <Pill className="w-3.5 h-3.5" />, color: "text-purple-400" },
    { label: "Top selling medicines", icon: <TrendingDown className="w-3.5 h-3.5" />, color: "text-emerald-400" },
    { label: "Inactive users", icon: <Users className="w-3.5 h-3.5" />, color: "text-blue-400" },
    { label: "Pending orders", icon: <Package className="w-3.5 h-3.5" />, color: "text-orange-400" },
    { label: "New users", icon: <Users className="w-3.5 h-3.5" />, color: "text-teal-400" },
];

export default function AdminSearch() {
    const { theme } = useTheme();
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const doSearch = async (q: string) => {
        if (!q.trim()) return;
        setQuery(q);
        setLoading(true);
        try {
            const data = await adminNlpSearch(q);
            setResult(data);
        } catch (err) {
            console.error("NLP search failed:", err);
        } finally {
            setLoading(false);
        }
    };

    const columns = result?.results?.[0] ? Object.keys(result.results[0]) : [];

    return (
        <div className="space-y-6">
            {/* Search Bar */}
            <div className={cn(
                "rounded-2xl p-6 border",
                theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
            )}>
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4.5 h-4.5 text-purple-400" />
                    <h3 className={cn("text-sm font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                        AI-Powered Admin Search
                    </h3>
                </div>

                {/* Input */}
                <div className="relative">
                    <Search className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4",
                        theme === "dark" ? "text-slate-600" : "text-stone-400"
                    )} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
                        placeholder='Try: "Low stock meds" or "Users with expired prescriptions"'
                        className={cn(
                            "w-full pl-11 pr-4 py-3.5 rounded-xl text-sm outline-none border transition-colors",
                            theme === "dark"
                                ? "bg-white/[0.03] border-white/[0.06] text-slate-200 placeholder:text-slate-600 focus:border-purple-500/40"
                                : "bg-stone-50 border-stone-200 text-slate-800 placeholder:text-stone-400 focus:border-purple-400"
                        )}
                    />
                </div>

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-2 mt-4">
                    {SUGGESTED_QUERIES.map((sq) => (
                        <button
                            key={sq.label}
                            onClick={() => doSearch(sq.label)}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                                theme === "dark"
                                    ? "bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.06] hover:text-slate-300"
                                    : "bg-stone-50 border border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                            )}
                        >
                            <span className={sq.color}>{sq.icon}</span>
                            {sq.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Results */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <Loader2 className="w-6 h-6 text-purple-400 animate-spin mx-auto mb-2" />
                        <p className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                            Analyzing query...
                        </p>
                    </div>
                </div>
            )}

            {!loading && result && (
                <div className={cn(
                    "rounded-2xl p-6 border",
                    theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                )}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={cn("text-sm font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                            {result.title}
                        </h3>
                        <span className={cn(
                            "px-2.5 py-1 rounded-lg text-[10px] font-bold",
                            theme === "dark" ? "bg-purple-500/10 text-purple-400" : "bg-purple-50 text-purple-600"
                        )}>
                            {result.count} result{result.count !== 1 ? "s" : ""} · intent: {result.intent}
                        </span>
                    </div>

                    {result.count === 0 ? (
                        <p className={cn("text-sm text-center py-8", theme === "dark" ? "text-slate-600" : "text-stone-400")}>
                            No results found for this query
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className={cn("border-b", theme === "dark" ? "border-white/[0.06]" : "border-stone-200")}>
                                        {columns.map((col) => (
                                            <th
                                                key={col}
                                                className={cn(
                                                    "text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider",
                                                    theme === "dark" ? "text-slate-500" : "text-stone-400"
                                                )}
                                            >
                                                {col.replace(/_/g, " ")}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.results.map((row: any, i: number) => (
                                        <tr
                                            key={i}
                                            className={cn(
                                                "border-b transition-colors",
                                                theme === "dark" ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-stone-100 hover:bg-stone-50"
                                            )}
                                        >
                                            {columns.map((col) => {
                                                const value = row[col];
                                                const isStatus = col === "status" || col === "risk" || col === "urgency";
                                                const isCritical = typeof value === "string" && ["Critical", "High"].includes(value);
                                                return (
                                                    <td
                                                        key={col}
                                                        className={cn(
                                                            "px-3 py-2.5 text-xs",
                                                            isStatus && isCritical ? "text-red-400 font-bold" :
                                                                isStatus ? "text-amber-400 font-semibold" :
                                                                    theme === "dark" ? "text-slate-300" : "text-stone-600"
                                                        )}
                                                    >
                                                        {Array.isArray(value) ? value.join(", ") : String(value ?? "—")}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
