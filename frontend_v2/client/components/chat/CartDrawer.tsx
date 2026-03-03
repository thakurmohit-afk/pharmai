import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ShoppingCart, Plus, Minus, Trash2, CreditCard, Package, X, ShoppingBag,
} from "lucide-react";
import confetti from "canvas-confetti";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { getCart, updateCartItem, removeCartItem, clearCart, checkoutCart } from "@/services/api";

declare global {
    interface Window { Razorpay: any; }
}

interface CartItemData {
    item_id: string;
    medicine_id: string;
    medicine_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

interface CartData {
    cart_id: string;
    item_count: number;
    total_amount: number;
    items: CartItemData[];
}

interface CartDrawerProps {
    open: boolean;
    onClose: () => void;
    onCheckoutSuccess?: (result: any) => void;
}

function formatInr(amount: number): string {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function CartDrawer({ open, onClose, onCheckoutSuccess }: CartDrawerProps) {
    const { theme } = useTheme();
    const [cart, setCart] = useState<CartData | null>(null);
    const [loading, setLoading] = useState(false);
    const [checkingOut, setCheckingOut] = useState(false);

    const fetchCart = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getCart();
            setCart(data);
        } catch (err) {
            console.error("Failed to fetch cart:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchCart();
    }, [open, fetchCart]);

    const handleUpdateQty = async (itemId: string, newQty: number) => {
        try {
            const updated = await updateCartItem(itemId, newQty);
            setCart(updated);
        } catch (err) {
            console.error("Update failed:", err);
        }
    };

    const handleRemove = async (itemId: string) => {
        try {
            const updated = await removeCartItem(itemId);
            setCart(updated);
        } catch (err) {
            console.error("Remove failed:", err);
        }
    };

    const handleClear = async () => {
        try {
            await clearCart();
            setCart({ cart_id: cart?.cart_id || "", item_count: 0, total_amount: 0, items: [] });
        } catch (err) {
            console.error("Clear failed:", err);
        }
    };

    const handleCheckout = async () => {
        try {
            setCheckingOut(true);
            const result = await checkoutCart();

            // If Razorpay is configured and SDK is loaded, open payment modal
            if (result?.razorpay_order_id && result?.key_id && window.Razorpay) {
                const rzpOptions = {
                    key: result.key_id,
                    amount: Math.round((result.amount || 0) * 100),
                    currency: result.currency || "INR",
                    name: "PharmAI",
                    description: "Medicine Order",
                    order_id: result.razorpay_order_id,
                    handler: async (response: any) => {
                        try {
                            const { verifyPayment } = await import("@/services/api");
                            await verifyPayment({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                payment_method: "card",
                            });
                        } catch (err) {
                            console.error("Payment verification failed:", err);
                        }
                        setCart({ cart_id: cart?.cart_id || "", item_count: 0, total_amount: 0, items: [] });
                        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#10b981", "#14b8a6", "#34d399", "#6ee7b7"] });
                        onCheckoutSuccess?.(result);
                        onClose();
                    },
                    modal: {
                        ondismiss: () => {
                            // User closed the Razorpay modal without paying
                            setCheckingOut(false);
                        },
                    },
                    theme: { color: "#10b981" },
                };
                const rzp = new window.Razorpay(rzpOptions);
                rzp.open();
                return; // Don't setCheckingOut(false) — Razorpay modal handles it
            }

            // Fallback: no Razorpay, just complete directly
            setCart({ cart_id: cart?.cart_id || "", item_count: 0, total_amount: 0, items: [] });
            onCheckoutSuccess?.(result);
            onClose();
        } catch (err) {
            console.error("Checkout failed:", err);
        } finally {
            setCheckingOut(false);
        }
    };

    const itemCount = cart?.item_count || 0;
    const items = cart?.items || [];

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className={cn(
                            "fixed top-0 right-0 z-50 h-full w-full max-w-md flex flex-col border-l shadow-2xl",
                            theme === "dark"
                                ? "bg-[#0c0c0c] border-white/[0.06]"
                                : "bg-white border-stone-200"
                        )}
                    >
                        {/* Header */}
                        <div
                            className={cn(
                                "flex items-center justify-between px-6 py-4 border-b shrink-0",
                                theme === "dark" ? "border-white/[0.06]" : "border-stone-100"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        "w-9 h-9 rounded-xl flex items-center justify-center",
                                        theme === "dark" ? "bg-emerald-500/10" : "bg-emerald-50"
                                    )}
                                >
                                    <ShoppingCart className="w-4.5 h-4.5 text-emerald-500" />
                                </div>
                                <div>
                                    <h2
                                        className={cn(
                                            "text-base font-bold",
                                            theme === "dark" ? "text-slate-100" : "text-slate-900"
                                        )}
                                    >
                                        Shopping Cart
                                    </h2>
                                    <p
                                        className={cn(
                                            "text-[11px]",
                                            theme === "dark" ? "text-slate-500" : "text-stone-400"
                                        )}
                                    >
                                        {itemCount} item{itemCount !== 1 ? "s" : ""}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                    theme === "dark"
                                        ? "hover:bg-white/[0.06] text-slate-400"
                                        : "hover:bg-stone-100 text-stone-400"
                                )}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {loading && !cart ? (
                                <div className="flex items-center justify-center h-32">
                                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full py-16">
                                    <ShoppingBag
                                        className={cn(
                                            "w-16 h-16 mb-4",
                                            theme === "dark" ? "text-slate-700" : "text-stone-200"
                                        )}
                                    />
                                    <p
                                        className={cn(
                                            "text-sm font-medium mb-1",
                                            theme === "dark" ? "text-slate-400" : "text-stone-500"
                                        )}
                                    >
                                        Your cart is empty
                                    </p>
                                    <p
                                        className={cn(
                                            "text-xs",
                                            theme === "dark" ? "text-slate-600" : "text-stone-400"
                                        )}
                                    >
                                        Ask PharmAI to add medicines
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {items.map((item, i) => (
                                        <motion.div
                                            key={item.item_id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3.5 rounded-xl group transition-colors",
                                                theme === "dark"
                                                    ? "bg-white/[0.025] border border-white/[0.05] hover:border-white/[0.08]"
                                                    : "bg-stone-50/80 border border-stone-200/60 hover:bg-stone-50"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                    theme === "dark" ? "bg-blue-500/10" : "bg-blue-50"
                                                )}
                                            >
                                                <Package className="w-5 h-5 text-blue-400" />
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p
                                                    className={cn(
                                                        "text-[13px] font-semibold truncate",
                                                        theme === "dark" ? "text-slate-200" : "text-slate-800"
                                                    )}
                                                >
                                                    {item.medicine_name}
                                                </p>
                                                <p
                                                    className={cn(
                                                        "text-[11px] mt-0.5",
                                                        theme === "dark" ? "text-slate-500" : "text-stone-400"
                                                    )}
                                                >
                                                    {formatInr(item.unit_price)} per strip
                                                </p>
                                            </div>

                                            {/* Qty controls */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    onClick={() =>
                                                        item.quantity <= 1
                                                            ? handleRemove(item.item_id)
                                                            : handleUpdateQty(item.item_id, item.quantity - 1)
                                                    }
                                                    className={cn(
                                                        "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                                                        theme === "dark"
                                                            ? "bg-white/[0.06] hover:bg-white/[0.1] text-slate-400"
                                                            : "bg-stone-200/60 hover:bg-stone-200 text-stone-500"
                                                    )}
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span
                                                    className={cn(
                                                        "w-7 text-center text-xs font-bold tabular-nums",
                                                        theme === "dark" ? "text-slate-200" : "text-slate-700"
                                                    )}
                                                >
                                                    {item.quantity}
                                                </span>
                                                <button
                                                    onClick={() => handleUpdateQty(item.item_id, item.quantity + 1)}
                                                    className={cn(
                                                        "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
                                                        theme === "dark"
                                                            ? "bg-white/[0.06] hover:bg-white/[0.1] text-slate-400"
                                                            : "bg-stone-200/60 hover:bg-stone-200 text-stone-500"
                                                    )}
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>

                                            {/* Subtotal + remove */}
                                            <div className="flex flex-col items-end shrink-0 gap-0.5">
                                                <span
                                                    className={cn(
                                                        "text-xs font-bold",
                                                        theme === "dark" ? "text-slate-200" : "text-slate-700"
                                                    )}
                                                >
                                                    {formatInr(item.subtotal)}
                                                </span>
                                                <button
                                                    onClick={() => handleRemove(item.item_id)}
                                                    className={cn(
                                                        "text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity",
                                                        theme === "dark"
                                                            ? "text-red-400/70 hover:text-red-400"
                                                            : "text-red-400 hover:text-red-500"
                                                    )}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* Clear all */}
                                    {items.length > 1 && (
                                        <button
                                            onClick={handleClear}
                                            className={cn(
                                                "w-full text-center py-2 text-[11px] font-medium rounded-lg transition-colors mt-2",
                                                theme === "dark"
                                                    ? "text-red-400/60 hover:text-red-400 hover:bg-red-500/5"
                                                    : "text-red-400 hover:text-red-500 hover:bg-red-50"
                                            )}
                                        >
                                            <Trash2 className="w-3 h-3 inline mr-1.5" />
                                            Clear entire cart
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer — total + checkout */}
                        {items.length > 0 && (
                            <div
                                className={cn(
                                    "shrink-0 px-6 py-5 border-t",
                                    theme === "dark"
                                        ? "border-white/[0.06] bg-white/[0.015]"
                                        : "border-stone-100 bg-stone-50/50"
                                )}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <span
                                        className={cn(
                                            "text-[11px] font-semibold uppercase tracking-wider",
                                            theme === "dark" ? "text-slate-500" : "text-stone-400"
                                        )}
                                    >
                                        Order Total
                                    </span>
                                    <span
                                        className={cn(
                                            "text-xl font-bold",
                                            theme === "dark" ? "text-slate-100" : "text-slate-900"
                                        )}
                                    >
                                        {formatInr(cart?.total_amount || 0)}
                                    </span>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.01 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleCheckout}
                                    disabled={checkingOut}
                                    className={cn(
                                        "w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all",
                                        "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg hover:shadow-xl",
                                        "disabled:opacity-50 disabled:cursor-not-allowed"
                                    )}
                                >
                                    {checkingOut ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <CreditCard className="w-4 h-4" />
                                    )}
                                    {checkingOut ? "Processing..." : "Proceed to Checkout"}
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
