import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
    Search, MessageSquare, ShoppingCart, FileText, Pill,
    Heart, Package, Upload, ArrowRight,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

interface Command {
    id: string;
    label: string;
    description: string;
    icon: any;
    action: string; // path or special
    keywords: string[];
}

const COMMANDS: Command[] = [
    { id: "chat", label: "Chat with PharmAI", description: "Ask about medicines, health, orders", icon: MessageSquare, action: "/chat", keywords: ["chat", "ask", "help", "ai"] },
    { id: "orders", label: "My Orders", description: "View order history and track deliveries", icon: Package, action: "/orders", keywords: ["order", "track", "delivery", "history"] },
    { id: "cart", label: "Shopping Cart", description: "View items in your cart", icon: ShoppingCart, action: "/cart", keywords: ["cart", "checkout", "buy", "shop"] },
    { id: "prescriptions", label: "Prescriptions", description: "Upload or view prescriptions", icon: FileText, action: "/prescriptions", keywords: ["prescription", "rx", "upload", "scan"] },
    { id: "medications", label: "My Medications", description: "View active medications and schedules", icon: Pill, action: "/medications", keywords: ["medicine", "medication", "med", "drug", "pill"] },
    { id: "health", label: "Health Profile", description: "Conditions, allergies, and medical history", icon: Heart, action: "/health", keywords: ["health", "allergy", "condition", "profile"] },
    { id: "refills", label: "Refill Center", description: "Check refill reminders and reorder", icon: Upload, action: "/refills", keywords: ["refill", "reorder", "renew"] },
    { id: "search", label: "Search Medicines", description: "Find medicines by name or category", icon: Search, action: "/search", keywords: ["search", "find", "medicine", "look"] },
];

export default function CommandPalette() {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = COMMANDS.filter((cmd) => {
        if (!query) return true;
        const q = query.toLowerCase();
        return (
            cmd.label.toLowerCase().includes(q) ||
            cmd.description.toLowerCase().includes(q) ||
            cmd.keywords.some((k) => k.includes(q))
        );
    });

    const open = useCallback(() => {
        setIsOpen(true);
        setQuery("");
        setSelectedIndex(0);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        setQuery("");
    }, []);

    const runCommand = useCallback((cmd: Command) => {
        close();
        if (cmd.action.startsWith("/")) {
            navigate(cmd.action);
        }
    }, [close, navigate]);

    // ⌘K / Ctrl+K listener
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                isOpen ? close() : open();
            }
            if (e.key === "Escape" && isOpen) close();
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, open, close]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }, [isOpen]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
            }
            if (e.key === "Enter" && filtered[selectedIndex]) {
                runCommand(filtered[selectedIndex]);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [isOpen, filtered, selectedIndex, runCommand]);

    // Reset selection on query change
    useEffect(() => { setSelectedIndex(0); }, [query]);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
                        onClick={close}
                    />

                    {/* Palette */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        className={cn(
                            "fixed top-[20%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl border",
                            theme === "dark"
                                ? "bg-slate-900/95 border-white/10 shadow-black/50"
                                : "bg-white/95 border-slate-200 shadow-slate-300/50"
                        )}
                        style={{ backdropFilter: "blur(20px)" }}
                    >
                        {/* Search Input */}
                        <div className={cn(
                            "flex items-center gap-3 px-5 py-4 border-b",
                            theme === "dark" ? "border-white/5" : "border-slate-100"
                        )}>
                            <Search className={cn("w-5 h-5 shrink-0", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Type a command or search..."
                                className={cn(
                                    "flex-1 bg-transparent outline-none text-sm font-medium",
                                    theme === "dark" ? "text-white placeholder-slate-500" : "text-slate-900 placeholder-slate-400"
                                )}
                            />
                            <kbd className={cn(
                                "hidden sm:inline px-2 py-0.5 rounded text-[10px] font-bold",
                                theme === "dark" ? "bg-white/5 text-slate-500" : "bg-slate-100 text-slate-400"
                            )}>
                                ESC
                            </kbd>
                        </div>

                        {/* Results */}
                        <div className="max-h-80 overflow-y-auto py-2 px-2">
                            {filtered.length === 0 ? (
                                <p className={cn("text-sm text-center py-8 font-medium", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                    No results found
                                </p>
                            ) : (
                                filtered.map((cmd, i) => {
                                    const Icon = cmd.icon;
                                    const isActive = i === selectedIndex;
                                    return (
                                        <button
                                            key={cmd.id}
                                            onClick={() => runCommand(cmd)}
                                            onMouseEnter={() => setSelectedIndex(i)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left",
                                                isActive
                                                    ? (theme === "dark" ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700")
                                                    : (theme === "dark" ? "text-slate-300 hover:bg-white/5" : "text-slate-700 hover:bg-slate-50")
                                            )}
                                        >
                                            <div className={cn(
                                                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                                                isActive
                                                    ? (theme === "dark" ? "bg-emerald-500/15" : "bg-emerald-100")
                                                    : (theme === "dark" ? "bg-white/5" : "bg-slate-100/80")
                                            )}>
                                                <Icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold">{cmd.label}</p>
                                                <p className={cn("text-[11px] truncate", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                                    {cmd.description}
                                                </p>
                                            </div>
                                            {isActive && <ArrowRight className="w-4 h-4 shrink-0 opacity-40" />}
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div className={cn(
                            "flex items-center gap-4 px-5 py-2.5 text-[11px] border-t",
                            theme === "dark" ? "border-white/5 text-slate-600" : "border-slate-100 text-slate-400"
                        )}>
                            <span><kbd className="font-bold">↑↓</kbd> Navigate</span>
                            <span><kbd className="font-bold">↵</kbd> Open</span>
                            <span><kbd className="font-bold">Esc</kbd> Close</span>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
