import { LogOut, LayoutDashboard, MessageCircle, Shield, Activity } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function Sidebar({ user, onLogout }) {
    const links = [
        { to: '/', icon: MessageCircle, label: 'Chat' },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ];

    if (user?.role === 'admin') {
        links.push({ to: '/admin', icon: Shield, label: 'Admin' });
    }

    return (
        <aside className="w-20 my-auto h-[95vh] glass-card rounded-3xl flex flex-col items-center py-8 gap-6 z-50 shrink-0 border border-white/10 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-4 shadow-lg shadow-primary-500/30">
                <Activity size={24} className="text-white" />
            </div>

            <nav className="flex flex-col gap-4 flex-1 w-full px-3">
                {links.map((link) => {
                    const LinkIcon = link.icon;
                    return (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            className={({ isActive }) =>
                                `relative group w-full aspect-square rounded-2xl flex items-center justify-center transition-all duration-300 ${isActive
                                    ? 'text-white'
                                    : 'text-surface-400 hover:text-white hover:bg-surface-800/50'
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    {isActive && (
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
                                </>
                            )}
                        </NavLink>
                    );
                })}
            </nav>

            <div className="mt-auto flex flex-col items-center gap-4 w-full px-3">
                <div className="flex flex-col items-center justify-center w-full aspect-square rounded-2xl bg-surface-800/50 border border-white/5 overflow-hidden">
                    <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-br from-primary-400 to-primary-200 uppercase">
                        {user?.role === 'admin' ? 'ADM' : 'USR'}
                    </span>
                </div>

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
