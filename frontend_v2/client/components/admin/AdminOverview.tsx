import { useState, useEffect } from "react";
import {
  ShoppingCart, TrendingUp, Bell, PackageX, FileText, Users, Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getAdminOverview, getAdminAlerts, getAdminOrders } from "@/services/api";
import AdminMetricCard from "./AdminMetricCard";
import type { AdminOverview as OverviewData, AdminAlert, AdminOrder } from "@/types/admin";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusColor(status: string) {
  switch (status) {
    case "confirmed":
    case "completed":
    case "delivered":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "pending":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
    default:
      return "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20";
  }
}

function confidenceColor(confidence: number) {
  if (confidence >= 0.8) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (confidence >= 0.5) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-red-500/15 text-red-600 dark:text-red-400";
}

export default function AdminOverview() {
  const { theme } = useTheme();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [ov, al, or_] = await Promise.all([
          getAdminOverview(),
          getAdminAlerts(),
          getAdminOrders(10),
        ]);
        setOverview(ov);
        setAlerts(al);
        setOrders(or_);
      } catch (err) {
        console.error("Failed to load overview", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <AdminMetricCard
          label="Orders Today"
          value={overview?.orders_today ?? 0}
          icon={ShoppingCart}
          iconColor="text-emerald-500"
          iconBg={theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50"}
          delay={0}
        />
        <AdminMetricCard
          label="Total Orders"
          value={overview?.total_orders ?? 0}
          icon={TrendingUp}
          iconColor="text-blue-500"
          iconBg={theme === "dark" ? "bg-blue-500/10" : "bg-blue-50"}
          delay={0.05}
        />
        <AdminMetricCard
          label="Active Alerts"
          value={overview?.active_alerts ?? 0}
          icon={Bell}
          iconColor="text-amber-500"
          iconBg={theme === "dark" ? "bg-amber-500/10" : "bg-amber-50"}
          delay={0.1}
        />
        <AdminMetricCard
          label="Low Stock"
          value={overview?.low_stock_count ?? 0}
          icon={PackageX}
          iconColor="text-red-500"
          iconBg={theme === "dark" ? "bg-red-500/10" : "bg-red-50"}
          delay={0.15}
        />
        <AdminMetricCard
          label="Pending Rx"
          value={overview?.pending_prescriptions ?? 0}
          icon={FileText}
          iconColor="text-purple-500"
          iconBg={theme === "dark" ? "bg-purple-500/10" : "bg-purple-50"}
          delay={0.2}
        />
        <AdminMetricCard
          label="Active Users"
          value={overview?.active_users ?? 0}
          icon={Users}
          iconColor="text-teal-500"
          iconBg={theme === "dark" ? "bg-teal-500/10" : "bg-teal-50"}
          delay={0.25}
        />
      </div>

      {/* Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={cn(
            "rounded-2xl p-6",
            theme === "dark"
              ? "bg-white/[0.03] border border-white/[0.06]"
              : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          )}
        >
          <h3 className={cn(
            "text-sm font-semibold mb-4 flex items-center gap-2",
            theme === "dark" ? "text-slate-300" : "text-slate-700"
          )}>
            <ShoppingCart className="w-4 h-4 text-emerald-500" />
            Recent Orders
          </h3>

          {orders.length === 0 ? (
            <p className={cn("text-sm py-4 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
              No orders yet.
            </p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div
                  key={order.order_id}
                  className={cn(
                    "flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors",
                    theme === "dark" ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      theme === "dark" ? "text-slate-200" : "text-slate-700"
                    )}>
                      {order.user_name}
                    </p>
                    <p className={cn(
                      "text-[11px] mt-0.5",
                      theme === "dark" ? "text-slate-500" : "text-slate-400"
                    )}>
                      {timeAgo(order.order_date)} · {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "text-sm font-semibold",
                      theme === "dark" ? "text-slate-200" : "text-slate-700"
                    )}>
                      ₹{order.total_amount.toFixed(0)}
                    </span>
                    <Badge variant="outline" className={cn("text-[10px] capitalize", statusColor(order.status))}>
                      {order.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Active Refill Alerts */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={cn(
            "rounded-2xl p-6",
            theme === "dark"
              ? "bg-white/[0.03] border border-white/[0.06]"
              : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          )}
        >
          <h3 className={cn(
            "text-sm font-semibold mb-4 flex items-center gap-2",
            theme === "dark" ? "text-slate-300" : "text-slate-700"
          )}>
            <Bell className="w-4 h-4 text-amber-500" />
            Active Refill Alerts
          </h3>

          {alerts.length === 0 ? (
            <p className={cn("text-sm py-4 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
              No active alerts. System healthy.
            </p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.alert_id}
                  className={cn(
                    "flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors",
                    theme === "dark" ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn(
                      "text-sm font-medium truncate",
                      theme === "dark" ? "text-slate-200" : "text-slate-700"
                    )}>
                      {alert.user_name}
                    </p>
                    <p className={cn(
                      "text-[11px] mt-0.5",
                      theme === "dark" ? "text-slate-500" : "text-slate-400"
                    )}>
                      {alert.medicine_name} · {alert.estimated_run_out ? `runs out ${timeAgo(alert.estimated_run_out)}` : "date unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn("text-[10px]", confidenceColor(alert.confidence))}>
                      {Math.round(alert.confidence * 100)}%
                    </Badge>
                    <Badge variant="outline" className={cn("text-[10px] capitalize", statusColor(alert.status))}>
                      {alert.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
