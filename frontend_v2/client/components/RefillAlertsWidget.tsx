import { AlertTriangle, TrendingDown, CheckCircle2 } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import TubesCursorBackground from "@/components/ui/TubesCursorBackground";
import { useNavigate } from "react-router-dom";

export default function RefillAlertsWidget({ alerts = [] }: { alerts?: any[] }) {
    const { theme } = useTheme();
    const navigate = useNavigate();

    if (!alerts || alerts.length === 0) {
        return null; // hide widget if no active alerts
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {alerts.slice(0, 3).map((alert, idx) => {
                const isCritical = alert.days_until_run_out <= 5;
                return (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1, type: "spring", stiffness: 200 }}
                        className={cn(
                            "relative overflow-hidden rounded-[32px] p-6 lg:p-8 flex flex-col justify-between transition-all duration-500 z-10",
                            theme === "dark"
                                ? isCritical ? "border border-red-500/30 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]" : "border border-orange-500/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]"
                                : isCritical ? "bg-red-50 border-red-100 premium-shadow border" : "bg-orange-50 border-orange-100 premium-shadow border"
                        )}
                    >
                        {theme === "dark" && (
                            <>
                                <TubesCursorBackground className="opacity-80 mix-blend-screen overflow-hidden rounded-[32px]" />
                                <div className={cn("absolute inset-0 backdrop-blur-[64px] z-0 pointer-events-none", isCritical ? "bg-[#200000]/60" : "bg-[#1a0f00]/60")} />
                                <div className="absolute inset-0 border border-white/5 rounded-[32px] pointer-events-none z-10" />
                            </>
                        )}

                        {/* Background Accent Gradient */}
                        {isCritical && (
                            <div className="absolute top-0 right-0 w-48 h-48 bg-red-500/15 blur-[64px] rounded-full translate-x-10 -translate-y-10" />
                        )}

                        <div className="flex items-start justify-between relative z-10">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-2.5 rounded-xl",
                                    isCritical
                                        ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                        : "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
                                )}>
                                    {isCritical ? <AlertTriangle className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                </div>
                                <div>
                                    <h3 className={cn("font-semibold", theme === "dark" ? "text-slate-100" : "text-slate-900")}>
                                        {alert.medicine_name}
                                    </h3>
                                    <p className={cn("text-sm", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                                        {alert.days_until_run_out} days supply remaining
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 flex items-end justify-between relative z-10">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">AI Prediction</span>
                                <div className="flex items-center gap-1.5 text-sm">
                                    <CheckCircle2 className={cn("w-4 h-4", isCritical ? "text-red-500" : "text-orange-500")} />
                                    <span className={cn("font-medium", theme === "dark" ? "text-slate-300" : "text-slate-700")}>
                                        Runs out {new Date(alert.estimated_run_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => navigate(`/chat?msg=I want to reorder ${alert.medicine_name}`)}
                                className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md",
                                    isCritical
                                        ? "bg-red-600 hover:bg-red-700 text-white shadow-red-600/20"
                                        : "bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20"
                                )}
                            >
                                Order Refill
                            </button>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}

