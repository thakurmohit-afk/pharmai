import { useState, useCallback } from "react";
import {
  Lock, Smartphone, CreditCard, Building2, Loader2, CheckCircle2,
  ShieldCheck, Receipt,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { verifyPayment, notifyVoicePaymentStatus } from "@/services/api";
import type { PaymentPayload } from "@/types/chat";

declare global {
  interface Window {
    Razorpay: any;
  }
}

type PaymentMethod = "upi" | "card" | "netbanking";

const METHODS: { id: PaymentMethod; label: string; icon: any }[] = [
  { id: "upi", label: "UPI", icon: Smartphone },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "netbanking", label: "Net Banking", icon: Building2 },
];

function formatInr(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

interface PaymentCardProps {
  payment: PaymentPayload;
  onPaymentSuccess: (result: any) => void;
  onPaymentCancel: () => void;
}

export default function PaymentCard({ payment, onPaymentSuccess, onPaymentCancel }: PaymentCardProps) {
  const { theme } = useTheme();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("upi");
  const [status, setStatus] = useState<"pending" | "processing" | "success" | "failed">("pending");
  const [paidAt, setPaidAt] = useState<string>("");
  const [paymentId, setPaymentId] = useState<string>("");

  const handlePay = useCallback(async () => {
    if (!window.Razorpay) {
      console.error("Razorpay SDK not loaded");
      setStatus("failed");
      return;
    }

    setStatus("processing");

    const options = {
      key: payment.key_id,
      amount: Math.round(payment.amount * 100),
      currency: payment.currency || "INR",
      name: "PharmDash",
      description: "Medicine Order",
      order_id: payment.razorpay_order_id,
      handler: async (response: any) => {
        try {
          const result = await verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            payment_method: selectedMethod,
          });
          setPaymentId(response.razorpay_payment_id || "");
          setPaidAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
          setStatus("success");
          notifyVoicePaymentStatus("success", payment.order_id).catch(() => {});
          onPaymentSuccess(result);
        } catch (err) {
          console.error("Payment verification failed", err);
          setStatus("failed");
          notifyVoicePaymentStatus("failed", payment.order_id).catch(() => {});
        }
      },
      modal: {
        ondismiss: () => {
          setStatus("pending");
          notifyVoicePaymentStatus("dismissed", payment.order_id).catch(() => {});
          onPaymentCancel();
        },
      },
      theme: { color: "#10b981" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  }, [payment, selectedMethod, onPaymentSuccess, onPaymentCancel]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={cn(
        "mt-4 rounded-2xl overflow-hidden max-w-sm",
        theme === "dark"
          ? "bg-[#0B1120]/80 border border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "bg-white border border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)]"
      )}
    >
      {/* Subtle top accent */}
      <div className={cn(
        "h-[2px] w-full",
        theme === "dark"
          ? "bg-gradient-to-r from-emerald-500/40 via-teal-500/30 to-transparent"
          : "bg-gradient-to-r from-emerald-400/30 via-teal-400/20 to-transparent"
      )} />

      <AnimatePresence mode="wait">
        {status === "success" ? (
          /* ─── Success State ─── */
          <motion.div
            key="success"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="p-6 flex flex-col items-center gap-4"
          >
            {/* Animated check with ring pulse */}
            <div className="relative">
              <motion.div
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center"
              >
                <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              </motion.div>
              {/* Ring pulse */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0.6 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                className="absolute inset-0 rounded-full border-2 border-emerald-500/30"
              />
              <motion.div
                initial={{ scale: 0.8, opacity: 0.4 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }}
                className="absolute inset-0 rounded-full border border-emerald-500/20"
              />
            </div>

            <div className="text-center">
              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={cn("text-[15px] font-semibold", theme === "dark" ? "text-slate-100" : "text-slate-800")}
              >
                Payment Confirmed
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className={cn("text-xs mt-1", theme === "dark" ? "text-slate-500" : "text-slate-400")}
              >
                Your medicines have been reserved
              </motion.p>
            </div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className={cn("text-xl font-semibold tabular-nums", theme === "dark" ? "text-slate-100" : "text-slate-800")}
            >
              ₹{formatInr(payment.amount)}
            </motion.p>

            {/* Transaction details */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              className={cn(
                "w-full rounded-xl p-3.5 space-y-2",
                theme === "dark" ? "bg-white/[0.025] border border-white/[0.04]" : "bg-slate-50/80 border border-slate-100/50"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Receipt className={cn("w-3 h-3", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
                <span className={cn("text-[10px] font-semibold uppercase tracking-wide", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                  Transaction Details
                </span>
              </div>
              {paymentId && (
                <div className="flex items-center justify-between">
                  <span className={cn("text-[11px]", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Payment ID</span>
                  <span className={cn("text-[11px] font-mono font-medium", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                    {paymentId.length > 16 ? `${paymentId.substring(0, 16)}...` : paymentId}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className={cn("text-[11px]", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Method</span>
                <span className={cn("text-[11px] font-medium", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                  {selectedMethod === "upi" ? "UPI" : selectedMethod === "card" ? "Card" : "Net Banking"}
                </span>
              </div>
              {paidAt && (
                <div className="flex items-center justify-between">
                  <span className={cn("text-[11px]", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Time</span>
                  <span className={cn("text-[11px] font-medium", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                    {paidAt}
                  </span>
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : (
          /* ─── Pending / Processing State ─── */
          <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50")}>
                  <Lock className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span className={cn("text-[13px] font-semibold", theme === "dark" ? "text-slate-300" : "text-slate-600")}>
                  Secure Payment
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3 text-emerald-500" />
                <span className={cn("text-[10px] font-medium", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                  Razorpay Protected
                </span>
              </div>
            </div>

            {/* Amount */}
            <div className="text-center mb-5">
              <p className={cn("text-2xl font-semibold tabular-nums", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
                ₹{formatInr(payment.amount)}
              </p>
              <p className={cn("text-[11px] font-medium mt-1", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                {payment.items?.length || 0} item{(payment.items?.length || 0) !== 1 ? "s" : ""} · Medicine order
              </p>
            </div>

            {/* Method selector */}
            <div className={cn(
              "flex gap-1.5 p-1 rounded-xl mb-4",
              theme === "dark" ? "bg-white/[0.03] border border-white/[0.04]" : "bg-slate-50/80 border border-slate-100/50"
            )}>
              {METHODS.map((m) => {
                const Icon = m.icon;
                const isSelected = selectedMethod === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethod(m.id)}
                    disabled={status === "processing"}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200",
                      isSelected
                        ? (theme === "dark"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15"
                            : "bg-emerald-50 text-emerald-600 border border-emerald-100")
                        : (theme === "dark"
                            ? "text-slate-500 hover:text-slate-300 border border-transparent"
                            : "text-slate-400 hover:text-slate-600 border border-transparent")
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Pay button */}
            <button
              onClick={handlePay}
              disabled={status === "processing"}
              className={cn(
                "w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 relative overflow-hidden",
                status === "processing"
                  ? "bg-emerald-600/50 text-white/70 cursor-wait"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.25)] hover:shadow-[0_4px_16px_rgba(16,185,129,0.3)]"
              )}
            >
              {status === "processing" ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing payment...
                </span>
              ) : (
                `Pay ₹${formatInr(payment.amount)}`
              )}
            </button>

            {status === "failed" && (
              <p className={cn("text-xs text-center mt-3 font-medium", theme === "dark" ? "text-red-400/80" : "text-red-500/80")}>
                Payment couldn't be completed. Please try again.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
