/* ChatWindow - Main conversation UI with account-scoped threads */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Mic, MicOff, Paperclip, Plus, Send, Sparkles, Trash2, User, Volume2, Pill, Activity, Receipt, ShieldQuestion, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import useVoiceRecorder from '../../hooks/useVoiceRecorder';
import {
    createChatThread,
    deleteChatThread,
    getLlmStatus,
    getThreadMessages,
    getVoiceToken,
    listChatThreads,
    sendMessage,
    speakUrl,
    uploadPrescriptionToChat,
    uploadVoice,
    verifyPayment,
} from '../../services/api';
import OrderSummaryCard from './OrderSummaryCard';
import PaymentCard from './PaymentCard';
import PipelineViewer from './PipelineViewer';
import VoiceChat from './VoiceChat';
import PrescriptionStatus from './PrescriptionStatus';

const LLM_ERROR_CODES = new Set([
    'openai_auth_failed',
    'openai_rate_limited',
    'openai_timeout',
    'openai_connection_error',
    'openai_api_error',
    'openai_error',
    'llm_unavailable',
    'openai_key_missing',
]);

function ensureClientSessionId() {
    const key = 'pharm_client_session_id';
    let sessionId = sessionStorage.getItem(key);
    if (!sessionId) {
        sessionId = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 64);
        sessionStorage.setItem(key, sessionId);
    }
    return sessionId;
}

function toUiMessages(apiMessages) {
    if (!apiMessages?.length) {
        return [];
    }
    return apiMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'bot' : 'user',
        content: msg.content,
    }));
}

export default function ChatWindow() {
    const [threads, setThreads] = useState([]);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingThreads, setLoadingThreads] = useState(true);
    const [creatingThread, setCreatingThread] = useState(false);
    const [composerNotice, setComposerNotice] = useState('');
    const [modelStatus, setModelStatus] = useState(null);
    const [modelIssue, setModelIssue] = useState(null);
    const [refreshingModelStatus, setRefreshingModelStatus] = useState(false);
    const bottomRef = useRef(null);
    const fileInputRef = useRef(null);
    const createThreadPromiseRef = useRef(null);
    const { isRecording, audioBlob, startRecording, stopRecording, clearAudio } = useVoiceRecorder();

    useEffect(() => {
        // Smooth scroll to bottom
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, [messages]);

    useEffect(() => {
        ensureClientSessionId();
    }, []);

    const refreshThreads = useCallback(async () => {
        const data = await listChatThreads();
        setThreads(data || []);
        return data || [];
    }, []);

    const loadThread = useCallback(async (conversationId) => {
        const data = await getThreadMessages(conversationId);
        setActiveConversationId(conversationId);
        setMessages(toUiMessages(data.messages));
        setComposerNotice('');
    }, []);

    const refreshModelStatus = useCallback(async (forceRefresh = false) => {
        setRefreshingModelStatus(true);
        try {
            const status = await getLlmStatus(forceRefresh);
            setModelStatus(status);
            if (status?.auth_ok) {
                setModelIssue(null);
            } else if (status?.status === 'error') {
                setModelIssue((prev) => prev || {
                    code: status.last_error_code || 'llm_unavailable',
                    message: `Model configuration/auth issue (${status.last_error_code || 'unknown'}).`,
                });
            }
            return status;
        } catch (err) {
            console.error('LLM status check failed:', err);
            return null;
        } finally {
            setRefreshingModelStatus(false);
        }
    }, []);

    const createAndSelectThread = useCallback(async () => {
        if (createThreadPromiseRef.current) {
            return createThreadPromiseRef.current;
        }
        setCreatingThread(true);
        setComposerNotice('');

        const createPromise = (async () => {
            const newThread = await createChatThread('New conversation');
            const latest = await refreshThreads();
            if (!latest.some((thread) => thread.conversation_id === newThread.conversation_id)) {
                setThreads((prev) => [newThread, ...prev]);
            }
            setActiveConversationId(newThread.conversation_id);
            setMessages([]);
            return newThread.conversation_id;
        })();

        createThreadPromiseRef.current = createPromise;
        try {
            return await createPromise;
        } finally {
            createThreadPromiseRef.current = null;
            setCreatingThread(false);
        }
    }, [refreshThreads]);

    useEffect(() => {
        let active = true;
        async function bootstrapThreads() {
            setLoadingThreads(true);
            try {
                const data = await refreshThreads();
                if (!active) return;
                if (data.length > 0) {
                    await loadThread(data[0].conversation_id);
                } else {
                    setActiveConversationId(null);
                    setMessages([]);
                }
            } catch (err) {
                console.error('Thread bootstrap failed:', err);
                if (active) {
                    setComposerNotice('Unable to load your chat threads right now.');
                }
            } finally {
                if (active) setLoadingThreads(false);
            }
        }
        bootstrapThreads();
        return () => {
            active = false;
        };
    }, [loadThread, refreshThreads]);

    useEffect(() => {
        refreshModelStatus(false).catch(() => { });
    }, [refreshModelStatus]);

    const appendBotMessage = useCallback((res) => {
        setMessages((prev) => [
            ...prev,
            {
                role: 'bot',
                content: res.message,
                traceId: res.trace_id,
                confidence: res.confidence,
                action: res.action,
                payment: res.payment || null,
                quote: res.quote || null,
                actions: res.agent_actions || [],
                safetyWarning: res.safety_warning || null,
                pipelineSteps: res.pipeline_steps || [],
                prescription: res.prescription || null,
            },
        ]);
        if (res.conversation_id) {
            setActiveConversationId(res.conversation_id);
        }
        if (res.action === 'infra_error') {
            setModelIssue({
                code: res.error_code || 'llm_unavailable',
                message: res.message || 'Model configuration/auth issue.',
            });
        }
        refreshThreads().catch(() => { });
    }, [refreshThreads]);

    const handleVoice = useCallback(
        async (blob) => {
            if (!activeConversationId) {
                setComposerNotice('Click New Chat before sending messages.');
                return;
            }
            setLoading(true);
            setMessages((prev) => [...prev, { role: 'user', content: '(voice message)' }]);
            try {
                const transcript = await uploadVoice(blob);
                if (transcript.transcription) {
                    setMessages((prev) => {
                        const updated = [...prev];
                        updated[updated.length - 1].content = `"${transcript.transcription}"`;
                        return updated;
                    });
                    const res = await sendMessage(transcript.transcription, activeConversationId);
                    appendBotMessage(res);
                }
            } catch (err) {
                console.error(err);
                if (LLM_ERROR_CODES.has(err?.code)) {
                    setModelIssue({
                        code: err.code,
                        message: err.message || 'Model configuration/auth issue.',
                    });
                    await refreshModelStatus(true);
                } else {
                    setMessages((prev) => [...prev, { role: 'bot', content: 'Could not process voice. Please try again.' }]);
                }
            } finally {
                setLoading(false);
            }
        },
        [activeConversationId, appendBotMessage, refreshModelStatus]
    );

    useEffect(() => {
        if (audioBlob && !isRecording) {
            handleVoice(audioBlob);
            clearAudio();
        }
    }, [audioBlob, clearAudio, handleVoice, isRecording]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;
        if (!activeConversationId) {
            setComposerNotice('Create your first chat using New Chat.');
            return;
        }
        if (modelStatus?.status === 'error' && modelStatus?.auth_ok === false) {
            setComposerNotice('Model configuration/auth issue. Fix backend key and retry status.');
            return;
        }

        const conversationId = activeConversationId;
        const text = input.trim();
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setComposerNotice('');
        setLoading(true);
        try {
            const res = await sendMessage(text, conversationId);
            appendBotMessage(res);
            if (modelStatus?.status === 'error' && res?.message) {
                setModelIssue(null);
            }
        } catch (err) {
            console.error(err);
            if (err?.code === 'conversation_required') {
                setComposerNotice('Select or create a chat first.');
            } else if (err?.code === 'conversation_not_found') {
                setComposerNotice('Selected chat was not found. Create a new chat.');
                setActiveConversationId(null);
                setMessages([]);
                await refreshThreads();
            } else if (LLM_ERROR_CODES.has(err?.code)) {
                setModelIssue({
                    code: err.code,
                    message: err.message || 'Model configuration/auth issue.',
                });
                await refreshModelStatus(true);
            } else {
                setMessages((prev) => [...prev, { role: 'bot', content: err?.message || 'Something went wrong. Please try again.' }]);
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePrescription = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setLoading(true);

        let targetConvId = activeConversationId;
        if (!targetConvId) {
            setComposerNotice('Creating new chat for prescription...');
            try {
                const thread = await createChatThread();
                targetConvId = thread.conversation_id;
                setComposerNotice('');
            } catch (err) {
                console.error(err);
                setComposerNotice('Failed to create chat. Please try again.');
                setLoading(false);
                event.target.value = '';
                return;
            }
        }

        // Show user message with image thumbnail
        const imageUrl = URL.createObjectURL(file);
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: `Uploaded prescription: ${file.name}`, prescriptionImage: imageUrl },
        ]);

        try {
            // Route through the chat pipeline so GPT responds naturally
            const res = await uploadPrescriptionToChat(file, targetConvId);
            appendBotMessage(res);
        } catch (err) {
            console.error(err);
            setMessages((prev) => [
                ...prev,
                { role: 'bot', content: err?.message || 'Could not process prescription. Please try again.' },
            ]);
        } finally {
            setLoading(false);
            event.target.value = '';
        }
    };

    const handlePaymentSuccess = async (paymentData) => {
        setMessages((prev) => [...prev, { role: 'bot', content: 'Verifying payment...' }]);
        setLoading(true);
        try {
            const res = await verifyPayment(paymentData);
            if (res.status === 'success' || res.status === 'already_confirmed') {
                setMessages((prev) => [
                    ...prev,
                    { role: 'bot', content: `Payment confirmed.\n\nOrder #${res.order_id.slice(0, 8)} has been placed successfully.` },
                ]);
            }
        } catch (err) {
            console.error(err);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'bot',
                    content:
                        `Payment verification failed. Please contact support with ` +
                        `Order ID: ${paymentData.razorpay_order_id}`,
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteThread = async (conversationId) => {
        try {
            await deleteChatThread(conversationId);
            const remaining = threads.filter((t) => t.conversation_id !== conversationId);
            setThreads(remaining);
            if (activeConversationId === conversationId) {
                if (remaining.length > 0) {
                    await loadThread(remaining[0].conversation_id);
                } else {
                    setActiveConversationId(null);
                    setMessages([]);
                    setComposerNotice('Conversation deleted. Click New Chat to start again.');
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const playTTS = (text) => {
        const audio = new Audio(speakUrl(text));
        audio.play().catch(() => { });
    };

    const fetchVoiceAuthToken = useCallback(async () => {
        const res = await getVoiceToken();
        return res.token;
    }, []);

    const modelBlocked = modelStatus?.status === 'error' && modelStatus?.auth_ok === false;
    const modelIssueMessage =
        modelIssue?.message ||
        (modelBlocked
            ? `Model configuration/auth issue (${modelStatus?.last_error_code || 'unknown'}).`
            : '');

    return (
        <div className="flex h-full w-full bg-transparent gap-4">

            {/* Minimalist Thread Sidebar */}
            <aside className="w-[300px] flex-shrink-0 flex flex-col h-full glass-panel overflow-hidden border border-white/5">
                <div className="p-4 border-b border-white/5">
                    <button
                        onClick={createAndSelectThread}
                        disabled={creatingThread}
                        className="btn-glow w-full flex items-center justify-center gap-2 py-3 rounded-2xl shadow-lg shadow-primary-500/20"
                    >
                        <Plus size={18} />
                        <span className="font-semibold tracking-wide">New Chat</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                    {loadingThreads ? (
                        <div className="flex items-center justify-center h-20">
                            <div className="w-5 h-5 border-2 border-primary-500/50 border-t-primary-500 rounded-full animate-spin" />
                        </div>
                    ) : (
                        <>
                            {threads.length === 0 && (
                                <div className="text-center p-6 bg-surface-800/30 rounded-2xl border border-dashed border-white/10 m-2">
                                    <MessageCircle className="mx-auto w-8 h-8 text-surface-500 mb-3" />
                                    <p className="text-sm font-medium text-surface-300">No chats yet</p>
                                    <p className="text-xs text-surface-500 mt-1">Start a new conversation</p>
                                </div>
                            )}
                            {threads.map((thread) => (
                                <div
                                    key={thread.conversation_id}
                                    className={`relative group rounded-2xl p-3 transition-all duration-300 ${activeConversationId === thread.conversation_id
                                        ? 'bg-primary-600/20 border border-primary-500/30 shadow-[0_0_20px_-5px_rgba(99,102,241,0.2)]'
                                        : 'bg-surface-800/30 border border-white/5 hover:bg-surface-800/50 hover:border-white/10'
                                        }`}
                                >
                                    <button
                                        onClick={() => loadThread(thread.conversation_id)}
                                        className="w-full text-left"
                                    >
                                        <p className="truncate text-sm font-semibold text-white/90">{thread.title || 'Conversation'}</p>
                                        <p className="mt-1 truncate text-xs text-surface-400">
                                            {thread.last_message || 'No messages yet'}
                                        </p>
                                    </button>

                                    <div className="mt-2.5 flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity">
                                        <span className="text-[10px] uppercase font-bold tracking-wider text-surface-500">
                                            {thread.updated_at ? new Date(thread.updated_at).toLocaleDateString() : ''}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteThread(thread.conversation_id)}
                                            className="text-surface-500 hover:text-danger-400 p-1 rounded-md hover:bg-danger-500/10 transition-colors"
                                            title="Delete thread"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </>
                    )}
                </div>
            </aside>

            {/* Main Chat Area */}
            <div className="flex flex-col h-full flex-1 relative">
                {/* Header */}
                <header className="h-16 flex items-center gap-3 px-6 glass-panel rounded-t-3xl rounded-b-none border-b border-white/5 z-10 shrink-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
                        <Sparkles size={20} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">PharmAI Assistant</h2>
                        <p className="text-[11px] font-medium text-surface-400 uppercase tracking-widest">Intelligent Pharmacy</p>
                    </div>
                </header>

                {modelBlocked && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-danger-500/10 border border-danger-500/30 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex items-center gap-4">
                        <div>
                            <p className="text-sm font-bold text-danger-200">System Issue</p>
                            <p className="text-xs text-danger-200/80 mt-1">{modelIssueMessage}</p>
                        </div>
                        <button
                            onClick={() => refreshModelStatus(true)}
                            className="bg-danger-500 hover:bg-danger-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors whitespace-nowrap"
                            disabled={refreshingModelStatus}
                        >
                            {refreshingModelStatus ? 'Checking...' : 'Retry'}
                        </button>
                    </div>
                )}

                {/* Messages Container */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 no-scrollbar scroll-smooth">
                    {/* Welcome Screen / Empty State */}
                    {!activeConversationId && messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center mt-[-40px]">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5 }}
                                className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mb-6 shadow-2xl shadow-primary-500/40"
                            >
                                <Sparkles size={40} className="text-white" />
                            </motion.div>
                            <motion.h1
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="text-4xl font-extrabold text-white tracking-tight mb-3"
                            >
                                How can I help you today?
                            </motion.h1>
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2 }}
                                className="text-surface-400 mb-12 max-w-md"
                            >
                                Upload a prescription, order medications, or ask about your active refill alerts.
                            </motion.p>

                            {/* Bento Grid Suggestions */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.3 }}
                                className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full"
                            >
                                <button onClick={() => { createAndSelectThread().then(() => setInput("I need to run a routine check for my active refills.")); }} className="group text-left p-5 rounded-3xl bg-surface-800/40 hover:bg-surface-800/80 border border-white/5 hover:border-primary-500/30 transition-all duration-300">
                                    <div className="w-10 h-10 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center mb-3 group-hover:bg-primary-500 group-hover:text-white transition-colors">
                                        <Activity size={20} />
                                    </div>
                                    <h3 className="text-sm font-bold text-white mb-1">Check current refills</h3>
                                    <p className="text-xs text-surface-400">See what medications are running low</p>
                                </button>
                                <button onClick={() => { createAndSelectThread().then(() => setInput("Order Dolo 650mg")); }} className="group text-left p-5 rounded-3xl bg-surface-800/40 hover:bg-surface-800/80 border border-white/5 hover:border-accent-500/30 transition-all duration-300">
                                    <div className="w-10 h-10 rounded-xl bg-accent-500/20 text-accent-400 flex items-center justify-center mb-3 group-hover:bg-accent-500 group-hover:text-white transition-colors">
                                        <Pill size={20} />
                                    </div>
                                    <h3 className="text-sm font-bold text-white mb-1">Quick order</h3>
                                    <p className="text-xs text-surface-400">Instantly order common medications</p>
                                </button>
                                <button onClick={() => { createAndSelectThread(); setTimeout(() => fileInputRef.current?.click(), 1000); }} className="group text-left p-5 rounded-3xl bg-surface-800/40 hover:bg-surface-800/80 border border-white/5 hover:border-warning-500/30 transition-all duration-300">
                                    <div className="w-10 h-10 rounded-xl bg-warning-500/20 text-warning-400 flex items-center justify-center mb-3 group-hover:bg-warning-500 group-hover:text-white transition-colors">
                                        <Receipt size={20} />
                                    </div>
                                    <h3 className="text-sm font-bold text-white mb-1">Upload Prescription</h3>
                                    <p className="text-xs text-surface-400">Let AI extract your needed medicines</p>
                                </button>
                                <button onClick={() => { createAndSelectThread().then(() => setInput("What are the side effects of Amlodipine?")); }} className="group text-left p-5 rounded-3xl bg-surface-800/40 hover:bg-surface-800/80 border border-white/5 hover:border-primary-500/30 transition-all duration-300">
                                    <div className="w-10 h-10 rounded-xl bg-primary-500/20 text-primary-400 flex items-center justify-center mb-3 group-hover:bg-primary-500 group-hover:text-white transition-colors">
                                        <ShieldQuestion size={20} />
                                    </div>
                                    <h3 className="text-sm font-bold text-white mb-1">Analyze interactions</h3>
                                    <p className="text-xs text-surface-400">Ask about side-effects and conflicts</p>
                                </button>
                            </motion.div>
                        </div>
                    )}

                    <AnimatePresence>
                        {messages.map((msg, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.4, type: "spring", stiffness: 200, damping: 20 }}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`flex items-end gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                    {/* Avatar */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-md ${msg.role === 'user'
                                        ? 'bg-gradient-to-br from-surface-700 to-surface-800 border border-white/10'
                                        : 'bg-gradient-to-br from-primary-500 to-primary-700 shadow-primary-500/30'
                                        }`}>
                                        {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
                                    </div>

                                    {/* Message Body */}
                                    <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} ${msg.role === 'bot' ? 'w-full' : ''}`}>
                                        <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'}>
                                            <p className="whitespace-pre-wrap text-[15px] leading-relaxed tracking-wide">
                                                {msg.role === 'user' && msg.content.startsWith("I uploaded a prescription")
                                                    ? "Prescription uploaded. (Analysis requested)"
                                                    : msg.content}
                                            </p>

                                            {msg.prescriptionImage && (
                                                <img
                                                    src={msg.prescriptionImage}
                                                    alt="Prescription"
                                                    className="mt-2 rounded-lg max-w-[200px] max-h-[200px] object-cover border border-white/10 cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={() => window.open(msg.prescriptionImage, '_blank')}
                                                />
                                            )}
                                        </div>

                                        {/* Bot Message Metadata & Components */}
                                        {msg.role === 'bot' && (
                                            <div className="flex flex-col gap-3 mt-3 ml-2">
                                                <div className="flex items-center gap-3">
                                                    {msg.confidence > 0 && (
                                                        <span className="px-2 py-1 rounded-md bg-surface-800/50 border border-white/5 text-[10px] font-bold text-primary-400 uppercase tracking-wider">
                                                            Confidence: {(msg.confidence * 100).toFixed(0)}%
                                                        </span>
                                                    )}
                                                    {msg.traceId && (
                                                        <span className="text-[10px] text-surface-500 font-mono">
                                                            trace:{msg.traceId.slice(0, 8)}
                                                        </span>
                                                    )}
                                                    <button
                                                        onClick={() => playTTS(msg.content)}
                                                        className="w-6 h-6 rounded-full flex items-center justify-center bg-surface-800/50 hover:bg-primary-500/20 text-surface-400 hover:text-primary-400 transition-colors border border-white/5"
                                                    >
                                                        <Volume2 size={12} />
                                                    </button>
                                                </div>

                                                {msg.pipelineSteps && msg.pipelineSteps.length > 0 && (
                                                    <PipelineViewer steps={msg.pipelineSteps} traceId={msg.traceId} />
                                                )}

                                                {msg.quote && msg.quote.quantity_status === 'resolved' && msg.action !== 'ask_quantity' && (
                                                    <OrderSummaryCard quote={msg.quote} />
                                                )}

                                                {msg.action === 'request_payment' && msg.payment && (
                                                    <PaymentCard
                                                        orderData={msg.payment}
                                                        onPaymentSuccess={handlePaymentSuccess}
                                                        safetyWarning={msg.safetyWarning}
                                                    />
                                                )}

                                                {msg.prescription && (
                                                    <PrescriptionStatus
                                                        prescription={msg.prescription}
                                                        onAction={(text) => {
                                                            setInput(text);
                                                            setTimeout(handleSend, 0);
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {loading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex justify-start"
                        >
                            <div className="flex items-end gap-3 max-w-[85%]">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
                                    <Bot size={14} className="text-white" />
                                </div>
                                <div className="chat-bubble-bot flex items-center gap-3 py-4">
                                    <div className="flex gap-1.5">
                                        <motion.span animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="w-2 h-2 bg-primary-400 rounded-full" />
                                        <motion.span animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className="w-2 h-2 bg-primary-400 rounded-full" />
                                        <motion.span animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className="w-2 h-2 bg-primary-400 rounded-full" />
                                    </div>
                                    <span className="text-xs font-medium text-surface-300 tracking-wide">AI is thinking...</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                    <div ref={bottomRef} className="h-4" />
                </div>

                {/* Floating Chat Input Dock */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-20">
                    <div className="chat-dock flex items-center p-2 gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-10 h-10 rounded-full flex items-center justify-center text-surface-300 hover:text-white hover:bg-surface-700/50 transition-all focus:outline-none"
                            title="Upload prescription"
                        >
                            <Paperclip size={20} />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePrescription}
                            className="hidden"
                        />

                        <button
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all focus:outline-none ${isRecording
                                ? 'bg-danger-500 text-white shadow-lg shadow-danger-500/40 recording-indicator'
                                : 'text-surface-300 hover:text-white hover:bg-surface-700/50'
                                }`}
                            title={isRecording ? 'Stop recording' : 'Start recording'}
                        >
                            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>

                        <input
                            type="text"
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && handleSend()}
                            placeholder={
                                !activeConversationId
                                    ? 'Select or create a chat to begin...'
                                    : modelBlocked
                                        ? 'Model unavailable until auth/config is fixed...'
                                        : "Message PharmAI..."
                            }
                            className="flex-1 bg-transparent text-[15px] font-medium text-white placeholder:text-surface-400 outline-none px-2 min-w-0"
                            disabled={loading || !activeConversationId || modelBlocked}
                        />

                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || loading || !activeConversationId || modelBlocked}
                            className="w-10 h-10 rounded-full flex items-center justify-center bg-white text-surface-900 disabled:opacity-50 disabled:bg-surface-700 disabled:text-surface-400 hover:scale-105 transition-all focus:outline-none shadow-md"
                        >
                            <Send size={18} className="translate-x-[1px]" />
                        </button>
                    </div>
                    {composerNotice && (
                        <p className="absolute -top-8 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 flex items-center justify-center rounded-lg bg-surface-800 border border-white/10 text-amber-400 capitalize whitespace-nowrap shadow-xl">
                            {composerNotice}
                        </p>
                    )}
                </div>

                <div className="absolute right-6 bottom-6 z-30">
                    <VoiceChat getAuthToken={fetchVoiceAuthToken} />
                </div>
            </div>
        </div>
    );
}
