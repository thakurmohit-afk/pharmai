import { type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

interface AdminMetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  delay?: number;
}

export default function AdminMetricCard({
  label,
  value,
  icon: Icon,
  iconColor,
  iconBg,
  delay = 0,
}: AdminMetricCardProps) {
  const { theme } = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={cn(
        "rounded-2xl p-5 flex items-center gap-4 transition-colors",
        theme === "dark"
          ? "bg-white/[0.03] border border-white/[0.06]"
          : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      )}
    >
      <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        <Icon className={cn("w-5 h-5", iconColor)} />
      </div>
      <div className="min-w-0">
        <p className={cn(
          "text-2xl font-bold tracking-tight",
          theme === "dark" ? "text-slate-100" : "text-slate-800"
        )}>
          {value}
        </p>
        <p className={cn(
          "text-[11px] font-medium uppercase tracking-wider mt-0.5",
          theme === "dark" ? "text-slate-500" : "text-slate-400"
        )}>
          {label}
        </p>
      </div>
    </motion.div>
  );
}
