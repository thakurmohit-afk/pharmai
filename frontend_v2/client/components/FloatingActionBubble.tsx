import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Camera, ShoppingCart, Mic, X, Plus } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

const ACTIONS = [
    { icon: MessageSquare, label: "Chat", path: "/chat", color: "from-emerald-500 to-teal-500" },
    { icon: Camera, label: "Scan Rx", path: "/prescriptions", color: "from-blue-500 to-indigo-500" },
    { icon: ShoppingCart, label: "Reorder", path: "/orders", color: "from-amber-500 to-orange-500" },
    { icon: Mic, label: "Voice", path: "/chat?voice=1", color: "from-purple-500 to-pink-500" },
];

export default function FloatingActionBubble() {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    // Close on Escape
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, []);

    const handleAction = useCallback((path: string) => {
        setOpen(false);
        navigate(path);
    }, [navigate]);

    return (
        <>
            {/* Backdrop */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[99] bg-black/20 backdrop-blur-[2px]"
                        onClick={() => setOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Action items */}
            <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse items-center gap-3">
                <AnimatePresence>
                    {open && ACTIONS.map((action, i) => {
                        const Icon = action.icon;
                        return (
                            <motion.button
                                key={action.label}
                                initial={{ opacity: 0, y: 20, scale: 0.3 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.5 }}
                                transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 22 }}
                                onClick={() => handleAction(action.path)}
                                className="group relative flex items-center gap-3"
                            >
                                <span className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-semibold shadow-lg whitespace-nowrap transition-all opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0",
                                    theme === "dark"
                                        ? "bg-slate-800 text-white border border-white/10"
                                        : "bg-white text-slate-800 border border-slate-200"
                                )}>
                                    {action.label}
                                </span>
                                <div className={cn(
                                    "w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg bg-gradient-to-br",
                                    action.color
                                )}>
                                    <Icon className="w-5 h-5" />
                                </div>
                            </motion.button>
                        );
                    })}
                </AnimatePresence>

                {/* Main FAB */}
                <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setOpen(!open)}
                    className={cn(
                        "w-14 h-14 rounded-full flex items-center justify-center text-white shadow-xl fab-bubble",
                        "bg-gradient-to-br from-emerald-500 to-teal-500",
                        "hover:from-emerald-400 hover:to-teal-400 transition-all duration-300"
                    )}
                >
                    <motion.div
                        animate={{ rotate: open ? 45 : 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
                    </motion.div>
                </motion.button>
            </div>
        </>
    );
}
