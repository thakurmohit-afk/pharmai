import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { semanticSearch, addCartItem, getCart } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search, Sparkles, ShieldCheck, AlertTriangle, Package, Info,
    Loader2, ShoppingCart, Plus, Pill, CheckCircle, XCircle, ChevronDown,
} from "lucide-react";

/* ── Risk Badge ─────────────────────────────────────────────────────────── */
function RiskBadge({ level }: { level: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        high: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", label: "High Risk" },
        medium: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "Moderate" },
        low: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", label: "Safe" },
    };
    const c = config[level] || config.low;
    return (
        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border", c.bg, c.text)}>
            <ShieldCheck className="w-3 h-3" />
            {c.label}
        </span>
    );
}

/* ── Explanation Popover ────────────────────────────────────────────────── */
function WhyPopover({ explanations, cautions, theme }: { explanations: string[]; cautions: string[]; theme: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className={cn(
                    "flex items-center gap-1 text-[10px] font-semibold transition-colors",
                    theme === "dark" ? "text-purple-400/70 hover:text-purple-400" : "text-purple-500/70 hover:text-purple-600"
                )}
            >
                <Info className="w-3 h-3" />
                Why this result?
                <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={cn(
                            "absolute left-0 top-full mt-1 z-20 w-64 p-3 rounded-xl border shadow-xl",
                            theme === "dark" ? "bg-[#111] border-white/[0.08]" : "bg-white border-stone-200 shadow-lg"
                        )}
                    >
                        <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-2", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                            Matched because:
                        </p>
                        <div className="space-y-1">
                            {explanations.map((e, i) => (
                                <div key={i} className="flex items-start gap-1.5">
                                    <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                                    <span className={cn("text-[11px]", theme === "dark" ? "text-slate-300" : "text-stone-600")}>{e}</span>
                                </div>
                            ))}
                        </div>
                        {cautions.length > 0 && (
                            <>
                                <p className={cn("text-[10px] font-bold uppercase tracking-wider mt-2.5 mb-1.5", "text-amber-400/70")}>
                                    Cautions:
                                </p>
                                <div className="space-y-1">
                                    {cautions.map((c, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                            <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                                            <span className={cn("text-[11px]", theme === "dark" ? "text-amber-300/80" : "text-amber-600")}>{c}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Search Suggestions ─────────────────────────────────────────────────── */
const SUGGESTIONS = [
    "Medicine for dry cough without drowsiness",
    "BP tablet safe for diabetic patient",
    "Painkiller that doesn't affect stomach",
    "Antibiotic for throat infection",
    "Allergy medicine non-drowsy",
    "Fever medicine for children",
    "Statins with low interaction risk",
    "Antacid for acid reflux",
];

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function SearchPage() {
    const { theme } = useTheme();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [addingToCart, setAddingToCart] = useState<string | null>(null);
    const [cartSuccess, setCartSuccess] = useState<string | null>(null);

    const doSearch = useCallback(async (q: string) => {
        if (!q.trim()) return;
        setQuery(q);
        setLoading(true);
        setResults(null);
        try {
            const data = await semanticSearch(q, 12);
            setResults(data);
        } catch (err) {
            console.error("Search failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleAddToCart = async (med: any) => {
        setAddingToCart(med.medicine_id);
        try {
            await addCartItem(med.name, 1);
            setCartSuccess(med.medicine_id);
            setTimeout(() => setCartSuccess(null), 2000);
        } catch (err) {
            console.error("Add to cart failed:", err);
        } finally {
            setAddingToCart(null);
        }
    };

    const searchResults = results?.results || [];

    return (
        <div
            className={cn(
                "min-h-screen w-full flex font-sans transition-colors duration-300 overflow-hidden",
                theme === "dark" ? "bg-[#050505]" : "bg-slate-50"
            )}
        >
            <Sidebar />

            <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
                <TopNavbar onOpenProfileDrawer={() => { }} />

                <main className="flex-1 p-6 md:p-8 xl:p-10 max-w-[1200px] w-full mx-auto relative z-10 overflow-y-auto">
                    <div className="space-y-6 pb-10">
                        {/* Header */}
                        <div>
                            <h2 className="text-3xl font-heading font-bold bg-clip-text text-transparent bg-gradient-to-br from-purple-400 to-pink-500">
                                Smart Medicine Search
                            </h2>
                            <p className={cn(
                                "mt-1 text-sm font-medium",
                                theme === "dark" ? "text-slate-500" : "text-slate-400"
                            )}>
                                Context-aware, risk-aware search with AI-powered explainability
                            </p>
                        </div>

                        {/* Search Bar */}
                        <div className={cn(
                            "rounded-2xl p-6 border",
                            theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                        )}>
                            <div className="relative">
                                <Search className={cn(
                                    "absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5",
                                    theme === "dark" ? "text-slate-600" : "text-stone-400"
                                )} />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
                                    placeholder="Describe what you need... e.g. 'medicine for dry cough without drowsiness'"
                                    className={cn(
                                        "w-full pl-12 pr-28 py-4 rounded-xl text-sm outline-none border transition-colors",
                                        theme === "dark"
                                            ? "bg-white/[0.03] border-white/[0.06] text-slate-200 placeholder:text-slate-600 focus:border-purple-500/40"
                                            : "bg-stone-50 border-stone-200 text-slate-800 placeholder:text-stone-400 focus:border-purple-400"
                                    )}
                                />
                                <button
                                    onClick={() => doSearch(query)}
                                    disabled={loading || !query.trim()}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold transition-all hover:shadow-lg disabled:opacity-40"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                                </button>
                            </div>

                            {/* Suggestion chips */}
                            <div className="flex flex-wrap gap-2 mt-4">
                                {SUGGESTIONS.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => doSearch(s)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border",
                                            theme === "dark"
                                                ? "bg-white/[0.02] border-white/[0.05] text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
                                                : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100 hover:text-stone-700"
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Context Banner */}
                        {results?.user_context?.context_applied && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                    "flex items-center gap-3 px-5 py-3 rounded-xl border",
                                    theme === "dark" ? "bg-blue-500/5 border-blue-500/20" : "bg-blue-50 border-blue-200"
                                )}
                            >
                                <Sparkles className="w-4 h-4 text-blue-400" />
                                <p className={cn("text-xs font-medium", theme === "dark" ? "text-blue-300" : "text-blue-700")}>
                                    Results filtered for your conditions: {results.user_context.conditions.join(", ")}
                                </p>
                            </motion.div>
                        )}

                        {/* Intent parsed */}
                        {results?.intent && (results.intent.conditions.length > 0 || results.intent.avoidances.length > 0) && (
                            <div className="flex flex-wrap gap-2">
                                {results.intent.conditions.map((c: string) => (
                                    <span key={c} className={cn(
                                        "px-2.5 py-1 rounded-lg text-[10px] font-bold border",
                                        theme === "dark" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    )}>
                                        Condition: {c}
                                    </span>
                                ))}
                                {results.intent.avoidances.map((a: string) => (
                                    <span key={a} className={cn(
                                        "px-2.5 py-1 rounded-lg text-[10px] font-bold border",
                                        theme === "dark" ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-red-50 border-red-200 text-red-600"
                                    )}>
                                        Avoiding: {a}
                                    </span>
                                ))}
                                {results.intent.otc_only && (
                                    <span className={cn(
                                        "px-2.5 py-1 rounded-lg text-[10px] font-bold border",
                                        theme === "dark" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-600"
                                    )}>
                                        OTC Only
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Loading */}
                        {loading && (
                            <div className="flex items-center justify-center py-16">
                                <div className="text-center">
                                    <div className="relative mx-auto w-12 h-12 mb-4">
                                        <div className="absolute inset-0 rounded-full border-2 border-purple-500/20" />
                                        <div className="absolute inset-0 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                                        <Sparkles className="absolute inset-0 m-auto w-5 h-5 text-purple-400" />
                                    </div>
                                    <p className={cn("text-sm font-medium", theme === "dark" ? "text-slate-400" : "text-stone-500")}>
                                        Analyzing intent & ranking results...
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Results Grid */}
                        {!loading && searchResults.length > 0 && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className={cn("text-xs font-semibold", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                                        {results.total_found} results found — ranked by relevance & safety
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {searchResults.map((med: any, i: number) => (
                                        <motion.div
                                            key={med.medicine_id}
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            className={cn(
                                                "rounded-2xl p-5 border group transition-all hover:shadow-lg",
                                                theme === "dark"
                                                    ? "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]"
                                                    : "bg-white border-stone-200/60 hover:border-stone-300 shadow-sm"
                                            )}
                                        >
                                            {/* Top row: name + badges */}
                                            <div className="flex items-start justify-between gap-2 mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={cn("text-sm font-bold truncate", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                                                        {med.name}
                                                    </h3>
                                                    {med.generic_name && (
                                                        <p className={cn("text-[11px] truncate mt-0.5", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                                                            {med.generic_name}
                                                        </p>
                                                    )}
                                                </div>
                                                <RiskBadge level={med.risk_level} />
                                            </div>

                                            {/* Category + Dosage */}
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                {med.category && (
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium",
                                                        theme === "dark" ? "bg-white/[0.04] text-slate-500" : "bg-stone-100 text-stone-500"
                                                    )}>
                                                        {med.category}
                                                    </span>
                                                )}
                                                {med.dosage && (
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-medium",
                                                        theme === "dark" ? "bg-white/[0.04] text-slate-500" : "bg-stone-100 text-stone-500"
                                                    )}>
                                                        {med.dosage}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Flags row */}
                                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                                {/* Rx flag */}
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border",
                                                    med.prescription_required
                                                        ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                                )}>
                                                    {med.prescription_required ? "Rx Required" : "OTC"}
                                                </span>
                                                {/* Stock */}
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold",
                                                    med.in_stock
                                                        ? theme === "dark" ? "text-emerald-400" : "text-emerald-600"
                                                        : theme === "dark" ? "text-red-400" : "text-red-500"
                                                )}>
                                                    {med.in_stock ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                                    {med.in_stock ? `In Stock (${med.stock_quantity})` : "Out of Stock"}
                                                </span>
                                            </div>

                                            {/* Caution flags */}
                                            {med.caution_flags?.length > 0 && (
                                                <div className="mb-3 space-y-1">
                                                    {med.caution_flags.map((f: string, ci: number) => (
                                                        <div key={ci} className={cn(
                                                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium",
                                                            theme === "dark" ? "bg-amber-500/5 text-amber-400" : "bg-amber-50 text-amber-600"
                                                        )}>
                                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                                            {f}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Bottom row: Price + Why + Add to cart */}
                                            <div className="flex items-center justify-between pt-3 border-t mt-auto"
                                                style={{ borderColor: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)" }}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className={cn("text-base font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                                                        ₹{med.price}
                                                    </span>
                                                    <WhyPopover explanations={med.explanations} cautions={med.caution_flags || []} theme={theme} />
                                                </div>
                                                <button
                                                    onClick={() => handleAddToCart(med)}
                                                    disabled={!med.in_stock || addingToCart === med.medicine_id}
                                                    className={cn(
                                                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all",
                                                        cartSuccess === med.medicine_id
                                                            ? "bg-emerald-500 text-white"
                                                            : !med.in_stock
                                                                ? "bg-white/[0.03] text-slate-600 cursor-not-allowed"
                                                                : "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:shadow-lg"
                                                    )}
                                                >
                                                    {cartSuccess === med.medicine_id ? (
                                                        <><CheckCircle className="w-3.5 h-3.5" /> Added</>
                                                    ) : addingToCart === med.medicine_id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <><Plus className="w-3.5 h-3.5" /> Add to Cart</>
                                                    )}
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty state */}
                        {!loading && results && searchResults.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Pill className={cn("w-16 h-16 mb-4", theme === "dark" ? "text-slate-700" : "text-stone-200")} />
                                <p className={cn("text-sm font-medium", theme === "dark" ? "text-slate-400" : "text-stone-500")}>
                                    No medicines found for this search
                                </p>
                                <p className={cn("text-xs mt-1", theme === "dark" ? "text-slate-600" : "text-stone-400")}>
                                    Try a different description or check spelling
                                </p>
                            </div>
                        )}

                        {/* Initial empty page */}
                        {!loading && !results && (
                            <div className="flex flex-col items-center justify-center py-16">
                                <div className={cn(
                                    "w-20 h-20 rounded-2xl flex items-center justify-center mb-4",
                                    theme === "dark" ? "bg-purple-500/10" : "bg-purple-50"
                                )}>
                                    <Search className="w-9 h-9 text-purple-400" />
                                </div>
                                <p className={cn("text-sm font-medium", theme === "dark" ? "text-slate-400" : "text-stone-500")}>
                                    Describe what you're looking for
                                </p>
                                <p className={cn("text-xs mt-1 max-w-md text-center", theme === "dark" ? "text-slate-600" : "text-stone-400")}>
                                    Our AI understands conditions, avoidance preferences, and your health profile to rank the safest options
                                </p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
