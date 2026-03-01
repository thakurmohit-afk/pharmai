import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ShoppingCart, Plus, Minus, Trash2, CreditCard, Package,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

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

interface CartCardProps {
    cart: CartData;
    onCheckout?: () => void;
    onUpdateQuantity?: (itemId: string, newQty: number) => void;
    onRemoveItem?: (itemId: string) => void;
}

function formatInr(amount: number): string {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function CartCard({ cart, onCheckout, onUpdateQuantity, onRemoveItem }: CartCardProps) {
    const { theme } = useTheme();
    const [removingId, setRemovingId] = useState<string | null>(null);

    if (!cart || !cart.items || cart.items.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    "mt-3 rounded-2xl border p-6 text-center",
                    theme === "dark"
                        ? "bg-white/[0.02] border-white/[0.06]"
                        : "bg-stone-50 border-stone-200/60"
                )}
            >
                <ShoppingCart
                    className={cn(
                        "w-10 h-10 mx-auto mb-3",
                        theme === "dark" ? "text-slate-600" : "text-stone-300"
                    )}
                />
                <p
                    className={cn(
                        "text-sm font-medium",
                        theme === "dark" ? "text-slate-400" : "text-stone-500"
                    )}
                >
                    Your cart is empty
                </p>
            </motion.div>
        );
    }

    const handleRemove = (itemId: string) => {
        setRemovingId(itemId);
        setTimeout(() => {
            onRemoveItem?.(itemId);
            setRemovingId(null);
        }, 300);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className={cn(
                "mt-3 rounded-2xl border overflow-hidden",
                theme === "dark"
                    ? "bg-white/[0.02] border-white/[0.06]"
                    : "bg-white border-stone-200/60 shadow-sm"
            )}
        >
            {/* Header */}
            <div
                className={cn(
                    "px-5 py-3.5 flex items-center gap-3 border-b",
                    theme === "dark"
                        ? "border-white/[0.06] bg-emerald-500/[0.04]"
                        : "border-stone-100 bg-emerald-50/30"
                )}
            >
                <div
                    className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center",
                        theme === "dark" ? "bg-emerald-500/15" : "bg-emerald-100/80"
                    )}
                >
                    <ShoppingCart className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <p
                        className={cn(
                            "text-sm font-semibold",
                            theme === "dark" ? "text-slate-200" : "text-slate-800"
                        )}
                    >
                        Shopping Cart
                    </p>
                    <p
                        className={cn(
                            "text-[11px]",
                            theme === "dark" ? "text-slate-500" : "text-stone-400"
                        )}
                    >
                        {cart.item_count} item{cart.item_count !== 1 ? "s" : ""}
                    </p>
                </div>
                <span
                    className={cn(
                        "text-sm font-bold",
                        theme === "dark" ? "text-emerald-400" : "text-emerald-600"
                    )}
                >
                    {formatInr(cart.total_amount)}
                </span>
            </div>

            {/* Items */}
            <div className="px-4 py-2 space-y-1">
                <AnimatePresence>
                    {cart.items.map((item, i) => (
                        <motion.div
                            key={item.item_id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{
                                opacity: removingId === item.item_id ? 0 : 1,
                                x: removingId === item.item_id ? -30 : 0,
                                height: removingId === item.item_id ? 0 : "auto",
                            }}
                            exit={{ opacity: 0, x: -30, height: 0 }}
                            transition={{ duration: 0.25, delay: i * 0.05 }}
                            className={cn(
                                "flex items-center gap-3 px-3 py-3 rounded-xl group",
                                theme === "dark"
                                    ? "hover:bg-white/[0.03]"
                                    : "hover:bg-stone-50"
                            )}
                        >
                            {/* Medicine icon */}
                            <div
                                className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                                    theme === "dark" ? "bg-blue-500/10" : "bg-blue-50"
                                )}
                            >
                                <Package className="w-4 h-4 text-blue-400" />
                            </div>

                            {/* Name & price */}
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
                                        "text-[11px]",
                                        theme === "dark" ? "text-slate-500" : "text-stone-400"
                                    )}
                                >
                                    {formatInr(item.unit_price)} × {item.quantity} = {formatInr(item.subtotal)}
                                </p>
                            </div>

                            {/* Quantity controls */}
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={() => {
                                        if (item.quantity <= 1) {
                                            handleRemove(item.item_id);
                                        } else {
                                            onUpdateQuantity?.(item.item_id, item.quantity - 1);
                                        }
                                    }}
                                    className={cn(
                                        "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                                        theme === "dark"
                                            ? "bg-white/[0.05] hover:bg-white/[0.1] text-slate-400"
                                            : "bg-stone-100 hover:bg-stone-200 text-stone-500"
                                    )}
                                >
                                    <Minus className="w-3 h-3" />
                                </button>
                                <span
                                    className={cn(
                                        "w-6 text-center text-xs font-bold tabular-nums",
                                        theme === "dark" ? "text-slate-300" : "text-slate-700"
                                    )}
                                >
                                    {item.quantity}
                                </span>
                                <button
                                    onClick={() => onUpdateQuantity?.(item.item_id, item.quantity + 1)}
                                    className={cn(
                                        "w-6 h-6 rounded-lg flex items-center justify-center transition-colors",
                                        theme === "dark"
                                            ? "bg-white/[0.05] hover:bg-white/[0.1] text-slate-400"
                                            : "bg-stone-100 hover:bg-stone-200 text-stone-500"
                                    )}
                                >
                                    <Plus className="w-3 h-3" />
                                </button>
                            </div>

                            {/* Remove */}
                            <button
                                onClick={() => handleRemove(item.item_id)}
                                className={cn(
                                    "w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all",
                                    theme === "dark"
                                        ? "hover:bg-red-500/10 text-red-400/60 hover:text-red-400"
                                        : "hover:bg-red-50 text-stone-300 hover:text-red-400"
                                )}
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Total & checkout */}
            <div
                className={cn(
                    "px-5 py-4 border-t flex items-center justify-between",
                    theme === "dark"
                        ? "border-white/[0.06] bg-white/[0.015]"
                        : "border-stone-100 bg-stone-50/50"
                )}
            >
                <div>
                    <p
                        className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider",
                            theme === "dark" ? "text-slate-600" : "text-stone-400"
                        )}
                    >
                        Total
                    </p>
                    <p
                        className={cn(
                            "text-lg font-bold",
                            theme === "dark" ? "text-slate-100" : "text-slate-900"
                        )}
                    >
                        {formatInr(cart.total_amount)}
                    </p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={onCheckout}
                    className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                        "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md hover:shadow-lg"
                    )}
                >
                    <CreditCard className="w-4 h-4" />
                    Checkout
                </motion.button>
            </div>
        </motion.div>
    );
}
