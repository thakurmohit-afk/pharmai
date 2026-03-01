import { useState, useEffect } from "react";
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

const API_BASE = (import.meta.env.VITE_API_BASE || "/api")
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
          "h-9 rounded-xl flex items-center transition-all duration-200 overflow-hidden whitespace-nowrap",
          "px-[11px] gap-3",
          isActive
            ? theme === "dark"
              ? "bg-white/10 text-white"
              : "bg-emerald-50 text-emerald-700 font-medium"
            : theme === "dark"
              ? "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100/80"
        )}
        title={item.label}
      >
        <item.icon className="w-[18px] h-[18px] stroke-[2] shrink-0" />
        <span className={cn(
          "text-[13px] font-medium transition-opacity duration-300",
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
        ...(isWorkspace ? {
          background: "rgba(255,255,255,0.12)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRight: "1px solid rgba(255,255,255,0.18)",
        } : {}),
      }}
      className={cn(
        "h-screen flex flex-col py-4 justify-between shrink-0 sticky top-0 z-50 overflow-hidden",
        "transition-[width] duration-300 ease-in-out",
        !isWorkspace && (
          theme === "dark"
            ? "border-r border-white/5 bg-[#050505] text-slate-300"
            : "border-r border-gray-200 bg-gray-50/50 text-slate-600"
        ),
        isWorkspace && "text-slate-700"
      )}
    >
      {/* Top: Logo + Toggle + Sections */}
      <div className="flex flex-col w-full overflow-y-auto overflow-x-hidden scrollbar-none">
        <div className="px-3 flex flex-col gap-1">
          {/* Logo row */}
          <div className="flex items-center h-10 mb-1">
            <div
              className={cn(
                "w-10 h-10 flex items-center justify-center rounded-xl font-black text-lg shrink-0",
                theme === "dark"
                  ? "text-white bg-gradient-to-br from-emerald-500 to-teal-400"
                  : "text-white bg-gradient-to-br from-emerald-600 to-teal-500"
              )}
            >
              P
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

        {/* HEALTH section (hidden for admin users) */}
        {user?.role !== "admin" && (
          <div className="px-3">
            {renderSectionLabel("Health")}
            <div className="flex flex-col gap-0.5">
              {healthNav.map(renderNavItem)}
            </div>
          </div>
        )}

        {/* PHARMACY section (hidden for admin users) */}
        {user?.role !== "admin" && (
          <div className="px-3">
            {renderSectionLabel("Pharmacy")}
            <div className="flex flex-col gap-0.5">
              {pharmacyNav.map(renderNavItem)}
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

        {/* Profile */}
        <button
          onClick={() => navigate("/")}
          className={cn(
            "group relative rounded-xl flex items-center transition-colors overflow-hidden whitespace-nowrap",
            "px-[7px] py-2 gap-3",
            theme === "dark" ? "hover:bg-white/5" : "hover:bg-gray-100/80"
          )}
          title={name}
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt="avatar"
              className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-emerald-500 to-teal-400 shrink-0">
              {initials}
            </div>
          )}

          <div className={cn(
            "min-w-0 text-left transition-opacity duration-300",
            collapsed ? "opacity-0" : "opacity-100"
          )}>
            <p className={cn("text-sm font-semibold truncate", theme === "dark" ? "text-slate-200" : "text-slate-700")}>
              {name}
            </p>
            <p className={cn("text-[11px] truncate", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
              {profile?.email || user?.email || ""}
            </p>
          </div>

          {/* Tooltip (collapsed only) */}
          <div className={cn(
            "absolute left-[calc(100%+8px)] px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl z-50",
            collapsed ? "opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0" : "opacity-0 pointer-events-none",
            theme === "dark"
              ? "bg-slate-800 border border-white/10 text-white"
              : "bg-white border border-slate-200 text-slate-800 shadow-lg"
          )}>
            {name}<br />
            <span className={theme === "dark" ? "text-slate-400" : "text-slate-500"}>
              {profile?.email || user?.email || ""}
            </span>
          </div>
        </button>

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
