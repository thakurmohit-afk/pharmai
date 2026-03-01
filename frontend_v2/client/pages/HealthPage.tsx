import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import HealthSnapshotWidget from "@/components/HealthSnapshotWidget";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getMyProfile, getMyDashboard } from "@/services/api";
import { cn } from "@/lib/utils";
import { Loader2, HeartPulse, ShieldAlert, Phone, User, AlertTriangle } from "lucide-react";

export default function HealthPage() {
    const { theme } = useTheme();
    const { user } = useAuth();
    const [profile, setProfile] = useState<any>(null);
    const [dashboard, setDashboard] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        Promise.all([getMyProfile(), getMyDashboard()])
            .then(([p, d]) => { setProfile(p); setDashboard(d); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user]);

    const conditions = profile?.chronic_conditions || [];
    const allergies = (profile?.medical_facts || []).filter((f: any) => f.fact_type === "allergy");
    const activeMedicines = dashboard?.active_medicines || [];

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
                            <h2 className={cn("text-2xl font-bold", theme === "dark" ? "text-white" : "text-slate-900")}>
                                Health Profile
                            </h2>
                            <p className={cn("mt-1 text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                Your medical profile, conditions, allergies, and health overview.
                            </p>
                        </div>

                        {/* Emergency Info Card */}
                        <div className={cn(
                            "rounded-2xl p-6 border-2",
                            theme === "dark" ? "bg-red-500/5 border-red-500/20" : "bg-red-50/40 border-red-200"
                        )}>
                            <div className="flex items-center gap-2 mb-4">
                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                <h3 className={cn("text-sm font-bold uppercase tracking-wide", theme === "dark" ? "text-red-400" : "text-red-600")}>
                                    Emergency Information Card
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <p className={cn("text-[10px] uppercase tracking-wider font-bold mb-1", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Patient</p>
                                    <p className={cn("text-sm font-semibold", theme === "dark" ? "text-white" : "text-slate-800")}>
                                        {profile?.name || "—"} {profile?.age ? `· ${profile.age}y` : ""} {profile?.gender ? `· ${profile.gender}` : ""}
                                    </p>
                                </div>
                                <div>
                                    <p className={cn("text-[10px] uppercase tracking-wider font-bold mb-1", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Conditions</p>
                                    <div className="flex flex-wrap gap-1">
                                        {conditions.length > 0 ? conditions.map((c: string, i: number) => (
                                            <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-md font-medium">{c}</span>
                                        )) : <span className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>None recorded</span>}
                                    </div>
                                </div>
                                <div>
                                    <p className={cn("text-[10px] uppercase tracking-wider font-bold mb-1", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Allergies</p>
                                    <div className="flex flex-wrap gap-1">
                                        {allergies.length > 0 ? allergies.map((a: any, i: number) => (
                                            <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-md font-medium">{a.value}</span>
                                        )) : <span className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>None recorded</span>}
                                    </div>
                                </div>
                            </div>
                            {activeMedicines.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-red-200/50">
                                    <p className={cn("text-[10px] uppercase tracking-wider font-bold mb-2", theme === "dark" ? "text-slate-500" : "text-slate-400")}>Current Medications</p>
                                    <div className="flex flex-wrap gap-1">
                                        {activeMedicines.map((m: any, i: number) => (
                                            <span key={i} className={cn("px-2 py-0.5 text-xs rounded-md font-medium", theme === "dark" ? "bg-white/5 text-slate-300" : "bg-slate-100 text-slate-600")}>
                                                {m.medicine_name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Conditions & Allergies detail */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className={cn(
                                "rounded-2xl p-6 border",
                                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
                            )}>
                                <div className="flex items-center gap-2 mb-4">
                                    <HeartPulse className="w-4 h-4 text-emerald-500" />
                                    <h3 className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-300" : "text-slate-700")}>
                                        Chronic Conditions
                                    </h3>
                                </div>
                                {conditions.length > 0 ? (
                                    <div className="space-y-2">
                                        {conditions.map((c: string, i: number) => (
                                            <div key={i} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl", theme === "dark" ? "bg-white/[0.03]" : "bg-stone-50")}>
                                                <div className={cn("w-2 h-2 rounded-full bg-emerald-500")} />
                                                <span className={cn("text-sm font-medium", theme === "dark" ? "text-slate-300" : "text-slate-700")}>{c}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>No chronic conditions recorded.</p>
                                )}
                            </div>

                            <div className={cn(
                                "rounded-2xl p-6 border",
                                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
                            )}>
                                <div className="flex items-center gap-2 mb-4">
                                    <ShieldAlert className="w-4 h-4 text-red-500" />
                                    <h3 className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-300" : "text-slate-700")}>
                                        Allergies & Sensitivities
                                    </h3>
                                </div>
                                {allergies.length > 0 ? (
                                    <div className="space-y-2">
                                        {allergies.map((a: any, i: number) => (
                                            <div key={i} className={cn("flex items-center gap-3 px-4 py-3 rounded-xl", theme === "dark" ? "bg-red-500/5" : "bg-red-50/50")}>
                                                <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                                                <span className={cn("text-sm font-medium", theme === "dark" ? "text-slate-300" : "text-slate-700")}>{a.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>No allergies recorded.</p>
                                )}
                            </div>
                        </div>

                        {/* Health Snapshot Widget */}
                        <HealthSnapshotWidget profile={profile} activeMedicines={activeMedicines} />
                    </div>
                </main>
            </div>
        </div>
    );
}
