import { Heart, ShieldAlert, Pill } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import TubesCursorBackground from "@/components/ui/TubesCursorBackground";

interface HealthSnapshotWidgetProps {
  profile: any;
  activeMedicines?: any[];
}

export default function HealthSnapshotWidget({ profile, activeMedicines = [] }: HealthSnapshotWidgetProps) {
  const { theme } = useTheme();

  const conditions = profile?.chronic_conditions || [];
  const medicalFacts = profile?.medical_facts || [];
  const allergies = medicalFacts.filter((f: any) => f.fact_type === "allergy");
  const otherFacts = medicalFacts.filter((f: any) => f.fact_type !== "allergy");

  return (
    <div className={cn(
      "col-span-1 rounded-[32px] p-6 lg:p-8 flex flex-col relative overflow-hidden transition-all duration-500 z-10",
      theme === "dark"
        ? "border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]"
        : "bg-white border-slate-100 premium-shadow border"
    )}>
      {theme === "dark" && (
        <>
          <TubesCursorBackground className="opacity-80 mix-blend-screen overflow-hidden rounded-[32px]" />
          <div className="absolute inset-0 bg-[#050505]/60 backdrop-blur-[64px] z-0 pointer-events-none" />
          <div className="absolute inset-0 border border-white/5 rounded-[32px] pointer-events-none z-10" />
        </>
      )}

      <h3 className="font-heading font-bold text-lg flex items-center gap-2 mb-6 relative z-10">
        <Heart className="w-5 h-5 text-primary" />
        Health Snapshot
      </h3>

      <div className="space-y-5 relative z-10 flex-1">
        {/* Tracked Conditions */}
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-wider mb-2", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
            Tracked Conditions
          </p>
          <div className="flex flex-wrap gap-2">
            {conditions.length > 0 ? conditions.map((c: string, i: number) => (
              <span key={i} className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold",
                theme === "dark"
                  ? "bg-teal-500/15 text-teal-400"
                  : "bg-teal-50 text-teal-700"
              )}>
                {c}
              </span>
            )) : (
              <span className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>None tracked</span>
            )}
          </div>
        </div>

        {/* Known Allergies */}
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
            <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            Known Allergies
          </p>
          <div className="flex flex-wrap gap-2">
            {allergies.length > 0 ? allergies.map((a: any, i: number) => (
              <span key={i} className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-semibold",
                theme === "dark"
                  ? "bg-red-500/15 text-red-400"
                  : "bg-red-50 text-red-600"
              )}>
                ⚠ {a.value}
              </span>
            )) : (
              <span className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>None recorded</span>
            )}
          </div>
        </div>

        {/* Active Medications */}
        <div>
          <p className={cn("text-xs font-semibold uppercase tracking-wider mb-2", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
            Active Medications
          </p>
          <div className="flex flex-wrap gap-2">
            {activeMedicines.length > 0 ? activeMedicines.slice(0, 6).map((m: any, i: number) => (
              <span key={i} className={cn(
                "px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1",
                theme === "dark"
                  ? "bg-indigo-500/15 text-indigo-300"
                  : "bg-indigo-50 text-indigo-600"
              )}>
                <Pill className="w-3 h-3" />
                {m.medicine_name}
              </span>
            )) : (
              <span className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>None active</span>
            )}
          </div>
        </div>

        {/* Other Medical Facts */}
        {otherFacts.length > 0 && (
          <div>
            <p className={cn("text-xs font-semibold uppercase tracking-wider mb-2", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
              Medical Flags
            </p>
            <div className="flex flex-wrap gap-2">
              {otherFacts.map((f: any, i: number) => (
                <span key={i} className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-semibold",
                  theme === "dark"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-amber-50 text-amber-600"
                )}>
                  {f.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
