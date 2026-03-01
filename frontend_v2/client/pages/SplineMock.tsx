import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Mail, Lock, ArrowRight, Github } from "lucide-react";
import { motion } from "framer-motion";
import Spline from "@splinetool/react-spline";

export default function SplineMock() {
    const { theme } = useTheme();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    useEffect(() => {
        const handlePointerMove = (e: PointerEvent) => {
            if (!e.isTrusted) return;

            const canvas = document.querySelector('canvas');
            const loginCard = document.getElementById('login-card');

            if (!canvas || !loginCard) return;

            const rect = loginCard.getBoundingClientRect();

            let clientX = e.clientX;
            let clientY = e.clientY;

            // Adding a 20px buffer so the drone stays nicely outside the glass
            const buffer = 20;
            const isInside = (
                clientX >= rect.left - buffer &&
                clientX <= rect.right + buffer &&
                clientY >= rect.top - buffer &&
                clientY <= rect.bottom + buffer
            );

            if (isInside) {
                const distLeft = Math.abs(clientX - (rect.left - buffer));
                const distRight = Math.abs((rect.right + buffer) - clientX);
                const distTop = Math.abs(clientY - (rect.top - buffer));
                const distBottom = Math.abs((rect.bottom + buffer) - clientY);

                const min = Math.min(distLeft, distRight, distTop, distBottom);

                if (min === distLeft) {
                    clientX = rect.left - buffer;
                } else if (min === distRight) {
                    clientX = rect.right + buffer;
                } else if (min === distTop) {
                    clientY = rect.top - buffer;
                } else {
                    clientY = rect.bottom + buffer;
                }

                const syntheticEvent = new PointerEvent('pointermove', {
                    bubbles: true,
                    clientX,
                    clientY,
                    pointerId: e.pointerId,
                    pointerType: e.pointerType,
                });
                canvas.dispatchEvent(syntheticEvent);
            } else {
                // If not inside the login box, but hovering over another interactable (like buttons/inputs elsewhere)
                // Ensure Spline still tracks it perfectly.
                if (!(e.target instanceof HTMLCanvasElement)) {
                    const syntheticEvent = new PointerEvent('pointermove', {
                        bubbles: true,
                        clientX: e.clientX,
                        clientY: e.clientY,
                        pointerId: e.pointerId,
                        pointerType: e.pointerType,
                    });
                    canvas.dispatchEvent(syntheticEvent);
                }
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        return () => window.removeEventListener('pointermove', handlePointerMove);
    }, []);

    return (
        <div className={cn("min-h-screen w-full flex items-center justify-center transition-colors duration-300 relative overflow-hidden")}>

            {/* Background Texture & Gradient */}
            <div className="absolute inset-0 z-0 bg-[#bbf7a3]" />

            {/* Background Spline 3D Embed */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-auto flex items-center justify-center">
                {/* 
                  Centered layout so the 3D model sits between the hero text and the login card.
                  Adjusting width to 100vw so it doesn't overflow or shift unpredictably.
                */}
                <div className="absolute top-1/2 -translate-y-1/2 w-full h-full flex items-center justify-center opacity-90 mix-blend-multiply">
                    <Spline
                        scene="/scene.splinecode"
                        onLoad={(splineApp) => {
                            // Reset zoom so it fits naturally in the center
                            splineApp.setZoom(1.1);
                        }}
                    />
                </div>
            </div>

            {/* Overlay UI Layer */}
            <div className="relative z-10 w-full max-w-[1500px] mx-auto px-6 md:px-12 h-screen flex flex-col pointer-events-none">

                {/* Header Navigation */}
                <header className="w-full flex justify-between items-center py-8 pointer-events-none">
                    {/* Logo */}
                    <div className="flex items-center gap-2 text-[#0b3320]">
                        <div className="flex gap-[2px]">
                            <div className="w-1.5 h-6 bg-[#0b3320] rounded-full"></div>
                            <div className="w-1.5 h-8 bg-[#0b3320] rounded-full -translate-y-1"></div>
                            <div className="w-1.5 h-5 bg-[#0b3320] rounded-full translate-y-1 border-r border-white/20"></div>
                        </div>
                        <span className="text-2xl font-black tracking-tighter ml-1">Agentic.Rx</span>
                    </div>

                    <div className="text-sm font-bold text-[#1b4332] flex gap-6">
                        <button className="hover:text-black transition-colors uppercase tracking-wider text-xs pointer-events-auto">Observability Logs</button>
                        <button className="hover:text-black transition-colors uppercase tracking-wider text-xs pointer-events-auto">API Docs</button>
                    </div>
                </header>

                {/* Main Content: 2-Column Layout */}
                <main className="flex-1 flex flex-col lg:flex-row items-center justify-between pb-16 w-full pointer-events-none gap-10">

                    {/* Left: Hero Typography */}
                    <div className="flex-1 max-w-[650px] w-full mt-10 lg:mt-0 pointer-events-none z-10">
                        <h1 className="text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.08] tracking-tight font-heading font-bold text-[#081c15] mb-6">
                            Autonomous<br />
                            Pharmacy<br />
                            Ecosystem.
                        </h1>
                        <p className="text-lg text-[#1b4332]/90 font-medium mb-10 max-w-[450px] leading-relaxed">
                            Sign in to deploy your AI Pharmacist. Manage prescriptions, predict refills, and automate inventory seamlessly.
                        </p>
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-[#081c15]/10 text-[#081c15] text-xs font-bold tracking-wider uppercase">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#4dca59] mr-2 animate-pulse"></div>
                                Live Sync
                            </span>
                        </div>
                    </div>

                    {/* Right: Premium Light-Theme Login Card */}
                    <motion.div
                        id="login-card"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
                        className="w-full max-w-[420px] p-8 md:p-10 rounded-[32px] pointer-events-auto bg-white/50 backdrop-blur-[40px] border border-white/60 shadow-[0_12px_40px_0_rgba(8,28,21,0.08)] relative overflow-hidden z-10"
                    >
                        <div className="mb-8 text-center group">
                            <h2 className="text-2xl font-bold tracking-tight text-[#081c15]">
                                Welcome Back
                            </h2>
                            <p className="text-sm mt-1.5 font-semibold text-[#1b4332]/70">
                                Sign in to your AI Pharmacy Dashboard.
                            </p>
                        </div>

                        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>

                            {/* Email Field */}
                            <div className="space-y-1.5 flex flex-col items-start">
                                <label className="text-xs font-bold text-[#081c15] uppercase tracking-wider ml-1">
                                    Admin Email
                                </label>
                                <div className="relative w-full">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Mail className="w-5 h-5 text-[#1b4332]/60" />
                                    </div>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl outline-none transition-all border font-semibold bg-white/70 border-white/60 text-[#081c15] focus:bg-white focus:border-[#4dca59]/50 focus:ring-4 focus:ring-[#bbf7a3]/60 placeholder:text-[#1b4332]/40 pointer-events-auto"
                                        placeholder="admin@agentic.rx"
                                    />
                                </div>
                            </div>

                            {/* Password Field */}
                            <div className="space-y-1.5 flex flex-col items-start w-full mt-2">
                                <label className="text-xs font-bold text-[#081c15] uppercase tracking-wider ml-1 w-full flex justify-between">
                                    <span>Access Token</span>
                                    <button type="button" className="text-[#081c15] hover:text-[#4dca59] transition-colors lowercase font-semibold tracking-normal pointer-events-auto">Lost key?</button>
                                </label>
                                <div className="relative w-full">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Lock className="w-5 h-5 text-[#1b4332]/60" />
                                    </div>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl outline-none transition-all border font-semibold bg-white/70 border-white/60 text-[#081c15] focus:bg-white focus:border-[#4dca59]/50 focus:ring-4 focus:ring-[#bbf7a3]/60 placeholder:text-[#1b4332]/40 pointer-events-auto"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            {/* Sign In Button */}
                            <div className="pt-2">
                                <button
                                    className="w-full py-4 rounded-2xl bg-[#081c15] text-[#bbf7a3] font-bold text-lg hover:bg-black transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_4px_14px_0_rgba(8,28,21,0.2)] group pointer-events-auto"
                                >
                                    Initialize Agents
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>

                        </form>

                    </motion.div>
                </main>
            </div>
        </div>
    );
}
