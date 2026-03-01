import { CheckCircle2, FileText, AlertTriangle, XCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import type { PrescriptionMeta } from "@/types/chat";

interface PrescriptionStatusProps {
  prescription: PrescriptionMeta;
  isNew?: boolean;
  onAction?: (text: string) => void;
}

export default function PrescriptionStatus({ prescription, isNew = false, onAction }: PrescriptionStatusProps) {
  const { theme } = useTheme();

  const medicines = prescription.medicines || [];
  const hasData = medicines.length > 0 || prescription.valid_until || prescription.doctor_name || (prescription.advice && prescription.advice.length > 0);

  if (!hasData) return null;

  // Calculate stats for top summary
  let exactCount = 0;
  let partialCount = 0;
  let notFoundCount = 0;
  let subtotal = 0;

  const evaluatedMedicines = medicines.map((med) => {
    const dbMatch = med.db_matches?.[0]; // Best match

    let state: "exact" | "partial" | "not_found" = "not_found";
    if (dbMatch) {
      if (dbMatch.match_quality === "exact" || dbMatch.match_quality === "strength_mismatch") {
        state = "exact";
        exactCount++;
        subtotal += dbMatch.price || 0;
      } else {
        state = "partial";
        partialCount++;
      }
    } else {
      notFoundCount++;
    }

    return { med, dbMatch, state };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={cn(
        "mt-2 w-[440px] max-w-full rounded-[16px] overflow-hidden flex flex-col",
        theme === "dark"
          ? "bg-[#0A0D14] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
          : "bg-white border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
      )}
    >
      {/* ─── Top Summary Section ─── */}
      <div className={cn(
        "px-4 py-3 border-b",
        theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-slate-50/50 border-slate-100"
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className={cn("w-4 h-4", theme === "dark" ? "text-emerald-400" : "text-emerald-600")} />
            <h3 className={cn("text-[13px] font-semibold uppercase tracking-wider", theme === "dark" ? "text-slate-300" : "text-slate-700")}>
              Prescription Analysis Complete
            </h3>
          </div>
          <span className={cn("text-[11px]", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
            Analyzed {isNew ? "just now" : "previously"}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[12px] font-medium flex-wrap">
          <span className={cn(theme === "dark" ? "text-slate-400" : "text-slate-500")}>Detected: {medicines.length} Medicines</span>

          <div className="w-1 h-1 rounded-full bg-slate-400/30 mx-1" />

          <span className={cn(
            "px-2 py-0.5 rounded-full",
            theme === "dark" ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
          )}>
            Exact: {exactCount}
          </span>
          <span className={cn(
            "px-2 py-0.5 rounded-full",
            theme === "dark" ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"
          )}>
            Partial: {partialCount}
          </span>
          {notFoundCount > 0 && (
            <span className={cn(
              "px-2 py-0.5 rounded-full",
              theme === "dark" ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"
            )}>
              Not Found: {notFoundCount}
            </span>
          )}
        </div>
      </div>

      {/* ─── Medicine Evaluation Cards ─── */}
      <div className="p-4 space-y-3">
        {evaluatedMedicines.map(({ med, dbMatch, state }, i) => (
          <motion.div
            key={i}
            initial={isNew ? { opacity: 0, y: 10 } : { opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: isNew ? 0.1 * i : 0, duration: 0.3 }}
            className={cn(
              "rounded-[12px] p-3 border",
              state === "exact"
                ? (theme === "dark" ? "bg-emerald-500/[0.03] border-emerald-500/20" : "bg-emerald-50/50 border-emerald-100")
                : state === "partial"
                  ? (theme === "dark" ? "bg-amber-500/[0.03] border-amber-500/20" : "bg-amber-50/50 border-amber-100")
                  : (theme === "dark" ? "bg-red-500/[0.03] border-red-500/20" : "bg-red-50/50 border-red-100")
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className={cn("text-[14px] font-semibold leading-tight mb-1", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                  {dbMatch?.name || med.name} {med.dosage && <span className="opacity-70 font-normal">({med.dosage})</span>}
                </h4>
                {dbMatch?.price && (
                  <p className={cn("text-[12px] font-medium", theme === "dark" ? "text-slate-400" : "text-slate-600")}>
                    ₹{dbMatch.price} / strip
                  </p>
                )}
              </div>

              {/* Icon Status */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                state === "exact"
                  ? (theme === "dark" ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-600")
                  : state === "partial"
                    ? (theme === "dark" ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-600")
                    : (theme === "dark" ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600")
              )}>
                {state === "exact" && <CheckCircle2 className="w-4 h-4" />}
                {state === "partial" && <AlertTriangle className="w-4 h-4" />}
                {state === "not_found" && <XCircle className="w-4 h-4" />}
              </div>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5 mb-2">
              <Badge
                text={state === "exact" ? "Exact Molecule Match" : state === "partial" ? "Partial Match" : "No Exact Match"}
                color={state === "exact" ? "emerald" : state === "partial" ? "amber" : "red"}
                theme={theme}
              />
              {dbMatch && (
                <>
                  <Badge
                    text={dbMatch.in_stock ? "In Stock" : "Out of Stock"}
                    color={dbMatch.in_stock ? "slate" : "red"}
                    theme={theme}
                  />
                  <Badge
                    text={dbMatch.rx_required ? "Rx Required" : "No Rx Required"}
                    color="slate"
                    theme={theme}
                  />
                </>
              )}
            </div>

            {/* Issue Explanation (for partial cases) */}
            {state === "partial" && dbMatch?.match_warnings && dbMatch.match_warnings.length > 0 && (
              <div className={cn(
                "mb-3 px-3 py-2 rounded-lg text-[12px] leading-relaxed",
                theme === "dark" ? "bg-black/20 text-slate-300" : "bg-white/60 text-slate-600"
              )}>
                {dbMatch.match_warnings.join(" ")}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={() => onAction && onAction(state === "exact" ? `Add ${dbMatch?.name || med.name} to order` : `Refine ${med.name}`)}
              className={cn(
                "w-full py-1.5 rounded-lg text-[12px] font-semibold transition-all",
                state === "exact"
                  ? (theme === "dark"
                    ? "bg-white/[0.08] hover:bg-white/[0.12] text-emerald-300 border border-emerald-500/20"
                    : "bg-white hover:bg-emerald-50 text-emerald-700 shadow-sm border border-emerald-200")
                  : (theme === "dark"
                    ? "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10"
                    : "bg-white hover:bg-slate-50 text-slate-700 shadow-sm border border-slate-200")
              )}
            >
              {state === "exact" ? "Add to Order" : state === "partial" ? "View Alternatives" : "View Similar Combinations"}
            </button>
          </motion.div>
        ))}

        {/* ─── Doctor Instructions Section ─── */}
        {prescription.advice && prescription.advice.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <h4 className={cn("text-[11px] font-semibold uppercase tracking-wider mb-2", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
              Doctor's Instructions
            </h4>
            <ul className="space-y-1.5">
              {prescription.advice.map((line, i) => {
                const text = typeof line === 'string' ? line : typeof line === 'object' && line !== null ? (line as any).instruction : '';
                if (!text) return null;
                return (
                  <li key={i} className="flex items-start gap-2">
                    <div className={cn("w-1 h-1 rounded-full mt-1.5 shrink-0", theme === "dark" ? "bg-slate-500" : "bg-slate-400")} />
                    <p className={cn("text-[12px] leading-relaxed", theme === "dark" ? "text-slate-300" : "text-slate-600")}>
                      {text}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* ─── Action Footer ─── */}
      <div className={cn(
        "p-4 flex items-center justify-between mt-auto border-t",
        theme === "dark" ? "bg-white/[0.02] border-white/[0.08]" : "bg-slate-50/80 border-slate-100"
      )}>
        <div>
          <p className={cn("text-[11px] font-medium uppercase tracking-wider", theme === "dark" ? "text-slate-500" : "text-slate-500")}>
            Total Amount
          </p>
          <p className={cn("text-[16px] font-bold mt-0.5", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
            ₹{subtotal.toFixed(2)}
          </p>
        </div>
        <button
          onClick={() => {
            if (!onAction) return;
            // Collect exact-match medicine names to send as an explicit order message
            const exactMeds = evaluatedMedicines
              .filter(({ state, dbMatch }) => state === "exact" && dbMatch)
              .map(({ dbMatch, med }) => dbMatch?.name || med.name);
            if (exactMeds.length > 0) {
              const medList = exactMeds.join(", ");
              onAction(`I want to order ${medList} — 1 strip each. Proceed with order.`);
            } else {
              onAction("Proceed with exact matches");
            }
          }}
          disabled={exactCount === 0}
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full transition-all shadow-sm",
            exactCount > 0
              ? (theme === "dark"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.25)]"
                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_2px_8px_rgba(16,185,129,0.25)]")
              : (theme === "dark"
                ? "bg-white/[0.04] text-slate-500 cursor-not-allowed"
                : "bg-slate-100 text-slate-400 cursor-not-allowed")
          )}
        >
          <CheckCircle2 className="w-5 h-5" />
        </button>
      </div>

    </motion.div>
  );
}

function Badge({ text, color, theme }: { text: string, color: "emerald" | "amber" | "red" | "slate", theme: string }) {
  const isDark = theme === "dark";
  const styles = {
    emerald: isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-100",
    red: isDark ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-700 border-red-100",
    slate: isDark ? "bg-slate-500/10 text-slate-300 border-slate-500/20" : "bg-slate-50 text-slate-600 border-slate-200"
  };

  return (
    <span className={cn("px-2.5 py-1 text-[11px] font-semibold rounded-full border", styles[color])}>
      {text}
    </span>
  );
}
