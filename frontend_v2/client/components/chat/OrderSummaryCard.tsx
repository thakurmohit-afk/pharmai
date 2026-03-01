import { useState, useCallback } from "react";
import { subscribeWaitlist } from "@/services/api";
import {
  Pill, ChevronDown, ChevronUp, Truck, ShieldCheck, ShieldAlert,
  Utensils, Moon, Wine, FlaskConical, Factory, CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import type { QuotePayload, QuoteLine } from "@/types/chat";

/* ─── Soft, muted category colors (no neon) ─── */
const CATEGORY_COLORS: Record<string, { bg: string; icon: string }> = {
  Analgesic: { bg: "bg-rose-50 dark:bg-rose-500/8", icon: "text-rose-400" },
  Antibiotic: { bg: "bg-emerald-50 dark:bg-emerald-500/8", icon: "text-emerald-400" },
  Antihistamine: { bg: "bg-violet-50 dark:bg-violet-500/8", icon: "text-violet-400" },
  Cardiac: { bg: "bg-red-50 dark:bg-red-500/8", icon: "text-red-400" },
  Antidiabetic: { bg: "bg-amber-50 dark:bg-amber-500/8", icon: "text-amber-400" },
  Gastrointestinal: { bg: "bg-lime-50 dark:bg-lime-500/8", icon: "text-lime-500" },
  Antihypertensive: { bg: "bg-sky-50 dark:bg-sky-500/8", icon: "text-sky-400" },
  default: { bg: "bg-slate-50 dark:bg-slate-500/8", icon: "text-emerald-400" },
};

function getCategoryColor(category?: string) {
  if (!category) return CATEGORY_COLORS.default;
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

function formatInr(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ─── Single Medicine Card ─── */
function MedicineCard({ line, index }: { line: QuoteLine; index: number }) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [notifyState, setNotifyState] = useState<"idle" | "loading" | "subscribed">("idle");
  const counseling = line.counseling_info || {};
  const hasDetails = line.manufacturer || (line.active_ingredients && line.active_ingredients.length > 0) || Object.keys(counseling).length > 0;
  const catColor = getCategoryColor(line.category);
  const isOutOfStock = line.in_stock === false;

  const handleNotifyMe = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (notifyState !== "idle") return;
    setNotifyState("loading");
    try {
      await subscribeWaitlist(line.name);
      setNotifyState("subscribed");
    } catch {
      setNotifyState("idle");
    }
  }, [notifyState, line.name]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: "spring", stiffness: 260, damping: 24 }}
      whileHover={{ y: -1, transition: { duration: 0.2 } }}
      layout
      onClick={() => hasDetails && setExpanded(!expanded)}
      className={cn(
        "rounded-2xl p-4 transition-all duration-200",
        hasDetails && "cursor-pointer",
        theme === "dark"
          ? "bg-white/[0.025] border border-white/[0.06] hover:border-white/[0.1] shadow-[0_2px_8px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.1)]"
          : "bg-white border border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.06)]"
      )}
    >
      <div className="flex items-start gap-3.5">
        {/* Medicine icon with soft bg container */}
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
          catColor.bg
        )}>
          <Pill className={cn("w-5 h-5", catColor.icon)} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={cn("text-[14px] font-semibold truncate leading-tight", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
                {line.name}
              </p>
              {line.generic_name && (
                <p className={cn("text-xs truncate mt-0.5", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                  {line.generic_name}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className={cn("text-[15px] font-semibold tabular-nums", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
                ₹{formatInr(line.subtotal)}
              </p>
              <p className={cn("text-[11px] mt-0.5 tabular-nums", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                {line.billing_qty} {line.billing_unit}{line.billing_qty > 1 ? "s" : ""} × ₹{formatInr(line.unit_price)}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
            {line.dosage && (
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-semibold",
                theme === "dark" ? "bg-slate-800 text-slate-300 border border-white/5" : "bg-slate-50 text-slate-600"
              )}>
                {line.dosage}
              </span>
            )}
            <span className={cn(
              "px-2.5 py-0.5 rounded-full text-[10px] font-semibold",
              line.prescription_required
                ? (theme === "dark" ? "bg-amber-500/10 text-amber-400/90" : "bg-amber-50 text-amber-600")
                : (theme === "dark" ? "bg-emerald-500/10 text-emerald-400/90" : "bg-emerald-50 text-emerald-600")
            )}>
              {line.prescription_required ? "Rx Required" : "OTC"}
            </span>
            {isOutOfStock ? (
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1",
                theme === "dark" ? "bg-red-500/10 text-red-400/90" : "bg-red-50 text-red-600"
              )}>
                Out of Stock
              </span>
            ) : (
              <span className={cn(
                "px-2.5 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1",
                theme === "dark" ? "bg-emerald-500/10 text-emerald-400/90" : "bg-emerald-50 text-emerald-600"
              )}>
                <CheckCircle2 className="w-2.5 h-2.5" />
                In Stock
              </span>
            )}
            {hasDetails && (
              expanded
                ? <ChevronUp className={cn("w-3.5 h-3.5 ml-auto", theme === "dark" ? "text-slate-600" : "text-slate-300")} />
                : <ChevronDown className={cn("w-3.5 h-3.5 ml-auto", theme === "dark" ? "text-slate-600" : "text-slate-300")} />
            )}
          </div>

          {/* Delivery estimate — only for in-stock items */}
          {!isOutOfStock && (
            <div className={cn("flex items-center gap-1.5 mt-2.5 text-[11px] font-medium", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
              <Truck className="w-3 h-3" />
              Estimated delivery: Tomorrow, 6–9 PM
            </div>
          )}

          {/* Notify Me — only for out-of-stock items */}
          {isOutOfStock && (
            <button
              onClick={handleNotifyMe}
              disabled={notifyState !== "idle"}
              className={cn(
                "mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all duration-200",
                notifyState === "subscribed"
                  ? (theme === "dark"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
                    : "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default")
                  : (theme === "dark"
                    ? "bg-white/[0.04] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.12]"
                    : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200")
              )}
            >
              {notifyState === "loading" ? (
                <span className="animate-pulse">Subscribing…</span>
              ) : notifyState === "subscribed" ? (
                <><CheckCircle2 className="w-3.5 h-3.5" /> Subscribed — we'll notify you</>
              ) : (
                <>🔔 Notify Me When Available</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className={cn("mt-3.5 pt-3.5 space-y-3 border-t", theme === "dark" ? "border-white/5" : "border-slate-100")}>
              {/* Manufacturer */}
              {line.manufacturer && (
                <div className="flex items-center gap-2">
                  <Factory className={cn("w-3.5 h-3.5", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
                  <span className={cn("text-xs", theme === "dark" ? "text-slate-400" : "text-slate-500")}>{line.manufacturer}</span>
                </div>
              )}

              {/* Active ingredients */}
              {line.active_ingredients && line.active_ingredients.length > 0 && (
                <div className="flex items-start gap-2">
                  <FlaskConical className={cn("w-3.5 h-3.5 mt-0.5", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
                  <div className="flex flex-wrap gap-1.5">
                    {line.active_ingredients.map((ing, i) => (
                      <span key={i} className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-medium",
                        theme === "dark" ? "bg-slate-800 text-slate-300 border border-white/5" : "bg-slate-50 text-slate-600"
                      )}>
                        {ing.molecule} {ing.strength_mg ? `${ing.strength_mg}${ing.strength_unit || "mg"}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Counseling tags */}
              {(counseling.food_timing || counseling.drowsiness || counseling.alcohol_warning || counseling.is_antibiotic) && (
                <div className="flex flex-wrap gap-1.5">
                  {counseling.food_timing && (
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium",
                      theme === "dark" ? "bg-slate-800 text-slate-300 border border-white/5" : "bg-slate-50 text-slate-600"
                    )}>
                      <Utensils className="w-3 h-3 text-emerald-500" />
                      {counseling.food_timing === "before_food" ? "Take before food" :
                        counseling.food_timing === "after_food" ? "Take after food" : "Take any time"}
                    </span>
                  )}
                  {counseling.drowsiness && (
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium",
                      theme === "dark" ? "bg-slate-800 text-slate-300 border border-white/5" : "bg-slate-50 text-slate-600"
                    )}>
                      <Moon className="w-3 h-3 text-blue-400" />
                      May cause drowsiness
                    </span>
                  )}
                  {counseling.alcohol_warning && (
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium",
                      theme === "dark" ? "bg-red-500/8 text-red-400/90 border border-red-500/10" : "bg-red-50 text-red-500"
                    )}>
                      <Wine className="w-3 h-3" />
                      Avoid alcohol
                    </span>
                  )}
                  {counseling.is_antibiotic && (
                    <span className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium",
                      theme === "dark" ? "bg-amber-500/8 text-amber-400/90 border border-amber-500/10" : "bg-amber-50 text-amber-600"
                    )}>
                      <ShieldAlert className="w-3 h-3" />
                      Complete full course
                    </span>
                  )}
                </div>
              )}

              {/* Side effects */}
              {counseling.common_side_effects && counseling.common_side_effects.length > 0 && (
                <p className={cn("text-[11px] leading-relaxed", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                  Possible side effects: {counseling.common_side_effects.join(", ")}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Order Summary Card ─── */
export default function OrderSummaryCard({ quote }: { quote: QuotePayload }) {
  const { theme } = useTheme();

  if (!quote || !Array.isArray(quote.lines) || quote.lines.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={cn(
        "mt-4 rounded-2xl overflow-hidden",
        theme === "dark"
          ? "bg-[#0B1120]/80 border border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "bg-white border border-slate-100/80 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_8px_30px_rgba(0,0,0,0.06)]"
      )}
    >
      {/* Subtle top gradient accent */}
      <div className={cn(
        "h-[2px] w-full",
        theme === "dark"
          ? "bg-gradient-to-r from-emerald-500/40 via-teal-500/30 to-transparent"
          : "bg-gradient-to-r from-emerald-400/30 via-teal-400/20 to-transparent"
      )} />

      {/* Header */}
      <div className={cn(
        "px-5 py-3.5 flex items-center gap-2.5",
        theme === "dark" ? "border-b border-white/[0.04]" : "border-b border-slate-50"
      )}>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50")}>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        </div>
        <span className={cn("text-[13px] font-semibold", theme === "dark" ? "text-slate-300" : "text-slate-600")}>
          Your medicines are ready
        </span>
        <span className={cn("text-[11px] font-medium ml-auto tabular-nums", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
          {quote.lines.length} item{quote.lines.length > 1 ? "s" : ""}
        </span>
      </div>

      {quote.quantity_status !== "resolved" && (
        <div className={cn(
          "px-5 py-2 text-[11px] font-medium border-b",
          theme === "dark"
            ? "text-amber-300/90 border-white/[0.04] bg-amber-500/5"
            : "text-amber-700 border-slate-50 bg-amber-50/80"
        )}>
          Quantity confirmation still needed. Please confirm the exact strips to proceed.
        </div>
      )}

      {/* Medicine cards */}
      <div className="p-3.5 space-y-2.5">
        {quote.lines.map((line, idx) => (
          <MedicineCard key={line.medicine_id || idx} line={line} index={idx} />
        ))}
      </div>

      {/* Conversion note */}
      {quote.conversion_note && (
        <div className={cn("px-5 py-2 text-[11px] font-medium", theme === "dark" ? "text-amber-400/60" : "text-amber-600/60")}>
          {quote.conversion_note}
        </div>
      )}

      {/* Total */}
      <div className={cn(
        "px-5 py-4 flex items-center justify-between",
        theme === "dark" ? "border-t border-white/[0.04] bg-white/[0.01]" : "border-t border-slate-50 bg-slate-50/30"
      )}>
        <span className={cn("text-[12px] font-semibold uppercase tracking-wide", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
          Total
        </span>
        <span className={cn("text-xl font-semibold tabular-nums", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
          ₹{formatInr(quote.total_amount)}
        </span>
      </div>
    </motion.div>
  );
}
