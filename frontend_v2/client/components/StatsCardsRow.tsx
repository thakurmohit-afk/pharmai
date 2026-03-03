import { IndianRupee, Package, Pill, AlertTriangle, FileText } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface StatsCardsRowProps {
  dashboard: any;
}

function CircularProgress({ value, size = 56 }: { value: number; size?: number }) {
  const { theme } = useTheme();
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke={theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}
        strokeWidth={4}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke="#14B8A6"
        strokeWidth={4}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000"
      />
    </svg>
  );
}

export default function StatsCardsRow({ dashboard }: StatsCardsRowProps) {
  const { theme } = useTheme();

  const totalSpent = (dashboard?.payment_history || []).reduce(
    (sum: number, p: any) => sum + (p.amount || 0), 0
  );
  const totalOrders = (dashboard?.order_history || []).length;
  const activeMeds = (dashboard?.active_medicines || []).length;
  const activeAlerts = (dashboard?.active_alerts || []).length;
  const prescriptionCount = (dashboard?.prescriptions || []).length;

  const highConfidenceCount = (dashboard?.active_medicines || []).filter(
    (m: any) => m.refill_confidence === "high"
  ).length;
  const adherence = activeMeds > 0 ? Math.round((highConfidenceCount / activeMeds) * 100) : 0;

  const stats = [
    { label: "Total Spent", value: `₹${totalSpent.toLocaleString("en-IN")}`, icon: IndianRupee, color: "text-violet-500", bg: "bg-violet-100 dark:bg-violet-500/15" },
    { label: "Total Orders", value: totalOrders, icon: Package, color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-500/15" },
    { label: "Active Meds", value: activeMeds, icon: Pill, color: "text-emerald-500", bg: "bg-emerald-100 dark:bg-emerald-500/15" },
    { label: "Active Alerts", value: activeAlerts, icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-500/15" },
    { label: "Prescriptions", value: prescriptionCount, icon: FileText, color: "text-cyan-500", bg: "bg-cyan-100 dark:bg-cyan-500/15" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map((stat, idx) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06, type: "spring", stiffness: 200 }}
            className={cn(
              "glass-card p-4 flex flex-col gap-3 transition-all",
              theme === "dark"
                ? "hover:border-white/10"
                : "hover:shadow-md"
            )}
          >
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", stat.bg)}>
              <Icon className={cn("w-4 h-4", stat.color)} />
            </div>
            <div>
              <p className={cn("text-xl font-bold font-heading", theme === "dark" ? "text-white" : "text-slate-900")}>
                {stat.value}
              </p>
              <p className={cn("text-[11px] uppercase tracking-wider font-semibold mt-0.5", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                {stat.label}
              </p>
            </div>
          </motion.div>
        );
      })}

      {/* Adherence card with circular progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, type: "spring", stiffness: 200 }}
        className={cn(
          "glass-card p-4 flex flex-col items-center justify-center gap-2 transition-all",
          theme === "dark"
            ? "hover:border-white/10"
            : "hover:shadow-md"
        )}
      >
        <div className="relative">
          <CircularProgress value={adherence} size={52} />
          <span className={cn(
            "absolute inset-0 flex items-center justify-center text-sm font-bold",
            theme === "dark" ? "text-teal-400" : "text-teal-600"
          )}>
            {adherence}%
          </span>
        </div>
        <p className={cn("text-[11px] uppercase tracking-wider font-semibold", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
          Adherence
        </p>
      </motion.div>
    </div>
  );
}
