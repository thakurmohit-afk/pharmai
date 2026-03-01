import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import ProfileDrawer from "@/components/ProfileDrawer";
import StatsCardsRow from "@/components/StatsCardsRow";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getMyDashboard, getMyProfile } from "@/services/api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Loader2, ShieldAlert, ArrowRight, Pill, RefreshCw,
  HeartPulse, Sparkles, AlertTriangle, Clock, Package,
} from "lucide-react";
import { Navigate } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "/api")
  .replace(/\/api$/, "")
  .replace(/\/$/, "");

export default function Index() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [dash, prof] = await Promise.all([getMyDashboard(), getMyProfile()]);
        setDashboard(dash);
        setProfile(prof);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    if (user) loadData();
  }, [user]);

  if (user?.role === "admin") {
    return <Navigate to="/admin" replace />;
  }

  if (loading) {
    return (
      <div className={cn("min-h-screen w-full flex items-center justify-center font-sans", theme === "dark" ? "bg-[#050505]" : "bg-slate-50")}>
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  const conditions = profile?.chronic_conditions || [];
  const allergies = (profile?.medical_facts || []).filter((f: any) => f.fact_type === "allergy");
  const activeMedicines = dashboard?.active_medicines || [];
  const alerts = dashboard?.active_alerts || [];
  const orders = dashboard?.order_history || [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.name ? profile.name.split(" ")[0] : "User";
  const avatarSrc = profile?.avatar_url
    ? (profile.avatar_url.startsWith("http") ? profile.avatar_url : `${API_BASE}${profile.avatar_url}`)
    : null;

  // Top refill alert
  const topAlert = alerts[0];
  const topAlertDays = topAlert?.estimated_run_out
    ? Math.max(0, Math.ceil((new Date(topAlert.estimated_run_out).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // AI insight suggestion
  const generateInsight = () => {
    if (alerts.length > 0 && topAlertDays !== null && topAlertDays <= 5) {
      return {
        title: "Refill Recommended",
        message: `Based on your usage pattern, ${topAlert.medicine_name || "your medication"} may run out in ${topAlertDays} days. Consider reordering now.`,
        action: () => navigate("/refills"),
        actionLabel: "Go to Refill Center",
      };
    }
    if (activeMedicines.length > 5) {
      return {
        title: "Medication Review Suggested",
        message: `You have ${activeMedicines.length} active medications. Consider asking our AI assistant to check for potential interactions.`,
        action: () => navigate("/chat"),
        actionLabel: "Ask AI Assistant",
      };
    }
    if (conditions.length > 0) {
      return {
        title: "Health Monitoring Active",
        message: `We're tracking ${conditions.length} condition${conditions.length > 1 ? "s" : ""} and ${activeMedicines.length} medication${activeMedicines.length !== 1 ? "s" : ""}. Your health profile is up to date.`,
        action: () => navigate("/health"),
        actionLabel: "View Health Profile",
      };
    }
    return {
      title: "All Clear",
      message: "No urgent actions needed. Your medications and health profile are in good shape.",
      action: () => navigate("/chat"),
      actionLabel: "Chat with AI",
    };
  };

  const insight = generateInsight();

  return (
    <div
      className={cn(
        "min-h-screen w-full flex font-sans transition-colors duration-300 overflow-hidden",
        theme === "dark" ? "bg-[#050505]" : "bg-slate-50"
      )}
    >
      <Sidebar />

      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Ambient bg */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <div className={cn(
            "absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full blur-[120px] opacity-30",
            theme === "dark" ? "bg-emerald-900/30" : "bg-emerald-100/50"
          )} />
          <div className={cn(
            "absolute top-[50%] -right-[10%] w-[35%] h-[50%] rounded-full blur-[120px] opacity-25",
            theme === "dark" ? "bg-teal-900/20" : "bg-teal-50/60"
          )} />
        </div>

        <TopNavbar onOpenProfileDrawer={() => setIsProfileOpen(true)} profile={profile} />

        <main className="flex-1 p-6 md:p-8 xl:p-10 max-w-[1400px] w-full mx-auto relative z-10 overflow-y-auto">
          <div className="space-y-6 pb-10">

            {/* ─── Profile Hero ─── */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, type: "spring" }}
              className={cn(
                "rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-5",
                theme === "dark"
                  ? "bg-slate-900/40 border border-white/5"
                  : "bg-white border border-slate-200/60 shadow-sm"
              )}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt={profile.name} className="w-16 h-16 rounded-2xl object-cover ring-2 ring-emerald-500/20" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center text-white text-xl font-bold ring-2 ring-emerald-500/20">
                  {firstName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className={cn("text-2xl font-bold", theme === "dark" ? "text-white" : "text-slate-900")}>
                  {greeting}, {firstName}
                </h2>
                <p className={cn("text-sm mt-0.5", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                  {profile?.email}
                  {profile?.age && <span className="ml-3">{profile.age}y</span>}
                  {profile?.gender && <span className="ml-2 capitalize">· {profile.gender}</span>}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {conditions.map((c: string, i: number) => (
                    <span key={i} className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold", theme === "dark" ? "bg-teal-500/15 text-teal-400" : "bg-teal-50 text-teal-700")}>{c}</span>
                  ))}
                  {allergies.map((a: any, i: number) => (
                    <span key={`a-${i}`} className={cn("px-2 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1", theme === "dark" ? "bg-red-500/15 text-red-400" : "bg-red-50 text-red-600")}>
                      <ShieldAlert className="w-3 h-3" />{a.value}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ─── Stats Cards ─── */}
            <StatsCardsRow dashboard={dashboard} />

            {/* ─── AI Insights Card ─── */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className={cn(
                "rounded-2xl p-5 border flex items-start gap-4",
                theme === "dark"
                  ? "bg-emerald-500/5 border-emerald-500/15"
                  : "bg-gradient-to-r from-emerald-50 to-teal-50/50 border-emerald-200/60"
              )}
            >
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", theme === "dark" ? "bg-emerald-500/15" : "bg-emerald-100")}>
                <Sparkles className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-semibold", theme === "dark" ? "text-emerald-400" : "text-emerald-700")}>
                  {insight.title}
                </p>
                <p className={cn("text-sm mt-0.5", theme === "dark" ? "text-slate-400" : "text-slate-600")}>
                  {insight.message}
                </p>
              </div>
              <button
                onClick={insight.action}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all",
                  theme === "dark"
                    ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm"
                )}
              >
                {insight.actionLabel}
              </button>
            </motion.div>

            {/* ─── Priority Refill Alert ─── */}
            {topAlert && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className={cn(
                  "rounded-2xl p-5 border flex items-center gap-4",
                  topAlertDays !== null && topAlertDays <= 7
                    ? (theme === "dark" ? "bg-red-500/5 border-red-500/15" : "bg-red-50/50 border-red-200/60")
                    : (theme === "dark" ? "bg-amber-500/5 border-amber-500/15" : "bg-amber-50/50 border-amber-200/60")
                )}
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  topAlertDays !== null && topAlertDays <= 7
                    ? (theme === "dark" ? "bg-red-500/15" : "bg-red-100")
                    : (theme === "dark" ? "bg-amber-500/15" : "bg-amber-100")
                )}>
                  <AlertTriangle className={cn("w-5 h-5", topAlertDays !== null && topAlertDays <= 7 ? "text-red-500" : "text-amber-500")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                    {topAlert.medicine_name || "Medication"} — {topAlertDays !== null ? `${topAlertDays} days left` : "Refill recommended"}
                  </p>
                  <p className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                    {alerts.length > 1 ? `+${alerts.length - 1} more alert${alerts.length > 2 ? "s" : ""}` : "Priority refill alert"}
                  </p>
                </div>
                <button
                  onClick={() => navigate("/refills")}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all",
                    theme === "dark"
                      ? "bg-white/5 text-slate-300 hover:bg-white/10"
                      : "bg-white text-slate-700 hover:bg-slate-50 shadow-sm border border-slate-200/60"
                  )}
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </motion.div>
            )}

            {/* ─── Quick Glance Grid ─── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Active Meds Summary */}
              <div className={cn(
                "rounded-2xl p-5 border",
                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-emerald-500" />
                    <h3 className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-300" : "text-slate-700")}>Active Medications</h3>
                  </div>
                  <button onClick={() => navigate("/medications")} className={cn("text-xs font-medium flex items-center gap-1", theme === "dark" ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600")}>
                    See all <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                {activeMedicines.length > 0 ? (
                  <div className="space-y-2">
                    {activeMedicines.slice(0, 4).map((m: any, i: number) => (
                      <div key={i} className={cn("flex items-center gap-3 px-3 py-2 rounded-xl", theme === "dark" ? "bg-white/[0.03]" : "bg-stone-50")}>
                        <div className={cn("w-2 h-2 rounded-full bg-emerald-500")} />
                        <span className={cn("text-sm", theme === "dark" ? "text-slate-300" : "text-slate-700")}>{m.medicine_name}</span>
                        {m.dosage && <span className={cn("text-xs ml-auto", theme === "dark" ? "text-slate-500" : "text-slate-400")}>{m.dosage}</span>}
                      </div>
                    ))}
                    {activeMedicines.length > 4 && (
                      <p className={cn("text-xs px-3", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                        +{activeMedicines.length - 4} more
                      </p>
                    )}
                  </div>
                ) : (
                  <p className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>No active medications.</p>
                )}
              </div>

              {/* Recent Orders Summary */}
              <div className={cn(
                "rounded-2xl p-5 border",
                theme === "dark" ? "bg-white/[0.02] border-white/5" : "bg-white border-slate-200/60 shadow-sm"
              )}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-500" />
                    <h3 className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-300" : "text-slate-700")}>Recent Orders</h3>
                  </div>
                  <button onClick={() => navigate("/orders")} className={cn("text-xs font-medium flex items-center gap-1", theme === "dark" ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600")}>
                    See all <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                {orders.length > 0 ? (
                  <div className="space-y-2">
                    {orders.slice(0, 3).map((o: any, i: number) => (
                      <div key={i} className={cn("flex items-center justify-between px-3 py-2 rounded-xl", theme === "dark" ? "bg-white/[0.03]" : "bg-stone-50")}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className={cn("w-3.5 h-3.5 shrink-0", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
                          <span className={cn("text-sm truncate", theme === "dark" ? "text-slate-300" : "text-slate-700")}>
                            {o.medicine_name || `Order #${o.order_id || i + 1}`}
                          </span>
                        </div>
                        <span className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0",
                          o.status === "delivered"
                            ? (theme === "dark" ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600")
                            : (theme === "dark" ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600")
                        )}>
                          {o.status || "pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>No orders yet.</p>
                )}
              </div>
            </div>

          </div>
        </main>
      </div>

      <ProfileDrawer
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={profile}
      />
    </div>
  );
}
