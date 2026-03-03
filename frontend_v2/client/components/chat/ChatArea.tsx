import { useState, useRef, useEffect } from "react";
import {
  Send, Mic, MicOff, X, Sparkles, Loader2, Copy, Check, Paperclip, ShoppingCart,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getMyDashboard, getCart } from "@/services/api";
import { ShaderCanvas } from "./ShaderCanvas";
import OrderSummaryCard from "./OrderSummaryCard";
import PaymentCard from "./PaymentCard";
import DeliveryTracker from "./DeliveryTracker";
import PrescriptionStatus from "./PrescriptionStatus";
import MedicineSuggestionCard from "./MedicineSuggestionCard";
import PrescriptionActionCard from "./PrescriptionActionCard";
import WaitlistCard from "./WaitlistCard";
import CartCard from "./CartCard";
import CartDrawer from "./CartDrawer";
import useHybridVoiceAgent from "@/hooks/useHybridVoiceAgent";
import type { Message } from "@/types/chat";

interface ChatAreaProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (msg: string) => void;
  onPrescriptionUpload?: (file: File) => void;
  onPaymentSuccess?: (result: any) => void;
  onPaymentCancel?: () => void;
  activeThreadId: string | null;
  onVoiceMessage: (msg: Message) => void;
  onVoiceRichUpdate?: (richData: Partial<Message>) => void;
  ensureThread: () => Promise<string>;
}

/* ─── Streaming text hook ─── */
function useStreamingText(text: string, enabled: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(typeof text === "string" ? text : "");
      setDone(true);
      return;
    }
    if (typeof text !== "string") {
      setDisplayed("");
      setDone(true);
      return;
    }
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i >= text.length) {
        setDisplayed(text);
        setDone(true);
        clearInterval(id);
      } else {
        setDisplayed(text.slice(0, i));
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, enabled, speed]);

  return { displayed, done };
}

/* ─── Simple markdown-lite renderer ─── */
function renderMarkdown(text: string) {
  if (typeof text !== "string") return text;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    let processed: React.ReactNode = line;
    const boldParts = line.split(/\*\*(.*?)\*\*/g);
    if (boldParts.length > 1) {
      processed = boldParts.map((part, j) =>
        j % 2 === 1 ? <strong key={j} className="font-semibold">{part}</strong> : part
      );
    }
    if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
      return <li key={i} className="ml-4 list-disc">{typeof processed === "string" ? processed.replace(/^[-•]\s*/, "") : processed}</li>;
    }
    if (/^\d+\.\s/.test(line.trim())) {
      return <li key={i} className="ml-4 list-decimal">{typeof processed === "string" ? processed.replace(/^\d+\.\s*/, "") : processed}</li>;
    }
    if (line.trim() === "---" || line.trim() === "───") {
      return <hr key={i} className="border-slate-200/10 my-3" />;
    }
    if (line.trim().startsWith("──")) {
      return <p key={i} className="text-xs uppercase tracking-widest text-emerald-500/70 mt-4 mb-1 font-semibold">{line.replace(/[─]/g, "").trim()}</p>;
    }
    return <p key={i}>{processed}</p>;
  });
}

function collectPrescriptionLockedMedicineNames(message?: Message): string[] {
  if (!message) return [];
  if (message.uiPayload?.type === "prescription_required") {
    const names = message.uiPayload?.data?.medicine_names;
    if (Array.isArray(names)) return names.filter((n) => typeof n === "string");
  }
  return [];
}

function needsPrescriptionActionCard(message?: Message, allMessages?: Message[]): boolean {
  if (!message || message.role !== "assistant") return false;
  if (message.prescription) return false;
  if (message.uiPayload?.type !== "prescription_required") return false;

  // Check if a prescription was uploaded AFTER this message — if so, hide the card permanently
  if (allMessages) {
    const msgIndex = allMessages.findIndex((m) => m.id === message.id);
    if (msgIndex >= 0) {
      for (let i = msgIndex + 1; i < allMessages.length; i++) {
        const later = allMessages[i];
        if (later.prescription || later.content === "📋 Prescription uploaded") {
          return false; // Prescription already uploaded — hide this card
        }
      }
    }
  }
  return true;
}

export default function ChatArea({
  messages,
  isLoading,
  onSendMessage,
  onPrescriptionUpload,
  onPaymentSuccess,
  onPaymentCancel,
  activeThreadId,
  onVoiceMessage,
  onVoiceRichUpdate,
  ensureThread,
}: ChatAreaProps) {
  const [inputValue, setInputValue] = useState("");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const { user } = useAuth();
  const wasConnectedRef = useRef(false);

  // Fetch cart count on mount and when messages change (in case the AI added items)
  useEffect(() => {
    const fetchCartCount = async () => {
      try {
        const data = await getCart();
        setCartCount(data?.item_count || 0);
      } catch {
        // ignore — user might not be logged in yet
      }
    };
    fetchCartCount();
  }, [messages.length]);

  // Hybrid voice agent — STT + chat logic + TTS (no split brain)
  const voiceAgent = useHybridVoiceAgent({
    threadId: activeThreadId,
    onMessage: onVoiceMessage,
  });

  // Auto-close voice when agent disconnects
  useEffect(() => {
    if (voiceAgent.isConnected) {
      wasConnectedRef.current = true;
    } else if (wasConnectedRef.current) {
      wasConnectedRef.current = false;
      setIsVoiceMode(false);
    }
  }, [voiceAgent.isConnected]);

  // Welcome screen data
  const [welcomeData, setWelcomeData] = useState<any>(null);
  const [welcomeLoading, setWelcomeLoading] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Fetch dashboard data for welcome screen
  useEffect(() => {
    if (messages.length === 0 && !welcomeData && !welcomeLoading) {
      setWelcomeLoading(true);
      getMyDashboard()
        .then((d) => setWelcomeData(d))
        .catch(() => { })
        .finally(() => setWelcomeLoading(false));
    }
  }, [messages.length, welcomeData, welcomeLoading]);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onPrescriptionUpload) {
      onPrescriptionUpload(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openPrescriptionUpload = () => {
    if (!onPrescriptionUpload) return;
    fileInputRef.current?.click();
  };

  const chooseRecommendation = (name: string) => {
    if (!name || isLoading) return;
    onSendMessage(`I want ${name}.`);
  };

  const browseOtcAlternatives = () => {
    if (isLoading) return;
    onSendMessage("Show me OTC alternatives.");
  };

  const cancelOrderFlow = () => {
    if (isLoading) return;
    onSendMessage("Cancel this order.");
  };

  // Voice status label
  const voiceStatusLabel = voiceAgent.isConnecting ? "Connecting…"
    : voiceAgent.isSpeaking ? "Speaking…"
      : voiceAgent.isConnected ? "Listening…"
        : "";

  // Time-aware greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  const firstName = user?.name ? user.name.split(" ")[0] : "there";

  // Refill alerts from dashboard
  const refillAlerts = welcomeData?.active_alerts || [];
  const activeMedicines = welcomeData?.active_medicines || [];

  return (
    <>
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 h-full overflow-hidden relative rounded-tl-3xl",
          theme === "dark" ? "bg-[#0a0a0a]" : "bg-white"
        )}
        style={theme !== "dark" ? {
          boxShadow: "0 0 40px rgba(0,0,0,0.06), -1px 0 0 rgba(0,0,0,0.04)",
        } : {}}
      >
        {/* No ambient glow — white elevated panel */}

        {/* No fullscreen overlay — voice runs inline with chat visible */}

        {/* Header — clean elevated */}
        <div
          className={cn(
            "relative z-20 flex-shrink-0 border-b",
            theme === "dark" ? "bg-[#0a0a0a] border-white/5" : "bg-white border-stone-100"
          )}
        >
          <div className="max-w-3xl mx-auto px-8 py-3.5 flex items-center justify-between">
            {/* Left spacer for balance */}
            <div className="w-10" />

            {/* Center title */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className={cn(
                "text-sm font-semibold tracking-wide",
                theme === "dark" ? "text-slate-400" : "text-slate-600"
              )}>
                PharmAI Assistant
              </h1>
            </div>

            {/* Right — Cart icon */}
            <button
              onClick={() => setCartOpen(true)}
              className={cn(
                "relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200",
                theme === "dark"
                  ? "hover:bg-white/[0.06] text-slate-400 hover:text-emerald-400"
                  : "hover:bg-emerald-50 text-stone-400 hover:text-emerald-600"
              )}
              title="Shopping Cart"
            >
              <ShoppingCart className="w-[18px] h-[18px]" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className={cn(
          "flex-1 overflow-y-auto px-8 relative z-10 transition-all duration-500",
          messages.length === 0 ? "flex flex-col justify-end pb-2" : "py-6"
        )}>
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div
                key="greeting"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-3xl mx-auto w-full flex flex-col gap-4 mb-4"
              >
                {/* Personalized greeting — high contrast */}
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center",
                    theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50"
                  )}>
                    <img src="/pharmai-logo.png" alt="PharmAI" className="w-5 h-5 object-contain" />
                  </div>
                  <span className={cn(
                    "text-xl font-medium tracking-tight",
                    theme === "dark" ? "text-slate-300" : "text-stone-500"
                  )}>
                    {greeting}, {firstName}
                  </span>
                </div>
                <h2 className={cn(
                  "text-3xl md:text-4xl font-bold tracking-tight leading-tight",
                  theme === "dark" ? "text-slate-100" : "text-slate-900"
                )}>
                  How can I help your health today?
                </h2>

                {/* Refill alert cards */}
                {refillAlerts.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-2 space-y-2"
                  >
                    <p className={cn("text-[11px] font-semibold uppercase tracking-wider", theme === "dark" ? "text-slate-600" : "text-stone-400")}>
                      You may be running low on
                    </p>
                    {refillAlerts.slice(0, 3).map((alert: any, i: number) => {
                      const med = activeMedicines.find((m: any) => m.medicine_id === alert.medicine_id);
                      const medName = med?.medicine_name || alert.medicine_name || "Medicine";
                      const daysLeft = alert.estimated_run_out
                        ? Math.max(0, Math.ceil((new Date(alert.estimated_run_out).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                        : null;

                      return (
                        <motion.button
                          key={alert.alert_id || i}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.1 }}
                          onClick={() => onSendMessage(`I want to reorder ${medName} `)}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-200 border-l-[3px] border-l-emerald-500",
                            theme === "dark"
                              ? "bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.1] shadow-sm"
                              : "bg-stone-50/80 border border-stone-200/60 shadow-sm hover:shadow-md hover:bg-stone-50"
                          )}
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                            theme === "dark" ? "bg-amber-500/10" : "bg-amber-50"
                          )}>
                            <span className="text-sm">💊</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-[13px] font-semibold truncate", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                              {medName}
                            </p>
                            <p className={cn("text-[11px]", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                              {daysLeft !== null ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining` : "Refill recommended"}
                              {alert.confidence && (
                                <span className={cn(
                                  "ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase",
                                  alert.confidence === "high" || (typeof alert.confidence === "number" && alert.confidence > 0.7)
                                    ? (theme === "dark" ? "bg-emerald-500/10 text-emerald-400/80" : "bg-emerald-50 text-emerald-600")
                                    : (theme === "dark" ? "bg-amber-500/10 text-amber-400/80" : "bg-amber-50 text-amber-600")
                                )}>
                                  {typeof alert.confidence === "number"
                                    ? (alert.confidence > 0.7 ? "high" : "medium")
                                    : alert.confidence}
                                </span>
                              )}
                            </p>
                          </div>
                          <span className={cn(
                            "text-[11px] font-semibold shrink-0",
                            theme === "dark" ? "text-emerald-400/80" : "text-emerald-600"
                          )}>
                            Reorder →
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="max-w-3xl mx-auto space-y-4 w-full"
              >
                {messages.map((msg) =>
                  msg.role === "user" ? (
                    <UserMessage key={msg.id} content={msg.content as string} />
                  ) : (
                    <AssistantMessage
                      key={msg.id}
                      message={msg}
                      allMessages={messages}
                      onPaymentSuccess={onPaymentSuccess}
                      onPaymentCancel={onPaymentCancel}
                      onAction={onSendMessage}
                      onUploadPrescription={openPrescriptionUpload}
                      onCancelOrder={cancelOrderFlow}
                      onBrowseOtc={browseOtcAlternatives}
                      onSelectRecommendation={chooseRecommendation}
                    />
                  )
                )}
                {isLoading && (
                  <div className="flex items-center gap-3 pt-4">
                    <div className={cn(
                      "w-8 h-8 rounded-xl flex items-center justify-center",
                      theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50"
                    )}>
                      <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
                    </div>
                    <span className={cn("text-sm font-medium animate-pulse", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                      Thinking...
                    </span>
                  </div>
                )}
                <div ref={bottomRef} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area — premium elevated pill */}
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 400, damping: 40 }}
          className={cn(
            "flex-shrink-0 relative z-10 w-full transition-all duration-500",
            theme === "dark"
              ? "bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent"
              : "bg-gradient-to-t from-white via-white/95 to-transparent",
            messages.length === 0
              ? "px-8 pt-4 pb-[15vh]"
              : "px-8 pt-10 pb-6"
          )}
        >
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2">
              {/* Input pill */}
              <div
                className={cn(
                  "flex-1 flex items-center gap-3 rounded-2xl px-5 py-3 transition-all duration-200 chat-input-morph",
                  theme === "dark"
                    ? "bg-white/[0.04] border border-white/[0.08] focus-within:border-white/[0.15]"
                    : "bg-stone-50 border border-stone-200/80 focus-within:border-emerald-400 shadow-sm"
                )}
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className={cn(
                    "flex-1 bg-transparent text-sm outline-none",
                    theme === "dark"
                      ? "text-slate-200 placeholder-slate-500"
                      : "text-slate-800 placeholder-stone-400"
                  )}
                />
              </div>

              {/* Prescription upload */}
              {onPrescriptionUpload && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={cn(
                      "w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-xl transition-all duration-200 disabled:opacity-50",
                      theme === "dark"
                        ? "bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] text-slate-400"
                        : "bg-stone-50 border border-stone-200/80 hover:bg-stone-100 text-stone-400 hover:text-stone-600"
                    )}
                    title="Upload Prescription"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </>
              )}

              {/* Mic toggle — starts/stops voice inline */}
              <button
                onClick={async () => {
                  if (isVoiceMode) {
                    voiceAgent.endSession();
                    setIsVoiceMode(false);
                  } else {
                    setIsVoiceMode(true);
                    const tid = await ensureThread();
                    if (tid) voiceAgent.startSession(tid);
                  }
                }}
                disabled={isLoading || voiceAgent.isConnecting}
                className={cn(
                  "w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-xl transition-all duration-200 disabled:opacity-50",
                  isVoiceMode
                    ? "bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-400"
                    : theme === "dark"
                      ? "bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-400"
                      : "bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md hover:shadow-lg"
                )}
                style={!isVoiceMode && theme !== "dark" ? { animation: "chat-mic-pulse 2s infinite" } : {}}
                title={isVoiceMode ? "Stop Voice" : "Voice Input"}
              >
                {isVoiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Inline Shader Ball — visible when voice is active */}
              <AnimatePresence>
                {isVoiceMode && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="relative flex items-center gap-2"
                  >
                    {/* Small shader orb */}
                    <div className="relative w-10 h-10 flex-shrink-0">
                      {/* Speaking halo */}
                      {voiceAgent.isSpeaking && (
                        <motion.div
                          animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                          className="absolute inset-0 rounded-full bg-emerald-400/20 blur-md -z-10"
                        />
                      )}
                      {/* Listening rings */}
                      {voiceAgent.isConnected && !voiceAgent.isSpeaking && (
                        <motion.div
                          animate={{ scale: 1 + voiceAgent.audioLevel * 0.3, opacity: 0.2 + voiceAgent.audioLevel * 0.4 }}
                          transition={{ duration: 0.1 }}
                          className="absolute inset-[-4px] rounded-full border border-emerald-400/30 -z-10"
                        />
                      )}
                      <ShaderCanvas size={40} isListening={voiceAgent.isConnected && !voiceAgent.isSpeaking} isSpeaking={voiceAgent.isSpeaking} shaderId={1} />
                    </div>
                    {/* Status text */}
                    <span className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap",
                      voiceAgent.isSpeaking
                        ? "text-emerald-500"
                        : voiceAgent.isConnected
                          ? theme === "dark" ? "text-blue-400" : "text-blue-500"
                          : theme === "dark" ? "text-slate-500" : "text-slate-400"
                    )}>
                      {voiceStatusLabel}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Send */}
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading}
                className={cn(
                  "w-10 h-10 flex items-center justify-center flex-shrink-0 rounded-xl transition-all duration-200",
                  "bg-emerald-600 hover:bg-emerald-500 text-white",
                  "shadow-md hover:shadow-lg",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* Suggestion Pills */}
            <AnimatePresence>
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 15 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-wrap items-center gap-2.5 mt-5"
                >
                  <SuggestionPill icon="📦" text="Track my order" theme={theme} onClick={() => onSendMessage("Track my last order")} />
                  <SuggestionPill icon="🩺" text="I have a headache" theme={theme} onClick={() => onSendMessage("I have a headache")} />
                  <SuggestionPill icon="💊" text="Refill my medicine" theme={theme} onClick={() => onSendMessage("Refill my medicine")} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Cart Drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => {
          setCartOpen(false);
          // Refresh count after drawer closes
          getCart().then(d => setCartCount(d?.item_count || 0)).catch(() => { });
        }}
        onCheckoutSuccess={(result) => {
          setCartCount(0);
          if (result?.order_id) {
            onSendMessage(`My cart checkout is complete.Order ID: ${result.order_id} `);
          }
        }}
      />
    </>
  );
}

/* ─── User Message — clean neutral ─── */
function UserMessage({ content }: { content: string }) {
  const { theme } = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex justify-end"
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl rounded-br-md px-5 py-3 text-sm leading-relaxed",
          theme === "dark"
            ? "bg-emerald-500/10 text-slate-200 border border-emerald-500/15"
            : "bg-stone-100 text-slate-800 border border-stone-200/60"
        )}
      >
        {content === "📋 Prescription uploaded" ? (
          <div className="flex items-center gap-2">
            <span className="text-emerald-500">✔</span>
            <span>Prescription received — analyzing medications...</span>
          </div>
        ) : content}
      </div>
    </motion.div>
  );
}

/* ─── Assistant Message with card rendering ─── */
function AssistantMessage({
  message,
  allMessages,
  onPaymentSuccess,
  onPaymentCancel,
  onAction,
  onUploadPrescription,
  onCancelOrder,
  onBrowseOtc,
  onSelectRecommendation,
}: {
  message: Message;
  allMessages?: Message[];
  onPaymentSuccess?: (result: any) => void;
  onPaymentCancel?: () => void;
  onAction?: (text: string) => void;
  onUploadPrescription?: () => void;
  onCancelOrder?: () => void;
  onBrowseOtc?: () => void;
  onSelectRecommendation?: (name: string) => void;
}) {
  const { theme } = useTheme();
  const isNew = message.isNew ?? false;
  const textContent = typeof message.content === "string" ? message.content : "";
  const { displayed, done } = useStreamingText(textContent, isNew);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderedContent = typeof message.content === "string"
    ? renderMarkdown(isNew ? displayed : textContent)
    : message.content;

  const uiType = message.uiPayload?.type || "none";
  const cardPayment = message.payment || message.uiPayload?.data?.payment;
  const cardQuote = message.quote || message.uiPayload?.data?.quote;
  const cardRecommendations = message.recommendations || message.uiPayload?.data?.items;
  const deliveryOrderId = message.orderId || message.uiPayload?.data?.order_id;
  const isDeliveryOnly = (uiType === "delivery_status" || message.action === "delivery_confirmed") && !textContent;
  const isPrescriptionReview = !!message.prescription;
  const hasRecommendations = !!(cardRecommendations && cardRecommendations.length > 0);
  const showPrescriptionActions = uiType === "prescription_required" || uiType === "prescription_upload" || needsPrescriptionActionCard(message, allMessages);
  // Use uiPayload.type as the primary selector: order_summary wins over recommendations
  const showQuoteCard = !!(cardQuote && cardQuote.lines?.length > 0) && !showPrescriptionActions
    && (uiType === "order_summary" || !hasRecommendations);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-start"
    >
      <div className="max-w-[85%] flex gap-3">
        {/* Avatar */}
        <div className={cn(
          "w-8 h-8 flex-shrink-0 rounded-xl flex items-center justify-center mt-1",
          theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50"
        )}>
          <img src="/pharmai-logo.png" alt="PharmAI" className="w-5 h-5 object-contain" />
        </div>

        {/* Content + Cards */}
        <div className="flex-1 min-w-0">
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider mb-1.5 block",
            theme === "dark" ? "text-slate-600" : "text-slate-400"
          )}>
            PharmAI
          </span>

          {/* Text bubble — light emerald tint */}
          {!isDeliveryOnly && !isPrescriptionReview && textContent && (
            <div
              className={cn(
                "rounded-2xl rounded-tl-md px-5 py-4 text-sm leading-relaxed",
                theme === "dark"
                  ? "bg-white/[0.025] border border-white/[0.06] text-slate-300"
                  : "bg-emerald-50/70 border border-emerald-100/60 text-slate-700"
              )}
            >
              <div className="space-y-1">
                {renderedContent}
                {isNew && !done && (
                  <span className="inline-block w-0.5 h-4 bg-emerald-500/60 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          )}

          {/* ─── Rich Cards ─── */}

          {/* ─── Rich Cards ─── */}

          {/* 1. Payment Card preempts everything */}
          {(uiType === "payment" || message.action === "request_payment") && cardPayment ? (
            <div className="mt-2 w-full max-w-sm drop-shadow-sm">
              <PaymentCard
                payment={cardPayment}
                onPaymentSuccess={onPaymentSuccess || (() => { })}
                onPaymentCancel={onPaymentCancel || (() => { })}
              />
            </div>
          ) : showPrescriptionActions ? (
            <PrescriptionActionCard
              medicineNames={collectPrescriptionLockedMedicineNames(message)}
              onUploadPrescription={onUploadPrescription}
              onCancelOrder={onCancelOrder}
              onBrowseOtc={onBrowseOtc}
            />
          ) : showQuoteCard ? (
            /* 2. Order Summary — takes priority over recommendations */
            <div className="mt-2 w-full max-w-sm drop-shadow-sm overflow-visible">
              <OrderSummaryCard quote={cardQuote} />
            </div>
          ) : hasRecommendations && uiType !== "order_summary" ? (
            <MedicineSuggestionCard
              recommendations={cardRecommendations || []}
              onSelectRecommendation={onSelectRecommendation}
              onUploadPrescription={onUploadPrescription}
              onCancelOrder={onCancelOrder}
            />
          ) : uiType === "waitlist_subscribed" && message.uiPayload?.data?.items ? (
            <div className="mt-2 w-full max-w-sm drop-shadow-sm">
              <WaitlistCard items={message.uiPayload.data.items} />
            </div>
          ) : uiType === "cart_summary" && message.uiPayload?.data?.cart ? (
            <div className="mt-2 w-full max-w-sm drop-shadow-sm">
              <CartCard cart={message.uiPayload.data.cart} />
            </div>
          ) : null}

          {/* Prescription Status */}
          {message.prescription && (
            <PrescriptionStatus prescription={message.prescription} isNew={isNew} onAction={onAction} />
          )}

          {/* Delivery Tracker */}
          {(uiType === "delivery_status" || message.action === "delivery_confirmed") && deliveryOrderId && (
            <DeliveryTracker orderId={deliveryOrderId} isNew={isNew} />
          )}

          {/* Copy button removed for cleaner UI */}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Voice mode card renderer ─── */
function VoiceCardRenderer({
  message,
  onPaymentSuccess,
  onPaymentCancel,
  onUploadPrescription,
  onCancelOrder,
  onBrowseOtc,
  onSelectRecommendation,
}: {
  message: Message;
  onPaymentSuccess?: (result: any) => void;
  onPaymentCancel?: () => void;
  onUploadPrescription?: () => void;
  onCancelOrder?: () => void;
  onBrowseOtc?: () => void;
  onSelectRecommendation?: (name: string) => void;
}) {
  const uiType = message.uiPayload?.type || "none";
  const cardPayment = message.payment || message.uiPayload?.data?.payment;
  const cardQuote = message.quote || message.uiPayload?.data?.quote;
  const cardRecommendations = message.recommendations || message.uiPayload?.data?.items;
  const deliveryOrderId = message.orderId || message.uiPayload?.data?.order_id;

  // 1. Payment requested overrules everything
  if ((uiType === "payment" || message.action === "request_payment") && cardPayment) {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <PaymentCard
          payment={cardPayment}
          onPaymentSuccess={onPaymentSuccess || (() => { })}
          onPaymentCancel={onPaymentCancel || (() => { })}
        />
      </div>
    );
  }
  // 2. Prescription review
  if (message.prescription) {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <PrescriptionStatus prescription={message.prescription} isNew={false} />
      </div>
    );
  }
  // 3. Prescription action/upload card
  if (uiType === "prescription_upload" || needsPrescriptionActionCard(message, undefined)) {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <PrescriptionActionCard
          medicineNames={collectPrescriptionLockedMedicineNames(message)}
          onUploadPrescription={onUploadPrescription}
          onCancelOrder={onCancelOrder}
          onBrowseOtc={onBrowseOtc}
        />
      </div>
    );
  }
  // 4. Order summary — takes priority over recommendations
  if (cardQuote && cardQuote.lines?.length > 0 && (uiType === "order_summary" || !(cardRecommendations && cardRecommendations.length > 0))) {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <OrderSummaryCard quote={cardQuote} />
      </div>
    );
  }
  // 5. Medicine recommendations (only when no order summary)
  if (cardRecommendations && cardRecommendations.length > 0 && uiType !== "order_summary") {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <MedicineSuggestionCard
          recommendations={cardRecommendations}
          onSelectRecommendation={onSelectRecommendation}
          onUploadPrescription={onUploadPrescription}
          onCancelOrder={onCancelOrder}
        />
      </div>
    );
  }
  // 6. Waitlist notification
  if (uiType === "waitlist_subscribed" && message.uiPayload?.data?.items) {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <WaitlistCard items={message.uiPayload.data.items} />
      </div>
    );
  }
  // 7. Cart summary
  if (uiType === "cart_summary" && message.uiPayload?.data?.cart) {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <CartCard cart={message.uiPayload.data.cart} />
      </div>
    );
  }
  // 8. Delivery tracker
  if ((uiType === "delivery_status" || message.action === "delivery_confirmed") && deliveryOrderId) {
    return (
      <div className="transform scale-[1.02] md:scale-[1.15] md:origin-top w-full">
        <DeliveryTracker orderId={deliveryOrderId} isNew={false} />
      </div>
    );
  }
  return null;
}

function SuggestionPill({ icon, text, theme, onClick }: { icon: string; text: string; theme: string; onClick?: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium transition-all duration-200",
        theme === "dark"
          ? "bg-white/[0.03] hover:bg-white/[0.06] text-slate-400 border border-white/[0.06] hover:border-white/[0.1]"
          : "bg-stone-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 border border-stone-200/60 hover:border-emerald-200"
      )}
    >
      {icon && <span>{icon}</span>}
      <span>{text}</span>
    </motion.button>
  );
}
