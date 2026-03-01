import { Utensils, Moon, Wine, Stethoscope, ChevronRight } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import TubesCursorBackground from "@/components/ui/TubesCursorBackground";

interface CounselingWidgetProps {
  activeMedicines: any[];
}

// Basic counseling rules (simplified — real data would come from backend counseling_info)
const COUNSELING_TAGS: Record<string, { icon: any; label: string; color: string }[]> = {};

function getCounselingTags(medName: string) {
  const name = medName.toLowerCase();
  const tags: { icon: any; label: string; color: string }[] = [];

  // Food timing
  if (name.includes("amlodipine") || name.includes("metformin") || name.includes("atorvastatin")) {
    tags.push({ icon: Utensils, label: "With food", color: "text-emerald-500" });
  } else if (name.includes("pantoprazole") || name.includes("omeprazole")) {
    tags.push({ icon: Utensils, label: "Before food", color: "text-amber-500" });
  }

  // Drowsiness
  if (name.includes("cetirizine") || name.includes("levocetirizine") || name.includes("chlorpheniramine")) {
    tags.push({ icon: Moon, label: "May cause drowsiness", color: "text-blue-400" });
  } else {
    tags.push({ icon: Moon, label: "No drowsiness", color: "text-slate-400" });
  }

  // Alcohol
  if (name.includes("metformin") || name.includes("paracetamol") || name.includes("azithromycin")) {
    tags.push({ icon: Wine, label: "Avoid alcohol", color: "text-red-400" });
  }

  return tags;
}

export default function CounselingWidget({ activeMedicines = [] }: CounselingWidgetProps) {
  const { theme } = useTheme();
  const navigate = useNavigate();

  if (activeMedicines.length === 0) return null;

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
        <Stethoscope className="w-5 h-5 text-primary" />
        Counseling Reminders
      </h3>

      <div className="space-y-4 flex-1 relative z-10">
        {activeMedicines.slice(0, 3).map((med: any, idx: number) => {
          const tags = getCounselingTags(med.medicine_name || "");
          if (tags.length === 0) return null;

          return (
            <div key={idx}>
              <p className={cn("text-sm font-semibold mb-2", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                {med.medicine_name}
              </p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, ti) => {
                  const TagIcon = tag.icon;
                  return (
                    <span key={ti} className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
                      theme === "dark" ? "bg-slate-800/80" : "bg-slate-50"
                    )}>
                      <TagIcon className={cn("w-3.5 h-3.5", tag.color)} />
                      <span className={theme === "dark" ? "text-slate-300" : "text-slate-600"}>{tag.label}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => navigate("/chat?msg=Tell me about my medication counseling")}
        className={cn(
          "mt-4 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider relative z-10 transition-colors",
          theme === "dark"
            ? "text-indigo-400 hover:text-indigo-300"
            : "text-indigo-600 hover:text-indigo-700"
        )}
      >
        Ask PharmAI for details
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
