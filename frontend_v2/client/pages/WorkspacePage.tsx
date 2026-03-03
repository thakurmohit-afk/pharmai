/**
 * WorkspacePage — Immersive AI Launcher
 *
 * Two interactive modules side by side.
 *   LEFT  – Chat (text AI) with typewriter cycling effect
 *   RIGHT – Voice (voice AI) with blue shader ball
 *
 * Clicking a panel expands to full screen and navigates to the experience.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    MessageSquare, Mic, Sparkles, ArrowRight,
    Pill, Stethoscope, FileText, Loader2, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import { ShaderCanvas } from "@/components/chat/ShaderCanvas";
import VoiceOverlay from "@/components/chat/VoiceOverlay";

/* ── CSS Animations ── */
const ANIM_CSS = `
@keyframes ws-gradient {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes ws-float-l {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-6px); }
}
@keyframes ws-float-r {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}
@keyframes ws-breathe {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}
@keyframes ws-glow {
  0%, 100% { box-shadow: 0 0 30px rgba(22,163,74,0.05), 0 16px 50px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4); }
  50% { box-shadow: 0 0 50px rgba(22,163,74,0.10), 0 20px 60px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5); }
}
@keyframes ws-orb {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}
@keyframes ws-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
@keyframes ws-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
`;

/* ── Typewriter Hook ── */
const TYPEWRITER_PHRASES = [
    "I need cold medicine...",
    "Check drug interactions...",
    "Refill my prescription...",
    "What are the side effects?",
];

function useTypewriter(phrases: string[], typeSpeed = 60, deleteSpeed = 35, pauseMs = 1800) {
    const [text, setText] = useState("");
    const [phraseIdx, setPhraseIdx] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        const currentPhrase = phrases[phraseIdx];

        if (!isDeleting && text === currentPhrase) {
            // Pause at full text, then start deleting
            timeoutRef.current = setTimeout(() => setIsDeleting(true), pauseMs);
        } else if (isDeleting && text === "") {
            // Move to next phrase
            setIsDeleting(false);
            setPhraseIdx((prev) => (prev + 1) % phrases.length);
        } else {
            const delta = isDeleting ? deleteSpeed : typeSpeed;
            timeoutRef.current = setTimeout(() => {
                setText(isDeleting
                    ? currentPhrase.slice(0, text.length - 1)
                    : currentPhrase.slice(0, text.length + 1)
                );
            }, delta);
        }

        return () => clearTimeout(timeoutRef.current);
    }, [text, isDeleting, phraseIdx, phrases, typeSpeed, deleteSpeed, pauseMs]);

    return text;
}

export default function WorkspacePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [expandingPanel, setExpandingPanel] = useState<"chat" | "voice" | null>(null);
    const [hoveredPanel, setHoveredPanel] = useState<"chat" | "voice" | null>(null);
    const [hoveredSuggestion, setHoveredSuggestion] = useState<number | null>(null);
    const [voiceOpen, setVoiceOpen] = useState(false);

    const typedText = useTypewriter(TYPEWRITER_PHRASES);

    useEffect(() => {
        const id = "ws-anim-v5";
        if (!document.getElementById(id)) {
            const s = document.createElement("style");
            s.id = id;
            s.textContent = ANIM_CSS;
            document.head.appendChild(s);
        }
    }, []);

    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
    const firstName = user?.name ? user.name.split(" ")[0] : "there";

    const handlePanelSelect = (panel: "chat" | "voice") => {
        if (panel === "voice") {
            setVoiceOpen(true);
            return;
        }
        setExpandingPanel(panel);
        setTimeout(() => {
            navigate("/chat");
        }, 650);
    };

    const suggestions = [
        { icon: Pill, text: "I need cold medicine", color: "#16a34a" },
        { icon: Stethoscope, text: "Check drug interaction", color: "#0d9488" },
        { icon: FileText, text: "Refill my prescription", color: "#15803d" },
    ];

    return (
        <div
            className="min-h-screen w-full flex font-sans overflow-hidden ws-layout"
            style={{
                background: "linear-gradient(145deg, #86efac 0%, #a7f3b8 25%, #bbf7c8 50%, #d1fae0 75%, #ecfdf5 100%)",
                backgroundSize: "300% 300%",
                animation: "ws-gradient 20s ease infinite",
            }}
        >
            {/* Glassmorphic sidebar on workspace */}
            <Sidebar defaultCollapsed transparent />

            <div
                className="flex-1 flex flex-col items-center justify-center h-screen overflow-hidden relative"
            >
                {/* Ambient glow orbs */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div
                        className="absolute top-[8%] left-[18%] w-[420px] h-[420px] rounded-full blur-[140px]"
                        style={{ background: "rgba(22,163,74,0.12)", animation: "ws-breathe 7s ease-in-out infinite" }}
                    />
                    <div
                        className="absolute bottom-[12%] right-[18%] w-[380px] h-[380px] rounded-full blur-[120px]"
                        style={{ background: "rgba(16,185,129,0.10)", animation: "ws-breathe 8s ease-in-out infinite 2s" }}
                    />
                </div>

                {/* ─── HEADER ─── */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: expandingPanel ? 0 : 1, y: expandingPanel ? -40 : 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-center mb-10 z-10 relative"
                >
                    <div className="flex items-center justify-center gap-2.5 mb-3">
                        <div className="flex gap-[3px]">
                            <div className="w-[5px] h-5 bg-[#052e16] rounded-full" />
                            <div className="w-[5px] h-7 bg-[#052e16] rounded-full -translate-y-0.5" />
                            <div className="w-[5px] h-[18px] bg-[#052e16] rounded-full translate-y-0.5" />
                        </div>
                        <span className="text-lg font-black tracking-tighter text-[#052e16] ml-0.5">PharmAI</span>
                    </div>
                    <h1 className="text-4xl font-extrabold text-[#052e16] tracking-tight mb-2">
                        {greeting}, {firstName}
                    </h1>
                    <p className="text-[15px] text-[#14532d]/55 font-medium">
                        Choose how you'd like to interact with your AI pharmacist
                    </p>
                </motion.div>

                {/* ═══════ PANELS ═══════ */}
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    animate={{
                        opacity: expandingPanel ? 0 : 1,
                        scale: expandingPanel ? 1.06 : 1,
                        y: expandingPanel ? -30 : 0,
                    }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="relative z-10 w-full max-w-[960px] px-8 flex gap-6 items-stretch"
                >

                    {/* ────── CHAT PANEL ────── */}
                    <motion.button
                        onClick={() => handlePanelSelect("chat")}
                        onMouseEnter={() => setHoveredPanel("chat")}
                        onMouseLeave={() => setHoveredPanel(null)}
                        whileHover={{ scale: 1.012, y: -3 }}
                        whileTap={{ scale: 0.99 }}
                        className="flex-1 relative overflow-hidden rounded-[24px] cursor-pointer text-left group"
                        style={{
                            background: "linear-gradient(165deg, rgba(255,255,255,0.65) 0%, rgba(220,252,231,0.50) 50%, rgba(187,247,200,0.40) 100%)",
                            backdropFilter: "blur(36px)",
                            WebkitBackdropFilter: "blur(36px)",
                            border: "1px solid rgba(255,255,255,0.50)",
                            animation: "ws-float-l 9s ease-in-out infinite, ws-glow 5s ease-in-out infinite",
                            minHeight: "340px",
                        }}
                    >
                        {/* Shimmer */}
                        <div className="absolute inset-0 overflow-hidden rounded-[24px]">
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)", animation: "ws-shimmer 2s ease-in-out infinite" }} />
                        </div>

                        {/* Hover glow */}
                        <motion.div
                            animate={{ opacity: hoveredPanel === "chat" ? 1 : 0 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0 rounded-[24px] pointer-events-none"
                            style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(22,163,74,0.08), transparent 70%)" }}
                        />

                        <div className="relative z-10 p-7 flex flex-col h-full">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-11 h-11 rounded-xl bg-emerald-600/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                                    <MessageSquare className="w-5 h-5 text-emerald-700" />
                                </div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/8 text-emerald-700 text-[9px] font-bold uppercase tracking-wider">
                                    <Zap className="w-2.5 h-2.5" /> Text
                                </span>
                            </div>

                            <h2 className="text-[22px] font-extrabold text-[#052e16] mb-1.5 tracking-tight">
                                Chat with AI
                            </h2>
                            <p className="text-[13px] text-[#14532d]/50 leading-relaxed mb-4 max-w-[280px]">
                                Type your questions, upload prescriptions, and get instant medicine recommendations.
                            </p>

                            {/* ── Typewriter input mockup ── */}
                            <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-white/50 border border-white/60 mb-auto">
                                <div className="w-2 h-2 rounded-full bg-emerald-500/40 shrink-0" />
                                <span className="text-[13px] text-[#052e16]/40 font-medium">
                                    {typedText}
                                    <span
                                        className="inline-block w-[2px] h-[14px] bg-emerald-600/60 ml-[1px] align-middle"
                                        style={{ animation: "ws-blink 1s step-end infinite" }}
                                    />
                                </span>
                            </div>

                            {/* Suggestion chips */}
                            <div className="flex flex-col gap-2 mt-5">
                                {suggestions.map((s, i) => (
                                    <motion.div
                                        key={i}
                                        onMouseEnter={() => setHoveredSuggestion(i)}
                                        onMouseLeave={() => setHoveredSuggestion(null)}
                                        animate={{
                                            scale: hoveredSuggestion === i ? 1.04 : hoveredSuggestion !== null ? 0.97 : 1,
                                            opacity: hoveredSuggestion !== null && hoveredSuggestion !== i ? 0.4 : 1,
                                        }}
                                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                        className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/50 border border-white/55 cursor-pointer group/chip hover:bg-white/70 transition-all duration-300"
                                    >
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}12` }}>
                                            <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                                        </div>
                                        <span className="text-[12px] font-semibold text-[#052e16]/65 flex-1">{s.text}</span>
                                        <ArrowRight className="w-3.5 h-3.5 text-[#052e16]/20 group-hover/chip:text-[#052e16]/50 group-hover/chip:translate-x-1 transition-all" />
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.button>

                    {/* ────── VOICE PANEL ────── */}
                    <motion.button
                        onClick={() => handlePanelSelect("voice")}
                        onMouseEnter={() => setHoveredPanel("voice")}
                        onMouseLeave={() => setHoveredPanel(null)}
                        whileHover={{ scale: 1.012, y: -3 }}
                        whileTap={{ scale: 0.99 }}
                        className="flex-1 relative overflow-hidden rounded-[24px] cursor-pointer text-left group"
                        style={{
                            background: "linear-gradient(165deg, rgba(255,255,255,0.65) 0%, rgba(209,250,229,0.50) 50%, rgba(167,243,184,0.35) 100%)",
                            backdropFilter: "blur(36px)",
                            WebkitBackdropFilter: "blur(36px)",
                            border: "1px solid rgba(255,255,255,0.50)",
                            animation: "ws-float-r 9s ease-in-out infinite 0.5s, ws-glow 6s ease-in-out infinite 1s",
                            minHeight: "340px",
                        }}
                    >
                        {/* Shimmer */}
                        <div className="absolute inset-0 overflow-hidden rounded-[24px]">
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                                style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)", animation: "ws-shimmer 2s ease-in-out infinite" }} />
                        </div>

                        {/* Hover glow */}
                        <motion.div
                            animate={{ opacity: hoveredPanel === "voice" ? 1 : 0 }}
                            transition={{ duration: 0.5 }}
                            className="absolute inset-0 rounded-[24px] pointer-events-none"
                            style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(16,185,129,0.08), transparent 70%)" }}
                        />

                        <div className="relative z-10 p-7 flex flex-col items-center justify-center h-full">
                            {/* Badge — centered at top */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/8 text-emerald-700 text-[9px] font-bold uppercase tracking-wider mb-5">
                                <Zap className="w-2.5 h-2.5" /> Voice
                            </span>

                            {/* Shader ball — BLUE (isListening=true triggers blue palette) */}
                            <div className="relative mb-5" style={{ animation: "ws-orb 5s ease-in-out infinite" }}>
                                <div className="absolute inset-[-14px] rounded-full bg-blue-500/5 blur-xl" />
                                <ShaderCanvas
                                    size={160}
                                    isListening={true}
                                    isSpeaking={false}
                                    shaderId={1}
                                    className="drop-shadow-[0_0_30px_rgba(66,153,225,0.18)] relative z-10"
                                />
                            </div>

                            <h2 className="text-[22px] font-extrabold text-[#052e16] mb-1.5 tracking-tight text-center">
                                Voice Assistant
                            </h2>
                            <p className="text-[13px] text-[#14532d]/50 leading-relaxed text-center max-w-[250px] mb-5">
                                Speak naturally and get real-time responses from your AI pharmacist.
                            </p>

                            {/* Mic button */}
                            <div className="relative group/mic">
                                <motion.div
                                    animate={{ scale: [1, 1.3, 1], opacity: [0.25, 0, 0.25] }}
                                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute inset-0 rounded-full bg-emerald-700/10"
                                />
                                <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-[#052e16] to-[#14532d] flex items-center justify-center group-hover/mic:scale-110 group-hover/mic:shadow-[0_0_24px_rgba(22,163,74,0.3)] transition-all duration-500 z-10">
                                    <Mic className="w-5 h-5 text-emerald-300" />
                                </div>
                            </div>
                            <p className="mt-2 text-[10px] font-bold text-[#14532d]/30 uppercase tracking-[0.15em]">
                                Tap to begin
                            </p>
                        </div>
                    </motion.button>
                </motion.div>



                {/* ═══════ FULL-SCREEN EXPAND ═══════ */}
                <AnimatePresence>
                    {expandingPanel && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, borderRadius: "28px" }}
                            animate={{ opacity: 1, scale: 1, borderRadius: "0px" }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                            className="fixed inset-0 z-[200] flex items-center justify-center"
                            style={{
                                background: expandingPanel === "chat"
                                    ? "linear-gradient(135deg, #bbf7d0, #dcfce7, #ffffff)"
                                    : "linear-gradient(135deg, #a7f3d0, #d1fae5, #ffffff)",
                            }}
                        >
                            <motion.div
                                initial={{ opacity: 0, y: 24, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ delay: 0.15, duration: 0.35 }}
                                className="flex flex-col items-center"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 flex items-center justify-center mb-4">
                                    {expandingPanel === "chat"
                                        ? <MessageSquare className="w-8 h-8 text-emerald-700" />
                                        : <Mic className="w-8 h-8 text-emerald-600" />
                                    }
                                </div>
                                <Loader2 className="w-5 h-5 text-emerald-700/30 animate-spin mb-2" />
                                <p className="text-sm font-medium text-[#14532d]/40">
                                    {expandingPanel === "chat" ? "Opening chat..." : "Starting voice..."}
                                </p>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Voice Overlay ── */}
                <VoiceOverlay open={voiceOpen} onClose={() => setVoiceOpen(false)} />
            </div>
        </div>
    );
}
