import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import ActiveMedsWidget from "@/components/ActiveMedsWidget";
import CounselingWidget from "@/components/CounselingWidget";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getMyDashboard } from "@/services/api";
import { cn } from "@/lib/utils";
import { Loader2, Pill, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function MedicationsPage() {
    const { theme } = useTheme();
    const { user } = useAuth();
    const [dashboard, setDashboard] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        getMyDashboard()
            .then(setDashboard)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user]);

    const meds = dashboard?.active_medicines || [];
    const totalMeds = meds.length;
    const safetyOk = totalMeds <= 5;

    if (loading) {
        return (
            <div className={cn("min-h-screen w-full flex items-center justify-center", theme === "dark" ? "bg-[#050505]" : "bg-slate-50")}>
                <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className={cn("min-h-screen w-full flex font-sans overflow-hidden", theme === "dark" ? "bg-[#050505]" : "bg-slate-50")}>
            <Sidebar />
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <TopNavbar onOpenProfileDrawer={() => { }} />
                <main className="flex-1 p-6 md:p-8 xl:p-10 max-w-[1600px] w-full mx-auto overflow-y-auto">
                    <div className="space-y-6 pb-10">
                        {/* Header */}
                        <div>
                            <h2 className={cn(
                                "text-2xl font-bold",
                                theme === "dark" ? "text-white" : "text-slate-900"
                            )}>My Medications</h2>
                            <p className={cn("mt-1 text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                Manage your active medications and get counseling information.
                            </p>
                        </div>

                        {/* Summary cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className={cn(
                                "rounded-2xl p-5 border",
                                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
                            )}>
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50")}>
                                        <Pill className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <p className={cn("text-2xl font-bold", theme === "dark" ? "text-white" : "text-slate-900")}>{totalMeds}</p>
                                        <p className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Active Medications</p>
                                    </div>
                                </div>
                            </div>

                            <div className={cn(
                                "rounded-2xl p-5 border",
                                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
                            )}>
                                <div className="flex items-center gap-3">
                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", safetyOk ? (theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50") : (theme === "dark" ? "bg-amber-500/10" : "bg-amber-50"))}>
                                        {safetyOk ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                                    </div>
                                    <div>
                                        <p className={cn("text-sm font-semibold", theme === "dark" ? "text-white" : "text-slate-900")}>
                                            {safetyOk ? "Safety OK" : "Review Needed"}
                                        </p>
                                        <p className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                            {safetyOk ? "Medication count normal" : `${totalMeds} meds — check interactions`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Widgets */}
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            <ActiveMedsWidget meds={meds} />
                            <CounselingWidget activeMedicines={meds} />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
