import { useCallback, useState } from 'react';
import { useConversation } from '@elevenlabs/react';
import { Loader2, Mic, Phone, X } from 'lucide-react';

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || '';

export default function VoiceChat({ getAuthToken }) {
    const [isOpen, setIsOpen] = useState(false);
    const conversation = useConversation({
        onConnect: () => console.log('Connected'),
        onDisconnect: () => {
            setIsOpen(false);
        },
        onError: (error) => console.error('Voice error:', error),
    });

    const { status, isSpeaking } = conversation;

    const toggleCall = useCallback(async () => {
        if (status === 'connected') {
            await conversation.endSession();
            setIsOpen(false);
            return;
        }

        if (!AGENT_ID) {
            alert('Please set VITE_ELEVENLABS_AGENT_ID in frontend environment.');
            return;
        }

        try {
            const authToken = await getAuthToken();
            await navigator.mediaDevices.getUserMedia({ audio: true });
            await conversation.startSession({
                agentId: AGENT_ID,
                customLlmExtraBody: { auth_token: authToken },
            });
            setIsOpen(true);
        } catch (err) {
            console.error('Failed to start voice session:', err);
            alert('Could not start voice session. Please retry.');
        }
    }, [conversation, getAuthToken, status]);

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 font-sans">
            {isOpen && (
                <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 shadow-2xl w-80 backdrop-blur-xl bg-opacity-95 text-white animate-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                    status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'
                                }`}
                            />
                            <span className="text-sm font-semibold tracking-wide">
                                {status === 'connected'
                                    ? isSpeaking
                                        ? 'PharmAI speaking...'
                                        : 'Listening...'
                                    : 'Connecting...'}
                            </span>
                        </div>
                        <button
                            onClick={toggleCall}
                            className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="h-32 bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4 relative overflow-hidden border border-white/5">
                        {status === 'connected' ? (
                            <div className="relative flex items-center justify-center h-full w-full">
                                <div
                                    className={`absolute w-16 h-16 rounded-full bg-primary-500/20 blur-xl transition-all duration-300 ${
                                        isSpeaking ? 'scale-150 opacity-100' : 'scale-75 opacity-0'
                                    }`}
                                />
                                <div
                                    className={`w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center border border-white/10 z-10 transition-transform duration-300 ${
                                        isSpeaking ? 'scale-110 border-primary-500/50' : ''
                                    }`}
                                >
                                    <Mic
                                        size={28}
                                        className={`transition-colors duration-300 ${
                                            isSpeaking ? 'text-primary-400' : 'text-slate-400'
                                        }`}
                                    />
                                </div>
                            </div>
                        ) : (
                            <Loader2 size={32} className="text-primary-400 animate-spin" />
                        )}
                    </div>
                </div>
            )}

            {!isOpen && (
                <button
                    onClick={toggleCall}
                    className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-lg hover:shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all duration-300"
                    title="Start Voice Chat"
                >
                    <span className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-0 group-hover:opacity-100 duration-1000" />
                    <Phone size={24} className="group-hover:rotate-12 transition-transform duration-300" />
                </button>
            )}
        </div>
    );
}

