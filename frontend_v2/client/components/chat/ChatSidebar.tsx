import { useState } from "react";
import { Plus, Trash2, PanelLeftClose, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
  threads: any[];
  onToggle?: () => void;
}

export default function ChatSidebar({ activeId, onSelect, onDelete, threads, onToggle }: ChatSidebarProps) {
  const recent = threads.slice(0, 5);
  const older = threads.slice(5);
  const [olderExpanded, setOlderExpanded] = useState(false);

  return (
    <div className="w-60 flex-shrink-0 flex flex-col h-full bg-white/80 backdrop-blur-xl border-r border-stone-200/60">
      {/* Header */}
      <div className="p-5 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
            History
          </h2>
          {onToggle && (
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => onSelect(null)}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2.5 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
        >
          <Plus className="w-4 h-4" />
          New chat
        </button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-3 pb-4" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {threads.length > 0 && (
          <div className="mb-2 px-2 mt-2">
            <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
              Recent
            </span>
          </div>
        )}
        <ul className="space-y-0.5">
          {recent.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              isActive={activeId === conv.id}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </ul>

        {older.length > 0 && (
          <>
            <button
              onClick={() => setOlderExpanded(!olderExpanded)}
              className="flex items-center gap-1.5 mb-2 px-2 mt-4 w-full text-left group"
            >
              {olderExpanded ? (
                <ChevronDown className="w-3 h-3 text-stone-400" />
              ) : (
                <ChevronRight className="w-3 h-3 text-stone-400" />
              )}
              <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider group-hover:text-stone-600 transition-colors">
                Older ({older.length})
              </span>
            </button>
            {olderExpanded && (
              <ul className="space-y-0.5">
                {older.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={activeId === conv.id}
                    onSelect={onSelect}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete
}: {
  conv: any;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li>
      <div
        onClick={() => onSelect(conv.id)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer",
          isActive
            ? "bg-emerald-50 text-emerald-800 font-medium"
            : "text-stone-500 hover:bg-stone-50 hover:text-stone-700"
        )}
      >
        <span className="text-[13px] truncate">
          {conv.title || "New Conversation"}
        </span>
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
            className="p-1 hover:text-red-500 text-stone-400 transition-colors flex-shrink-0 ml-2 rounded"
            aria-label="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
    </li>
  );
}
