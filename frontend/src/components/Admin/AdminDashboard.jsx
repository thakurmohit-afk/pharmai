/* AdminDashboard — Agent Traces, Conversations, System Health, Alerts, Inventory, Rx Queue */
import { useState, useEffect } from 'react';
import {
    AlertTriangle, Package, Shield, FileText, RefreshCw,
    Plus, CheckCircle, XCircle, BarChart3, Activity, MessageSquare
} from 'lucide-react';
import {
    getAdminAlerts, getInventory, restockMedicine, getPrescriptionQueue,
    getAdminThreads, getAdminHealth, getLangfuseConfig
} from '../../services/api';
import AgentTraceLive from './AgentTraceLive';
import ThreadTraceView from './ThreadTraceView';

export default function AdminDashboard() {
    const [alerts, setAlerts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [prescriptions, setPrescriptions] = useState([]);
    const [threads, setThreads] = useState([]);
    const [health, setHealth] = useState(null);
    const [langfuseHost, setLangfuseHost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('traces');
    const [restockId, setRestockId] = useState(null);
    const [restockQty, setRestockQty] = useState('');
    const [selectedThreadId, setSelectedThreadId] = useState(null);

    useEffect(() => { loadAll(); loadLangfuse(); }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [a, inv, rx, th, h] = await Promise.all([
                getAdminAlerts(), getInventory(), getPrescriptionQueue(),
                getAdminThreads(), getAdminHealth(),
            ]);
            setAlerts(a); setInventory(inv); setPrescriptions(rx);
            setThreads(th); setHealth(h);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const loadLangfuse = async () => {
        try {
            const cfg = await getLangfuseConfig();
            if (cfg?.host) setLangfuseHost(cfg.host);
        } catch { /* no langfuse */ }
    };

    const handleRestock = async (medId) => {
        const qty = parseInt(restockQty);
        if (!qty || qty <= 0) return;
        try {
            await restockMedicine(medId, qty);
            setRestockId(null);
            setRestockQty('');
            loadAll();
        } catch (err) { console.error(err); }
    };

    const tabs = [
        { id: 'traces', label: 'Agent Traces', icon: Activity },
        { id: 'conversations', label: 'Conversations', icon: MessageSquare, count: threads.length },
        { id: 'health', label: 'System Health', icon: BarChart3 },
        { id: 'alerts', label: 'Refill Alerts', icon: AlertTriangle, count: alerts.length },
        { id: 'inventory', label: 'Inventory', icon: Package, count: inventory.filter(i => i.status !== 'ok').length },
        { id: 'prescriptions', label: 'Rx Queue', icon: FileText, count: prescriptions.length },
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-8 h-8 text-primary-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 overflow-y-auto h-full animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Shield size={24} className="text-primary-400" /> Admin Console
                    </h1>
                    <p className="text-surface-200/50 text-sm mt-1">Agent observability, traceability, and operations</p>
                </div>
                <button onClick={loadAll} className="btn-ghost flex items-center gap-2 text-sm">
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-surface-700/50 pb-0 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => {
                    const TabIcon = tab.icon;
                    return (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setSelectedThreadId(null); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-surface-800/60 text-primary-400 border border-b-0 border-primary-500/20'
                                : 'text-surface-200/40 hover:text-surface-200/70'
                            }`}
                    >
                        <TabIcon size={15} /> {tab.label}
                        {tab.count > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-danger-500/20 text-danger-400 font-bold">
                                {tab.count}
                            </span>
                        )}
                    </button>
                    );
                })}
            </div>

            {/* ── Agent Traces tab (PRIMARY) ────────────────────────────────── */}
            {activeTab === 'traces' && (
                <AgentTraceLive langfuseHost={langfuseHost} />
            )}

            {/* ── Conversations tab ─────────────────────────────────────────── */}
            {activeTab === 'conversations' && (
                <div className="animate-fade-in">
                    {selectedThreadId ? (
                        <ThreadTraceView
                            threadId={selectedThreadId}
                            onBack={() => setSelectedThreadId(null)}
                            langfuseHost={langfuseHost}
                        />
                    ) : (
                        <div className="space-y-3">
                            {threads.length === 0 ? (
                                <div className="glass-card p-8 text-center">
                                    <MessageSquare size={32} className="mx-auto text-slate-600 mb-3" />
                                    <p className="text-surface-200/60">No conversations yet</p>
                                </div>
                            ) : (
                                <div className="glass-card overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-surface-700/50 text-surface-200/40 text-left">
                                                <th className="p-3">User</th>
                                                <th className="p-3">Title</th>
                                                <th className="p-3">Messages</th>
                                                <th className="p-3">Last Action</th>
                                                <th className="p-3">Updated</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {threads.map((t) => (
                                                <tr
                                                    key={t.thread_id}
                                                    onClick={() => setSelectedThreadId(t.thread_id)}
                                                    className="border-b border-surface-700/20 hover:bg-surface-800/30 transition-colors cursor-pointer"
                                                >
                                                    <td className="p-3">
                                                        <div>
                                                            <p className="text-white text-xs font-medium">{t.user_name}</p>
                                                            <p className="text-[10px] text-slate-600">{t.user_email}</p>
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <p className="text-surface-200/70 text-xs truncate max-w-[200px]">{t.title}</p>
                                                        {t.last_message_preview && (
                                                            <p className="text-[10px] text-slate-600 truncate max-w-[200px]">{t.last_message_preview}</p>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-surface-200/50 text-xs">{t.message_count}</td>
                                                    <td className="p-3">
                                                        {t.last_action && (
                                                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-700/50 text-slate-300">
                                                                {t.last_action}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-[10px] text-slate-600 font-mono">
                                                        {t.updated_at ? new Date(t.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── System Health tab (real data) ─────────────────────────────── */}
            {activeTab === 'health' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            {
                                label: 'Avg Confidence',
                                value: health ? `${(health.avg_confidence * 100).toFixed(0)}%` : '—',
                                sub: `${health?.total_traces || 0} traces analyzed`,
                                color: 'text-accent-400',
                            },
                            {
                                label: 'Clarification Rate',
                                value: health ? `${(health.clarification_rate * 100).toFixed(1)}%` : '—',
                                sub: 'Questions asked',
                                color: 'text-warning-400',
                            },
                            {
                                label: 'Error Rate',
                                value: health ? `${(health.error_rate * 100).toFixed(1)}%` : '—',
                                sub: 'Failed pipelines',
                                color: 'text-danger-400',
                            },
                            {
                                label: 'Safety Block Rate',
                                value: health ? `${(health.blocked_rate * 100).toFixed(1)}%` : '—',
                                sub: 'Orders flagged',
                                color: health?.blocked_rate > 0.1 ? 'text-danger-400' : 'text-accent-400',
                            },
                        ].map(({ label, value, sub, color }, i) => (
                            <div key={i} className="glass-card p-5 text-center">
                                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                                <p className="text-sm text-white mt-1">{label}</p>
                                <p className="text-xs text-surface-200/40 mt-1">{sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Overview counts */}
                    {health?.overview && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'Orders Today', value: health.overview.orders_today },
                                { label: 'Total Orders', value: health.overview.total_orders },
                                { label: 'Active Alerts', value: health.overview.active_alerts },
                                { label: 'Active Users', value: health.overview.active_users },
                            ].map(({ label, value }, i) => (
                                <div key={i} className="glass-card p-3 text-center">
                                    <p className="text-xl font-bold text-white">{value}</p>
                                    <p className="text-[10px] text-surface-200/40 mt-1">{label}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Agent Performance Table */}
                    <div className="glass-card p-5">
                        <h3 className="text-sm font-semibold text-surface-200/60 mb-4">Agent Pipeline Performance</h3>
                        {health?.agent_stats?.length > 0 ? (
                            <div className="space-y-3">
                                {health.agent_stats.map((agent, i) => (
                                    <div key={i} className="flex items-center justify-between py-2 border-b border-surface-700/20 last:border-0">
                                        <span className="text-white text-sm">{agent.name}</span>
                                        <div className="flex items-center gap-6 text-xs">
                                            <span className="text-surface-200/50">
                                                Latency: <span className="text-primary-300">{agent.avg_latency_ms}ms</span>
                                            </span>
                                            <span className="text-surface-200/50">
                                                Success: <span className={agent.success_rate >= 0.9 ? 'text-accent-400' : 'text-warning-400'}>
                                                    {(agent.success_rate * 100).toFixed(0)}%
                                                </span>
                                            </span>
                                            <span className="text-surface-200/50">
                                                Runs: <span className="text-slate-400">{agent.total_runs}</span>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-surface-200/40">No agent performance data yet. Traces will be analyzed as users interact.</p>
                        )}
                    </div>
                </div>
            )}

            {/* ── Alerts tab ──────────────────────────────────────────────── */}
            {activeTab === 'alerts' && (
                <div className="space-y-3 animate-fade-in">
                    {alerts.length === 0 ? (
                        <div className="glass-card p-8 text-center">
                            <CheckCircle size={32} className="mx-auto text-accent-400 mb-3" />
                            <p className="text-surface-200/60">No active alerts</p>
                        </div>
                    ) : (
                        <div className="glass-card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-surface-700/50 text-surface-200/40 text-left">
                                        <th className="p-3">Patient</th>
                                        <th className="p-3">Medicine</th>
                                        <th className="p-3">Runs Out</th>
                                        <th className="p-3">Confidence</th>
                                        <th className="p-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {alerts.map((a, i) => (
                                        <tr key={i} className="border-b border-surface-700/20 hover:bg-surface-800/30 transition-colors">
                                            <td className="p-3 text-white">{a.user_name}</td>
                                            <td className="p-3 text-surface-200/70">{a.medicine_name}</td>
                                            <td className="p-3 text-surface-200/70">
                                                {a.estimated_run_out ? new Date(a.estimated_run_out).toLocaleDateString() : '—'}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${a.confidence >= 0.8 ? 'badge-ok' : a.confidence >= 0.5 ? 'badge-low' : 'badge-pending'
                                                    }`}>
                                                    {(a.confidence * 100).toFixed(0)}%
                                                </span>
                                            </td>
                                            <td className="p-3">
                                                <span className="badge-pending px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                                    {a.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Inventory tab ───────────────────────────────────────────── */}
            {activeTab === 'inventory' && (
                <div className="space-y-3 animate-fade-in">
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        {['ok', 'low', 'critical'].map((status) => {
                            const count = inventory.filter((i) => i.status === status).length;
                            const colors = { ok: 'text-accent-400', low: 'text-warning-400', critical: 'text-danger-400' };
                            return (
                                <div key={status} className="glass-card p-4 text-center">
                                    <p className={`text-2xl font-bold ${colors[status]}`}>{count}</p>
                                    <p className="text-xs text-surface-200/40 mt-1 capitalize">{status}</p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="glass-card overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-surface-700/50 text-surface-200/40 text-left">
                                    <th className="p-3">Medicine</th>
                                    <th className="p-3">Stock</th>
                                    <th className="p-3">Threshold</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventory.map((item, i) => (
                                    <tr key={i} className="border-b border-surface-700/20 hover:bg-surface-800/30 transition-colors">
                                        <td className="p-3 text-white">{item.medicine_name}</td>
                                        <td className="p-3 text-surface-200/70">{item.stock_quantity} {item.unit_type}</td>
                                        <td className="p-3 text-surface-200/50">{item.min_stock_threshold}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold badge-${item.status}`}>
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            {restockId === item.medicine_id ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={restockQty}
                                                        onChange={(e) => setRestockQty(e.target.value)}
                                                        className="input-dark w-20 text-xs py-1 px-2"
                                                        placeholder="Qty"
                                                        min="1"
                                                    />
                                                    <button onClick={() => handleRestock(item.medicine_id)} className="btn-primary text-xs py-1 px-3">
                                                        <Plus size={12} />
                                                    </button>
                                                    <button onClick={() => setRestockId(null)} className="text-surface-200/40 hover:text-danger-400">
                                                        <XCircle size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => { setRestockId(item.medicine_id); setRestockQty(''); }}
                                                    className="btn-ghost text-xs py-1 px-3"
                                                >
                                                    Restock
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Rx Queue tab ────────────────────────────────────────────── */}
            {activeTab === 'prescriptions' && (
                <div className="space-y-3 animate-fade-in">
                    {prescriptions.length === 0 ? (
                        <div className="glass-card p-8 text-center">
                            <CheckCircle size={32} className="mx-auto text-accent-400 mb-3" />
                            <p className="text-surface-200/60">No prescriptions pending review</p>
                        </div>
                    ) : (
                        prescriptions.map((rx, i) => (
                            <div key={i} className="glass-card glass-card-hover p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <p className="text-white font-medium">{rx.user_name}</p>
                                        <p className="text-xs text-surface-200/40 font-mono">#{rx.prescription_id?.slice(0, 8)}</p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${rx.confidence >= 0.8 ? 'badge-ok' : rx.confidence >= 0.5 ? 'badge-low' : 'badge-critical'
                                        }`}>
                                        OCR: {(rx.confidence * 100).toFixed(0)}%
                                    </span>
                                </div>
                                <div className="text-sm text-surface-200/70 space-y-1">
                                    {rx.extracted_data?.medicines?.map((m, j) => (
                                        <div key={j} className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary-400/50" />
                                            <span>{m.name} {m.dosage || ''} — {m.frequency || ''}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    <button className="btn-primary text-xs py-1.5 flex-1 flex items-center justify-center gap-1">
                                        <CheckCircle size={12} /> Approve
                                    </button>
                                    <button className="btn-ghost text-xs py-1.5 flex-1 flex items-center justify-center gap-1 text-danger-400 border-danger-500/20 hover:bg-danger-500/10">
                                        <XCircle size={12} /> Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
