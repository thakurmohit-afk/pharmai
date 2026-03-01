import { FileText, CheckCircle2, Clock } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface PrescriptionGalleryWidgetProps {
  prescriptions: any[];
}

export default function PrescriptionGalleryWidget({ prescriptions = [] }: PrescriptionGalleryWidgetProps) {
  const { theme } = useTheme();

  if (prescriptions.length === 0) return null;

  return (
    <div>
      <h3 className="font-heading font-bold text-lg flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-primary" />
        Prescription Gallery
      </h3>

      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
        {prescriptions.map((rx: any, idx: number) => {
          const shortId = (rx.prescription_id || "").substring(0, 6);
          const medicines = rx.medicines || [];
          const medNames = medicines.map((m: any) => m.name || m).slice(0, 3);
          const uploadDate = rx.upload_date
            ? new Date(rx.upload_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : null;
          const expiryDate = rx.expiry_date
            ? new Date(rx.expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : null;

          return (
            <motion.div
              key={rx.prescription_id || idx}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, type: "spring", stiffness: 200 }}
              className={cn(
                "min-w-[220px] max-w-[260px] rounded-2xl p-5 flex flex-col gap-3 shrink-0 transition-all",
                theme === "dark"
                  ? "bg-slate-900/60 border border-white/5 hover:border-white/10"
                  : "bg-white border border-slate-100 premium-shadow hover:shadow-md"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className={cn("text-sm font-mono font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                  #{shortId}
                </span>
                {rx.verified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                    <Clock className="w-3 h-3" />
                    Pending
                  </span>
                )}
              </div>

              {/* Medicines */}
              <div className="flex flex-col gap-1">
                {medNames.map((name: string, mi: number) => (
                  <p key={mi} className={cn("text-xs truncate", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                    • {typeof name === 'string' ? name : (name as any)?.name || 'Unknown'}
                  </p>
                ))}
                {medicines.length > 3 && (
                  <p className={cn("text-[10px] font-medium", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                    +{medicines.length - 3} more
                  </p>
                )}
              </div>

              {/* Dates */}
              <div className={cn("flex items-center justify-between text-[10px] font-medium pt-2 border-t", theme === "dark" ? "border-white/5 text-slate-500" : "border-slate-100 text-slate-400")}>
                {uploadDate && <span>Uploaded {uploadDate}</span>}
                {expiryDate && <span>Exp {expiryDate}</span>}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
