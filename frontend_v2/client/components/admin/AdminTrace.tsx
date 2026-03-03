import { useState, useEffect } from "react";
import {
    Loader2, ArrowLeft, MessageSquare, User, Clock, Zap,
    CheckCircle2, AlertTriangle, XCircle, ChevronRight, ChevronDown, Brain,
    Search, GitBranch, Shield,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getAdminThreads, getAdminThreadTrace } from "@/services/api";

/* ── Helpers ──────────────────────────────────────────────────────── */
function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "—";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function stepStatusIcon(status: string) {
    switch (status) {
        case "completed": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
        case "error": return <XCircle className="w-3.5 h-3.5 text-red-500" />;
        case "blocked": return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
        case "skipped": return <ChevronRight className="w-3.5 h-3.5 text-slate-400" />;
        default: return <Clock className="w-3.5 h-3.5 text-slate-400" />;
    }
}

function safetyColor(decision: string | null | undefined) {
    if (decision === "allow") return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    if (decision === "soft_block") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    if (decision === "hard_block") return "text-red-500 bg-red-500/10 border-red-500/20";
    return "text-slate-500 bg-slate-500/10 border-slate-500/20";
}

/* ── Thread List View ────────────────────────────────────────────── */
function ThreadList({
    threads, theme, onSelect, search, setSearch,
}: {
    threads: any[]; theme: string; onSelect: (id: string) => void;
    search: string; setSearch: (s: string) => void;
}) {
    const dark = theme === "dark";
    const filtered = threads.filter(t =>
        t.user_name?.toLowerCase().includes(search.toLowerCase()) ||
        t.title?.toLowerCase().includes(search.toLowerCase()) ||
        t.last_message_preview?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className={cn("text-lg font-bold", dark ? "text-slate-100" : "text-slate-800")}>
                        Agent Trace Explorer
                    </h2>
                    <p className={cn("text-xs mt-0.5", dark ? "text-slate-600" : "text-slate-400")}>
                        Live Chain-of-Thought · {threads.length} conversation{threads.length !== 1 ? "s" : ""}
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2.5",
                dark
                    ? "bg-white/[0.04] border border-white/[0.08]"
                    : "bg-white border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            )}>
                <Search className={cn("w-4 h-4 shrink-0", dark ? "text-slate-500" : "text-slate-400")} />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by user, title, or content..."
                    className={cn(
                        "flex-1 bg-transparent text-sm outline-none",
                        dark ? "text-slate-200 placeholder-slate-600" : "text-slate-700 placeholder-slate-400"
                    )}
                />
            </div>

            {/* Thread cards */}
            {filtered.length === 0 ? (
                <p className={cn("text-sm py-8 text-center", dark ? "text-slate-600" : "text-slate-400")}>
                    No conversations found.
                </p>
            ) : (
                <div className="space-y-2">
                    {filtered.map((t, i) => (
                        <motion.button
                            key={t.thread_id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02 }}
                            onClick={() => onSelect(t.thread_id)}
                            className={cn(
                                "w-full text-left rounded-xl p-4 transition-all group",
                                dark
                                    ? "bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-emerald-500/20"
                                    : "bg-white border border-slate-100 hover:border-emerald-200 hover:shadow-md shadow-sm"
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <User className={cn("w-3.5 h-3.5 shrink-0", dark ? "text-emerald-400" : "text-emerald-600")} />
                                        <span className={cn("text-sm font-semibold truncate", dark ? "text-slate-200" : "text-slate-700")}>
                                            {t.user_name}
                                        </span>
                                        <span className={cn("text-[10px]", dark ? "text-slate-600" : "text-slate-400")}>
                                            {timeAgo(t.updated_at)}
                                        </span>
                                    </div>
                                    {t.title && (
                                        <p className={cn("text-xs font-medium mb-1 truncate", dark ? "text-slate-400" : "text-slate-500")}>
                                            {t.title}
                                        </p>
                                    )}
                                    {t.last_message_preview && (
                                        <p className={cn("text-[11px] truncate", dark ? "text-slate-600" : "text-slate-400")}>
                                            {t.last_message_preview}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className={cn(
                                        "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold",
                                        dark ? "bg-white/[0.04] text-slate-400" : "bg-slate-50 text-slate-500"
                                    )}>
                                        <MessageSquare className="w-3 h-3" />
                                        {t.message_count}
                                    </div>
                                    {t.last_action && (
                                        <Badge variant="outline" className={cn(
                                            "text-[10px] capitalize",
                                            t.last_action === "clarify" ? "text-amber-500 border-amber-500/20" : "text-emerald-500 border-emerald-500/20"
                                        )}>
                                            {t.last_action}
                                        </Badge>
                                    )}
                                    <ChevronRight className={cn(
                                        "w-4 h-4 transition-transform group-hover:translate-x-0.5",
                                        dark ? "text-slate-700" : "text-slate-300"
                                    )} />
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Step Summary Helper ─────────────────────────────────────────── */
const STEP_DESCRIPTIONS: Record<string, string> = {
    medicine_search: "Runs vector + lexical hybrid search across the medicine database to find relevant matches for the user's query.",
    pharmacist: "GPT-based pharmacist reasoning — interprets intent, selects tools, and generates the response message.",
    profiling: "Loads patient history, past orders, allergies, and preferences to personalize the interaction.",
    predictive: "Analyzes ordering patterns to predict refill needs and suggest proactive reorders.",
    safety: "Checks for prescription requirements, contraindications, drug interactions, and dosage limits.",
    inventory: "Verifies real-time stock availability and resolves pricing for matched medicines.",
    execution: "Places orders, processes payments, and triggers confirmation emails and webhooks.",
};

function stepSummaryText(step: any): string {
    const desc = STEP_DESCRIPTIONS[step.id] || step.description || "";
    const output = step.output || {};
    const parts: string[] = [];

    if (desc) parts.push(desc);

    // Add output details
    if (step.status === "skipped" && output.reason) {
        parts.push(`Skipped: ${output.reason}`);
    }
    if (output.results_count != null) {
        parts.push(`Found ${output.results_count} result(s).`);
    }
    if (output.action) {
        parts.push(`Action: ${output.action}`);
    }
    if (output.decision) {
        parts.push(`Decision: ${output.decision}`);
    }
    if (output.safety_decision) {
        parts.push(`Safety: ${output.safety_decision}`);
    }
    if (output.medicines_found != null) {
        parts.push(`${output.medicines_found} medicine(s) matched.`);
    }
    if (output.order_id) {
        parts.push(`Order ID: ${output.order_id}`);
    }
    if (output.total_amount != null) {
        parts.push(`Total: ₹${output.total_amount}`);
    }
    if (output.warnings?.length) {
        parts.push(`${output.warnings.length} warning(s) flagged.`);
    }
    if (output.refill_suggestions?.length) {
        parts.push(`${output.refill_suggestions.length} refill suggestion(s).`);
    }
    if (output.error) {
        parts.push(`Error: ${output.error}`);
    }

    return parts.join(" ") || "No additional details available.";
}

/* ── Expandable Step List Component ──────────────────────────────── */
function StepList({ steps, dark }: { steps: any[]; dark: boolean }) {
    const [expanded, setExpanded] = useState<Set<number>>(new Set());

    const toggle = (idx: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx);
            else next.add(idx);
            return next;
        });
    };

    return (
        <div className="space-y-1">
            {steps.map((step: any, si: number) => {
                const isOpen = expanded.has(si);
                return (
                    <div key={si}>
                        <button
                            onClick={() => toggle(si)}
                            className={cn(
                                "w-full flex items-center gap-2.5 py-1.5 px-2.5 rounded-lg transition-colors text-left",
                                dark
                                    ? "bg-white/[0.02] hover:bg-white/[0.04]"
                                    : "bg-white/50 hover:bg-white/80"
                            )}
                        >
                            {/* Step number */}
                            <span className={cn(
                                "w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0",
                                dark ? "bg-white/[0.06] text-slate-500" : "bg-slate-100 text-slate-400"
                            )}>
                                {si + 1}
                            </span>

                            {/* Status icon */}
                            {stepStatusIcon(step.status)}

                            {/* Agent name */}
                            <span className={cn(
                                "text-xs font-medium flex-1",
                                dark ? "text-slate-300" : "text-slate-600"
                            )}>
                                {step.name || step.id?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || `Step ${si + 1}`}
                            </span>

                            {/* Duration */}
                            {step.duration_ms != null && (
                                <span className={cn(
                                    "text-[10px] font-mono tabular-nums",
                                    step.duration_ms > 2000
                                        ? "text-amber-500"
                                        : dark ? "text-slate-600" : "text-slate-400"
                                )}>
                                    {step.duration_ms}ms
                                </span>
                            )}

                            {/* Status badge */}
                            <span className={cn(
                                "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
                                step.status === "completed"
                                    ? dark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                                    : step.status === "error"
                                        ? "bg-red-500/10 text-red-500"
                                        : step.status === "blocked"
                                            ? "bg-amber-500/10 text-amber-500"
                                            : dark ? "bg-white/[0.04] text-slate-500" : "bg-slate-100 text-slate-400"
                            )}>
                                {step.status}
                            </span>

                            {/* Expand chevron */}
                            <ChevronDown className={cn(
                                "w-3 h-3 shrink-0 transition-transform duration-200",
                                isOpen ? "rotate-180" : "",
                                dark ? "text-slate-600" : "text-slate-400"
                            )} />
                        </button>

                        {/* Expandable summary */}
                        <AnimatePresence>
                            {isOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                >
                                    <div className={cn(
                                        "mx-2 mt-0.5 mb-1 px-3 py-2 rounded-lg text-[11px] leading-relaxed",
                                        dark
                                            ? "bg-white/[0.03] text-slate-400 border border-white/[0.04]"
                                            : "bg-slate-50 text-slate-500 border border-slate-100"
                                    )}>
                                        {stepSummaryText(step)}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}

/* ── Trace Detail View (CoT) ─────────────────────────────────────── */
function TraceDetail({
    trace, theme, onBack,
}: {
    trace: any; theme: string; onBack: () => void;
}) {
    const dark = theme === "dark";

    return (
        <div className="space-y-4">
            {/* Back + Header */}
            <div className="flex items-center gap-3">
                <button
                    onClick={onBack}
                    className={cn(
                        "p-2 rounded-xl transition-colors",
                        dark ? "hover:bg-white/[0.05] text-slate-400" : "hover:bg-slate-100 text-slate-500"
                    )}
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                    <h2 className={cn("text-base font-bold", dark ? "text-slate-100" : "text-slate-800")}>
                        {trace.user_name}'s Conversation
                    </h2>
                    <p className={cn("text-[11px]", dark ? "text-slate-600" : "text-slate-400")}>
                        {trace.title || "Untitled"} · {trace.message_count} messages
                    </p>
                </div>
            </div>

            {/* Messages with CoT */}
            <div className="space-y-3">
                {trace.messages?.map((msg: any, i: number) => (
                    <motion.div
                        key={msg.message_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={cn(
                            "rounded-xl border p-4",
                            msg.role === "user"
                                ? dark ? "bg-blue-500/[0.04] border-blue-500/10" : "bg-blue-50/50 border-blue-100"
                                : dark ? "bg-white/[0.02] border-white/[0.05]" : "bg-white border-slate-100 shadow-sm"
                        )}
                    >
                        {/* Message Header */}
                        <div className="flex items-center gap-2 mb-2">
                            {msg.role === "user" ? (
                                <User className="w-3.5 h-3.5 text-blue-500" />
                            ) : (
                                <Brain className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                            <span className={cn(
                                "text-[11px] font-semibold uppercase tracking-wider",
                                msg.role === "user"
                                    ? "text-blue-500"
                                    : dark ? "text-emerald-400" : "text-emerald-600"
                            )}>
                                {msg.role === "user" ? "Patient" : "PharmAI Agent"}
                            </span>
                            <span className={cn("text-[10px]", dark ? "text-slate-700" : "text-slate-300")}>
                                {timeAgo(msg.created_at)}
                            </span>

                            {/* Action badge for assistant */}
                            {msg.role === "assistant" && msg.action && (
                                <Badge variant="outline" className={cn(
                                    "text-[9px] capitalize ml-auto",
                                    msg.action === "clarify" ? "text-amber-500 border-amber-500/20" : "text-emerald-500 border-emerald-500/20"
                                )}>
                                    {msg.action}
                                </Badge>
                            )}
                        </div>

                        {/* Content */}
                        <p className={cn(
                            "text-sm leading-relaxed whitespace-pre-wrap",
                            dark ? "text-slate-300" : "text-slate-600"
                        )}>
                            {msg.content}
                        </p>

                        {/* Pipeline CoT — only for assistant messages with trace data */}
                        {msg.role === "assistant" && msg.pipeline_steps?.length > 0 && (
                            <div className={cn(
                                "mt-3 rounded-lg border p-3",
                                dark ? "bg-black/20 border-white/[0.04]" : "bg-slate-50/80 border-slate-100"
                            )}>
                                <div className="flex items-center gap-1.5 mb-2.5">
                                    <GitBranch className={cn("w-3 h-3", dark ? "text-emerald-400" : "text-emerald-600")} />
                                    <span className={cn("text-[10px] font-bold uppercase tracking-wider", dark ? "text-emerald-400/80" : "text-emerald-600/80")}>
                                        Chain of Thought
                                    </span>
                                    {msg.trace_id && (
                                        <span className={cn("text-[9px] font-mono ml-auto", dark ? "text-slate-700" : "text-slate-300")}>
                                            {msg.trace_id.substring(0, 12)}…
                                        </span>
                                    )}
                                </div>

                                {/* Pipeline Steps */}
                                <StepList steps={msg.pipeline_steps} dark={dark} />

                                {/* Summary row */}
                                <div className={cn(
                                    "flex items-center gap-4 mt-2.5 pt-2 border-t text-[10px]",
                                    dark ? "border-white/[0.04]" : "border-slate-100"
                                )}>
                                    {msg.confidence != null && (
                                        <span className={cn("font-medium", dark ? "text-slate-400" : "text-slate-500")}>
                                            Confidence: <strong className="text-emerald-500">{Math.round(msg.confidence * 100)}%</strong>
                                        </span>
                                    )}
                                    {msg.safety_decision && (
                                        <span className="flex items-center gap-1">
                                            <Shield className="w-3 h-3" />
                                            <Badge variant="outline" className={cn("text-[9px] capitalize", safetyColor(msg.safety_decision))}>
                                                {msg.safety_decision}
                                            </Badge>
                                        </span>
                                    )}
                                    {msg.pipeline_steps.length > 0 && (
                                        <span className={cn("font-mono", dark ? "text-slate-600" : "text-slate-400")}>
                                            {msg.pipeline_steps.reduce((acc: number, s: any) => acc + (s.duration_ms || 0), 0)}ms total
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

/* ── Main Component ──────────────────────────────────────────────── */
export default function AdminTrace() {
    const { theme } = useTheme();
    const [threads, setThreads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // Drill-down state
    const [selectedTrace, setSelectedTrace] = useState<any>(null);
    const [traceLoading, setTraceLoading] = useState(false);

    useEffect(() => {
        async function load() {
            try {
                const data = await getAdminThreads(100);
                setThreads(data);
            } catch (err) {
                console.error("Failed to load threads", err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const handleSelectThread = async (threadId: string) => {
        setTraceLoading(true);
        try {
            const trace = await getAdminThreadTrace(threadId);
            setSelectedTrace(trace);
        } catch (err) {
            console.error("Failed to load thread trace", err);
        } finally {
            setTraceLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-40">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
            </div>
        );
    }

    if (traceLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
                <span className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                    Loading Chain of Thought…
                </span>
            </div>
        );
    }

    if (selectedTrace) {
        return <TraceDetail trace={selectedTrace} theme={theme} onBack={() => setSelectedTrace(null)} />;
    }

    return (
        <ThreadList
            threads={threads}
            theme={theme}
            onSelect={handleSelectThread}
            search={search}
            setSearch={setSearch}
        />
    );
}
