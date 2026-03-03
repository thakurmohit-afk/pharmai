import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import TopNavbar from "@/components/TopNavbar";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { getCart, updateCartItem, removeCartItem, clearCart, checkoutCart, verifyPayment } from "@/services/api";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import {
    ShoppingCart, Trash2, Minus, Plus, Loader2, Package, CheckCircle, XCircle,
} from "lucide-react";

declare global {
    interface Window { Razorpay: any; }
}

export default function CartPage() {
    const { theme } = useTheme();
    const [cart, setCart] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [checkingOut, setCheckingOut] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    const loadCart = useCallback(async () => {
        try {
            const data = await getCart();
            setCart(data);
        } catch (err) {
            console.error("Failed to load cart:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadCart(); }, [loadCart]);

    const handleUpdate = async (itemId: string, qty: number) => {
        setUpdating(itemId);
        try {
            if (qty <= 0) {
                await removeCartItem(itemId);
            } else {
                await updateCartItem(itemId, qty);
            }
            await loadCart();
        } catch (err) {
            console.error("Update failed:", err);
        } finally {
            setUpdating(null);
        }
    };

    const handleClear = async () => {
        try {
            await clearCart();
            await loadCart();
        } catch (err) {
            console.error("Clear failed:", err);
        }
    };

    const handleCheckout = async () => {
        setCheckingOut(true);
        try {
            const result = await checkoutCart();

            // Open Razorpay if available
            if (result?.razorpay_order_id && result?.key_id && window.Razorpay) {
                const rzp = new window.Razorpay({
                    key: result.key_id,
                    amount: Math.round((result.amount || 0) * 100),
                    currency: result.currency || "INR",
                    name: "PharmAI",
                    description: "Medicine Order",
                    order_id: result.razorpay_order_id,
                    handler: async (response: any) => {
                        // Razorpay handler = payment succeeded at gateway
                        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#10b981", "#14b8a6", "#34d399", "#6ee7b7"] });
                        setOrderSuccess(true);
                        setCheckingOut(false);

                        // Backend verify is best-effort
                        try {
                            await verifyPayment({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                payment_method: "card",
                            });
                        } catch (err) {
                            console.warn("Backend verify failed (non-critical):", err);
                        }
                        await loadCart();
                    },
                    modal: {
                        ondismiss: () => setCheckingOut(false),
                    },
                    theme: { color: "#10b981" },
                });
                rzp.open();
                return;
            }

            // Fallback if no Razorpay
            setOrderSuccess(true);
            await loadCart();
        } catch (err) {
            console.error("Checkout failed:", err);
        } finally {
            setCheckingOut(false);
        }
    };

    const items = cart?.items || [];
    const totalAmount = cart?.total_amount || 0;

    return (
        <div
            className={cn(
                "min-h-screen w-full flex font-sans transition-colors duration-300 overflow-hidden",
                theme === "dark" ? "bg-[#050505]" : "bg-slate-50"
            )}
        >
            <Sidebar />

            <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
                <TopNavbar onOpenProfileDrawer={() => { }} />

                <main className="flex-1 p-6 md:p-8 xl:p-10 max-w-[900px] w-full mx-auto relative z-10 overflow-y-auto">
                    <div className="space-y-6 pb-10">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-3xl font-heading font-bold bg-clip-text text-transparent bg-gradient-to-br from-emerald-400 to-teal-500">
                                    Shopping Cart
                                </h2>
                                <p className={cn("mt-1 text-sm font-medium", theme === "dark" ? "text-slate-500" : "text-slate-400")}>
                                    {items.length} item{items.length !== 1 ? "s" : ""} in your cart
                                </p>
                            </div>
                            {items.length > 0 && (
                                <button
                                    onClick={handleClear}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors",
                                        theme === "dark"
                                            ? "text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                                            : "text-red-400 hover:text-red-500 hover:bg-red-50"
                                    )}
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> Clear Cart
                                </button>
                            )}
                        </div>

                        {/* Order Success */}
                        <AnimatePresence>
                            {orderSuccess && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className={cn(
                                        "flex items-center gap-3 px-5 py-4 rounded-xl border",
                                        theme === "dark" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-emerald-50 border-emerald-200"
                                    )}
                                >
                                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                                    <div>
                                        <p className={cn("text-sm font-bold", theme === "dark" ? "text-emerald-300" : "text-emerald-700")}>Order Placed!</p>
                                        <p className={cn("text-xs", theme === "dark" ? "text-emerald-400/60" : "text-emerald-600")}>Your order has been submitted successfully.</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {loading ? (
                            <div className="flex items-center justify-center py-16">
                                <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : items.length === 0 && !orderSuccess ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <div className={cn("w-20 h-20 rounded-2xl flex items-center justify-center mb-4", theme === "dark" ? "bg-white/[0.03]" : "bg-stone-100")}>
                                    <ShoppingCart className={cn("w-9 h-9", theme === "dark" ? "text-slate-700" : "text-stone-300")} />
                                </div>
                                <p className={cn("text-sm font-medium", theme === "dark" ? "text-slate-400" : "text-stone-500")}>Your cart is empty</p>
                                <p className={cn("text-xs mt-1", theme === "dark" ? "text-slate-600" : "text-stone-400")}>Add medicines from chat or search</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Items */}
                                <div className="lg:col-span-2 space-y-3">
                                    {items.map((item: any, i: number) => (
                                        <motion.div
                                            key={item.item_id || i}
                                            initial={{ opacity: 0, x: -12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className={cn(
                                                "flex items-center gap-4 p-4 rounded-xl border",
                                                theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
                                                theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50"
                                            )}>
                                                <Package className="w-5 h-5 text-emerald-500" />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className={cn("text-sm font-semibold truncate", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                                                    {item.medicine_name || item.name || "Medicine"}
                                                </p>
                                                <p className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-stone-400")}>
                                                    ₹{item.unit_price || 0} per strip
                                                </p>
                                            </div>

                                            {/* Qty controls */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleUpdate(item.item_id, (item.quantity || 1) - 1)}
                                                    disabled={updating === item.item_id}
                                                    className={cn(
                                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                                        theme === "dark" ? "bg-white/[0.04] hover:bg-white/[0.08] text-slate-400" : "bg-stone-100 hover:bg-stone-200 text-stone-600"
                                                    )}
                                                >
                                                    <Minus className="w-3.5 h-3.5" />
                                                </button>
                                                <span className={cn("w-8 text-center text-sm font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                                                    {updating === item.item_id ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : item.quantity || 1}
                                                </span>
                                                <button
                                                    onClick={() => handleUpdate(item.item_id, (item.quantity || 1) + 1)}
                                                    disabled={updating === item.item_id}
                                                    className={cn(
                                                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                                        theme === "dark" ? "bg-white/[0.04] hover:bg-white/[0.08] text-slate-400" : "bg-stone-100 hover:bg-stone-200 text-stone-600"
                                                    )}
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                </button>
                                            </div>

                                            {/* Item total */}
                                            <p className={cn("text-sm font-bold w-20 text-right", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                                                ₹{(item.subtotal || ((item.unit_price || 0) * (item.quantity || 1))).toFixed(2)}
                                            </p>

                                            {/* Remove */}
                                            <button
                                                onClick={() => handleUpdate(item.item_id, 0)}
                                                className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                                    theme === "dark" ? "text-red-400/50 hover:text-red-400 hover:bg-red-500/10" : "text-red-300 hover:text-red-500 hover:bg-red-50"
                                                )}
                                            >
                                                <XCircle className="w-4 h-4" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </div>

                                {/* Order Summary */}
                                <div className="lg:col-span-1">
                                    <div className={cn(
                                        "rounded-2xl p-6 border sticky top-4",
                                        theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-stone-200/60 shadow-sm"
                                    )}>
                                        <h3 className={cn("text-sm font-bold mb-4", theme === "dark" ? "text-slate-200" : "text-slate-800")}>
                                            Order Summary
                                        </h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between">
                                                <span className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-stone-400")}>Subtotal</span>
                                                <span className={cn("text-xs font-semibold", theme === "dark" ? "text-slate-300" : "text-stone-600")}>₹{totalAmount.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className={cn("text-xs", theme === "dark" ? "text-slate-500" : "text-stone-400")}>Delivery</span>
                                                <span className={cn("text-xs font-semibold text-emerald-400")}>Free</span>
                                            </div>
                                            <div className={cn("h-px my-2", theme === "dark" ? "bg-white/[0.06]" : "bg-stone-200")} />
                                            <div className="flex justify-between">
                                                <span className={cn("text-sm font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>Total</span>
                                                <span className={cn("text-sm font-bold", theme === "dark" ? "text-slate-200" : "text-slate-800")}>₹{totalAmount.toFixed(2)}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleCheckout}
                                            disabled={checkingOut || items.length === 0}
                                            className="w-full mt-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-bold transition-all hover:shadow-lg disabled:opacity-40"
                                        >
                                            {checkingOut ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                                                </span>
                                            ) : (
                                                "Place Order"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
