import { useState, useEffect } from "react";
import { Loader2, ShoppingCart, Bell, Pill, FileText } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUserProfile, getUserDashboard } from "@/services/api";

interface UserDetailSheetProps {
  userId: string | null;
  userName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function UserDetailSheet({ userId, userName, open, onOpenChange }: UserDetailSheetProps) {
  const { theme } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    setProfile(null);
    setDashboard(null);

    Promise.all([getUserProfile(userId), getUserDashboard(userId)])
      .then(([p, d]) => {
        setProfile(p);
        setDashboard(d);
      })
      .catch((err) => console.error("Failed to load user detail", err))
      .finally(() => setLoading(false));
  }, [userId, open]);

  const sectionClass = cn(
    "rounded-xl p-4",
    theme === "dark"
      ? "bg-white/[0.02] border border-white/[0.04]"
      : "bg-slate-50/50 border border-slate-100/50"
  );

  const labelClass = cn(
    "text-[10px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5",
    theme === "dark" ? "text-slate-500" : "text-slate-400"
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn(
        "w-full sm:max-w-lg overflow-y-auto",
        theme === "dark" ? "bg-[#0a0a0a] border-white/[0.06]" : "bg-white"
      )}>
        <SheetHeader className="pb-4">
          <SheetTitle className={theme === "dark" ? "text-slate-200" : "text-slate-800"}>
            User Details
          </SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5 pb-8">
            {/* Profile Header */}
            <div className="flex items-center gap-4">
              <Avatar className="w-14 h-14">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className={cn(
                  "text-base font-semibold",
                  theme === "dark" ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                )}>
                  {initials(userName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className={cn(
                  "text-lg font-semibold",
                  theme === "dark" ? "text-slate-200" : "text-slate-800"
                )}>
                  {profile?.name || userName}
                </h3>
                <p className={cn("text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                  {profile?.email}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {profile?.age && (
                    <span className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                      {profile.age} yrs
                    </span>
                  )}
                  {profile?.gender && (
                    <span className={cn("text-xs capitalize", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                      · {profile.gender}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Chronic Conditions */}
            {profile?.chronic_conditions?.length > 0 && (
              <div className={sectionClass}>
                <p className={labelClass}>Chronic Conditions</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.chronic_conditions.map((c: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[11px]">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator className={theme === "dark" ? "bg-white/[0.06]" : "bg-slate-100"} />

            {/* Active Medicines */}
            <div className={sectionClass}>
              <p className={labelClass}>
                <Pill className="w-3.5 h-3.5" /> Active Medicines
              </p>
              {(dashboard?.active_medicines || []).length === 0 ? (
                <p className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>None tracked.</p>
              ) : (
                <div className="space-y-2">
                  {dashboard.active_medicines.slice(0, 8).map((med: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className={cn(
                        "text-sm font-medium truncate",
                        theme === "dark" ? "text-slate-300" : "text-slate-600"
                      )}>
                        {med.medicine_name || med.name || "Unknown"}
                      </span>
                      {med.next_refill_est && (
                        <span className={cn(
                          "text-[10px] shrink-0",
                          theme === "dark" ? "text-slate-600" : "text-slate-400"
                        )}>
                          refill ~{timeAgo(med.next_refill_est)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Orders */}
            <div className={sectionClass}>
              <p className={labelClass}>
                <ShoppingCart className="w-3.5 h-3.5" /> Recent Orders
              </p>
              {(dashboard?.order_history || []).length === 0 ? (
                <p className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>No orders.</p>
              ) : (
                <div className="space-y-2">
                  {dashboard.order_history.slice(0, 5).map((order: any) => (
                    <div key={order.order_id} className="flex items-center justify-between">
                      <div>
                        <span className={cn(
                          "text-sm",
                          theme === "dark" ? "text-slate-300" : "text-slate-600"
                        )}>
                          ₹{order.total_amount?.toFixed(0) ?? "0"}
                        </span>
                        <span className={cn(
                          "text-[10px] ml-2",
                          theme === "dark" ? "text-slate-600" : "text-slate-400"
                        )}>
                          {timeAgo(order.order_date)}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {order.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Refill Alerts */}
            <div className={sectionClass}>
              <p className={labelClass}>
                <Bell className="w-3.5 h-3.5" /> Refill Alerts
              </p>
              {(dashboard?.active_alerts || []).length === 0 ? (
                <p className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>No alerts.</p>
              ) : (
                <div className="space-y-2">
                  {dashboard.active_alerts.map((alert: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className={cn(
                        "text-sm truncate",
                        theme === "dark" ? "text-slate-300" : "text-slate-600"
                      )}>
                        {alert.medicine_name || "Medicine"}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {alert.confidence != null && (
                          <Badge variant="outline" className={cn(
                            "text-[10px]",
                            alert.confidence >= 0.7
                              ? "bg-emerald-500/15 text-emerald-500"
                              : "bg-amber-500/15 text-amber-500"
                          )}>
                            {Math.round(alert.confidence * 100)}%
                          </Badge>
                        )}
                        {alert.days_until_run_out != null && (
                          <span className={cn(
                            "text-[10px]",
                            theme === "dark" ? "text-slate-600" : "text-slate-400"
                          )}>
                            {alert.days_until_run_out}d left
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Prescriptions */}
            <div className={sectionClass}>
              <p className={labelClass}>
                <FileText className="w-3.5 h-3.5" /> Prescriptions
              </p>
              {(dashboard?.prescriptions || []).length === 0 ? (
                <p className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>None uploaded.</p>
              ) : (
                <div className="space-y-2">
                  {dashboard.prescriptions.slice(0, 5).map((rx: any) => (
                    <div key={rx.prescription_id} className="flex items-center justify-between">
                      <span className={cn(
                        "text-sm",
                        theme === "dark" ? "text-slate-300" : "text-slate-600"
                      )}>
                        {rx.medicines?.length ?? 0} medicine{(rx.medicines?.length ?? 0) !== 1 ? "s" : ""}
                      </span>
                      <div className="flex items-center gap-2">
                        {rx.confidence != null && (
                          <Badge variant="outline" className="text-[10px]">
                            {Math.round(rx.confidence * 100)}% conf.
                          </Badge>
                        )}
                        <span className={cn(
                          "text-[10px]",
                          theme === "dark" ? "text-slate-600" : "text-slate-400"
                        )}>
                          {timeAgo(rx.upload_date)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
