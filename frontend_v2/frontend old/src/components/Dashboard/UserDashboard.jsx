/* UserDashboard - Profile, alerts, orders, medications, prescriptions, payments */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Camera,
    ChevronRight,
    Clock,
    CreditCard,
    Edit2,
    FileText,
    Package,
    Pill,
    RefreshCw,
    Save,
    Smartphone,
    TrendingUp,
    X,
    Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
    getMyDashboard,
    getMyProfile,
    updateMyProfile,
    uploadAvatar,
} from '../../services/api';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/api$/, '').replace(/\/$/, '');

function AvatarCircle({ profile, size = 'lg' }) {
    const dim = size === 'lg' ? 'w-24 h-24 text-3xl' : 'w-10 h-10 text-sm';
    if (profile?.avatar_url) {
        return (
            <img
                src={`${API_BASE}${profile.avatar_url}`}
                alt="avatar"
                className={`${dim} rounded-3xl object-cover shadow-xl border border-white/10`}
            />
        );
    }
    const initials = (profile?.name || 'U')
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    return (
        <div className={`${dim} rounded-3xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center font-bold text-white shadow-xl border border-white/10`}>
            {initials}
        </div>
    );
}

function UrgencyBadge({ days }) {
    if (days === null || days === undefined) return null;
    if (days <= 2) return <span className="bg-danger-500 text-white shadow-lg shadow-danger-500/30 text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-wider">{days}d left!</span>;
    if (days <= 5) return <span className="bg-warning-500 text-white shadow-lg shadow-warning-500/30 text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-wider">{days} days left</span>;
    return <span className="bg-surface-700 text-surface-200 shadow-md text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-wider">{days} days</span>;
}

function PaymentMethodIcon({ method }) {
    const m = (method || '').toLowerCase();
    if (m === 'upi') return <Smartphone size={16} className="text-green-400" />;
    if (m === 'card') return <CreditCard size={16} className="text-blue-400" />;
    if (m === 'netbanking') return <Zap size={16} className="text-yellow-400" />;
    return <CreditCard size={16} className="text-surface-400" />;
}

export default function UserDashboard() {
    const [dashboard, setDashboard] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const avatarInputRef = useRef(null);
    const navigate = useNavigate();

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [dash, prof] = await Promise.all([getMyDashboard(), getMyProfile()]);
            setDashboard(dash);
            setProfile(prof);
        } catch (err) {
            console.error('Dashboard load error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const startEdit = () => {
        setEditForm({
            name: profile?.name || '',
            phone: profile?.phone || '',
            gender: profile?.gender || '',
            age: profile?.age || '',
        });
        setEditing(true);
    };

    const saveEdit = async () => {
        setSaving(true);
        try {
            const payload = { ...editForm };
            if (payload.age) payload.age = parseInt(payload.age, 10);
            else delete payload.age;
            if (!payload.gender) delete payload.gender;
            await updateMyProfile(payload);
            await loadData();
            setEditing(false);
        } catch (err) {
            console.error('Profile update error:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarUploading(true);
        try {
            await uploadAvatar(file);
            await loadData();
        } catch (err) {
            console.error('Avatar upload error:', err);
        } finally {
            setAvatarUploading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
                <p className="text-surface-400 font-medium tracking-wide">Loading dashboard...</p>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'active_meds', label: 'Active Meds', icon: Pill },
        { id: 'orders', label: 'Orders', icon: Package },
        { id: 'payments', label: 'Payments', icon: CreditCard },
        { id: 'prescriptions', label: 'Prescriptions', icon: FileText },
    ];

    const stats = [
        { label: 'Total Orders', value: dashboard?.order_history?.length || 0, icon: Package, color: 'text-primary-400', bg: 'bg-primary-500/10' },
        { label: 'Active Alerts', value: dashboard?.active_alerts?.length || 0, icon: AlertTriangle, color: 'text-warning-400', bg: 'bg-warning-500/10' },
        { label: 'Active Meds', value: dashboard?.active_medicines?.length || 0, icon: Pill, color: 'text-accent-400', bg: 'bg-accent-500/10' },
        { label: 'Prescriptions', value: dashboard?.prescriptions?.length || 0, icon: FileText, color: 'text-primary-300', bg: 'bg-primary-300/10' },
    ];

    return (
        <div className="p-4 sm:p-8 space-y-8 overflow-y-auto h-full no-scrollbar">

            {/* Header / Profile Bento Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full"
            >
                <div className="glass-card p-6 sm:p-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 blur-[100px] pointer-events-none" />
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 relative z-10">
                        <div className="relative flex-shrink-0 group-hover:scale-105 transition-transform duration-500">
                            <AvatarCircle profile={profile} size="lg" />
                            <button
                                onClick={() => avatarInputRef.current?.click()}
                                disabled={avatarUploading}
                                className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-gradient-to-br from-primary-600 to-primary-500 hover:scale-110 shadow-lg shadow-primary-500/40 flex items-center justify-center transition-all"
                                title="Change photo"
                            >
                                {avatarUploading
                                    ? <RefreshCw size={14} className="animate-spin text-white" />
                                    : <Camera size={14} className="text-white" />}
                            </button>
                            <input
                                ref={avatarInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleAvatarChange}
                            />
                        </div>

                        <div className="flex-1 w-full text-center sm:text-left">
                            {editing ? (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4 max-w-md">
                                    <div className="grid grid-cols-2 gap-4">
                                        <input className="col-span-2 bg-surface-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50" placeholder="Full name"
                                            value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                                        <input className="bg-surface-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50" placeholder="Phone"
                                            value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                                        <input className="bg-surface-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50" type="number" placeholder="Age"
                                            value={editForm.age} onChange={(e) => setEditForm((f) => ({ ...f, age: e.target.value }))} />
                                        <select className="col-span-2 bg-surface-900/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                                            value={editForm.gender} onChange={(e) => setEditForm((f) => ({ ...f, gender: e.target.value }))}>
                                            <option value="">Gender (optional)</option>
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-center sm:justify-start gap-4">
                                        <button onClick={saveEdit} disabled={saving}
                                            className="btn-glow px-6 py-2.5 flex items-center gap-2">
                                            <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                        <button onClick={() => setEditing(false)}
                                            className="px-6 py-2.5 rounded-full bg-surface-800 hover:bg-surface-700 text-white transition-colors flex items-center gap-2">
                                            <X size={16} /> Cancel
                                        </button>
                                    </div>
                                </motion.div>
                            ) : (
                                <>
                                    <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">{profile?.name || 'Welcome Back'}</h1>
                                    <p className="text-surface-400 mb-4">{profile?.email}{profile?.phone ? ` • ${profile.phone}` : ''}</p>

                                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                                        {profile?.gender && (
                                            <span className="px-3 py-1 bg-surface-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/5">
                                                {profile.gender}
                                            </span>
                                        )}
                                        {profile?.age && (
                                            <span className="px-3 py-1 bg-surface-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/5">
                                                {profile.age} Years Old
                                            </span>
                                        )}
                                        {profile?.chronic_conditions?.length > 0 && profile.chronic_conditions.map((c, i) => (
                                            <span key={i} className="px-3 py-1 bg-accent-500/20 text-accent-400 rounded-lg text-xs font-bold uppercase tracking-wider border border-accent-500/20 shadow-lg shadow-accent-500/10">
                                                {c.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {!editing && (
                            <button onClick={startEdit} className="absolute top-0 right-0 sm:relative w-10 h-10 rounded-xl bg-surface-800 hover:bg-surface-700 flex flex-shrink-0 items-center justify-center text-surface-300 hover:text-white transition-all border border-white/5" title="Edit profile">
                                <Edit2 size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Floating Navigation Tabs */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar p-1">
                {tabs.map((tab) => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all whitespace-nowrap ${isActive ? 'text-white shadow-lg' : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                                }`}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="dashboard-tab"
                                    className="absolute inset-0 bg-surface-800 border border-white/10 rounded-2xl -z-10"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            <TabIcon size={16} className={isActive ? 'text-primary-400' : ''} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Contents */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Overview Tab (Bento Grid) */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {stats.map((stat, i) => {
                                    const StatIcon = stat.icon;
                                    return (
                                        <div key={i} className="glass-card hover:-translate-y-1 transition-transform duration-300 p-6 flex flex-col items-start gap-4">
                                            <div className={`w-12 h-12 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                                                <StatIcon size={24} />
                                            </div>
                                            <div>
                                                <p className="text-3xl font-extrabold text-white mb-1">{stat.value}</p>
                                                <p className="text-xs font-bold text-surface-400 uppercase tracking-widest">{stat.label}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {dashboard?.active_alerts?.length > 0 && (
                                    <div className="glass-card p-6 flex flex-col h-full">
                                        <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-warning-500/20 text-warning-400 flex items-center justify-center">
                                                <AlertTriangle size={16} />
                                            </div>
                                            Refill Alerts
                                        </h3>
                                        <div className="space-y-4 flex-1">
                                            {dashboard.active_alerts.map((alert, i) => (
                                                <div key={i} className="p-4 rounded-2xl bg-surface-800/40 border border-white/5 flex items-center justify-between group hover:bg-surface-800/80 transition-colors">
                                                    <div>
                                                        <p className="text-white font-bold">{alert.medicine_name}</p>
                                                        <p className="text-xs text-surface-400 mt-1 flex items-center gap-1.5">
                                                            <Clock size={12} className="text-warning-400" />
                                                            Run out est: {alert.estimated_run_out ? new Date(alert.estimated_run_out).toLocaleDateString('en-IN') : 'Unknown'}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <UrgencyBadge days={alert.days_until_run_out} />
                                                        <button onClick={() => navigate('/')} className="text-[10px] font-bold text-primary-400 uppercase tracking-wider flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            Order Now <ChevronRight size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {profile?.chronic_conditions?.length > 0 && (
                                    <div className="glass-card p-6 flex flex-col h-full">
                                        <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-accent-500/20 text-accent-400 flex items-center justify-center">
                                                <TrendingUp size={16} />
                                            </div>
                                            Health Profile Overview
                                        </h3>
                                        <div className="flex-1 bg-surface-900/30 rounded-2xl border border-white/5 p-6 flex flex-col items-center justify-center min-h-[200px] text-center">
                                            <div className="relative mb-6">
                                                <div className="w-20 h-20 rounded-full border-4 border-surface-800 border-t-accent-500 flex items-center justify-center">
                                                    <Activity size={32} className="text-accent-400" />
                                                </div>
                                                <div className="absolute top-0 left-0 w-20 h-20 rounded-full border-4 border-transparent border-t-accent-400 blur-sm animate-spin-slow" />
                                            </div>
                                            <h4 className="text-white font-bold mb-2">Tracking {profile.chronic_conditions.length} Conditions</h4>
                                            <div className="flex flex-wrap items-center justify-center gap-2">
                                                {profile.chronic_conditions.map((c, i) => (
                                                    <span key={i} className="text-xs text-surface-300 bg-surface-800 px-3 py-1 rounded-full uppercase tracking-wider font-semibold">
                                                        {c.replace(/_/g, ' ')}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Active Meds Tab */}
                    {activeTab === 'active_meds' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {!dashboard?.active_medicines?.length ? (
                                <div className="col-span-1 md:col-span-2 glass-card p-12 text-center rounded-3xl">
                                    <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4 border border-white/5">
                                        <Pill size={32} className="text-surface-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">No active medications</h3>
                                    <p className="text-surface-400 text-sm max-w-sm mx-auto">Consistently order medicines to build your refill prediction profile.</p>
                                </div>
                            ) : (
                                dashboard.active_medicines.map((med, i) => (
                                    <div key={i} className="glass-card hover:-translate-y-1 transition-transform p-6 flex flex-col justify-between min-h-[200px]">
                                        <div className="flex items-start justify-between mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-accent-500/20 text-accent-400 flex items-center justify-center">
                                                    <Pill size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-white font-bold text-lg">{med.medicine_name || `Med ${med.medicine_id?.slice(0, 6)}`}</p>
                                                    <p className="text-xs font-bold text-surface-500 uppercase tracking-widest mt-1">{med.order_count} Total Orders</p>
                                                </div>
                                            </div>
                                            <span className="px-3 py-1 rounded-full bg-surface-800 text-[10px] font-bold text-white uppercase tracking-wider border border-white/5">
                                                {med.pattern}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-surface-800/50 border border-white/5 text-center">
                                            <div>
                                                <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Interval</p>
                                                <p className="text-white font-bold text-lg">{med.avg_interval_days}d</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Confidence</p>
                                                <p className={`font-bold text-lg ${med.refill_confidence === 'high' ? 'text-accent-400'
                                                        : med.refill_confidence === 'medium' ? 'text-warning-400'
                                                            : 'text-surface-500'}`}>
                                                    {med.refill_confidence}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest mb-1">Next Refill</p>
                                                <p className="text-white font-bold text-sm leading-tight mt-1">
                                                    {med.next_refill_est ? new Date(med.next_refill_est).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Orders Tab */}
                    {activeTab === 'orders' && (
                        <div className="space-y-4">
                            {!dashboard?.order_history?.length ? (
                                <div className="glass-card p-12 text-center rounded-3xl">
                                    <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4 border border-white/5">
                                        <Package size={32} className="text-surface-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">No orders found</h3>
                                    <p className="text-surface-400 text-sm">You haven't placed any orders yet.</p>
                                </div>
                            ) : (
                                dashboard.order_history.map((order, i) => (
                                    <div key={i} className="glass-card hover:bg-surface-800/40 transition-colors p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="w-12 h-12 rounded-xl bg-primary-500/20 text-primary-400 flex flex-shrink-0 items-center justify-center hidden sm:flex">
                                                <Package size={24} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-sm font-bold text-white">Order #{order.order_id?.slice(0, 8)}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${['delivered', 'confirmed'].includes(order.status) ? 'bg-accent-500/20 text-accent-400'
                                                            : order.status === 'pending_payment' ? 'bg-warning-500/20 text-warning-400' : 'bg-surface-700 text-surface-300'}`}>
                                                        {order.status}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-surface-300 font-medium">
                                                    {(order.items || []).map(item => `${item.name} (x${item.quantity || item.billing_qty})`).join(', ')}
                                                </p>
                                                <p className="text-xs font-bold text-surface-500 mt-2 uppercase tracking-wide">
                                                    {order.order_date ? new Date(order.order_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-row md:flex-col items-center md:items-end justify-between border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
                                            <p className="text-2xl font-extrabold text-white">₹{order.total_amount?.toFixed(2)}</p>
                                            {order.payment_method && (
                                                <div className="flex items-center gap-1.5 mt-2 bg-surface-800 px-3 py-1.5 rounded-lg border border-white/5">
                                                    <PaymentMethodIcon method={order.payment_method} />
                                                    <span className="text-xs font-bold text-white uppercase">{order.payment_method}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Payments Tab */}
                    {activeTab === 'payments' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {!dashboard?.payment_history?.length ? (
                                <div className="col-span-1 md:col-span-2 glass-card p-12 text-center rounded-3xl">
                                    <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4 border border-white/5">
                                        <CreditCard size={32} className="text-surface-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">No payment history</h3>
                                </div>
                            ) : (
                                dashboard.payment_history.map((pay, i) => (
                                    <div key={i} className="glass-card hover:-translate-y-1 transition-transform p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-surface-800 border border-white/5 flex items-center justify-center">
                                                    <PaymentMethodIcon method={pay.payment_method} />
                                                </div>
                                                <div>
                                                    <p className="text-white font-bold capitalize">{pay.payment_method || 'Payment'}</p>
                                                    <p className="text-xs text-surface-400 font-medium">
                                                        {pay.date ? new Date(pay.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xl font-extrabold text-white">₹{pay.amount?.toFixed(2)}</p>
                                                <span className={`inline-block mt-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${['confirmed', 'delivered'].includes(pay.status) ? 'bg-accent-500/20 text-accent-400' : 'bg-surface-700 text-surface-300'}`}>
                                                    {pay.status}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="bg-surface-900/40 rounded-xl p-3 border border-white/5">
                                            <p className="text-xs text-surface-300">
                                                For: {(pay.items || []).slice(0, 3).map(i => i.name).join(', ')} {(pay.items?.length > 3) ? '...' : ''}
                                            </p>
                                            {pay.razorpay_payment_id && (
                                                <p className="text-[10px] font-mono font-semibold text-surface-500 mt-2 flex items-center gap-1">
                                                    TXN: {pay.razorpay_payment_id.slice(-10)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Prescriptions Tab */}
                    {activeTab === 'prescriptions' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {!dashboard?.prescriptions?.length ? (
                                <div className="col-span-full glass-card p-12 text-center rounded-3xl">
                                    <div className="w-16 h-16 rounded-2xl bg-surface-800 flex items-center justify-center mx-auto mb-4 border border-white/5">
                                        <FileText size={32} className="text-surface-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-2">No prescriptions uploaded</h3>
                                    <p className="text-surface-400 text-sm">Upload a prescription via Chat to verify medicines.</p>
                                </div>
                            ) : (
                                dashboard.prescriptions.map((rx, i) => (
                                    <div key={i} className="glass-card hover:-translate-y-1 transition-transform p-5 flex flex-col justify-between h-full">
                                        <div>
                                            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-lg bg-primary-500/20 text-primary-400 border border-primary-500/10 flex items-center justify-center">
                                                        <FileText size={16} />
                                                    </div>
                                                    <span className="text-sm font-bold text-white font-mono shrink-0">#{rx.prescription_id?.slice(0, 6)}</span>
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${rx.verified ? 'bg-accent-500/20 text-accent-400' : 'bg-warning-500/20 text-warning-400'}`}>
                                                    {rx.verified ? 'Verified' : 'Pending'}
                                                </span>
                                            </div>
                                            <div className="space-y-2 mb-4">
                                                {(rx.medicines || []).map((med, j) => (
                                                    <div key={j} className="flex items-start gap-2 text-sm text-white font-medium">
                                                        <Pill size={14} className="text-surface-500 flex-shrink-0 mt-0.5" />
                                                        <span>{med.name} <span className="text-surface-400 ml-1">{med.dosage || ''}</span></span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="bg-surface-800/50 rounded-lg p-3 grid grid-cols-2 gap-2 text-[10px] font-bold uppercase tracking-wider text-surface-500 border border-white/5">
                                            <div>
                                                <span className="block mb-1 text-surface-600">Uploaded</span>
                                                <span className="text-surface-300">{rx.upload_date ? new Date(rx.upload_date).toLocaleDateString('en-IN') : '—'}</span>
                                            </div>
                                            <div>
                                                <span className="block mb-1 text-surface-600">Expires</span>
                                                <span className={rx.verified ? 'text-surface-300' : 'text-danger-400'}>{rx.expiry_date ? new Date(rx.expiry_date).toLocaleDateString('en-IN') : '—'}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
