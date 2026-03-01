import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { TrendingUp } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import TubesCursorBackground from "@/components/ui/TubesCursorBackground";

interface SpendingInsightsWidgetProps {
  paymentHistory: any[];
}

export default function SpendingInsightsWidget({ paymentHistory = [] }: SpendingInsightsWidgetProps) {
  const { theme } = useTheme();

  // Group payments by month (last 6 months)
  const now = new Date();
  const months: { label: string; amount: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("en-US", { month: "short" });
    const year = d.getFullYear();
    const month = d.getMonth();

    const monthTotal = paymentHistory
      .filter((p) => {
        if (!p.date) return false;
        const pd = new Date(p.date);
        return pd.getFullYear() === year && pd.getMonth() === month;
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    months.push({ label, amount: monthTotal });
  }

  const totalSpending = months.reduce((sum, m) => sum + m.amount, 0);
  const maxAmount = Math.max(...months.map((m) => m.amount), 1);

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
        <TrendingUp className="w-5 h-5 text-primary" />
        Spending Insights
      </h3>

      <div className="flex-1 relative z-10">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} barCategoryGap="25%">
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{
                  fontSize: 11,
                  fill: theme === "dark" ? "#64748B" : "#94A3B8",
                  fontWeight: 600,
                }}
              />
              <Tooltip
                cursor={false}
                contentStyle={{
                  borderRadius: "12px",
                  fontSize: "12px",
                  border: "none",
                  background: theme === "dark" ? "#1E293B" : "#FFFFFF",
                  boxShadow: "0 4px 20px rgb(0 0 0 / 0.15)",
                  padding: "8px 12px",
                }}
                formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Spent"]}
                labelStyle={{ color: theme === "dark" ? "#94A3B8" : "#64748B", fontWeight: 600 }}
              />
              <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={32}>
                {months.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={entry.amount > 0
                      ? (theme === "dark" ? "rgba(129,140,248,0.6)" : "rgba(99,102,241,0.7)")
                      : (theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)")
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className={cn(
          "mt-4 pt-4 border-t flex items-center justify-between",
          theme === "dark" ? "border-white/5" : "border-slate-100"
        )}>
          <span className={cn("text-xs font-semibold uppercase tracking-wider", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
            6-Month Total
          </span>
          <span className={cn("text-lg font-bold font-heading", theme === "dark" ? "text-indigo-400" : "text-indigo-600")}>
            ₹{totalSpending.toLocaleString("en-IN")}
          </span>
        </div>
      </div>
    </div>
  );
}
