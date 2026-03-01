import { Pill, ShieldCheck, ShieldAlert, Sparkles, FileUp, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import type { MedicineRecommendation } from "@/types/chat";

const CATEGORY_COLORS: Record<string, { bg: string; icon: string }> = {
  Analgesic: { bg: "bg-rose-50 dark:bg-rose-500/8", icon: "text-rose-400" },
  Antibiotic: { bg: "bg-emerald-50 dark:bg-emerald-500/8", icon: "text-emerald-400" },
  Antihistamine: { bg: "bg-cyan-50 dark:bg-cyan-500/8", icon: "text-cyan-400" },
  Cardiac: { bg: "bg-red-50 dark:bg-red-500/8", icon: "text-red-400" },
  Antidiabetic: { bg: "bg-amber-50 dark:bg-amber-500/8", icon: "text-amber-400" },
  Gastrointestinal: { bg: "bg-lime-50 dark:bg-lime-500/8", icon: "text-lime-500" },
  Antihypertensive: { bg: "bg-sky-50 dark:bg-sky-500/8", icon: "text-sky-400" },
  default: { bg: "bg-slate-50 dark:bg-slate-500/8", icon: "text-slate-400" },
};

function getCategoryColor(category?: string) {
  if (!category) return CATEGORY_COLORS.default;
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
}

function formatInr(amount: number): string {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

interface MedicineSuggestionCardProps {
  recommendations: MedicineRecommendation[];
  onSelectRecommendation?: (name: string) => void;
  onUploadPrescription?: () => void;
  onCancelOrder?: () => void;
}

export default function MedicineSuggestionCard({
  recommendations,
  onSelectRecommendation,
  onUploadPrescription,
  onCancelOrder,
}: MedicineSuggestionCardProps) {
  const { theme } = useTheme();
  if (!recommendations || recommendations.length === 0) return null;

  const hasRxItems = recommendations.some((med) => med.prescription_required);

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden border",
        theme === "dark"
          ? "bg-[#0B1120]/80 border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
          : "bg-white border-slate-100/80 shadow-[0_2px_14px_rgba(0,0,0,0.06)]"
      )}
    >
      <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400" />
      <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", theme === "dark" ? "bg-cyan-500/12" : "bg-cyan-50")}>
            <Sparkles className={cn("w-4.5 h-4.5", theme === "dark" ? "text-cyan-300" : "text-cyan-600")} />
          </div>
          <div className="min-w-0">
            <h3 className={cn("text-sm font-semibold truncate", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
              Recommended medicines
            </h3>
            <p className={cn("text-[11px]", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
              {recommendations.length} option{recommendations.length !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-2.5">
        {recommendations.map((med, index) => {
          const catColor = getCategoryColor(med.category);
          return (
            <motion.div
              key={`${med.name}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, type: "spring", stiffness: 260, damping: 24 }}
              className={cn(
                "rounded-xl p-3.5 border",
                theme === "dark"
                  ? "bg-white/[0.025] border-white/[0.08]"
                  : "bg-slate-50/50 border-slate-100"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", catColor.bg)}>
                  <Pill className={cn("w-4 h-4", catColor.icon)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("text-sm font-semibold truncate", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
                        {index + 1}. {med.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {med.generic_name && (
                          <span className={cn("text-[11px]", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                            {med.generic_name}
                          </span>
                        )}
                        {med.dosage && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded", theme === "dark" ? "bg-white/[0.06] text-slate-300" : "bg-slate-100 text-slate-600")}>
                            {med.dosage}
                          </span>
                        )}
                      </div>
                    </div>
                    {med.price != null && med.price > 0 && (
                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-semibold tabular-nums", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
                          Rs.{formatInr(med.price)}
                        </p>
                        <p className={cn("text-[10px]", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                          per strip
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      med.prescription_required
                        ? (theme === "dark" ? "bg-amber-500/12 text-amber-300 border border-amber-500/25" : "bg-amber-50 text-amber-700 border border-amber-200")
                        : (theme === "dark" ? "bg-emerald-500/12 text-emerald-300 border border-emerald-500/25" : "bg-emerald-50 text-emerald-700 border border-emerald-200")
                    )}>
                      {med.prescription_required ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                      {med.prescription_required ? "Rx required" : "OTC"}
                    </span>

                    {onSelectRecommendation && (
                      <button
                        onClick={() => onSelectRecommendation(med.name)}
                        className={cn(
                          "text-[10px] font-semibold px-2.5 py-1 rounded-lg border ml-auto",
                          theme === "dark"
                            ? "bg-white/[0.04] border-white/[0.1] text-slate-200 hover:bg-white/[0.08]"
                            : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        Choose this
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {hasRxItems && (
        <div className={cn(
          "px-4 py-3 border-t",
          theme === "dark" ? "border-white/[0.06] bg-amber-500/5" : "border-slate-100 bg-amber-50/55"
        )}>
          <p className={cn("text-[11px] mb-2.5", theme === "dark" ? "text-amber-200/90" : "text-amber-800")}>
            Some medicines need a valid prescription before checkout.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onUploadPrescription}
              className={cn(
                "h-8 px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border",
                theme === "dark"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/22"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
              )}
            >
              <FileUp className="w-3.5 h-3.5" />
              Upload Rx
            </button>
            <button
              onClick={onCancelOrder}
              className={cn(
                "h-8 px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 border",
                theme === "dark"
                  ? "bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/18"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              )}
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

