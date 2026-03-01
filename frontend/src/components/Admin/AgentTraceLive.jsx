/* AgentTraceLive — Real-time agent pipeline trace feed for admin observability */
import { useState, useEffect, useRef } from 'react';
import {
    RefreshCw, ChevronDown, ChevronRight, Clock, Copy, ExternalLink,
    CheckCircle2, XCircle, SkipForward, ShieldAlert, Loader2
} from 'lucide-react';
import { getLiveTraces } from '../../services/api';

const STATUS_CONFIG = {
    completed: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', Icon: CheckCircle2 },
    running: { color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30', Icon: Loader2 },
    skipped: { color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', Icon: SkipForward },
    blocked: { color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30', Icon: ShieldAlert },
    error: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', Icon: XCircle },
    pending: { color: 'text-slate-600', bg: 'bg-slate-600/5', border: 'border-slate-600/10', Icon: Clock },
};

const ACTION_COLORS = {
    chat: 'bg-slate-700/50 text-slate-300',
    recommend: 'bg-blue-900/30 text-blue-300',
    confirm_order: 'bg-emerald-900/30 text-emerald-300',
    proceed: 'bg-emerald-900/30 text-emerald-300',
    clarify: 'bg-amber-900/30 text-amber-300',
    reject: 'bg-red-900/30 text-red-300',
    negotiate: 'bg-violet-900/30 text-violet-300',
};

const SAFETY_COLORS = {
    allow: 'bg-emerald-900/30 text-emerald-300',
    soft_block: 'bg-amber-900/30 text-amber-300',
    hard_block: 'bg-red-900/30 text-red-300',
};

function timeAgo(ts) {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts).getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function OutputBadge({ label, value, variant = 'default' }) {
    const variants = {
        default: 'bg-slate-700/50 text-slate-300',
        success: 'bg-emerald-900/30 text-emerald-300',
        warning: 'bg-amber-900/30 text-amber-300',
        danger: 'bg-red-900/30 text-red-300',
        info: 'bg-blue-900/30 text-blue-300',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]}`}>
            <span className="text-slate-500">{label}:</span> {String(value)}
        </span>
    );
}

function StepOutputDetails({ output, stepId }) {
    if (!output || Object.keys(output).length === 0) return null;
    switch (stepId) {
        case 'medicine_search':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="Searches" value={output.searches || 0} variant="info" />
                    {output.queries?.length > 0 && <OutputBadge label="Top query" value={output.queries[0]} />}
                </div>
            );
        case 'pharmacist':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="Action" value={output.action || 'chat'} variant="info" />
                    <OutputBadge label="Confidence" value={`${((output.confidence || 0) * 100).toFixed(0)}%`}
                        variant={output.confidence > 0.7 ? 'success' : 'warning'} />
                    {output.language && <OutputBadge label="Lang" value={output.language} />}
                    <OutputBadge label="Tools" value={output.tool_calls || 0} />
                </div>
            );
        case 'profiling':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="User" value={output.user_found ? 'Found' : 'New'} variant={output.user_found ? 'success' : 'info'} />
                    {output.chronic_conditions?.length > 0 && <OutputBadge label="Chronic" value={output.chronic_conditions.join(', ')} variant="warning" />}
                </div>
            );
        case 'predictive':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="Refill alerts" value={output.refill_alerts || 0} variant={output.refill_alerts > 0 ? 'warning' : 'default'} />
                </div>
            );
        case 'safety':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="Decision" value={output.decision || 'allow'}
                        variant={output.decision === 'allow' ? 'success' : output.decision === 'soft_block' ? 'warning' : 'danger'} />
                    {output.blocked_count > 0 && <OutputBadge label="Blocked" value={output.blocked_count} variant="danger" />}
                    {output.reason && <OutputBadge label="Reason" value={output.reason} />}
                </div>
            );
        case 'inventory':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="Available" value={output.available ? 'Yes' : 'No'} variant={output.available ? 'success' : 'danger'} />
                    <OutputBadge label="Strategy" value={output.strategy || 'none'} variant="info" />
                </div>
            );
        case 'execution':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="Success" value={output.success ? 'Yes' : 'No'} variant={output.success ? 'success' : 'danger'} />
                    {output.order_id && <OutputBadge label="Order" value={output.order_id.slice(0, 8)} variant="info" />}
                </div>
            );
        default:
            if (output.reason) return <span className="text-xs text-slate-500 italic mt-1">{output.reason}</span>;
            return null;
    }
}

function PipelineChain({ steps }) {
    if (!steps || steps.length === 0) return null;

    return (
        <div className="mt-3 space-y-1">
            {steps.map((step, i) => {
                const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
                const { Icon } = config;
                return (
                    <div key={step.id || i} className="flex items-start gap-3 py-2 relative">
                        {/* Connector line */}
                        {i < steps.length - 1 && (
                            <div className={`absolute left-[15px] top-[32px] bottom-0 w-px ${
                                step.status === 'completed' ? 'bg-emerald-400/20' : 'bg-slate-700/30'
                            }`} />
                        )}
                        {/* Status icon */}
                        <div className={`relative z-10 w-8 h-8 rounded-lg ${config.bg} border ${config.border} flex items-center justify-center shrink-0`}>
                            <Icon size={14} className={config.color} />
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white">{step.name}</span>
                                <span className={`text-[10px] uppercase tracking-wider font-bold ${config.color}`}>
                                    {step.status}
                                </span>
                                {step.duration_ms > 0 && (
                                    <span className="ml-auto text-[10px] text-slate-600 font-mono flex items-center gap-1">
                                        <Clock size={9} />{step.duration_ms}ms
                                    </span>
                                )}
                            </div>
                            <StepOutputDetails output={step.output} stepId={step.id} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function TraceRow({ trace, langfuseHost }) {
    const [expanded, setExpanded] = useState(false);

    const borderColor = trace.safety_decision === 'hard_block' ? 'border-l-red-500'
        : trace.safety_decision === 'soft_block' ? 'border-l-amber-500'
        : trace.action === 'clarify' ? 'border-l-amber-400'
        : 'border-l-emerald-500/50';

    const copyTraceId = () => {
        navigator.clipboard.writeText(trace.trace_id);
    };

    return (
        <div className={`border-l-2 ${borderColor} bg-surface-800/30 rounded-r-xl overflow-hidden transition-all`}>
            {/* Summary row */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors text-left"
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 font-mono w-14 shrink-0">{timeAgo(trace.timestamp)}</span>
                    <span className="text-xs font-medium text-primary-300 w-20 shrink-0 truncate">{trace.user_name}</span>
                    <span className="text-xs text-slate-400 truncate flex-1">{trace.message_preview}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${ACTION_COLORS[trace.action] || ACTION_COLORS.chat}`}>
                        {trace.action}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                        trace.confidence >= 0.7 ? 'bg-emerald-900/30 text-emerald-300'
                        : trace.confidence >= 0.4 ? 'bg-amber-900/30 text-amber-300'
                        : 'bg-red-900/30 text-red-300'
                    }`}>
                        {(trace.confidence * 100).toFixed(0)}%
                    </span>
                    {trace.safety_decision && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${SAFETY_COLORS[trace.safety_decision] || SAFETY_COLORS.allow}`}>
                            {trace.safety_decision}
                        </span>
                    )}
                    <span className="text-[10px] text-slate-600 font-mono w-16 text-right">{trace.total_duration_ms}ms</span>
                    <span className="text-[10px] text-slate-600 w-10 text-right">{trace.step_summary}</span>
                    {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                </div>
            </button>

            {/* Expanded: pipeline chain */}
            {expanded && (
                <div className="px-4 pb-4 border-t border-white/[0.04]">
                    <PipelineChain steps={trace.pipeline_steps} />
                    {/* Trace ID footer */}
                    <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-600 font-mono">
                        <span>trace: {trace.trace_id?.slice(0, 16)}</span>
                        <button onClick={copyTraceId} className="hover:text-slate-400 transition-colors" title="Copy trace ID">
                            <Copy size={10} />
                        </button>
                        {langfuseHost && trace.trace_id && (
                            <a
                                href={`${langfuseHost}/trace/${trace.trace_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-primary-400 transition-colors flex items-center gap-1"
                            >
                                <ExternalLink size={10} /> LangFuse
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AgentTraceLive({ langfuseHost }) {
    const [traces, setTraces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const intervalRef = useRef(null);

    const loadTraces = async () => {
        try {
            const data = await getLiveTraces(50);
            setTraces(data);
        } catch (err) {
            console.error('Failed to load traces:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTraces();
    }, []);

    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(loadTraces, 10000);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-3 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">{traces.length} recent traces</span>
                    {autoRefresh && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                            autoRefresh ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
                        }`}
                    >
                        {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                    </button>
                    <button onClick={loadTraces} className="btn-ghost flex items-center gap-1 text-xs py-1 px-2">
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>
            </div>

            {/* Trace list */}
            {traces.length === 0 ? (
                <div className="glass-card p-8 text-center">
                    <Clock size={32} className="mx-auto text-slate-600 mb-3" />
                    <p className="text-surface-200/60">No pipeline traces yet. Traces will appear here as users interact with the chat.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {traces.map((trace, i) => (
                        <TraceRow key={trace.trace_id || i} trace={trace} langfuseHost={langfuseHost} />
                    ))}
                </div>
            )}
        </div>
    );
}
