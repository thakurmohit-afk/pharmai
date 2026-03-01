import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import SpendingInsightsWidget from "@/components/SpendingInsightsWidget";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { getMyDashboard } from "@/services/api";
import { cn } from "@/lib/utils";
import { Loader2, CreditCard, TrendingUp } from "lucide-react";

export default function SpendingPage() {
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

    const paymentHistory = dashboard?.payment_history || [];
    const totalSpent = paymentHistory.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

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
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className={cn("text-2xl font-bold", theme === "dark" ? "text-white" : "text-slate-900")}>
                                    Spending & Payments
                                </h2>
                                <p className={cn("mt-1 text-sm", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                    Track your pharmacy spending and payment history.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <div className={cn(
                                    "px-4 py-2 rounded-xl text-sm font-medium",
                                    theme === "dark" ? "bg-white/5 text-slate-300" : "bg-stone-100 text-slate-600"
                                )}>
                                    <CreditCard className="w-4 h-4 inline mr-2" />
                                    {paymentHistory.length} payments
                                </div>
                                {totalSpent > 0 && (
                                    <div className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-medium",
                                        theme === "dark" ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                                    )}>
                                        <TrendingUp className="w-4 h-4 inline mr-2" />
                                        ₹{totalSpent.toLocaleString()} total
                                    </div>
                                )}
                            </div>
                        </div>

                        <SpendingInsightsWidget paymentHistory={paymentHistory} />
                    </div>
                </main>
            </div>
        </div>
    );
}
