import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import AdminSidebar, { SECTION_DEFAULTS } from "@/components/admin/AdminSidebar";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

import AdminControlCenter from "@/components/admin/AdminControlCenter";
import AdminOverview from "@/components/admin/AdminOverview";
import AdminInventory from "@/components/admin/AdminInventory";
import AdminUsers from "@/components/admin/AdminUsers";
import AdminSystem from "@/components/admin/AdminSystem";
import AdminRefillCalls from "@/components/admin/AdminRefillCalls";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
import AdminAIInsights from "@/components/admin/AdminAIInsights";
import AdminTrace from "@/components/admin/AdminTrace";
import AdminSearch from "@/components/admin/AdminSearch";

/* ── View Router ──────────────────────────────────────────────────────── */
function AdminContent({ view }: { view: string }) {
  switch (view) {
    case "overview": return <AdminControlCenter />;
    case "orders": return <AdminOverview />;
    case "users-overview": return <AdminUsers />;
    case "inventory": return <AdminInventory />;
    case "refill-calls": return <AdminRefillCalls />;
    case "forecast": return <AdminAnalytics />;
    case "ai-insights": return <AdminAIInsights />;
    case "trace": return <AdminTrace />;
    case "platform-health": return <AdminSystem />;
    default: return <AdminControlCenter />;
  }
}

/* ── Layout ────────────────────────────────────────────────────────────── */
export default function AdminPage() {
  const { theme } = useTheme();
  const [activeView, setActiveView] = useState("overview");

  return (
    <div className={cn(
      "min-h-screen w-full flex font-sans transition-colors duration-300 overflow-hidden",
      theme === "dark" ? "bg-[#050505]" : "bg-slate-50"
    )}>
      <Sidebar />

      <div className="flex-1 flex h-screen overflow-hidden">
        <AdminSidebar section="control" activeView={activeView} onViewChange={setActiveView} />

        <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
          <div className={cn(
            "absolute inset-0 z-0 pointer-events-none",
            theme === "dark"
              ? "bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.04)_0%,transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(20,184,166,0.03)_0%,transparent_50%)]"
              : "bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.06)_0%,transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(20,184,166,0.04)_0%,transparent_50%)]"
          )} />

          <TopNavbar onOpenProfileDrawer={() => { }} />

          <main className="flex-1 p-6 md:p-8 xl:p-10 max-w-[1600px] w-full mx-auto relative z-10 overflow-y-auto">
            <AdminContent view={activeView} />
          </main>
        </div>
      </div>
    </div>
  );
}
