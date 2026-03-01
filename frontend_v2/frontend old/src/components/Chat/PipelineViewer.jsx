/* PipelineViewer — LangGraph-style step-by-step agent visibility */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock, CheckCircle2, XCircle, SkipForward, ShieldAlert, Loader2 } from 'lucide-react';

const STATUS_CONFIG = {
    completed: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30', Icon: CheckCircle2, label: 'Done' },
    running: { color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30', Icon: Loader2, label: 'Running' },
    skipped: { color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', Icon: SkipForward, label: 'Skipped' },
    blocked: { color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30', Icon: ShieldAlert, label: 'Blocked' },
    error: { color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/30', Icon: XCircle, label: 'Error' },
    pending: { color: 'text-slate-600', bg: 'bg-slate-600/5', border: 'border-slate-600/10', Icon: Clock, label: 'Pending' },
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

    const renderOutput = () => {
        switch (stepId) {
            case 'medicine_search':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Searches" value={output.searches || 0} variant="info" />
                        {output.queries?.length > 0 && (
                            <OutputBadge label="Top query" value={output.queries[0]} />
                        )}
                    </div>
                );
            case 'pharmacist':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Action" value={output.action || 'chat'} variant="info" />
                        <OutputBadge
                            label="Confidence"
                            value={`${((output.confidence || 0) * 100).toFixed(0)}%`}
                            variant={output.confidence > 0.7 ? 'success' : 'warning'}
                        />
                        <OutputBadge label="Language" value={output.language || 'en'} />
                        <OutputBadge label="Tools" value={output.tool_calls || 0} />
                    </div>
                );
            case 'understanding':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Confidence" value={`${(output.confidence * 100).toFixed(0)}%`}
                            variant={output.confidence > 0.8 ? 'success' : output.confidence > 0.5 ? 'warning' : 'danger'} />
                        <OutputBadge label="Items" value={output.items_found || 0} variant="info" />
                        <OutputBadge label="Language" value={output.language || 'en'} />
                        {output.needs_clarification && <OutputBadge label="Status" value="Needs clarification" variant="warning" />}
                    </div>
                );
            case 'profiling':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="User" value={output.user_found ? 'Found' : 'New'} variant={output.user_found ? 'success' : 'info'} />
                        {output.chronic_conditions?.length > 0 && (
                            <OutputBadge label="Chronic" value={output.chronic_conditions.join(', ')} variant="warning" />
                        )}
                    </div>
                );
            case 'predictive':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Refill alerts" value={output.refill_alerts || 0}
                            variant={output.refill_alerts > 0 ? 'warning' : 'default'} />
                    </div>
                );
            case 'supervisor':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Action" value={output.action || 'unknown'}
                            variant={output.action === 'proceed' ? 'success' : output.action === 'clarify' ? 'warning' : 'danger'} />
                        <OutputBadge label="Confidence" value={`${((output.confidence || 0) * 100).toFixed(0)}%`}
                            variant={output.confidence > 0.7 ? 'success' : 'warning'} />
                        <OutputBadge label="Risk" value={output.risk_level || 'unknown'}
                            variant={output.risk_level === 'low' ? 'success' : output.risk_level === 'medium' ? 'warning' : 'danger'} />
                    </div>
                );
            case 'safety':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Decision" value={output.decision || 'allow'}
                            variant={output.decision === 'allow' ? 'success' : output.decision === 'soft_block' ? 'warning' : 'danger'} />
                        {output.blocked_count > 0 && <OutputBadge label="Blocked" value={output.blocked_count} variant="danger" />}
                    </div>
                );
            case 'inventory':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Available" value={output.available ? 'Yes' : 'No'}
                            variant={output.available ? 'success' : 'danger'} />
                        <OutputBadge label="Strategy" value={output.strategy || 'none'} variant="info" />
                    </div>
                );
            case 'execution':
                return (
                    <div className="flex flex-wrap gap-1.5">
                        <OutputBadge label="Success" value={output.success ? 'Yes' : 'No'}
                            variant={output.success ? 'success' : 'danger'} />
                        {output.order_id && <OutputBadge label="Order" value={output.order_id.slice(0, 8)} variant="info" />}
                        {output.razorpay_order_id && (
                            <OutputBadge label="Razorpay" value={output.razorpay_order_id.slice(0, 10)} variant="info" />
                        )}
                    </div>
                );
            default:
                if (output.reason) return <span className="text-xs text-slate-500 italic">{output.reason}</span>;
                return null;
        }
    };

    return <div className="mt-2">{renderOutput()}</div>;
}

function PipelineStep({ step, isLast, defaultOpen }) {
    const [open, setOpen] = useState(defaultOpen);
    const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
    const { Icon } = config;

    return (
        <div className="relative">
            {/* Connector line */}
            {!isLast && (
                <div className={`absolute left-[19px] top-[40px] bottom-0 w-px ${step.status === 'completed' ? 'bg-emerald-400/30' :
                        step.status === 'skipped' ? 'bg-slate-700/30' :
                            'bg-slate-700/50'
                    }`} />
            )}

            {/* Step card */}
            <div
                className={`relative flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/[0.03] ${step.status === 'skipped' ? 'opacity-40' : ''
                    }`}
                onClick={() => setOpen(!open)}
            >
                {/* Status icon circle */}
                <div className={`relative z-10 w-10 h-10 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center shrink-0`}>
                    <Icon size={16} className={`${config.color} ${step.status === 'running' ? 'animate-spin' : ''}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{step.icon}</span>
                        <h4 className={`text-sm font-semibold ${step.status === 'skipped' ? 'text-slate-600' : 'text-white'}`}>
                            {step.name}
                        </h4>
                        <span className={`text-[10px] uppercase tracking-wider font-bold ${config.color}`}>
                            {config.label}
                        </span>
                        {step.duration_ms > 0 && (
                            <span className="ml-auto text-[10px] text-slate-600 font-mono flex items-center gap-1">
                                <Clock size={9} />
                                {step.duration_ms}ms
                            </span>
                        )}
                        {open ? <ChevronDown size={14} className="text-slate-600 ml-auto" /> : <ChevronRight size={14} className="text-slate-600 ml-auto" />}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>

                    {/* Output details (expandable) */}
                    {open && <StepOutputDetails output={step.output} stepId={step.id} />}
                </div>
            </div>
        </div>
    );
}

export default function PipelineViewer({ steps, traceId }) {
    const [expanded, setExpanded] = useState(false);

    if (!steps || steps.length === 0) return null;

    const completedCount = steps.filter(s => s.status === 'completed').length;
    const totalRuntime = steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const hasBlock = steps.some(s => s.status === 'blocked');
    const hasError = steps.some(s => s.status === 'error');

    return (
        <div className="mt-3 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent overflow-hidden">
            {/* Header bar */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center">
                        <span className="text-xs">⚡</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-300">Agent Pipeline</span>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 ml-auto">
                    <span className="text-[10px] text-slate-500">{completedCount}/{steps.length} steps</span>
                    <span className="text-[10px] text-slate-500 font-mono">{totalRuntime}ms</span>
                    {hasBlock && <span className="text-[10px] text-red-400 font-bold">BLOCKED</span>}
                    {hasError && <span className="text-[10px] text-red-500 font-bold">ERROR</span>}

                    {/* Progress dots */}
                    <div className="flex gap-1">
                        {steps.map(s => (
                            <div
                                key={s.id}
                                className={`w-2 h-2 rounded-full ${s.status === 'completed' ? 'bg-emerald-400' :
                                        s.status === 'blocked' ? 'bg-red-400' :
                                            s.status === 'error' ? 'bg-red-500' :
                                                s.status === 'skipped' ? 'bg-slate-700' :
                                                    s.status === 'running' ? 'bg-blue-400 animate-pulse' :
                                                        'bg-slate-700'
                                    }`}
                                title={`${s.name}: ${s.status}`}
                            />
                        ))}
                    </div>

                    {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                </div>
            </button>

            {/* Expanded pipeline steps */}
            {expanded && (
                <div className="px-3 pb-4 border-t border-white/[0.04]">
                    <div className="pt-3">
                        {steps.map((step, i) => (
                            <PipelineStep
                                key={step.id}
                                step={step}
                                isLast={i === steps.length - 1}
                                defaultOpen={step.status === 'completed' || step.status === 'blocked'}
                            />
                        ))}
                    </div>
                    {traceId && (
                        <div className="mt-2 px-3 text-[10px] text-slate-600 font-mono">
                            trace: {traceId.slice(0, 12)}…
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
