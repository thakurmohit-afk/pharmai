import { useState, useEffect, useMemo } from "react";
import { Search, Loader2, ShoppingCart, Bell, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAdminUsers } from "@/services/api";
import UserDetailSheet from "./UserDetailSheet";
import type { AdminUser } from "@/types/admin";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function AdminUsers() {
  const { theme } = useTheme();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Sheet state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getAdminUsers();
        setUsers(data);
      } catch (err) {
        console.error("Failed to load users", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, search]);

  const openDetail = (user: AdminUser) => {
    setSelectedUserId(user.user_id);
    setSelectedUserName(user.name);
    setSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className={cn(
        "flex items-center gap-2 rounded-xl px-4 py-2.5 max-w-md",
        theme === "dark"
          ? "bg-white/[0.04] border border-white/[0.08]"
          : "bg-white border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      )}>
        <Search className={cn("w-4 h-4 shrink-0", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className={cn(
            "flex-1 bg-transparent text-sm outline-none",
            theme === "dark" ? "text-slate-200 placeholder-slate-600" : "text-slate-700 placeholder-slate-400"
          )}
        />
      </div>

      {/* User Cards */}
      {filtered.length === 0 ? (
        <p className={cn("text-sm py-8 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
          No users found.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((user, i) => (
            <motion.div
              key={user.user_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn(
                "rounded-2xl p-5 flex flex-col gap-4 transition-colors",
                theme === "dark"
                  ? "bg-white/[0.03] border border-white/[0.06]"
                  : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              )}
            >
              {/* User info */}
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={user.avatar_url || undefined} />
                  <AvatarFallback className={cn(
                    "text-xs font-semibold",
                    theme === "dark" ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                  )}>
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-sm font-semibold truncate",
                    theme === "dark" ? "text-slate-200" : "text-slate-700"
                  )}>
                    {user.name}
                  </p>
                  <p className={cn(
                    "text-[11px] truncate",
                    theme === "dark" ? "text-slate-500" : "text-slate-400"
                  )}>
                    {user.email}
                  </p>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px] shrink-0",
                  user.is_active
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/20"
                    : "bg-red-500/15 text-red-500 border-red-500/20"
                )}>
                  {user.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <ShoppingCart className={cn("w-3.5 h-3.5", theme === "dark" ? "text-slate-600" : "text-slate-400")} />
                  <span className={cn(
                    "text-xs font-medium",
                    theme === "dark" ? "text-slate-400" : "text-slate-500"
                  )}>
                    {user.order_count} orders
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Bell className={cn("w-3.5 h-3.5", theme === "dark" ? "text-slate-600" : "text-slate-400")} />
                  <span className={cn(
                    "text-xs font-medium",
                    user.alert_count > 0
                      ? "text-amber-500"
                      : theme === "dark" ? "text-slate-400" : "text-slate-500"
                  )}>
                    {user.alert_count} alert{user.alert_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-[10px]",
                  theme === "dark" ? "text-slate-600" : "text-slate-400"
                )}>
                  Last login: {timeAgo(user.last_login_at)}
                </span>
                <button
                  onClick={() => openDetail(user)}
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                    theme === "dark"
                      ? "bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:bg-white/[0.06]"
                      : "bg-slate-50 border border-slate-200/60 text-slate-500 hover:bg-slate-100"
                  )}
                >
                  <Eye className="w-3 h-3" />
                  Details
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* User Detail Sheet */}
      <UserDetailSheet
        userId={selectedUserId}
        userName={selectedUserName}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
