/**
 * VoiceOverlay — Full-screen immersive voice mode.
 *
 * Uses @elevenlabs/react useConversation SDK for proper
 * programmatic start/stop control. ShaderCanvas orb for visuals.
 * Standalone — no backend connection needed.
 */

import { useCallback, useState, useEffect, useRef } from "react";
import { useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { ShaderCanvas } from "./ShaderCanvas";

const AGENT_ID = "agent_8001kjsqz4dqe7ms98t9pk8syem9";

interface VoiceOverlayProps {
    open: boolean;
    onClose: () => void;
}

export default function VoiceOverlay({ open, onClose }: VoiceOverlayProps) {
    const [statusText, setStatusText] = useState("Tap the orb to start");
    const [isStarting, setIsStarting] = useState(false);
    const [timeLeft, setTimeLeft] = useState(60);
    const timerRef = useRef<ReturnType<typeof setInterval>>();

    const conversation = useConversation({
        onConnect: () => {
            setIsStarting(false);
            setStatusText("Listening...");
            setTimeLeft(60);
        },
        onDisconnect: () => {
            setIsStarting(false);
            setStatusText("Tap the orb to start");
            setTimeLeft(60);
            if (timerRef.current) clearInterval(timerRef.current);
        },
        onError: (err: any) => {
            console.error("ElevenLabs voice error:", err);
            setIsStarting(false);
            setStatusText("Connection failed — tap to retry");
            if (timerRef.current) clearInterval(timerRef.current);
        },
        onMessage: ({ message, source }: { message: string; source: string }) => {
            if (source === "ai") {
                setStatusText(message.length > 80 ? message.slice(0, 80) + "…" : message);
            }
        },
    });

    const isConnected = conversation.status === "connected";
    const isSpeaking = conversation.isSpeaking;

    /* ── 1-minute auto-disconnect timer ── */
    useEffect(() => {
        if (isConnected) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        conversation.endSession().catch(() => { });
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [isConnected]);

    /* ── Toggle session ── */
    const handleOrbClick = useCallback(async () => {
        if (isStarting) return;

        if (isConnected) {
            try {
                await conversation.endSession();
            } catch (err) {
                console.error("Failed to end session:", err);
            }
            setStatusText("Tap the orb to start");
        } else {
            setIsStarting(true);
            setStatusText("Connecting...");
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
                await conversation.startSession({
                    agentId: AGENT_ID,
                } as any);
            } catch (err: any) {
                console.error("Failed to start voice session:", err);
                setIsStarting(false);
                setStatusText(
                    err?.name === "NotAllowedError"
                        ? "Microphone access denied"
                        : "Connection failed — tap to retry"
                );
            }
        }
    }, [isConnected, isStarting, conversation]);

    /* ── Cleanup on overlay close ── */
    useEffect(() => {
        if (!open && isConnected) {
            conversation.endSession().catch(() => { });
        }
        if (!open) {
            setStatusText("Tap the orb to start");
            setIsStarting(false);
            setTimeLeft(60);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    }, [open]);

    /* ── Ambient CSS ── */
    const ambientCSS = `
    @keyframes vo-ring-expand {
      0% { transform: scale(1); opacity: 0.35; }
      100% { transform: scale(2); opacity: 0; }
    }
    @keyframes vo-breathe { 0%,100% { opacity:0.12; } 50% { opacity:0.30; } }
    @keyframes vo-glow-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes vo-wave { 0%,100% { height:6px; } 50% { height:26px; } }
  `;

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    key="voice-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
                    style={{
                        background: "radial-gradient(ellipse at 50% 40%, #0a1628 0%, #050d1a 50%, #020609 100%)",
                    }}
                >
                    <style>{ambientCSS}</style>

                    {/* ── Close button ── */}
                    <motion.button
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        onClick={() => { if (isConnected) conversation.endSession().catch(() => { }); onClose(); }}
                        className="absolute top-6 right-6 z-50 w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                    >
                        <X className="w-4 h-4 text-white/60" />
                    </motion.button>

                    {/* ── Ambient background blobs ── */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div
                            className="absolute top-[20%] left-[30%] w-[500px] h-[500px] rounded-full blur-[180px]"
                            style={{
                                background: isConnected
                                    ? "rgba(59,130,246,0.12)"
                                    : "rgba(16,185,129,0.06)",
                                animation: "vo-breathe 6s ease-in-out infinite",
                                transition: "background 1.5s ease",
                            }}
                        />
                        <div
                            className="absolute bottom-[20%] right-[25%] w-[400px] h-[400px] rounded-full blur-[150px]"
                            style={{
                                background: isConnected
                                    ? "rgba(139,92,246,0.10)"
                                    : "rgba(6,182,212,0.05)",
                                animation: "vo-breathe 8s ease-in-out infinite 2s",
                                transition: "background 1.5s ease",
                            }}
                        />
                    </div>

                    {/* ── PharmAI branding ── */}
                    <motion.div
                        initial={{ opacity: 0, y: -30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-8 text-center z-10"
                    >
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <div className="flex gap-[2px]">
                                <div className="w-[3px] h-3.5 bg-emerald-400/70 rounded-full" />
                                <div className="w-[3px] h-5 bg-emerald-400/70 rounded-full -translate-y-0.5" />
                                <div className="w-[3px] h-[13px] bg-emerald-400/70 rounded-full translate-y-0.5" />
                            </div>
                            <span className="text-sm font-black tracking-tight text-white/80">
                                PharmAI
                            </span>
                        </div>
                        <p className="text-[11px] text-white/25 font-medium uppercase tracking-[0.2em]">
                            Voice Assistant
                        </p>
                    </motion.div>

                    {/* ── Shader Ball Orb ── */}
                    <motion.div
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="relative z-10 cursor-pointer"
                        onClick={handleOrbClick}
                    >
                        {/* Expanding ring pulses when connected */}
                        {isConnected && (
                            <>
                                {[0, 1, 2].map(i => (
                                    <div
                                        key={i}
                                        className="absolute inset-0 rounded-full border border-emerald-400/20"
                                        style={{
                                            animation: `vo-ring-expand 3s ease-out infinite`,
                                            animationDelay: `${i * 1}s`,
                                        }}
                                    />
                                ))}
                            </>
                        )}

                        {/* Rotating gradient ring */}
                        {isConnected && (
                            <div
                                className="absolute inset-[-16px] rounded-full"
                                style={{
                                    background: "conic-gradient(from 0deg, transparent 0%, rgba(16,185,129,0.25) 25%, transparent 50%, rgba(52,211,153,0.15) 75%, transparent 100%)",
                                    animation: "vo-glow-spin 4s linear infinite",
                                    maskImage: "radial-gradient(circle, transparent 42%, black 43%, black 48%, transparent 49%)",
                                    WebkitMaskImage: "radial-gradient(circle, transparent 42%, black 43%, black 48%, transparent 49%)",
                                }}
                            />
                        )}

                        {/* Glow backdrop */}
                        <div
                            className="absolute inset-[-20px] rounded-full blur-2xl transition-all duration-1000"
                            style={{
                                background: isConnected
                                    ? "radial-gradient(circle, rgba(59,130,246,0.25) 0%, transparent 70%)"
                                    : "radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)",
                            }}
                        />

                        {/* The Shader Orb */}
                        <ShaderCanvas
                            size={240}
                            isListening={isConnected && !isSpeaking}
                            isSpeaking={isSpeaking}
                            shaderId={1}
                            className="relative z-10"
                        />
                    </motion.div>

                    {/* ── Status text ── */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="mt-8 text-center z-10 max-w-md px-4"
                    >
                        {/* Waveform bars when connected */}
                        {isConnected && (
                            <div className="flex items-center justify-center gap-[3px] mb-3 h-7">
                                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                                    <div
                                        key={i}
                                        className={`w-[3px] rounded-full transition-colors duration-500 ${isSpeaking ? "bg-blue-400/60" : "bg-emerald-400/40"
                                            }`}
                                        style={{
                                            animation: `vo-wave ${0.5 + i * 0.12}s ease-in-out infinite`,
                                            animationDelay: `${i * 0.08}s`,
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        <p className="text-sm font-medium text-white/40 truncate">{statusText}</p>

                        {/* Timer + Connection state */}
                        <div className="mt-2 flex items-center justify-center gap-3">
                            {isConnected && (
                                <span className={`text-xs font-mono font-bold tabular-nums ${timeLeft <= 10 ? "text-red-400" : "text-white/30"}`}>
                                    {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                                </span>
                            )}
                            <p className="text-[11px] text-white/20">
                                {isStarting
                                    ? "Setting up microphone..."
                                    : isConnected
                                        ? isSpeaking ? "AI is speaking..." : "Listening — speak now"
                                        : "Tap the orb to start a conversation"
                                }
                            </p>
                        </div>

                        {/* End call button when connected */}
                        {isConnected && (
                            <motion.button
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={async () => {
                                    try { await conversation.endSession(); } catch { }
                                    setStatusText("Tap the orb to start");
                                }}
                                className="mt-6 px-5 py-2 rounded-full bg-red-500/15 border border-red-400/25 text-red-300/80 text-xs font-semibold hover:bg-red-500/25 transition-colors"
                            >
                                End Call
                            </motion.button>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
