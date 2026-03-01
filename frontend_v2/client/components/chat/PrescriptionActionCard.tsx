import { FilePlus2, ShieldAlert, XCircle, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

interface PrescriptionActionCardProps {
  medicineNames?: string[];
  onUploadPrescription?: () => void;
  onCancelOrder?: () => void;
  onBrowseOtc?: () => void;
}

export default function PrescriptionActionCard({
  medicineNames = [],
  onUploadPrescription,
  onCancelOrder,
  onBrowseOtc,
}: PrescriptionActionCardProps) {
  const { theme } = useTheme();
  const hasNames = medicineNames.length > 0;
  const title = hasNames
    ? `${medicineNames.slice(0, 2).join(", ")} ${medicineNames.length > 2 ? "and more" : ""} require a prescription`
    : "Prescription required to proceed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={cn(
        "rounded-2xl overflow-hidden border",
        theme === "dark"
          ? "bg-[#0B1120]/80 border-amber-400/20 shadow-[0_6px_28px_rgba(0,0,0,0.35)]"
          : "bg-white border-amber-200 shadow-[0_3px_18px_rgba(0,0,0,0.07)]"
      )}
    >
      <div className={cn(
        "px-4 py-3.5 border-b flex items-start gap-2.5",
        theme === "dark" ? "border-white/[0.06]" : "border-slate-100"
      )}>
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
          theme === "dark" ? "bg-amber-500/12" : "bg-amber-50"
        )}>
          <ShieldAlert className={cn("w-4.5 h-4.5", theme === "dark" ? "text-amber-300" : "text-amber-600")} />
        </div>
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold leading-tight", theme === "dark" ? "text-slate-100" : "text-slate-800")}>
            {title}
          </p>
          <p className={cn("text-[11px] mt-1", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
            Upload your prescription to continue this order.
          </p>
        </div>
      </div>

      <div className="p-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          onClick={onUploadPrescription}
          className={cn(
            "h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5",
            theme === "dark"
              ? "bg-emerald-500/18 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
          )}
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          Upload Rx
        </button>
        <button
          onClick={onBrowseOtc}
          className={cn(
            "h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5",
            theme === "dark"
              ? "bg-white/[0.05] text-slate-200 border border-white/[0.08] hover:bg-white/[0.09]"
              : "bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          OTC Options
        </button>
        <button
          onClick={onCancelOrder}
          className={cn(
            "h-10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5",
            theme === "dark"
              ? "bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/18"
              : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
          )}
        >
          <XCircle className="w-3.5 h-3.5" />
          Cancel Order
        </button>
      </div>
    </motion.div>
  );
}

