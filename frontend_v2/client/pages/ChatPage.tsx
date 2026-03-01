import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import ChatArea from "@/components/chat/ChatArea";
import ChatSidebar from "@/components/chat/ChatSidebar";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import {
  listChatThreads,
  createChatThread,
  getThreadMessages,
  sendMessage,
  deleteChatThread,
  uploadPrescriptionToChat,
} from "@/services/api";
import type { Message } from "@/types/chat";

/* Global Razorpay type */
declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function ChatPage() {
  const { theme } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  const [threads, setThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Initial thread load
  useEffect(() => {
    loadThreads();
  }, []);

  // Fetch messages when switching threads
  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId]);

  // Handle URL-driven messages (e.g. from RefillAlertsWidget)
  useEffect(() => {
    const initialMsg = searchParams.get("msg");
    if (initialMsg && !isLoading) {
      handleSendMessage(initialMsg);
      setSearchParams({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadThreads = async () => {
    try {
      const data = await listChatThreads();
      const mapped = (data || []).map((t: any) => ({
        id: t.conversation_id,
        title: t.title || "New Conversation",
        last_message: t.last_message || "",
        updated_at: t.updated_at,
      }));
      setThreads(mapped);
    } catch (err) {
      console.error("Failed to load threads", err);
    }
  };

  const loadMessages = async (threadId: string) => {
    setIsLoading(true);
    try {
      const data = await getThreadMessages(threadId);
      // historical messages: isNew = false (no streaming), no rich data
      const msgs: Message[] = (data?.messages || []).map((msg: any) => ({
        id: msg.message_id,
        role: msg.role,
        content: msg.content,
        isNew: false,
        prescription: msg.prescription,
      }));
      setMessages(msgs);
    } catch (err) {
      console.error("Failed to load messages", err);
    } finally {
      setIsLoading(false);
    }
  };

  /** Handle payment success from PaymentCard */
  const handlePaymentSuccess = useCallback((result: any) => {
    // Append delivery tracker message
    setMessages((prev) => [
      ...prev,
      {
        id: `delivery-${Date.now()}`,
        role: "assistant" as const,
        content: "",
        isNew: true,
        action: "delivery_confirmed",
        orderId: result.order_id || result.orderId || "",
      },
    ]);
  }, []);

  /** Ensure a thread exists — creates one if activeThreadId is null.
   *  Used by voice mode so it has a thread_id before starting session. */
  const ensureThread = useCallback(async (): Promise<string> => {
    if (activeThreadId) return activeThreadId;
    const newThread = await createChatThread("Voice Conversation");
    const id = newThread.conversation_id;
    setActiveThreadId(id);
    await loadThreads();
    return id;
  }, [activeThreadId]);

  /** Handle voice messages from ElevenLabs agent */
  const handleVoiceMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.length === 0) return [msg];
      const lastMsg = prev[prev.length - 1];

      // If both the current and the new message are from the assistant, merge them
      // ONLY if they belong to the same turn (or turnSeq is absent — backward compat).
      // This prevents two distinct responses (e.g., payment confirmation + follow-up)
      // arriving quickly from being incorrectly merged into one bubble.
      if (lastMsg.role === "assistant" && msg.role === "assistant") {
        const sameTurn =
          msg.turnSeq == null ||
          lastMsg.turnSeq == null ||
          msg.turnSeq === lastMsg.turnSeq;

        if (sameTurn) {
          const merged: Message = {
            ...lastMsg,
            // Append the new text chunk
            content: `${lastMsg.content} ${msg.content}`.trim(),
            // Preserve any rich data that arrived via polling while text was streaming,
            // or take the incoming msg's rich data if it has it.
            action: msg.action ?? lastMsg.action,
            quote: msg.quote ?? lastMsg.quote,
            payment: msg.payment ?? lastMsg.payment,
            prescription: msg.prescription ?? lastMsg.prescription,
            recommendations: msg.recommendations ?? lastMsg.recommendations,
            uiPayload: msg.uiPayload ?? lastMsg.uiPayload,
            turnSeq: msg.turnSeq ?? lastMsg.turnSeq,
          };
          return [...prev.slice(0, -1), merged];
        }
      }

      return [...prev, msg];
    });

    // Refresh threads after assistant messages to update sidebar preview
    if (msg.role === "assistant") {
      loadThreads();
    }
  }, []);

  /** Handle rich data arriving from background poller (quote/payment/recommendations) */
  const handleVoiceRichUpdate = useCallback((richData: Partial<Message>) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;

      const lastMsg = prev[prev.length - 1];

      // CRITICAL FIX: If backend Redis polling is faster than ElevenLabs audio stream,
      // create a "Ghost Bubble" so the Card payload doesn't erroneously attach 
      // to the PREVIOUS message natively. ElevenLabs text will seamlessly merge into this!
      if (lastMsg && lastMsg.role === "user") {
        const recommendMode = richData.action === "recommend";
        return [
          ...prev,
          {
            id: `ai-ghost-${Date.now()}`,
            role: "assistant",
            content: "",
            isNew: true,
            action: richData.action,
            quote: recommendMode ? undefined : richData.quote,
            payment: recommendMode ? undefined : richData.payment,
            recommendations: richData.recommendations,
            prescription: richData.prescription,
            uiPayload: richData.uiPayload,
            turnSeq: richData.turnSeq,
          }
        ];
      }

      // Find the absolute LAST assistant message and securely latch the rich data to it.
      // This ensures even if ElevenLabs is streaming/chunking, the UI card data survives.
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === "assistant") {
          const shouldClearCards =
            richData.uiPayload?.type === "none" ||
            (richData.action === "chat" &&
              !richData.quote &&
              !richData.payment &&
              (!richData.recommendations || richData.recommendations.length === 0));

          const updated: Message = {
            ...prev[i],
            action: richData.action ?? prev[i].action,
            quote: shouldClearCards
              ? undefined
              : (richData.action === "recommend"
                ? undefined
                : (richData.quote ?? prev[i].quote)),
            payment: shouldClearCards
              ? undefined
              : (richData.action === "recommend"
                ? undefined
                : (richData.payment ?? prev[i].payment)),
            recommendations: shouldClearCards
              ? undefined
              : (richData.recommendations ?? prev[i].recommendations),
            prescription: richData.prescription ?? prev[i].prescription,
            uiPayload: shouldClearCards ? undefined : (richData.uiPayload ?? prev[i].uiPayload),
            turnSeq: richData.turnSeq ?? prev[i].turnSeq,
          };
          return [...prev.slice(0, i), updated, ...prev.slice(i + 1)];
        }
      }
      return prev;
    });
  }, []);

  /** Handle payment cancel from PaymentCard */
  const handlePaymentCancel = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      {
        id: `pay-cancel-${Date.now()}`,
        role: "assistant" as const,
        content: 'Payment was cancelled. You can try again by saying **"pay now"** or start a new order.',
        isNew: true,
      },
    ]);
  }, []);

  const handleSendMessage = async (text: string) => {
    setIsLoading(true);
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: "user" as const, content: text, isNew: true },
    ]);

    try {
      let targetThreadId = activeThreadId;

      // Create thread if needed
      if (!targetThreadId) {
        const newThread = await createChatThread(
          text.length > 30 ? text.substring(0, 30) + "..." : text
        );
        targetThreadId = newThread.conversation_id;
      }

      // Send message — backend returns { message, conversation_id, action, payment, quote, ... }
      const response = await sendMessage(text, targetThreadId);

      const aiContent = response?.message || "";

      // Build rich message with all backend data attached
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: aiContent,
        isNew: true,
        action: response?.action,
        quote: response?.quote,
        payment: response?.payment,
        prescription: response?.prescription,
        recommendations: response?.recommendations,
        uiPayload: response?.ui_payload,
      };

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { id: `user-${Date.now()}`, role: "user", content: text, isNew: false },
        aiMessage,
      ]);

      // Refresh threads
      await loadThreads();

      if (activeThreadId !== targetThreadId) {
        setActiveThreadId(targetThreadId);
      }
    } catch (err) {
      console.error("Failed to send message", err);
      // Keep the user's message visible and show an error response
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { id: `user-${Date.now()}`, role: "user" as const, content: text, isNew: false },
        {
          id: `error-${Date.now()}`,
          role: "assistant" as const,
          content: "Sorry, I'm having trouble processing your request right now. Please try again in a moment.",
          isNew: true,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  /** Handle prescription upload from chat input */
  const uploadingRef = useRef(false);
  const handlePrescriptionUpload = async (file: File) => {
    // Prevent duplicate uploads
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setIsLoading(true);

    const userMsgId = `user-rx-${Date.now()}`;

    // Single clean user message — no raw filename, no processing placeholder
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user" as const, content: "📋 Prescription uploaded", isNew: true },
    ]);

    try {
      let targetThreadId = activeThreadId;
      if (!targetThreadId) {
        const newThread = await createChatThread("Prescription Upload");
        targetThreadId = newThread.conversation_id;
      }

      const response = await uploadPrescriptionToChat(file, targetThreadId);

      // Single AI response — no duplicate "checking" message
      const aiMessage: Message = {
        id: `rx-result-${Date.now()}`,
        role: "assistant",
        content: response?.message || "Prescription processed.",
        isNew: true,
        prescription: response?.prescription,
        quote: response?.quote,
        action: response?.action,
        payment: response?.payment,
        recommendations: response?.recommendations,
        uiPayload: response?.ui_payload,
      };

      setMessages((prev) => [...prev, aiMessage]);

      await loadThreads();
      if (activeThreadId !== targetThreadId) {
        setActiveThreadId(targetThreadId);
      }
    } catch (err: any) {
      console.error("Failed to upload prescription", err);
      // Only show error if it's not a duplicate-upload rejection
      const isUploadLock = err?.response?.status === 429;
      if (!isUploadLock) {
        setMessages((prev) => [
          ...prev,
          {
            id: `rx-error-${Date.now()}`,
            role: "assistant" as const,
            content: "Failed to process prescription. Please try again.",
            isNew: true,
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      uploadingRef.current = false;
    }
  };

  const handleDeleteThread = async (id: string) => {
    try {
      await deleteChatThread(id);
      if (activeThreadId === id) {
        setActiveThreadId(null);
        setMessages([]);
      }
      await loadThreads();
    } catch (err) {
      console.error("Failed to delete thread", err);
    }
  };

  return (
    <>
      <style>{`
        @keyframes chat-mic-pulse {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.3); }
          70% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
      `}</style>

      <div
        className={cn(
          "min-h-screen w-full flex font-sans overflow-hidden relative",
          theme === "dark" ? "bg-[#050505]" : "bg-stone-100"
        )}
      >
        {/* Single subtle green glow centered behind chat only */}
        {theme !== "dark" && (
          <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
            <div
              className="w-[600px] h-[500px] rounded-full blur-[200px]"
              style={{ background: "rgba(16,185,129,0.07)" }}
            />
          </div>
        )}

        <Sidebar />

        <div className="flex-1 flex h-screen overflow-hidden relative z-10">
          {/* Chat sidebar — collapsed by default */}
          <div
            className={cn(
              "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
              sidebarOpen ? "w-64" : "w-0"
            )}
          >
            <ChatSidebar
              activeId={activeThreadId}
              onSelect={setActiveThreadId}
              onDelete={handleDeleteThread}
              threads={threads}
              onToggle={() => setSidebarOpen(false)}
            />
          </div>

          <div className="flex-1 flex flex-col h-full relative">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className={cn(
                  "absolute top-4 left-4 z-20 p-2 rounded-xl transition-all",
                  theme === "dark"
                    ? "text-slate-400 hover:text-white hover:bg-white/10"
                    : "text-slate-400 hover:text-slate-700 hover:bg-black/5"
                )}
                title="Open chat history"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /></svg>
              </button>
            )}
            <ChatArea
              messages={messages}
              isLoading={isLoading}
              onSendMessage={handleSendMessage}
              onPrescriptionUpload={handlePrescriptionUpload}
              onPaymentSuccess={handlePaymentSuccess}
              onPaymentCancel={handlePaymentCancel}
              activeThreadId={activeThreadId}
              onVoiceMessage={handleVoiceMessage}
              onVoiceRichUpdate={handleVoiceRichUpdate}
              ensureThread={ensureThread}
            />
          </div>
        </div>
      </div>
    </>
  );
}
