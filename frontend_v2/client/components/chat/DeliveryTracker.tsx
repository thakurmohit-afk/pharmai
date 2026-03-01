import { useState, useEffect } from "react";
import { Package, Truck, MapPin, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

interface DeliveryTrackerProps {
  orderId: string;
  isNew?: boolean;
}

const STEPS = [
  { label: "Order confirmed", sublabel: "We've reserved your medicines", icon: Package, color: "text-emerald-500", bg: "bg-emerald-500" },
  { label: "Preparing for dispatch", sublabel: "Your order is being packed", icon: Truck, color: "text-teal-500", bg: "bg-teal-500" },
  { label: "Estimated arrival: Tomorrow, 6–9 PM", sublabel: "We'll notify you before delivery", icon: MapPin, color: "text-sky-500", bg: "bg-sky-500" },
];

export default function DeliveryTracker({ orderId, isNew = false }: DeliveryTrackerProps) {
  const { theme } = useTheme();
  const [visibleSteps, setVisibleSteps] = useState(isNew ? 0 : STEPS.length);

  useEffect(() => {
    if (!isNew) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleSteps(i + 1), (i + 1) * 700));
    });
    return () => timers.forEach(clearTimeout);
  }, [isNew]);

  const progress = STEPS.length > 0 ? (visibleSteps / STEPS.length) * 100 : 0;

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
      {/* Progress bar at top */}
      <div className={cn("h-[3px] w-full", theme === "dark" ? "bg-white/[0.04]" : "bg-slate-100/80")}>
        <motion.div
          initial={{ width: isNew ? "0%" : `${progress}%` }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: isNew ? 2.1 : 0, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 rounded-r-full"
        />
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50")}>
              <Package className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <span className={cn("text-[13px] font-semibold", theme === "dark" ? "text-slate-300" : "text-slate-600")}>
              Delivery Status
            </span>
          </div>
          <span className={cn("text-[10px] font-mono font-medium", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
            #{orderId?.substring(0, 8) || "—"}
          </span>
        </div>

        {/* Steps */}
        <div className="space-y-0">
          {STEPS.map((step, i) => {
            const isVisible = i < visibleSteps;
            const isLast = i === STEPS.length - 1;
            const StepIcon = step.icon;

            return (
              <div key={i}>
                <motion.div
                  initial={isNew ? { opacity: 0, x: -15 } : { opacity: 1, x: 0 }}
                  animate={isVisible ? { opacity: 1, x: 0 } : { opacity: 0, x: -15 }}
                  transition={{ type: "spring", stiffness: 220, damping: 22 }}
                  className="flex items-start gap-3.5"
                >
                  {/* Icon circle with subtle glow when active */}
                  <div className="relative shrink-0">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-500",
                      isVisible
                        ? (theme === "dark"
                            ? `${step.bg}/10`
                            : `${step.bg === "bg-emerald-500" ? "bg-emerald-50" : step.bg === "bg-teal-500" ? "bg-teal-50" : "bg-sky-50"}`)
                        : (theme === "dark" ? "bg-white/[0.03]" : "bg-slate-50")
                    )}>
                      {isVisible ? (
                        i < visibleSteps - 1 || !isNew ? (
                          <CheckCircle2 className={cn("w-4 h-4", step.color)} />
                        ) : (
                          <StepIcon className={cn("w-4 h-4", step.color)} />
                        )
                      ) : (
                        <div className={cn("w-2 h-2 rounded-full", theme === "dark" ? "bg-white/10" : "bg-slate-200")} />
                      )}
                    </div>
                    {/* Subtle glow ring on latest step */}
                    {isVisible && i === visibleSteps - 1 && isNew && (
                      <motion.div
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 1.4, opacity: 0 }}
                        transition={{ duration: 1, repeat: 1, ease: "easeOut" }}
                        className={cn("absolute inset-0 rounded-xl border", step.color.replace("text-", "border-"), "opacity-30")}
                      />
                    )}
                  </div>

                  {/* Label + sublabel */}
                  <div className="pt-1.5">
                    <p className={cn(
                      "text-[13px] font-medium leading-tight transition-colors duration-300",
                      isVisible
                        ? (theme === "dark" ? "text-slate-200" : "text-slate-700")
                        : (theme === "dark" ? "text-slate-600" : "text-slate-300")
                    )}>
                      {step.label}
                    </p>
                    {isVisible && (
                      <motion.p
                        initial={isNew ? { opacity: 0 } : { opacity: 1 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.15 }}
                        className={cn("text-[11px] mt-0.5", theme === "dark" ? "text-slate-500" : "text-slate-400")}
                      >
                        {step.sublabel}
                      </motion.p>
                    )}
                  </div>
                </motion.div>

                {/* Connector line */}
                {!isLast && (
                  <div className="ml-[17px] py-1">
                    <motion.div
                      initial={isNew ? { height: 0 } : { height: 22 }}
                      animate={isVisible ? { height: 22 } : { height: 0 }}
                      transition={{ duration: 0.3, delay: isNew ? 0.2 : 0 }}
                      className={cn(
                        "w-[3px] rounded-full transition-colors duration-500",
                        isVisible
                          ? (theme === "dark" ? "bg-emerald-500/20" : "bg-emerald-100")
                          : (theme === "dark" ? "bg-white/[0.04]" : "bg-slate-100")
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
