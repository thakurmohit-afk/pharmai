import { useState, useEffect } from "react";
import {
  Loader2, Cpu, Database, RefreshCw, Trash2, FileText,
  Shield, ChevronDown, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  getLlmStatus,
  getCacheStatus,
  clearRuntimeCache,
  getPrescriptionQueue,
  getAdminDispensingLogs,
} from "@/services/api";
import type { PrescriptionQueueItem, DispensingLog } from "@/types/admin";

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

function safetyBadge(decision: string | null) {
  switch (decision) {
    case "allow":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "soft_block":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "hard_block":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
    default:
      return "bg-slate-500/15 text-slate-500 border-slate-500/20";
  }
}

export default function AdminSystem() {
  const { theme } = useTheme();
  const [llmStatus, setLlmStatus] = useState<any>(null);
  const [cacheStatus, setCacheStatus] = useState<any>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionQueueItem[]>([]);
  const [logs, setLogs] = useState<DispensingLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingLlm, setRefreshingLlm] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [llm, cache, rxQueue, dLogs] = await Promise.all([
          getLlmStatus(),
          getCacheStatus(),
          getPrescriptionQueue(),
          getAdminDispensingLogs(20),
        ]);
        setLlmStatus(llm);
        setCacheStatus(cache);
        setPrescriptions(rxQueue);
        setLogs(dLogs);
      } catch (err) {
        console.error("Failed to load system data", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRefreshLlm = async () => {
    setRefreshingLlm(true);
    try {
      const data = await getLlmStatus(true);
      setLlmStatus(data);
    } catch (err) {
      console.error("LLM refresh failed", err);
    } finally {
      setRefreshingLlm(false);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await clearRuntimeCache();
      const data = await getCacheStatus();
      setCacheStatus(data);
    } catch (err) {
      console.error("Cache clear failed", err);
    } finally {
      setClearingCache(false);
    }
  };

  const cardClass = cn(
    "rounded-2xl p-6 transition-colors",
    theme === "dark"
      ? "bg-white/[0.03] border border-white/[0.06]"
      : "bg-white border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
  );

  const sectionLabel = cn(
    "text-sm font-semibold mb-4 flex items-center gap-2",
    theme === "dark" ? "text-slate-300" : "text-slate-700"
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LLM Status */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardClass}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className={sectionLabel}>
              <Cpu className="w-4 h-4 text-blue-500" />
              LLM Status
            </h3>
            <button
              onClick={handleRefreshLlm}
              disabled={refreshingLlm}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                theme === "dark"
                  ? "bg-white/[0.04] border border-white/[0.06] text-slate-400 hover:bg-white/[0.06]"
                  : "bg-slate-50 border border-slate-200/60 text-slate-500 hover:bg-slate-100"
              )}
            >
              <RefreshCw className={cn("w-3 h-3", refreshingLlm && "animate-spin")} />
              Refresh
            </button>
          </div>

          {llmStatus ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  llmStatus.openai_configured || llmStatus.authenticated
                    ? "bg-emerald-500"
                    : "bg-red-500"
                )} />
                <span className={cn(
                  "text-sm font-medium",
                  theme === "dark" ? "text-slate-300" : "text-slate-600"
                )}>
                  {llmStatus.openai_configured || llmStatus.authenticated ? "Connected" : "Not Configured"}
                </span>
              </div>
              {llmStatus.provider && (
                <InfoRow label="Provider" value={llmStatus.provider} theme={theme} />
              )}
              {llmStatus.model && (
                <InfoRow label="Model" value={llmStatus.model} theme={theme} />
              )}
              {llmStatus.mock_mode != null && (
                <InfoRow label="Mock Mode" value={llmStatus.mock_mode ? "Enabled" : "Disabled"} theme={theme} />
              )}
            </div>
          ) : (
            <p className={cn("text-sm", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
              Unable to fetch LLM status.
            </p>
          )}
        </motion.div>

        {/* Cache Status */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={cardClass}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className={sectionLabel}>
              <Database className="w-4 h-4 text-teal-500" />
              Cache Status
            </h3>
            <button
              onClick={handleClearCache}
              disabled={clearingCache}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                "bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/15"
              )}
            >
              {clearingCache ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3" />
              )}
              Clear Cache
            </button>
          </div>

          {cacheStatus ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                <span className={cn(
                  "text-sm font-medium",
                  theme === "dark" ? "text-slate-300" : "text-slate-600"
                )}>
                  {cacheStatus.backend || "Active"}
                </span>
              </div>
              {cacheStatus.namespace && (
                <InfoRow label="Namespace" value={cacheStatus.namespace} theme={theme} />
              )}
              {cacheStatus.type && (
                <InfoRow label="Type" value={cacheStatus.type} theme={theme} />
              )}
            </div>
          ) : (
            <p className={cn("text-sm", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
              Unable to fetch cache status.
            </p>
          )}
        </motion.div>
      </div>

      {/* Prescription Queue */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={cardClass}
      >
        <h3 className={sectionLabel}>
          <FileText className="w-4 h-4 text-purple-500" />
          Prescription Queue
          {prescriptions.length > 0 && (
            <Badge variant="outline" className="text-[10px] ml-1 bg-purple-500/15 text-purple-500 border-purple-500/20">
              {prescriptions.length} pending
            </Badge>
          )}
        </h3>

        {prescriptions.length === 0 ? (
          <p className={cn("text-sm py-4 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
            No prescriptions awaiting review.
          </p>
        ) : (
          <div className="space-y-3">
            {prescriptions.map((rx) => {
              const medicines = rx.extracted_data?.medicines || [];
              return (
                <div
                  key={rx.prescription_id}
                  className={cn(
                    "rounded-xl p-4",
                    theme === "dark"
                      ? "bg-white/[0.02] border border-white/[0.04]"
                      : "bg-slate-50/50 border border-slate-100/50"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className={cn(
                        "text-sm font-medium",
                        theme === "dark" ? "text-slate-200" : "text-slate-700"
                      )}>
                        {rx.user_name}
                      </span>
                      <span className={cn(
                        "text-[10px] ml-2",
                        theme === "dark" ? "text-slate-600" : "text-slate-400"
                      )}>
                        {timeAgo(rx.upload_date)}
                      </span>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      rx.confidence >= 0.8
                        ? "bg-emerald-500/15 text-emerald-500"
                        : rx.confidence >= 0.5
                          ? "bg-amber-500/15 text-amber-500"
                          : "bg-red-500/15 text-red-500"
                    )}>
                      {Math.round(rx.confidence * 100)}% confidence
                    </Badge>
                  </div>
                  {medicines.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {medicines.map((med: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {med.name || med.medicine_name || "Unknown"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Dispensing Logs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className={cardClass}
      >
        <h3 className={sectionLabel}>
          <Shield className="w-4 h-4 text-emerald-500" />
          Dispensing Audit Trail
        </h3>

        {logs.length === 0 ? (
          <p className={cn("text-sm py-4 text-center", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
            No dispensing logs yet.
          </p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {logs.map((log) => (
              <AccordionItem
                key={log.log_id}
                value={log.log_id}
                className={cn(
                  "rounded-xl border px-4",
                  theme === "dark" ? "border-white/[0.04]" : "border-slate-100"
                )}
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left w-full pr-2">
                    {log.safety_decision === "allow" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : log.safety_decision === "hard_block" ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className={cn(
                        "text-sm font-medium",
                        theme === "dark" ? "text-slate-200" : "text-slate-700"
                      )}>
                        {log.user_name}
                      </span>
                      <span className={cn(
                        "text-[10px] ml-2",
                        theme === "dark" ? "text-slate-600" : "text-slate-400"
                      )}>
                        {timeAgo(log.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={cn("text-[10px] capitalize", safetyBadge(log.safety_decision))}>
                        {log.safety_decision || "unknown"}
                      </Badge>
                      {log.pharmacist_escalation_required && (
                        <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-500 border-red-500/20">
                          Escalated
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <div className="space-y-3 pt-1">
                    {/* Medicines Dispensed */}
                    {log.medicines_dispensed.length > 0 && (
                      <DetailSection label="Medicines Dispensed" theme={theme}>
                        <div className="flex flex-wrap gap-1.5">
                          {log.medicines_dispensed.map((med: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-[11px]">
                              {typeof med === "string" ? med : med.name || JSON.stringify(med)}
                            </Badge>
                          ))}
                        </div>
                      </DetailSection>
                    )}

                    {/* Safety Warnings */}
                    {log.safety_warnings_surfaced.length > 0 && (
                      <DetailSection label="Safety Warnings" theme={theme}>
                        <div className="space-y-1">
                          {log.safety_warnings_surfaced.map((w: any, i: number) => (
                            <p key={i} className={cn(
                              "text-xs",
                              theme === "dark" ? "text-amber-400/80" : "text-amber-600"
                            )}>
                              {typeof w === "string" ? w : JSON.stringify(w)}
                            </p>
                          ))}
                        </div>
                      </DetailSection>
                    )}

                    {/* Clinical Checks */}
                    {Object.keys(log.clinical_checks_passed).length > 0 && (
                      <DetailSection label="Clinical Checks" theme={theme}>
                        <div className="space-y-1">
                          {Object.entries(log.clinical_checks_passed).map(([key, val]) => (
                            <div key={key} className="flex items-center gap-2">
                              <span className={cn(
                                "text-xs font-medium",
                                theme === "dark" ? "text-slate-400" : "text-slate-500"
                              )}>
                                {key}:
                              </span>
                              <span className={cn(
                                "text-xs",
                                val ? "text-emerald-500" : "text-red-500"
                              )}>
                                {String(val)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </DetailSection>
                    )}

                    {/* Counseling */}
                    {log.counseling_provided.length > 0 && (
                      <DetailSection label="Counseling Provided" theme={theme}>
                        <div className="space-y-1">
                          {log.counseling_provided.map((c: any, i: number) => (
                            <p key={i} className={cn(
                              "text-xs",
                              theme === "dark" ? "text-slate-400" : "text-slate-500"
                            )}>
                              {typeof c === "string" ? c : JSON.stringify(c)}
                            </p>
                          ))}
                        </div>
                      </DetailSection>
                    )}

                    {/* Trace ID */}
                    {log.trace_id && (
                      <p className={cn(
                        "text-[10px] font-mono mt-2",
                        theme === "dark" ? "text-slate-700" : "text-slate-300"
                      )}>
                        trace: {log.trace_id}
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </motion.div>
    </div>
  );
}

function InfoRow({ label, value, theme }: { label: string; value: string; theme: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-xs", theme === "dark" ? "text-slate-600" : "text-slate-400")}>
        {label}
      </span>
      <span className={cn(
        "text-xs font-medium",
        theme === "dark" ? "text-slate-300" : "text-slate-600"
      )}>
        {value}
      </span>
    </div>
  );
}

function DetailSection({ label, children, theme }: { label: string; children: React.ReactNode; theme: string }) {
  return (
    <div>
      <p className={cn(
        "text-[10px] font-semibold uppercase tracking-wider mb-1.5",
        theme === "dark" ? "text-slate-600" : "text-slate-400"
      )}>
        {label}
      </p>
      {children}
    </div>
  );
}
