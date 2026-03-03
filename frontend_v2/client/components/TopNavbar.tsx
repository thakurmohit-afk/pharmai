import { useState, useEffect } from "react";
import { Search, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { getCart } from "@/services/api";

interface TopNavbarProps {
    onOpenProfileDrawer?: () => void;
    onOpenCart?: () => void;
    profile?: any;
}

export default function TopNavbar({ onOpenCart, profile }: TopNavbarProps) {
    const { theme } = useTheme();
    const navigate = useNavigate();
    const [cartCount, setCartCount] = useState(0);

    const handleCartClick = onOpenCart ?? (() => navigate("/cart"));

    useEffect(() => {
        getCart()
            .then((data: any) => setCartCount(data?.item_count || 0))
            .catch(() => { });
    }, []);

    return (
        <header
            className={cn(
                "sticky top-0 z-40 w-full backdrop-blur-xl border-b premium-shadow flex items-center justify-between px-6 h-16",
                theme === "dark"
                    ? "bg-slate-950/80 border-white/5"
                    : "bg-white/80 border-slate-200"
            )}
        >
            {/* Left side: Context/Search */}
            <div className="flex items-center gap-8 flex-1">
                <h1 className="text-xl font-heading font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-teal-400">
                    PharmAI
                </h1>

                <div className="relative w-full max-w-md hidden md:block">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        className={cn(
                            "block w-full pl-10 pr-3 py-2 border rounded-xl leading-5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
                            theme === "dark"
                                ? "bg-slate-900 border-slate-800 text-white placeholder-slate-500"
                                : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400"
                        )}
                        placeholder="Search medicines, orders... (⌘K)"
                    />
                </div>
            </div>

            {/* Right side: Cart */}
            <div className="flex items-center gap-3">
                <button
                    onClick={handleCartClick}
                    className={cn(
                        "relative flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all duration-200 group",
                        theme === "dark"
                            ? "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 hover:text-white"
                            : "bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-600 hover:text-slate-900"
                    )}
                    title="Shopping Cart"
                >
                    <div className="relative">
                        <ShoppingCart className="w-[18px] h-[18px] transition-transform group-hover:scale-105" />
                        {cartCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-emerald-500 rounded-full shadow-sm">
                                {cartCount > 9 ? "9+" : cartCount}
                            </span>
                        )}
                    </div>
                    <span className={cn(
                        "text-sm font-semibold hidden sm:block",
                        theme === "dark" ? "text-slate-300" : "text-slate-700"
                    )}>
                        Cart
                    </span>
                </button>
            </div>
        </header>
    );
}
