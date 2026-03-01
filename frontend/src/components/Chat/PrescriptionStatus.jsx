import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";

function Badge({ text, color }) {
    const styles = {
        emerald: "bg-[#10b981]/10 text-[#34d399] border-[#10b981]/20",
        amber: "bg-[#f59e0b]/10 text-[#fbbf24] border-[#f59e0b]/20",
        red: "bg-[#ef4444]/10 text-[#f87171] border-[#ef4444]/20",
        slate: "bg-[#64748b]/10 text-[#cbd5e1] border-[#64748b]/20"
    };

    return (
        <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full border ${styles[color]}`}>
            {text}
        </span>
    );
}

export default function PrescriptionStatus({ prescription, onAction }) {
    const medicines = prescription.medicines || [];
    const hasData = medicines.length > 0 || prescription.valid_until || prescription.doctor_name || (prescription.advice && prescription.advice.length > 0);

    if (!hasData) return null;

    let exactCount = 0;
    let partialCount = 0;
    let notFoundCount = 0;
    let subtotal = 0;

    const evaluatedMedicines = medicines.map((med) => {
        const dbMatch = med.db_matches?.[0]; // Best match

        let state = "not_found";
        if (dbMatch) {
            if (dbMatch.match_quality === "exact" || dbMatch.match_quality === "strength_mismatch") {
                state = "exact";
                exactCount++;
                subtotal += dbMatch.price || 0;
            } else {
                state = "partial";
                partialCount++;
            }
        } else {
            notFoundCount++;
        }

        return { med, dbMatch, state };
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="mt-2 w-full max-w-[440px] rounded-[16px] overflow-hidden flex flex-col bg-[#0A0D14] border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        >
            {/* ─── Top Summary Section ─── */}
            <div className="px-4 py-3 border-b bg-white/[0.02] border-white/[0.06]">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#34d399]" />
                        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-300">
                            Prescription Analysis Complete
                        </h3>
                    </div>
                    <span className="text-[11px] text-slate-500">
                        Analyzed just now
                    </span>
                </div>

                <div className="flex items-center gap-2 text-[12px] font-medium flex-wrap">
                    <span className="text-slate-400">Detected: {medicines.length} Medicines</span>

                    <div className="w-1 h-1 rounded-full bg-slate-400/30 mx-1" />

                    <span className="px-2 py-0.5 rounded-full bg-[#10b981]/10 text-[#34d399]">
                        Exact: {exactCount}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#f59e0b]/10 text-[#fbbf24]">
                        Partial: {partialCount}
                    </span>
                    {notFoundCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-[#ef4444]/10 text-[#f87171]">
                            Not Found: {notFoundCount}
                        </span>
                    )}
                </div>
            </div>

            {/* ─── Medicine Evaluation Cards ─── */}
            <div className="p-4 space-y-3">
                {evaluatedMedicines.map(({ med, dbMatch, state }, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 * i, duration: 0.3 }}
                        className={`rounded-[12px] p-3 border ${state === "exact"
                            ? "bg-[#10b981]/[0.03] border-[#10b981]/20"
                            : state === "partial"
                                ? "bg-[#f59e0b]/[0.03] border-[#f59e0b]/20"
                                : "bg-[#ef4444]/[0.03] border-[#ef4444]/20"
                            }`}
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <h4 className="text-[14px] font-semibold leading-tight mb-1 text-slate-200">
                                    {dbMatch?.name || med.name} {med.dosage && <span className="opacity-70 font-normal">({med.dosage})</span>}
                                </h4>
                                {dbMatch?.price && (
                                    <p className="text-[12px] font-medium text-slate-400">
                                        ₹{dbMatch.price} / strip
                                    </p>
                                )}
                            </div>

                            {/* Icon Status */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${state === "exact"
                                ? "bg-[#10b981]/20 text-[#34d399]"
                                : state === "partial"
                                    ? "bg-[#f59e0b]/20 text-[#fbbf24]"
                                    : "bg-[#ef4444]/20 text-[#f87171]"
                                }`}>
                                {state === "exact" && <CheckCircle2 className="w-4 h-4" />}
                                {state === "partial" && <AlertTriangle className="w-4 h-4" />}
                                {state === "not_found" && <XCircle className="w-4 h-4" />}
                            </div>
                        </div>

                        {/* Badges */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            <Badge
                                text={state === "exact" ? "Exact Molecule Match" : state === "partial" ? "Partial Match" : "No Exact Match"}
                                color={state === "exact" ? "emerald" : state === "partial" ? "amber" : "red"}
                            />
                            {dbMatch && (
                                <>
                                    <Badge
                                        text={dbMatch.in_stock ? "In Stock" : "Out of Stock"}
                                        color={dbMatch.in_stock ? "slate" : "red"}
                                    />
                                    <Badge
                                        text={dbMatch.rx_required ? "Rx Required" : "No Rx Required"}
                                        color="slate"
                                    />
                                </>
                            )}
                        </div>

                        {/* Issue Explanation (for partial cases) */}
                        {state === "partial" && dbMatch?.match_warnings && dbMatch.match_warnings.length > 0 && (
                            <div className="mb-3 px-3 py-2 rounded-lg text-[12px] leading-relaxed bg-black/20 text-slate-300">
                                {dbMatch.match_warnings.join(" ")}
                            </div>
                        )}

                        {/* CTA */}
                        <button
                            onClick={() => onAction && onAction(state === "exact" ? `Add ${dbMatch?.name || med.name} to order` : `Refine ${med.name}`)}
                            className={`w-full py-1.5 rounded-lg text-[12px] font-semibold transition-all ${state === "exact"
                                ? "bg-white/[0.08] hover:bg-white/[0.12] text-[#34d399] border border-[#10b981]/20"
                                : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10"
                                }`}
                        >
                            {state === "exact" ? "Add to Order" : state === "partial" ? "View Alternatives" : "View Similar Combinations"}
                        </button>
                    </motion.div>
                ))}

                {/* ─── Doctor Instructions Section ─── */}
                {prescription.advice && prescription.advice.length > 0 && (
                    <div className="pt-3 border-t border-white/[0.06]">
                        <h4 className="text-[11px] font-semibold uppercase tracking-wider mb-2 text-slate-400">
                            Doctor's Instructions
                        </h4>
                        <ul className="space-y-1.5">
                            {prescription.advice.map((line, i) => {
                                const text = typeof line === 'string' ? line : typeof line === 'object' && line !== null ? line.instruction : '';
                                if (!text) return null;
                                return (
                                    <li key={i} className="flex items-start gap-2">
                                        <div className="w-1 h-1 rounded-full mt-1.5 shrink-0 bg-slate-500" />
                                        <p className="text-[12px] leading-relaxed text-slate-300">
                                            {text}
                                        </p>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {/* ─── Action Footer ─── */}
            <div className="p-4 flex items-center justify-between mt-auto border-t bg-white/[0.02] border-white/[0.08]">
                <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Total Amount
                    </p>
                    <p className="text-[16px] font-bold mt-0.5 text-slate-200">
                        ₹{subtotal.toFixed(2)}
                    </p>
                </div>
                <button
                    onClick={() => onAction && onAction("Proceed with exact matches")}
                    disabled={exactCount === 0}
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-all shadow-sm ${exactCount > 0
                        ? "bg-[#10b981] hover:bg-[#059669] text-white shadow-[0_2px_8px_rgba(16,185,129,0.25)]"
                        : "bg-white/[0.04] text-slate-500 cursor-not-allowed"
                        }`}
                >
                    <CheckCircle2 className="w-5 h-5" />
                </button>
            </div>

        </motion.div>
    );
}
