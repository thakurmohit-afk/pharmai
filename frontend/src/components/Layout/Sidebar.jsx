import { useState, useEffect } from 'react';
import { LogOut, LayoutDashboard, MessageCircle, Shield, Activity, Pill, Package, HeartPulse } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getMyProfile } from '../../services/api';

const API_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/api$/, '').replace(/\/$/, '');

export default function Sidebar({ user, onLogout }) {
    const location = useLocation();
    const [avatarUrl, setAvatarUrl] = useState(null);

    useEffect(() => {
        if (!user) return;
        getMyProfile()
            .then((profile) => {
                if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
            })
            .catch(() => {});
    }, [user]);

    const links = user?.role === 'admin'
        ? [{ to: '/admin', icon: Shield, label: 'Admin Console', exact: true }]
        : [
            { to: '/', icon: MessageCircle, label: 'Chat', exact: true },
            { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true },
            { to: '/dashboard?tab=medicines', icon: Pill, label: 'My Medicines' },
            { to: '/dashboard?tab=orders', icon: Package, label: 'Orders' },
            { to: '/dashboard?tab=health', icon: HeartPulse, label: 'Health Profile' },
        ];

    const isLinkActive = (link) => {
        const [path, query] = link.to.split('?');
        if (link.exact) {
            return location.pathname === path && !location.search;
        }
        if (query) {
            return location.pathname === path && location.search === `?${query}`;
        }
        return location.pathname === path;
    };

    const firstName = (user?.name || 'User').split(' ')[0];
    const initials = (user?.name || 'U')
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <aside className="w-20 my-auto h-[95vh] glass-card rounded-3xl flex flex-col items-center py-8 gap-6 z-50 shrink-0 border border-white/10 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-4 shadow-lg shadow-primary-500/30">
                <Activity size={24} className="text-white" />
            </div>

            <nav className="flex flex-col gap-3 flex-1 w-full px-3 overflow-y-auto no-scrollbar">
                {links.map((link) => {
                    const LinkIcon = link.icon;
                    const active = isLinkActive(link);
                    return (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            className={`relative group w-full aspect-square rounded-2xl flex items-center justify-center transition-all duration-300 ${active
                                ? 'text-white'
                                : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                                }`}
                        >
                            {active && (
                                <motion.div
                                    layoutId="active-pill"
                                    className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-500 shadow-lg shadow-primary-500/25"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            <LinkIcon size={22} className="relative z-10" />

                            {/* Tooltip */}
                            <div className="absolute left-[calc(100%+16px)] px-3 py-1.5 rounded-xl bg-surface-800 border border-white/10 text-xs font-medium text-white opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl z-50">
                                {link.label}
                            </div>
                        </NavLink>
                    );
                })}
            </nav>

            <div className="mt-auto flex flex-col items-center gap-3 w-full px-3">
                {/* Profile avatar + name */}
                <NavLink
                    to={user?.role === 'admin' ? '/admin' : '/dashboard'}
                    className="group relative flex flex-col items-center gap-1.5 w-full py-2 rounded-2xl hover:bg-surface-800/50 transition-colors"
                >
                    {avatarUrl ? (
                        <img
                            src={`${API_BASE}${avatarUrl}`}
                            alt="avatar"
                            className="w-9 h-9 rounded-xl object-cover border border-white/10 shadow-md"
                        />
                    ) : (
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-xs font-bold text-white shadow-md border border-white/10">
                            {initials}
                        </div>
                    )}
                    <span className="text-[10px] font-medium text-surface-300 truncate max-w-[56px] leading-tight">
                        {firstName}
                    </span>

                    {/* Tooltip */}
                    <div className="absolute left-[calc(100%+16px)] px-3 py-1.5 rounded-xl bg-surface-800 border border-white/10 text-xs font-medium text-white opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl z-50">
                        {user?.name || 'User'}<br />
                        <span className="text-surface-400">{user?.email}</span>
                    </div>
                </NavLink>

                <button
                    onClick={onLogout}
                    className="group relative w-full aspect-square rounded-2xl flex items-center justify-center text-surface-400 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                    title="Logout"
                >
                    <LogOut size={20} />
                    <div className="absolute left-[calc(100%+16px)] px-3 py-1.5 rounded-xl bg-surface-800 border border-white/10 text-xs font-medium text-white opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl z-50">
                        Logout
                    </div>
                </button>
            </div>
        </aside>
    );
}
