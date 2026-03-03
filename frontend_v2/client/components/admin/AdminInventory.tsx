import { useState, useEffect, useMemo, useRef } from "react";
import { Package, Search, Loader2, Plus, Check, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getInventory, restockMedicine, importMedicines } from "@/services/api";
import type { InventoryItem } from "@/types/admin";

const STATUS_OPTIONS = ["all", "ok", "low", "critical"] as const;

function statusBadgeClass(status: string) {
  switch (status) {
    case "ok":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "low":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "critical":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
    default:
      return "";
  }
}

function progressColor(status: string) {
  switch (status) {
    case "ok":
      return "[&>div]:bg-emerald-500";
    case "low":
      return "[&>div]:bg-amber-500";
    case "critical":
      return "[&>div]:bg-red-500";
    default:
      return "";
  }
}

export default function AdminInventory() {
  const { theme } = useTheme();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Restock state per medicine
  const [restockId, setRestockId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const [restocking, setRestocking] = useState(false);
  const [restockSuccess, setRestockSuccess] = useState<string | null>(null);

  // CSV import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importMedicines(file);
      setImportResult(result);
      // Reload inventory after import
      const data = await getInventory();
      setInventory(data);
    } catch (err: any) {
      setImportResult({ errors: [{ name: "Upload", error: err.message || "Import failed" }], imported: [], skipped: [] });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const data = await getInventory();
        setInventory(data);
      } catch (err) {
        console.error("Failed to load inventory", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch = item.medicine_name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [inventory, search, statusFilter]);

  const handleRestock = async (medicineId: string) => {
    const qty = parseInt(restockQty, 10);
    if (!qty || qty <= 0) return;
    setRestocking(true);
    try {
      const result = await restockMedicine(medicineId as any, qty);
      if (result.success) {
        setInventory((prev) =>
          prev.map((item) =>
            item.medicine_id === medicineId
              ? {
                ...item,
                stock_quantity: result.new_stock,
                status: result.new_stock <= 0
                  ? "critical"
                  : result.new_stock < item.min_stock_threshold
                    ? "low"
                    : ("ok" as const),
              }
              : item
          )
        );
        setRestockSuccess(medicineId);
        setTimeout(() => setRestockSuccess(null), 2000);
      }
    } catch (err) {
      console.error("Restock failed", err);
    } finally {
      setRestocking(false);
      setRestockId(null);
      setRestockQty("");
    }
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
      {/* Search + Filter + Import */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className={cn(
          "flex-1 flex items-center gap-2 rounded-xl px-4 py-2.5",
          theme === "dark"
            ? "bg-white/[0.04] border border-white/[0.08]"
            : "bg-white border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        )}>
          <Search className={cn("w-4 h-4 shrink-0", theme === "dark" ? "text-slate-500" : "text-slate-400")} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicines..."
            className={cn(
              "flex-1 bg-transparent text-sm outline-none",
              theme === "dark" ? "text-slate-200 placeholder-slate-600" : "text-slate-700 placeholder-slate-400"
            )}
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3.5 py-2 rounded-lg text-xs font-semibold capitalize transition-colors",
                statusFilter === s
                  ? theme === "dark"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : theme === "dark"
                    ? "bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:bg-white/[0.05]"
                    : "bg-white text-slate-500 border border-slate-200/60 hover:bg-slate-50"
              )}
            >
              {s}
            </button>
          ))}
          {/* CSV Import Button */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCsvImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all",
              importing
                ? "opacity-60 cursor-wait"
                : theme === "dark"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
            )}
          >
            {importing ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing…</>
            ) : (
              <><Upload className="w-3.5 h-3.5" /> Import CSV</>
            )}
          </button>
        </div>
      </div>

      {/* Import Results Banner */}
      <AnimatePresence>
        {importResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "rounded-xl border p-4",
              theme === "dark" ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-slate-200/60 shadow-sm"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className={cn("w-4 h-4", theme === "dark" ? "text-emerald-400" : "text-emerald-600")} />
                <span className={cn("text-sm font-semibold", theme === "dark" ? "text-slate-200" : "text-slate-700")}>Import Results</span>
              </div>
              <button onClick={() => setImportResult(null)} className={cn("p-1 rounded-lg", theme === "dark" ? "hover:bg-white/5 text-slate-500" : "hover:bg-slate-100 text-slate-400")}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-4 flex-wrap">
              {(importResult.imported?.length > 0) && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className={cn("text-xs font-medium", theme === "dark" ? "text-emerald-400" : "text-emerald-600")}>
                    {importResult.imported.length} imported
                  </span>
                </div>
              )}
              {(importResult.skipped?.length > 0) && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className={cn("text-xs font-medium", theme === "dark" ? "text-amber-400" : "text-amber-600")}>
                    {importResult.skipped.length} skipped (duplicates)
                  </span>
                </div>
              )}
              {(importResult.errors?.length > 0) && (
                <div className="flex items-center gap-1.5">
                  <X className="w-3.5 h-3.5 text-red-500" />
                  <span className={cn("text-xs font-medium", theme === "dark" ? "text-red-400" : "text-red-600")}>
                    {importResult.errors.length} failed
                  </span>
                </div>
              )}
            </div>

            {/* Imported list */}
            {(importResult.imported?.length > 0) && (
              <div className="mt-3 space-y-1">
                {importResult.imported.map((m: any, i: number) => (
                  <div key={i} className={cn("text-[11px] flex items-center gap-2", theme === "dark" ? "text-slate-400" : "text-slate-500")}>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="font-medium">{m.name}</span>
                    <span className={cn("text-[10px]", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
                      {m.category} · {m.quantity} units
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards Grid */}
      {filtered.length === 0 ? (
        <p className={cn("text-sm py-8 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
          No medicines match your search.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((item, i) => {
            const pct = Math.min(100, (item.stock_quantity / Math.max(1, item.min_stock_threshold * 3)) * 100);
            const isRestocking = restockId === item.medicine_id;

            return (
              <motion.div
                key={item.inventory_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={cn(
                  "rounded-2xl p-5 flex flex-col gap-3 transition-colors",
                  theme === "dark"
                    ? "bg-white/[0.03] border border-white/[0.06]"
                    : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn(
                      "text-sm font-semibold truncate",
                      theme === "dark" ? "text-slate-200" : "text-slate-700"
                    )}>
                      {item.medicine_name}
                    </p>
                    <p className={cn(
                      "text-[11px] mt-0.5",
                      theme === "dark" ? "text-slate-500" : "text-slate-400"
                    )}>
                      Threshold: {item.min_stock_threshold} {item.unit_type}
                    </p>
                    {item.price > 0 && (
                      <p className={cn(
                        "text-xs font-semibold mt-1",
                        theme === "dark" ? "text-emerald-400" : "text-emerald-600"
                      )}>
                        ₹{item.price.toFixed(2)}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={cn("text-[10px] capitalize shrink-0", statusBadgeClass(item.status))}>
                    {item.status}
                  </Badge>
                </div>

                {/* Stock bar */}
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className={cn(
                      "text-lg font-bold",
                      theme === "dark" ? "text-slate-100" : "text-slate-800"
                    )}>
                      {item.stock_quantity}
                    </span>
                    <span className={cn(
                      "text-[10px] font-medium",
                      theme === "dark" ? "text-slate-600" : "text-slate-400"
                    )}>
                      {item.unit_type}
                    </span>
                  </div>
                  <Progress value={pct} className={cn("h-1.5", progressColor(item.status))} />
                </div>

                {/* Restock */}
                {isRestocking ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={restockQty}
                      onChange={(e) => setRestockQty(e.target.value)}
                      placeholder="Qty"
                      min={1}
                      autoFocus
                      className={cn(
                        "w-20 px-2.5 py-1.5 rounded-lg text-sm outline-none",
                        theme === "dark"
                          ? "bg-white/[0.04] border border-white/[0.08] text-slate-200"
                          : "bg-slate-50 border border-slate-200 text-slate-700"
                      )}
                    />
                    <button
                      onClick={() => handleRestock(item.medicine_id)}
                      disabled={restocking || !restockQty}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
                    >
                      {restocking ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                    </button>
                    <button
                      onClick={() => { setRestockId(null); setRestockQty(""); }}
                      className={cn(
                        "px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        theme === "dark" ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setRestockId(item.medicine_id)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors",
                      restockSuccess === item.medicine_id
                        ? "bg-emerald-500/15 text-emerald-500"
                        : theme === "dark"
                          ? "bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:bg-white/[0.06]"
                          : "bg-slate-50 border border-slate-200/60 text-slate-500 hover:bg-slate-100"
                    )}
                  >
                    {restockSuccess === item.medicine_id ? (
                      <><Check className="w-3 h-3" /> Restocked</>
                    ) : (
                      <><Plus className="w-3 h-3" /> Restock</>
                    )}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
