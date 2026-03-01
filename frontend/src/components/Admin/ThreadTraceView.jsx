/* ThreadTraceView — Conversation drill-down with per-message agent trace */
import { useState, useEffect } from 'react';
import {
    ArrowLeft, RefreshCw, Clock, ChevronDown, ChevronRight, Copy, ExternalLink,
    CheckCircle2, XCircle, SkipForward, ShieldAlert, Loader2, User, Bot
} from 'lucide-react';
import { getThreadTrace } from '../../services/api';

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
};

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
        case 'safety':
            return (
                <div className="flex flex-wrap gap-1.5 mt-1">
                    <OutputBadge label="Decision" value={output.decision || 'allow'}
                        variant={output.decision === 'allow' ? 'success' : output.decision === 'soft_block' ? 'warning' : 'danger'} />
                    {output.blocked_count > 0 && <OutputBadge label="Blocked" value={output.blocked_count} variant="danger" />}
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

function MessageTrace({ msg, langfuseHost }) {
    const [expanded, setExpanded] = useState(false);
    const isAssistant = msg.role === 'assistant';
    const hasTrace = isAssistant && msg.pipeline_steps?.length > 0;

    const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    const borderHighlight = msg.safety_decision === 'hard_block' ? 'border-l-red-500'
        : msg.safety_decision === 'soft_block' ? 'border-l-amber-500'
        : msg.action === 'clarify' ? 'border-l-amber-400'
        : isAssistant ? 'border-l-primary-500/30'
        : 'border-l-transparent';

    return (
        <div className={`border-l-2 ${borderHighlight} rounded-r-xl overflow-hidden`}>
            <div className={`px-4 py-3 ${isAssistant ? 'bg-surface-800/20' : ''}`}>
                {/* Message header */}
                <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        isAssistant ? 'bg-primary-500/20' : 'bg-slate-700/50'
                    }`}>
                        {isAssistant ? <Bot size={14} className="text-primary-400" /> : <User size={14} className="text-slate-400" />}
                    </div>
                    <span className="text-xs font-medium text-slate-300">{isAssistant ? 'PharmAI' : 'User'}</span>
                    <span className="text-[10px] text-slate-600">{time}</span>
                    {isAssistant && msg.action && (
                        <span className={`ml-auto px-2 py-0.5 rounded-md text-[10px] font-medium ${ACTION_COLORS[msg.action] || ACTION_COLORS.chat}`}>
                            {msg.action}
                        </span>
                    )}
                    {isAssistant && msg.confidence != null && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                            msg.confidence >= 0.7 ? 'bg-emerald-900/30 text-emerald-300' : 'bg-amber-900/30 text-amber-300'
                        }`}>
                            {(msg.confidence * 100).toFixed(0)}%
                        </span>
                    )}
                </div>

                {/* Message content */}
                <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                {/* Trace toggle */}
                {hasTrace && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="mt-2 flex items-center gap-1.5 text-[10px] text-primary-400/70 hover:text-primary-400 transition-colors"
                    >
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span className="font-medium">Agent Pipeline</span>
                        <span className="text-slate-600">
                            ({msg.pipeline_steps.filter(s => s.status === 'completed').length}/{msg.pipeline_steps.length} steps
                            {' '}&bull;{' '}
                            {msg.pipeline_steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0)}ms)
                        </span>
                    </button>
                )}

                {/* Expanded pipeline */}
                {expanded && hasTrace && (
                    <div className="mt-2 pl-2 border-l border-white/[0.04]">
                        {msg.pipeline_steps.map((step, i) => {
                            const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
                            const { Icon } = config;
                            return (
                                <div key={step.id || i} className="flex items-start gap-2.5 py-1.5">
                                    <div className={`w-6 h-6 rounded-md ${config.bg} border ${config.border} flex items-center justify-center shrink-0`}>
                                        <Icon size={12} className={config.color} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-white">{step.name}</span>
                                            <span className={`text-[9px] uppercase tracking-wider font-bold ${config.color}`}>{step.status}</span>
                                            {step.duration_ms > 0 && (
                                                <span className="ml-auto text-[10px] text-slate-600 font-mono">{step.duration_ms}ms</span>
                                            )}
                                        </div>
                                        <StepOutputDetails output={step.output} stepId={step.id} />
                                    </div>
                                </div>
                            );
                        })}
                        {/* Trace ID */}
                        {msg.trace_id && (
                            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-600 font-mono">
                                <span>trace: {msg.trace_id.slice(0, 16)}</span>
                                <button
                                    onClick={() => navigator.clipboard.writeText(msg.trace_id)}
                                    className="hover:text-slate-400 transition-colors"
                                    title="Copy trace ID"
                                >
                                    <Copy size={10} />
                                </button>
                                {langfuseHost && (
                                    <a href={`${langfuseHost}/trace/${msg.trace_id}`} target="_blank" rel="noopener noreferrer"
                                        className="hover:text-primary-400 transition-colors flex items-center gap-1">
                                        <ExternalLink size={10} /> LangFuse
                                    </a>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ThreadTraceView({ threadId, onBack, langfuseHost }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchKey, setFetchKey] = useState(threadId);

    // Reset loading when threadId changes
    if (fetchKey !== threadId) {
        setFetchKey(threadId);
        setLoading(true);
        setData(null);
    }

    useEffect(() => {
        if (!threadId) return;
        let cancelled = false;
        getThreadTrace(threadId)
            .then((res) => { if (!cancelled) setData(res); })
            .catch((err) => console.error('Failed to load thread trace:', err))
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [threadId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <RefreshCw className="w-6 h-6 text-primary-400 animate-spin" />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="glass-card p-8 text-center">
                <XCircle size={32} className="mx-auto text-red-400 mb-3" />
                <p className="text-surface-200/60">Thread not found</p>
                <button onClick={onBack} className="btn-ghost text-xs mt-3">Back to threads</button>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="btn-ghost p-2 rounded-xl">
                    <ArrowLeft size={16} />
                </button>
                <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white">{data.title}</h3>
                    <p className="text-xs text-slate-500">{data.user_name} &bull; {data.message_count} messages</p>
                </div>
            </div>

            {/* Messages */}
            <div className="space-y-1">
                {data.messages.map((msg) => (
                    <MessageTrace key={msg.message_id} msg={msg} langfuseHost={langfuseHost} />
                ))}
            </div>
        </div>
    );
}
