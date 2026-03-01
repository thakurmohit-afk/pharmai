/* AdminDashboard — Alerts, Inventory, System Health, Prescription Queue */
import { useState, useEffect } from 'react';
import {
    AlertTriangle, Package, Shield, FileText, RefreshCw,
    Plus, CheckCircle, XCircle, BarChart3
} from 'lucide-react';
import { getAdminAlerts, getInventory, restockMedicine, getPrescriptionQueue } from '../../services/api';

export default function AdminDashboard() {
    const [alerts, setAlerts] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [prescriptions, setPrescriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('alerts');
    const [restockId, setRestockId] = useState(null);
    const [restockQty, setRestockQty] = useState('');

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [a, inv, rx] = await Promise.all([
                getAdminAlerts(), getInventory(), getPrescriptionQueue()
            ]);
            setAlerts(a); setInventory(inv); setPrescriptions(rx);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
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
        { id: 'alerts', label: 'Refill Alerts', icon: AlertTriangle, count: alerts.length },
        { id: 'inventory', label: 'Inventory', icon: Package, count: inventory.filter(i => i.status !== 'ok').length },
        { id: 'prescriptions', label: 'Rx Queue', icon: FileText, count: prescriptions.length },
        { id: 'health', label: 'System Health', icon: BarChart3 },
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
                    <p className="text-surface-200/50 text-sm mt-1">Monitor agents, inventory, and alerts</p>
                </div>
                <button onClick={loadAll} className="btn-ghost flex items-center gap-2 text-sm">
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-surface-700/50 pb-0">
                {tabs.map((tab) => {
                    const TabIcon = tab.icon;
                    return (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all ${activeTab === tab.id
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

            {/* ── System Health tab ───────────────────────────────────────── */}
            {activeTab === 'health' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { label: 'Avg Confidence', value: '0.82', sub: 'Across all agents', color: 'text-accent-400' },
                            { label: 'Clarification Rate', value: '14%', sub: 'Questions asked', color: 'text-warning-400' },
                            { label: 'Error Rate', value: '2.1%', sub: 'Failed pipelines', color: 'text-danger-400' },
                        ].map(({ label, value, sub, color }, i) => (
                            <div key={i} className="glass-card p-5 text-center">
                                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                                <p className="text-sm text-white mt-1">{label}</p>
                                <p className="text-xs text-surface-200/40 mt-1">{sub}</p>
                            </div>
                        ))}
                    </div>
                    <div className="glass-card p-5">
                        <h3 className="text-sm font-semibold text-surface-200/60 mb-4">Agent Pipeline Performance</h3>
                        <div className="space-y-3">
                            {[
                                { name: 'Understanding', latency: '420ms', accuracy: '89%' },
                                { name: 'Profiling', latency: '85ms', accuracy: '95%' },
                                { name: 'Safety', latency: '120ms', accuracy: '99%' },
                                { name: 'Inventory', latency: '65ms', accuracy: '97%' },
                                { name: 'Supervisor', latency: '380ms', accuracy: '91%' },
                                { name: 'Execution', latency: '250ms', accuracy: '98%' },
                            ].map(({ name, latency, accuracy }, i) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-surface-700/20 last:border-0">
                                    <span className="text-white text-sm">{name}</span>
                                    <div className="flex items-center gap-6 text-xs">
                                        <span className="text-surface-200/50">Latency: <span className="text-primary-300">{latency}</span></span>
                                        <span className="text-surface-200/50">Accuracy: <span className="text-accent-400">{accuracy}</span></span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
