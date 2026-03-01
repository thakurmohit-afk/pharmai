import { motion } from "framer-motion";
import { Bell, CheckCircle2, Mail, MessageCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

interface WaitlistItem {
    medicine_name: string;
    medicine_id: string;
    notification_method: string;
}

interface WaitlistCardProps {
    items: WaitlistItem[];
}

export default function WaitlistCard({ items }: WaitlistCardProps) {
    const { theme } = useTheme();

    if (!items || items.length === 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className={cn(
                "mt-3 rounded-2xl border overflow-hidden",
                theme === "dark"
                    ? "bg-amber-500/[0.04] border-amber-500/10"
                    : "bg-amber-50/60 border-amber-200/50"
            )}
        >
            {/* Header */}
            <div
                className={cn(
                    "px-5 py-3.5 flex items-center gap-3 border-b",
                    theme === "dark"
                        ? "border-amber-500/10 bg-amber-500/[0.06]"
                        : "border-amber-200/40 bg-amber-100/40"
                )}
            >
                <div
                    className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center",
                        theme === "dark" ? "bg-amber-500/15" : "bg-amber-200/60"
                    )}
                >
                    <Bell className="w-4 h-4 text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <p
                        className={cn(
                            "text-sm font-semibold",
                            theme === "dark" ? "text-amber-300" : "text-amber-800"
                        )}
                    >
                        Out of Stock — Notification Set
                    </p>
                    <p
                        className={cn(
                            "text-[11px]",
                            theme === "dark" ? "text-amber-400/60" : "text-amber-600/70"
                        )}
                    >
                        We'll let you know when it's back
                    </p>
                </div>
            </div>

            {/* Items */}
            <div className="px-5 py-3 space-y-3">
                {items.map((item, i) => (
                    <motion.div
                        key={item.medicine_id || i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl",
                            theme === "dark"
                                ? "bg-white/[0.03] border border-white/[0.05]"
                                : "bg-white border border-amber-100"
                        )}
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.3 + i * 0.1 }}
                            className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                                theme === "dark" ? "bg-emerald-500/15" : "bg-emerald-50"
                            )}
                        >
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        </motion.div>

                        <div className="flex-1 min-w-0">
                            <p
                                className={cn(
                                    "text-[13px] font-semibold truncate",
                                    theme === "dark" ? "text-slate-200" : "text-slate-800"
                                )}
                            >
                                {item.medicine_name}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                {item.notification_method === "whatsapp" ? (
                                    <MessageCircle className="w-3 h-3 text-green-500" />
                                ) : (
                                    <Mail className="w-3 h-3 text-blue-400" />
                                )}
                                <p
                                    className={cn(
                                        "text-[11px]",
                                        theme === "dark" ? "text-slate-500" : "text-slate-400"
                                    )}
                                >
                                    Notify via {item.notification_method}
                                </p>
                            </div>
                        </div>

                        <span
                            className={cn(
                                "text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0",
                                theme === "dark"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-amber-100 text-amber-700"
                            )}
                        >
                            Waiting
                        </span>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}
