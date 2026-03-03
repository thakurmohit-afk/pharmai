import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getMyProfile } from "@/services/api";
import {
  Sparkles, LayoutDashboard, MessageSquare,
  Pill, RefreshCw, HeartPulse,
  FileImage, Package, CreditCard,
  Moon, Sun, LogOut, PanelLeftClose, PanelLeft,
  ShieldCheck, Bell, Search, ShoppingCart,
  UsersRound, Receipt, BrainCircuit, Gauge,
} from "lucide-react";

const API_BASE = (import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE || "/api")
  : "/api")
  .replace(/\/api$/, "")
  .replace(/\/$/, "");

/* ── Navigation structure ── */
const mainNav = [
  { icon: Sparkles, path: "/workspace", label: "Workspace" },
  { icon: LayoutDashboard, path: "/", label: "Dashboard" },
  { icon: MessageSquare, path: "/chat", label: "AI Chat" },
];

const healthNav = [
  { icon: Pill, path: "/medications", label: "My Medications" },
  { icon: RefreshCw, path: "/refills", label: "Refill Center" },
  { icon: HeartPulse, path: "/health", label: "Health Profile" },
];

const pharmacyNav = [
  { icon: Search, path: "/search", label: "Smart Search" },
  { icon: FileImage, path: "/prescriptions", label: "Prescriptions" },
  { icon: Package, path: "/orders", label: "Order History" },
  { icon: ShoppingCart, path: "/cart", label: "Cart" },
  { icon: CreditCard, path: "/spending", label: "Spending" },
];

const adminNav = [
  { icon: Gauge, path: "/admin", label: "Admin Panel" },
];

export default function Sidebar({ defaultCollapsed = false, transparent = false }: { defaultCollapsed?: boolean; transparent?: boolean } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const activePath = location.pathname;
  const isAdminRoute = activePath.startsWith("/admin");

  useEffect(() => {
    if (!user) return;
    getMyProfile()
      .then((p) => setProfile(p))
      .catch(() => { });
  }, [user]);

  const name = profile?.name || user?.name || "User";
  const avatarSrc = profile?.avatar_url
    ? (profile.avatar_url.startsWith("http") ? profile.avatar_url : `${API_BASE}${profile.avatar_url}`)
    : null;
  const initials = name
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const isWorkspace = activePath === "/workspace";

  const renderNavItem = (item: { icon: any; path: string; label: string }) => {
    const isActive = activePath === item.path ||
      (activePath.startsWith("/chat") && item.path === "/chat") ||
      (item.path.startsWith("/admin") && item.path !== "/admin" && activePath.startsWith(item.path)) ||
      (item.path === "/admin" && activePath === "/admin");
    return (
      <button
        key={item.path}
        onClick={() => navigate(item.path)}
        className={cn(
          "relative h-9 rounded-xl flex items-center overflow-hidden whitespace-nowrap",
          "px-[11px] gap-3",
          "transition-all duration-300 ease-out",
          isActive
            ? theme === "dark"
              ? "text-white"
              : "text-emerald-700 font-medium"
            : theme === "dark"
              ? "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100/80"
        )}
        title={item.label}
      >
        {/* Liquid active indicator */}
        {isActive && (
          <motion.div
            layoutId="sidebar-active"
            className={cn(
              "absolute inset-0 rounded-xl",
              theme === "dark" ? "bg-white/10" : "bg-emerald-50"
            )}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <item.icon className="w-[18px] h-[18px] stroke-[2] shrink-0 relative z-10" />
        <span className={cn(
          "text-[13px] font-medium transition-opacity duration-300 relative z-10",
          collapsed ? "opacity-0" : "opacity-100"
        )}>
          {item.label}
        </span>
      </button>
    );
  };

  const renderSectionLabel = (label: string) => {
    if (collapsed) return <div className="h-3" />;
    return (
      <div className="px-3 pt-4 pb-1">
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-widest",
          theme === "dark" ? "text-slate-600" : "text-stone-400"
        )}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div
      style={{
        width: collapsed ? 64 : 224,
        background: isWorkspace
          ? "rgba(255,255,255,0.12)"
          : theme === "dark" ? "#050505" : "rgba(249,250,251,0.5)",
        backdropFilter: isWorkspace ? "blur(20px)" : "none",
        WebkitBackdropFilter: isWorkspace ? "blur(20px)" : "none",
        borderRight: isWorkspace
          ? "1px solid rgba(255,255,255,0.18)"
          : theme === "dark" ? "1px solid rgba(255,255,255,0.05)" : "1px solid #e5e7eb",
        transition: "width 300ms ease-in-out, background 500ms ease, backdrop-filter 500ms ease, border-right 500ms ease",
      }}
      className={cn(
        "h-screen flex flex-col py-4 justify-between shrink-0 sticky top-0 z-50 overflow-hidden",
        isWorkspace ? "text-slate-700" : theme === "dark" ? "text-slate-300" : "text-slate-600"
      )}
    >
      {/* Top: Logo + Toggle + Sections */}
      <div className="flex flex-col w-full overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        <div className="px-3 flex flex-col gap-1">
          {/* Logo row */}
          <div className="flex items-center h-10 mb-1">
            <div className="w-10 h-10 flex items-center justify-center shrink-0">
              <img
                src="/pharmai-logo.png"
                alt="PharmAI"
                className={cn(
                  "w-9 h-9 object-contain mix-blend-multiply",
                  theme === "dark" && "invert brightness-0"
                )}
              />
            </div>
            <span className={cn(
              "text-sm font-bold font-heading ml-3 whitespace-nowrap overflow-hidden transition-opacity duration-300",
              collapsed ? "opacity-0" : "opacity-100",
              theme === "dark" ? "text-white" : "text-slate-800"
            )}>
              PharmAI
            </span>
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "h-9 rounded-xl flex items-center transition-colors overflow-hidden whitespace-nowrap",
              "px-[11px] gap-2",
              theme === "dark"
                ? "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                : "text-gray-400 hover:text-gray-700 hover:bg-gray-100/80"
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <div className="shrink-0 w-[18px] h-[18px] flex items-center justify-center">
              {collapsed ? (
                <PanelLeft className="w-[18px] h-[18px] stroke-[2]" />
              ) : (
                <PanelLeftClose className="w-[18px] h-[18px] stroke-[2]" />
              )}
            </div>
            <span className={cn(
              "text-xs font-medium transition-opacity duration-300",
              collapsed ? "opacity-0" : "opacity-100"
            )}>
              Collapse
            </span>
          </button>
        </div>

        {/* MAIN section */}
        <div className="px-3">
          {renderSectionLabel("Main")}
          <div className="flex flex-col gap-0.5">
            {mainNav.map(renderNavItem)}
          </div>
        </div>

        {/* PHARMACY section (hidden for admin users) */}
        {user?.role !== "admin" && (
          <div className="px-3">
            {renderSectionLabel("Pharmacy")}
            <div className="flex flex-col gap-0.5">
              {pharmacyNav.map(renderNavItem)}
            </div>
          </div>
        )}

        {/* HEALTH section (hidden for admin users) */}
        {user?.role !== "admin" && (
          <div className="px-3">
            {renderSectionLabel("Health")}
            <div className="flex flex-col gap-0.5">
              {healthNav.map(renderNavItem)}
            </div>
          </div>
        )}

        {/* ADMIN section (admin only) */}
        {user?.role === "admin" && (
          <div className="px-3">
            {renderSectionLabel("Admin")}
            <div className="flex flex-col gap-0.5">
              {adminNav.map(renderNavItem)}
            </div>
          </div>
        )}
      </div>

      {/* Bottom: Profile + Theme + Logout */}
      <div className="flex flex-col gap-1 w-full px-3 mt-2">
        <div className={cn("h-px mb-1", theme === "dark" ? "bg-white/5" : "bg-gray-200")} />



        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={cn(
            "h-9 rounded-xl flex items-center transition-colors overflow-hidden whitespace-nowrap",
            "px-[11px] gap-3",
            theme === "dark"
              ? "text-yellow-500 hover:bg-white/5"
              : "text-amber-500 hover:bg-gray-100/80"
          )}
          title="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-[18px] h-[18px] stroke-[2] shrink-0" />
          ) : (
            <Moon className="w-[18px] h-[18px] stroke-[2] shrink-0" />
          )}
          <span className={cn(
            "text-sm font-medium transition-opacity duration-300",
            collapsed ? "opacity-0" : "opacity-100"
          )}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className={cn(
            "h-9 rounded-xl flex items-center transition-colors overflow-hidden whitespace-nowrap",
            "px-[11px] gap-3",
            theme === "dark"
              ? "text-gray-500 hover:text-red-400 hover:bg-red-500/10"
              : "text-gray-400 hover:text-red-500 hover:bg-red-50"
          )}
          title="Log out"
        >
          <LogOut className="w-[18px] h-[18px] stroke-[2] shrink-0" />
          <span className={cn(
            "text-sm font-medium transition-opacity duration-300",
            collapsed ? "opacity-0" : "opacity-100"
          )}>
            Log out
          </span>
        </button>
      </div>
    </div>
  );
}
