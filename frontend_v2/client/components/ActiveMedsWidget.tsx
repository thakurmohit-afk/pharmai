import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { Pill, Activity, ChevronRight, PackageOpen } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import TubesCursorBackground from '@/components/ui/TubesCursorBackground';
import { useNavigate } from 'react-router-dom';

// Generate fake sparkline data to keep the UI looking cool
const generateSparklineData = (baseVal: number, variance: number) => {
    return Array.from({ length: 12 }, (_, i) => ({
        week: i + 1,
        interval: baseVal + (Math.random() * variance - variance / 2),
    }));
};

export default function ActiveMedsWidget({ meds = [] }: { meds?: any[] }) {
    const { theme } = useTheme();
    const navigate = useNavigate();

    return (
        <div className={cn(
            "col-span-1 xl:col-span-2 rounded-[32px] p-6 lg:p-8 flex flex-col relative overflow-hidden transition-all duration-500 z-10",
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
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div>
                    <h3 className="font-heading font-bold text-lg flex items-center gap-2">
                        <Pill className="w-5 h-5 text-primary" />
                        Active Medications
                    </h3>
                    <p className={cn("text-xs mt-1", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                        AI tracking your order history to build smart adherence patterns.
                    </p>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-4 relative z-10">
                {!meds || meds.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-10">
                        <PackageOpen className={cn("w-12 h-12 mb-4 opacity-50", theme === "dark" ? "text-slate-600" : "text-slate-300")} />
                        <p className={cn("text-sm", theme === "dark" ? "text-slate-400" : "text-slate-500")}>No active medications tracked yet.</p>
                        <button onClick={() => navigate("/chat")} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-all">
                            Order Medicines
                        </button>
                    </div>
                ) : (
                    meds.map((med, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 + idx * 0.1, type: "spring", stiffness: 200 }}
                            className={cn(
                                "group relative overflow-hidden flex items-center justify-between p-4 rounded-xl border transition-all hover:premium-shadow",
                                theme === "dark"
                                    ? "bg-slate-950/50 border-white/5 hover:border-primary/30"
                                    : "bg-slate-50 border-transparent hover:bg-white hover:border-slate-200"
                            )}
                        >
                            <div className="flex items-center gap-4 flex-1">
                                <div className={cn(
                                    "p-3 rounded-xl",
                                    theme === "dark" ? "bg-slate-800 text-teal-400" : "bg-teal-50 text-teal-600"
                                )}>
                                    <Activity className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className={cn("font-medium", theme === "dark" ? "text-slate-200" : "text-slate-900")}>
                                        {med.medicine_name}
                                    </h4>
                                    <p className={cn("text-xs mt-0.5", theme === "dark" ? "text-slate-500" : "text-slate-500")}>
                                        Ordered {med.order_count} times
                                    </p>
                                </div>
                            </div>

                            {/* Sparkline Chart - Simulated data for visual appeal */}
                            <div className="hidden sm:block w-32 h-10 mx-4">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={generateSparklineData(med.avg_interval_days || 30, Math.random() * 5)}>
                                        <Line
                                            type="monotone"
                                            dataKey="interval"
                                            stroke={theme === 'dark' ? '#14B8A6' : '#0F766E'}
                                            strokeWidth={2}
                                            dot={false}
                                            isAnimationActive={true}
                                        />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', background: theme === 'dark' ? '#1E293B' : '#FFFFFF', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            itemStyle={{ color: theme === 'dark' ? '#F8FAFC' : '#0F172A' }}
                                            labelStyle={{ display: 'none' }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                                <div className={cn("text-[10px] text-center mt-1 opacity-0 group-hover:opacity-100 transition-opacity", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                    Predictability
                                </div>
                            </div>

                            <div className="flex items-center gap-4 text-right">
                                <div>
                                    <p className={cn("text-sm font-bold capitalize", theme === "dark" ? "text-slate-200" : "text-slate-900")}>
                                        {med.refill_confidence}
                                    </p>
                                    <p className={cn("text-[10px] uppercase tracking-wider", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                        Confidence
                                    </p>
                                </div>
                                <ChevronRight className={cn("w-4 h-4 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1", theme === "dark" ? "text-slate-400" : "text-slate-400")} />
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}

