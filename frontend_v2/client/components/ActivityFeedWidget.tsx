import { Receipt, CreditCard, Clock, FileText } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import TubesCursorBackground from '@/components/ui/TubesCursorBackground';

export default function ActivityFeedWidget({ orders = [], prescriptions = [] }: { orders?: any[], prescriptions?: any[] }) {
    const { theme } = useTheme();

    // Combine and sort orders and prescriptions into a unified activity feed
    const activities = [
        ...(orders || []).map((o: any) => {
            const status = o.status || 'pending';
            const items = o.items || [];
            const totalPrice = o.total_price ?? 0;
            const createdAt = o.created_at ? new Date(o.created_at) : new Date();
            return {
                id: `order-${o.id}`,
                type: 'order',
                title: `Order #${o.id} - ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                description: `${items.length} item(s)`,
                time: createdAt.toLocaleDateString(),
                amount: `₹${totalPrice.toFixed(2)}`,
                icon: status === 'delivered' ? Receipt : Clock,
                color: status === 'delivered' ? 'text-emerald-500' : 'text-blue-500',
                bg: status === 'delivered' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-blue-50 dark:bg-blue-500/10',
                timestamp: createdAt.getTime()
            };
        }),
        ...(prescriptions || []).map((p: any) => {
            const status = p.status || (p.verified ? 'verified' : 'pending');
            const createdAt = p.created_at ? new Date(p.created_at) : new Date();
            return {
                id: `rx-${p.id}`,
                type: 'prescription',
                title: `Prescription ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                description: (() => {
                    try {
                        if (!p.medicines_identified) return 'Pending AI Review';
                        const parsed = typeof p.medicines_identified === 'string'
                            ? JSON.parse(p.medicines_identified)
                            : p.medicines_identified;
                        return Array.isArray(parsed) ? parsed.join(', ') : String(parsed);
                    } catch { return 'Pending AI Review'; }
                })(),
                time: createdAt.toLocaleDateString(),
                amount: null,
                icon: FileText,
                color: status === 'verified' ? 'text-emerald-500' : 'text-amber-500',
                bg: status === 'verified' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-amber-50 dark:bg-amber-500/10',
                timestamp: createdAt.getTime()
            };
        })
    ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5); // Take top 5 recent activities

    return (
        <div className={cn(
            "col-span-1 rounded-[32px] p-6 lg:p-8 flex flex-col relative overflow-hidden transition-all duration-500 z-10",
            theme === "dark"
                ? "border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]"
                : "bg-white border-slate-100 premium-shadow border"
        )}>
            {theme === "dark" && (
                <>
                    <TubesCursorBackground className="opacity-80 mix-blend-screen overflow-hidden rounded-[32px]" />
                    <div className="absolute inset-0 bg-[#050505]/60 backdrop-blur-[64px] z-0 pointer-events-none" />
                    <div className="absolute inset-0 border border-white/5 rounded-[32px] pointer-events-none z-10" />
                </>
            )}
            <h3 className="font-heading font-bold text-lg mb-6 relative z-10">Recent Activity</h3>

            <div className="relative flex-1">
                {activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 opacity-50 relative z-10">
                        <Clock className={cn("w-10 h-10 mb-3", theme === "dark" ? "text-slate-600" : "text-slate-400")} />
                        <p className={cn("text-sm text-center", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                            No recent activity found.<br />Upload a prescription or place an order.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Timeline Line */}
                        <div className={cn(
                            "absolute left-[19px] top-2 bottom-2 w-px",
                            theme === "dark" ? "bg-slate-800" : "bg-slate-200"
                        )} />

                        <div className="space-y-6 relative z-10">
                            {activities.map((activity, idx) => {
                                const Icon = activity.icon;
                                return (
                                    <motion.div
                                        key={activity.id}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 + idx * 0.1, type: "spring", stiffness: 200 }}
                                        className="flex gap-4 group"
                                    >
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-4 border-inherit ring-1 ring-black/5 dark:ring-white/5 transition-transform group-hover:scale-110",
                                            activity.bg,
                                            activity.color,
                                            theme === "dark" ? "border-slate-900" : "border-white"
                                        )}>
                                            <Icon className="w-4 h-4" />
                                        </div>

                                        <div className="flex-1 min-w-0 pt-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className={cn("text-sm font-semibold truncate", theme === "dark" ? "text-slate-200" : "text-slate-900")}>
                                                    {activity.title}
                                                </p>
                                                {activity.amount && (
                                                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                                                        {activity.amount}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={cn("text-xs mt-0.5 truncate", theme === "dark" ? "text-slate-400" : "text-slate-600")}>
                                                {activity.description}
                                            </p>
                                            <p className={cn("text-[10px] uppercase tracking-wider mt-1.5", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                                {activity.time}
                                            </p>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

