/* UserDashboard — Premium bento-grid pharmacy dashboard */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    Camera,
    ChevronRight,
    Clock,
    CreditCard,
    Edit2,
    FileText,
    HeartPulse,
    IndianRupee,
    Package,
    Pill,
    RefreshCw,
    Save,
    ShieldCheck,
    Smartphone,
    Target,
    TrendingUp,
    Utensils,
    Wine,
    Moon,
    X,
    Zap,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import {
    getMyDashboard,
    getMyProfile,
    updateMyProfile,
    uploadAvatar,
} from '../../services/api';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/api$/, '').replace(/\/$/, '');

/* ───────── Utility components ───────── */

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
    if (days <= 5) return <span className="bg-warning-500 text-white shadow-lg shadow-warning-500/30 text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-wider">{days} days</span>;
    return <span className="bg-surface-700 text-surface-200 shadow-md text-[10px] uppercase font-bold px-2 py-1 rounded-full tracking-wider">{days} days</span>;
}

function PaymentMethodIcon({ method }) {
    const m = (method || '').toLowerCase();
    if (m === 'upi') return <Smartphone size={16} className="text-green-400" />;
    if (m === 'card') return <CreditCard size={16} className="text-blue-400" />;
    if (m === 'netbanking') return <Zap size={16} className="text-yellow-400" />;
    return <CreditCard size={16} className="text-surface-400" />;
}

function CircularProgress({ value, size = 80, stroke = 6, color = '#a78bfa' }) {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    return (
        <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none" />
            <circle
                cx={size / 2} cy={size / 2} r={radius}
                stroke={color} strokeWidth={stroke} fill="none"
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
            />
        </svg>
    );
}

function CountdownBar({ days, maxDays = 30 }) {
    const pct = Math.min(100, Math.max(4, ((maxDays - (days || 0)) / maxDays) * 100));
    const color = days <= 2 ? 'bg-danger-500' : days <= 5 ? 'bg-warning-500' : 'bg-accent-500';
    return (
        <div className="w-full h-1.5 rounded-full bg-surface-800 overflow-hidden">
            <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
    );
}

function SpendingBar({ amount, maxAmount, month }) {
    const pct = maxAmount > 0 ? Math.max(6, (amount / maxAmount) * 100) : 6;
    return (
        <div className="flex flex-col items-center gap-2 flex-1">
            <div className="w-full h-32 flex items-end">
                <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-primary-600 to-primary-400 transition-all duration-700 hover:from-primary-500 hover:to-primary-300 cursor-default relative group"
                    style={{ height: `${pct}%` }}
                >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg bg-surface-800 border border-white/10 text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                        ₹{amount}
                    </div>
                </div>
            </div>
            <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">{month}</span>
        </div>
    );
}

/* ───────── Stagger animation config ───────── */
const stagger = {
    container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
    item: { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } },
};

/* ───────── Main component ───────── */

export default function UserDashboard() {
    const [dashboard, setDashboard] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const avatarInputRef = useRef(null);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Section refs for deep-linking
    const medicinesRef = useRef(null);
    const ordersRef = useRef(null);
    const healthRef = useRef(null);
    const sectionRefs = useMemo(() => ({
        medicines: medicinesRef,
        orders: ordersRef,
        health: healthRef,
    }), []);

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

    // Deep-link scroll
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && sectionRefs[tab]?.current && !loading) {
            setTimeout(() => {
                sectionRefs[tab].current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }
    }, [searchParams, loading, sectionRefs]);

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

    /* ── Derived data ── */
    const totalSpent = useMemo(() => {
        if (!dashboard?.payment_history) return 0;
        return dashboard.payment_history.reduce((sum, p) => sum + (p.amount || 0), 0);
    }, [dashboard]);

    const adherenceScore = useMemo(() => {
        const meds = dashboard?.active_medicines || [];
        if (!meds.length) return null;
        const high = meds.filter(m => m.refill_confidence === 'high').length;
        return Math.round((high / meds.length) * 100);
    }, [dashboard]);

    const spendingByMonth = useMemo(() => {
        if (!dashboard?.order_history) return [];
        const months = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = d.toLocaleDateString('en-IN', { month: 'short' });
            months[key] = 0;
        }
        for (const order of dashboard.order_history) {
            if (!order.order_date) continue;
            const d = new Date(order.order_date);
            const key = d.toLocaleDateString('en-IN', { month: 'short' });
            if (key in months) months[key] += (order.total_amount || 0);
        }
        return Object.entries(months).map(([month, amount]) => ({ month, amount: Math.round(amount) }));
    }, [dashboard]);

    const maxSpending = useMemo(() => Math.max(...spendingByMonth.map(s => s.amount), 1), [spendingByMonth]);

    const medicalFacts = useMemo(() => {
        return profile?.medical_facts || [];
    }, [profile]);

    const allergies = useMemo(() => {
        return medicalFacts.filter(f => (f.fact_type || '').toLowerCase() === 'allergy');
    }, [medicalFacts]);

    const otherFacts = useMemo(() => {
        return medicalFacts.filter(f => (f.fact_type || '').toLowerCase() !== 'allergy');
    }, [medicalFacts]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-12 h-12 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin" />
                <p className="text-surface-400 font-medium tracking-wide">Loading dashboard...</p>
            </div>
        );
    }

    const stats = [
        { label: 'Total Spent', value: `₹${totalSpent.toLocaleString('en-IN')}`, icon: IndianRupee, color: 'text-violet-400', bg: 'bg-violet-500/10', glow: 'shadow-violet-500/20' },
        { label: 'Total Orders', value: dashboard?.order_history?.length || 0, icon: Package, color: 'text-blue-400', bg: 'bg-blue-500/10', glow: 'shadow-blue-500/20' },
        { label: 'Active Meds', value: dashboard?.active_medicines?.length || 0, icon: Pill, color: 'text-emerald-400', bg: 'bg-emerald-500/10', glow: 'shadow-emerald-500/20' },
        { label: 'Active Alerts', value: dashboard?.active_alerts?.length || 0, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', glow: 'shadow-amber-500/20' },
        { label: 'Prescriptions', value: dashboard?.prescriptions?.length || 0, icon: FileText, color: 'text-cyan-400', bg: 'bg-cyan-500/10', glow: 'shadow-cyan-500/20' },
    ];

    return (
        <div className="p-4 sm:p-8 space-y-6 overflow-y-auto h-full no-scrollbar">
            <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">

                {/* ═══════════ ROW 1: PROFILE HERO ═══════════ */}
                <motion.div variants={stagger.item}>
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
                                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
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
                                            <button onClick={saveEdit} disabled={saving} className="btn-glow px-6 py-2.5 flex items-center gap-2">
                                                <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                                            </button>
                                            <button onClick={() => setEditing(false)} className="px-6 py-2.5 rounded-full bg-surface-800 hover:bg-surface-700 text-white transition-colors flex items-center gap-2">
                                                <X size={16} /> Cancel
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <>
                                        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">{profile?.name || 'Welcome Back'}</h1>
                                        <p className="text-surface-400 mb-4">{profile?.email}{profile?.phone ? ` • ${profile.phone}` : ''}</p>
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                                            {profile?.gender && (
                                                <span className="px-3 py-1 bg-surface-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/5">
                                                    {profile.gender}
                                                </span>
                                            )}
                                            {profile?.age && (
                                                <span className="px-3 py-1 bg-surface-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-white/5">
                                                    {profile.age} yrs
                                                </span>
                                            )}
                                            {profile?.chronic_conditions?.map((c, i) => (
                                                <span key={i} className="px-3 py-1 bg-accent-500/20 text-accent-400 rounded-lg text-xs font-bold uppercase tracking-wider border border-accent-500/20 shadow-lg shadow-accent-500/10">
                                                    {c.replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                            {allergies.map((a, i) => (
                                                <span key={`a${i}`} className="px-3 py-1 bg-danger-500/20 text-danger-400 rounded-lg text-xs font-bold uppercase tracking-wider border border-danger-500/20">
                                                    ⚠️ {a.value || a.fact_type}
                                                </span>
                                            ))}
                                            {otherFacts.map((f, i) => (
                                                <span key={`f${i}`} className="px-3 py-1 bg-warning-500/15 text-warning-400 rounded-lg text-xs font-bold uppercase tracking-wider border border-warning-500/20">
                                                    {f.value || f.fact_type}
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

                {/* ═══════════ ROW 2: STAT CARDS ═══════════ */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {stats.map((stat, i) => {
                        const StatIcon = stat.icon;
                        return (
                            <motion.div key={i} variants={stagger.item} className={`glass-card hover:-translate-y-1 transition-transform duration-300 p-5 flex flex-col items-start gap-3 shadow-lg ${stat.glow}`}>
                                <div className={`w-11 h-11 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                                    <StatIcon size={22} />
                                </div>
                                <div>
                                    <p className="text-2xl font-extrabold text-white mb-0.5">{stat.value}</p>
                                    <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">{stat.label}</p>
                                </div>
                            </motion.div>
                        );
                    })}
                    {/* Adherence Score — special card with ring */}
                    <motion.div variants={stagger.item} className="glass-card hover:-translate-y-1 transition-transform duration-300 p-5 flex flex-col items-center justify-center gap-2 shadow-lg shadow-purple-500/10 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 pointer-events-none" />
                        <div className="relative">
                            <CircularProgress value={adherenceScore ?? 0} size={64} stroke={5} color={adherenceScore >= 75 ? '#34d399' : adherenceScore >= 50 ? '#fbbf24' : '#f87171'} />
                            <span className="absolute inset-0 flex items-center justify-center text-lg font-extrabold text-white">
                                {adherenceScore !== null ? `${adherenceScore}%` : '—'}
                            </span>
                        </div>
                        <p className="text-[10px] font-bold text-surface-400 uppercase tracking-widest">Adherence</p>
                    </motion.div>
                </div>

                {/* ═══════════ ROW 3: REFILL + HEALTH ═══════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Refill Predictions */}
                    <motion.div variants={stagger.item} ref={sectionRefs.medicines} className="glass-card p-6 flex flex-col">
                        <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-warning-500/20 text-warning-400 flex items-center justify-center">
                                <AlertTriangle size={16} />
                            </div>
                            Refill Predictions
                        </h3>
                        {!dashboard?.active_alerts?.length && !dashboard?.active_medicines?.length ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                                <Pill size={32} className="text-surface-600 mb-3" />
                                <p className="text-surface-400 text-sm">No active medicines tracked yet.</p>
                                <p className="text-surface-500 text-xs mt-1">Order medicines regularly to build your refill profile.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 flex-1">
                                {(dashboard?.active_alerts || []).map((alert, i) => (
                                    <div key={`alert-${i}`} className="p-4 rounded-2xl bg-surface-800/40 border border-white/5 hover:bg-surface-800/70 transition-colors">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-white font-bold text-sm">{alert.medicine_name}</p>
                                            <UrgencyBadge days={alert.days_until_run_out} />
                                        </div>
                                        <CountdownBar days={alert.days_until_run_out} />
                                        <div className="flex items-center justify-between mt-2">
                                            <p className="text-[10px] text-surface-500 flex items-center gap-1">
                                                <Clock size={10} /> Runs out {alert.estimated_run_out ? new Date(alert.estimated_run_out).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : 'soon'}
                                            </p>
                                            <button
                                                onClick={() => navigate(`/?msg=${encodeURIComponent(`I want to reorder ${alert.medicine_name}`)}`)}
                                                className="text-[10px] font-bold text-primary-400 uppercase tracking-wider flex items-center hover:text-primary-300 transition-colors"
                                            >
                                                Quick Reorder <ChevronRight size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {(dashboard?.active_medicines || []).filter(m => !dashboard.active_alerts?.some(a => a.medicine_name === m.medicine_name)).slice(0, 3).map((med, i) => (
                                    <div key={`med-${i}`} className="p-3 rounded-xl bg-surface-800/30 border border-white/5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-accent-500/15 text-accent-400 flex items-center justify-center">
                                                <Pill size={14} />
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-semibold">{med.medicine_name || `Med ${med.medicine_id?.slice(0, 6)}`}</p>
                                                <p className="text-[10px] text-surface-500">{med.avg_interval_days}d cycle • {med.order_count} orders</p>
                                            </div>
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${med.refill_confidence === 'high' ? 'bg-accent-500/20 text-accent-400' : med.refill_confidence === 'medium' ? 'bg-warning-500/20 text-warning-400' : 'bg-surface-700 text-surface-400'}`}>
                                            {med.refill_confidence}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* Health Snapshot */}
                    <motion.div variants={stagger.item} ref={sectionRefs.health} className="glass-card p-6 flex flex-col">
                        <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-accent-500/20 text-accent-400 flex items-center justify-center">
                                <HeartPulse size={16} />
                            </div>
                            Health Snapshot
                        </h3>
                        <div className="space-y-4 flex-1">
                            {/* Chronic Conditions */}
                            {profile?.chronic_conditions?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2">Tracked Conditions</p>
                                    <div className="flex flex-wrap gap-2">
                                        {profile.chronic_conditions.map((c, i) => (
                                            <span key={i} className="px-3 py-1.5 bg-accent-500/15 text-accent-400 rounded-xl text-xs font-bold border border-accent-500/20">
                                                {c.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Allergies */}
                            {allergies.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-danger-400 uppercase tracking-widest mb-2">⚠️ Known Allergies</p>
                                    <div className="space-y-2">
                                        {allergies.map((a, i) => (
                                            <div key={i} className="p-3 rounded-xl bg-danger-500/10 border border-danger-500/20 flex items-center gap-3">
                                                <ShieldCheck size={16} className="text-danger-400 flex-shrink-0" />
                                                <p className="text-danger-300 text-sm font-semibold">{a.value || 'Unknown allergen'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Medical Facts */}
                            {otherFacts.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2">Medical Flags</p>
                                    <div className="flex flex-wrap gap-2">
                                        {otherFacts.map((f, i) => (
                                            <span key={i} className="px-3 py-1.5 bg-warning-500/10 text-warning-400 rounded-xl text-xs font-bold border border-warning-500/15">
                                                {f.value || f.fact_type}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Medicine by category */}
                            {dashboard?.active_medicines?.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2">Active Medications</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {dashboard.active_medicines.slice(0, 6).map((med, i) => (
                                            <div key={i} className="p-2.5 rounded-xl bg-surface-800/50 border border-white/5 text-center">
                                                <Pill size={16} className="text-primary-400 mx-auto mb-1" />
                                                <p className="text-[10px] text-white font-semibold truncate">{med.medicine_name || 'Med'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!profile?.chronic_conditions?.length && !allergies.length && !otherFacts.length && !dashboard?.active_medicines?.length && (
                                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                                    <HeartPulse size={32} className="text-surface-600 mb-3" />
                                    <p className="text-surface-400 text-sm">Your health profile is empty.</p>
                                    <p className="text-surface-500 text-xs mt-1">Update your profile to get personalized safety checks.</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* ═══════════ ROW 4: ORDERS + SPENDING + COUNSELING ═══════════ */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" ref={sectionRefs.orders}>
                    {/* Recent Orders */}
                    <motion.div variants={stagger.item} className="glass-card p-6 flex flex-col">
                        <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary-500/20 text-primary-400 flex items-center justify-center">
                                <Package size={16} />
                            </div>
                            Recent Orders
                        </h3>
                        {!dashboard?.order_history?.length ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
                                <Package size={28} className="text-surface-600 mb-2" />
                                <p className="text-surface-400 text-sm">No orders yet.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 flex-1">
                                {dashboard.order_history.slice(0, 4).map((order, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-surface-800/40 border border-white/5 hover:bg-surface-800/70 transition-colors">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-bold text-white">#{order.order_id?.slice(0, 8)}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${['delivered', 'confirmed'].includes(order.status) ? 'bg-accent-500/20 text-accent-400' : order.status === 'pending_payment' ? 'bg-warning-500/20 text-warning-400' : 'bg-surface-700 text-surface-300'}`}>
                                                {order.status?.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-surface-300 truncate">
                                            {(order.items || []).map(item => item.name).join(', ')}
                                        </p>
                                        <div className="flex items-center justify-between mt-2">
                                            <span className="text-[10px] text-surface-500">
                                                {order.order_date ? new Date(order.order_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : ''}
                                            </span>
                                            <span className="text-sm font-extrabold text-white">₹{order.total_amount?.toFixed(0)}</span>
                                        </div>
                                    </div>
                                ))}
                                {dashboard.order_history.length > 4 && (
                                    <button className="w-full text-center text-[10px] font-bold text-primary-400 uppercase tracking-wider py-2 hover:text-primary-300 transition-colors">
                                        View All {dashboard.order_history.length} Orders
                                    </button>
                                )}
                            </div>
                        )}
                    </motion.div>

                    {/* Spending Insights */}
                    <motion.div variants={stagger.item} className="glass-card p-6 flex flex-col">
                        <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center">
                                <TrendingUp size={16} />
                            </div>
                            Spending Insights
                        </h3>
                        {totalSpent === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
                                <IndianRupee size={28} className="text-surface-600 mb-2" />
                                <p className="text-surface-400 text-sm">No spending data yet.</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-between">
                                <div className="flex gap-1.5 flex-1 items-end">
                                    {spendingByMonth.map((s, i) => (
                                        <SpendingBar key={i} amount={s.amount} maxAmount={maxSpending} month={s.month} />
                                    ))}
                                </div>
                                <div className="mt-4 p-3 rounded-xl bg-surface-800/50 border border-white/5 flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-surface-500 uppercase tracking-wider">6-month total</span>
                                    <span className="text-lg font-extrabold text-white">₹{totalSpent.toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                        )}
                    </motion.div>

                    {/* Counseling Reminders */}
                    <motion.div variants={stagger.item} className="glass-card p-6 flex flex-col">
                        <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                                <Activity size={16} />
                            </div>
                            Counseling Reminders
                        </h3>
                        {!dashboard?.active_medicines?.length ? (
                            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
                                <Pill size={28} className="text-surface-600 mb-2" />
                                <p className="text-surface-400 text-sm">No active medicines.</p>
                            </div>
                        ) : (
                            <div className="space-y-3 flex-1">
                                {dashboard.active_medicines.slice(0, 4).map((med, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-surface-800/40 border border-white/5">
                                        <p className="text-sm font-bold text-white mb-2">{med.medicine_name || 'Medicine'}</p>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800 border border-white/5 text-[10px] font-bold text-surface-300" title="Food timing">
                                                <Utensils size={10} className="text-amber-400" /> With food
                                            </span>
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-800 border border-white/5 text-[10px] font-bold text-surface-300" title="Drowsiness">
                                                <Moon size={10} className="text-blue-400" /> No drowsiness
                                            </span>
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-danger-500/10 border border-danger-500/10 text-[10px] font-bold text-danger-300" title="Alcohol">
                                                <Wine size={10} className="text-danger-400" /> Avoid alcohol
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={() => navigate('/')}
                                    className="w-full text-center text-[10px] font-bold text-primary-400 uppercase tracking-wider py-2 hover:text-primary-300 transition-colors flex items-center justify-center gap-1"
                                >
                                    Ask PharmAI for details <ChevronRight size={12} />
                                </button>
                            </div>
                        )}
                    </motion.div>
                </div>

                {/* ═══════════ ROW 5: PRESCRIPTION GALLERY ═══════════ */}
                {dashboard?.prescriptions?.length > 0 && (
                    <motion.div variants={stagger.item} className="glass-card p-6">
                        <h3 className="text-sm font-bold text-white mb-5 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                                <FileText size={16} />
                            </div>
                            Prescription Gallery
                        </h3>
                        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                            {dashboard.prescriptions.map((rx, i) => (
                                <div key={i} className="min-w-[220px] max-w-[260px] flex-shrink-0 rounded-2xl bg-surface-800/40 border border-white/5 p-4 hover:-translate-y-1 transition-transform">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-primary-500/20 text-primary-400 flex items-center justify-center">
                                                <FileText size={14} />
                                            </div>
                                            <span className="text-xs font-bold text-white font-mono">#{rx.prescription_id?.slice(0, 6)}</span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${rx.verified ? 'bg-accent-500/20 text-accent-400' : 'bg-warning-500/20 text-warning-400'}`}>
                                            {rx.verified ? 'Verified' : 'Pending'}
                                        </span>
                                    </div>
                                    <div className="space-y-1 mb-3">
                                        {(rx.medicines || []).slice(0, 3).map((med, j) => (
                                            <div key={j} className="flex items-center gap-1.5 text-xs text-surface-300">
                                                <Pill size={10} className="text-surface-500 flex-shrink-0" />
                                                <span className="truncate">{med.name}</span>
                                            </div>
                                        ))}
                                        {(rx.medicines?.length > 3) && (
                                            <p className="text-[10px] text-surface-500">+{rx.medicines.length - 3} more</p>
                                        )}
                                    </div>
                                    <div className="flex justify-between text-[10px] font-bold text-surface-500 uppercase tracking-wider">
                                        <span>{rx.upload_date ? new Date(rx.upload_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—'}</span>
                                        <span className={rx.verified ? '' : 'text-danger-400'}>{rx.expiry_date ? new Date(rx.expiry_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : '—'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

            </motion.div>
        </div>
    );
}
