import { Plus, MessageSquare, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const threads = [
  {
    id: 1,
    title: "Python setup questions",
    preview: "Can you elaborate on the GPT model versions?",
    time: "2 hours ago",
  },
  {
    id: 2,
    title: "Implementation details",
    preview: "What's the best way to handle errors?",
    time: "1 hour ago",
  },
  {
    id: 3,
    title: "Testing the chatbot",
    preview: "How do I test the chatbot locally?",
    time: "30 minutes ago",
  },
];

interface ThreadsPanelProps {
  onThreadSelect?: (id: number) => void;
}

export default function ThreadsPanel({ onThreadSelect }: ThreadsPanelProps) {
  return (
    <div className="border-t border-gray-200 bg-white px-8 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-900">Threads</h3>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {threads.length}
            </span>
          </div>
          <button className="flex items-center gap-1.5 text-sm text-indigo-500 hover:text-indigo-700 transition-colors font-medium">
            <Plus className="w-4 h-4" />
            New thread
          </button>
        </div>

        <div className="space-y-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => onThreadSelect?.(thread.id)}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
            >
              <div className="mt-1">
                <div className="w-2 h-2 bg-indigo-500 rounded-full" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">
                  {thread.title}
                </p>
                <p className="text-sm text-gray-600 truncate mt-0.5">
                  {thread.preview}
                </p>
              </div>
              <div className="flex items-center gap-1 text-gray-400 flex-shrink-0 text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>{thread.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
