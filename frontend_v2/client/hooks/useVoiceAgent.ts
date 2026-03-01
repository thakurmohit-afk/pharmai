/**
 * useVoiceAgent — wraps @elevenlabs/react's useConversation to manage
 * the full voice session lifecycle: token acquisition, mic permission,
 * ElevenLabs connection, rich-state polling via Redis side-channel,
 * live captions, audio level metering, and error recovery.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { getVoiceToken, getVoiceLastAction, notifyVoiceSessionEnd } from "@/services/api";
import type { Message } from "@/types/chat";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID as string;
const MAX_STALE_AGE_S = 30;
const POLL_INTERVAL_MS = 200;
const POLL_ATTEMPTS = 40;
const INPUT_METER_INTERVAL_MS = 80;

const envConnectionType = String(import.meta.env.VITE_ELEVENLABS_CONNECTION_TYPE || "").toLowerCase();
const CONNECTION_TYPE: "websocket" | "webrtc" = envConnectionType === "websocket" ? "websocket" : "webrtc";

const envServerLocation = String(import.meta.env.VITE_ELEVENLABS_SERVER_LOCATION || "").toLowerCase();
const SERVER_LOCATION: "us" | "global" | "eu-residency" | "in-residency" =
  envServerLocation === "us"
    ? "us"
    : envServerLocation === "eu-residency"
      ? "eu-residency"
      : envServerLocation === "in-residency"
        ? "in-residency"
        : "global";

const HIGH_QUALITY_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000, min: 16000 },
  sampleSize: { ideal: 16 },
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

function buildRichUpdateFromSideChannel(data: any): Partial<Message> {
  const uiPayload = (data?.ui_payload && typeof data.ui_payload === "object")
    ? data.ui_payload
    : { type: "none", data: {} };

  const update: Partial<Message> = {
    action: data?.action,
    quote: data?.quote ?? undefined,
    payment: data?.payment ?? undefined,
    recommendations: data?.recommendations ?? undefined,
    uiPayload,
    turnSeq: typeof data?.turn_seq === "number" ? data.turn_seq : undefined,
  };

  if (uiPayload.type === "recommendations") {
    update.action = "recommend";
    update.recommendations = uiPayload?.data?.items ?? update.recommendations;
    update.quote = undefined;
    update.payment = undefined;
  } else if (uiPayload.type === "order_summary") {
    update.quote = uiPayload?.data?.quote ?? update.quote;
    update.payment = undefined;
  } else if (uiPayload.type === "payment") {
    update.action = "request_payment";
    update.payment = uiPayload?.data?.payment ?? update.payment;
  } else if (uiPayload.type === "delivery_status") {
    update.action = "delivery_confirmed";
    update.orderId = uiPayload?.data?.order_id || undefined;
  }

  return update;
}

type MicQualityProbe = {
  inputDeviceId?: string;
  settings?: MediaTrackSettings;
};

interface UseVoiceAgentOptions {
  threadId: string | null;
  userName?: string;
  onMessage: (msg: Message) => void;
  /** Called when rich data (quote/payment/recs) arrives after initial message dispatch */
  onRichUpdate?: (richData: Partial<Message>) => void;
}

export interface VoiceCaption {
  text: string;
  source: "user" | "ai";
}

export default function useVoiceAgent({ threadId, userName, onMessage, onRichUpdate }: UseVoiceAgentOptions) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<VoiceCaption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isVoicePaused, setIsVoicePaused] = useState(false);

  const msgCounter = useRef(0);
  const captionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const meterIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const pollAbortRef = useRef(false);
  const lastPollTs = useRef(0);
  const lastProcessedTurnSeq = useRef(0);
  const preferredInputDeviceIdRef = useRef<string | undefined>(undefined);
  const micSettingsRef = useRef<MediaTrackSettings | undefined>(undefined);

  async function probeMicrophoneQuality(): Promise<MicQualityProbe> {
    if (!navigator?.mediaDevices?.getUserMedia) return {};
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: HIGH_QUALITY_AUDIO_CONSTRAINTS });
    } catch {
      // Fallback for browsers that reject strict constraints.
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    try {
      const track = stream.getAudioTracks()[0];
      if (!track) return {};

      try {
        await track.applyConstraints(HIGH_QUALITY_AUDIO_CONSTRAINTS);
      } catch {
        // Non-fatal; keep browser defaults.
      }

      const settings = track.getSettings();
      const inputDeviceId = settings.deviceId || undefined;
      return { inputDeviceId, settings };
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  // ── Background poller — polls Redis side-channel and calls onRichUpdate ──
  function startBackgroundPoll() {
    pollAbortRef.current = false;
    const pollTs = Date.now();
    lastPollTs.current = pollTs;
    const expectedConversationId = threadId || "new";

    const poll = async () => {
      // Poll up to ~8 seconds; faster cadence makes voice cards feel immediate.
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
        if (pollAbortRef.current || lastPollTs.current !== pollTs) return;
        try {
          const data = await getVoiceLastAction();
          if (data && data.action && data.action !== "none") {
            const now = Date.now() / 1000;
            const turnSeq = typeof data.turn_seq === "number" ? data.turn_seq : 0;
            const conversationId = String(data.conversation_id || "").trim();
            if (
              expectedConversationId &&
              expectedConversationId !== "new" &&
              conversationId &&
              conversationId !== expectedConversationId
            ) {
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
              continue;
            }
            // Reject data older than 30 seconds
            if (data.ts && now - data.ts > MAX_STALE_AGE_S) {
              // Too old, keep polling
            } else if (turnSeq > 0 && turnSeq <= lastProcessedTurnSeq.current) {
              // Already processed this turn's data, keep polling
            } else {
              // Got fresh data from THIS turn — dispatch rich update
              if (turnSeq > 0) lastProcessedTurnSeq.current = turnSeq;

              // Voice pause during payment — mute TTS so it doesn't talk over payment UI
              if (data.voice_pause) {
                setIsVoicePaused(true);
                try { conversation.setVolume({ volume: 0 }); } catch { }
              } else if (isVoicePaused) {
                setIsVoicePaused(false);
                try { conversation.setVolume({ volume: 1 }); } catch { }
              }

              const update: Partial<Message> = buildRichUpdateFromSideChannel(data);
              onRichUpdate?.(update);
              return;
            }
          }
        } catch {
          // Non-critical
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    };
    poll();
  }

  // ── Audio level metering ───────────────────────────────────────────────
  function startAudioMeter() {
    stopAudioMeter();
    meterIntervalRef.current = setInterval(() => {
      try {
        const inputVolume = conversation.getInputVolume();
        if (typeof inputVolume !== "number" || Number.isNaN(inputVolume)) return;
        const clamped = Math.max(0, Math.min(1, inputVolume));
        setAudioLevel(clamped);
      } catch {
        // Non-critical
      }
    }, INPUT_METER_INTERVAL_MS);
  }

  function stopAudioMeter() {
    if (meterIntervalRef.current) clearInterval(meterIntervalRef.current);
    meterIntervalRef.current = undefined;
    setAudioLevel(0);
  }

  const conversation = useConversation({
    serverLocation: SERVER_LOCATION,
    connectionDelay: {
      default: 0,
      ios: 0,
      android: 350,
    },
    onConnect: () => {
      setIsConnecting(false);
      setError(null);
      startAudioMeter();
    },
    onDisconnect: () => {
      setIsConnecting(false);
      setIsVoicePaused(false);
      pollAbortRef.current = true;
      stopAudioMeter();
      notifyVoiceSessionEnd();
    },
    onError: (err: any) => {
      console.error("ElevenLabs voice error:", err);
      setIsConnecting(false);
      const msg = typeof err === "string" ? err : err?.message || "Voice connection failed";
      setError(msg);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setError(null), 5000);
    },
    onMessage: ({ message, source }: { message: string; source: string }) => {
      const id = `voice-${source}-${Date.now()}-${++msgCounter.current}`;

      // Update caption immediately
      setCurrentCaption({ text: message, source: source as "user" | "ai" });
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
      captionTimeoutRef.current = setTimeout(() => setCurrentCaption(null), 4000);

      if (source === "user") {
        // Abort any running poll and reset for new turn
        pollAbortRef.current = true;

        onMessage({
          id,
          role: "user",
          content: message,
          isNew: true,
        });

        // Start background poll immediately — the backend will write rich
        // state to Redis after the pipeline completes (before streaming).
        // Polling here catches it as soon as available.
        startBackgroundPoll();
      } else if (source === "ai") {
        // Dispatch message immediately with text only — no blocking poll.
        // Rich data (quote/payment) arrives via background poller → onRichUpdate.
        onMessage({
          id,
          role: "assistant",
          content: message,
          isNew: true,
        });
      }
    },
  });

  const startSession = useCallback(async (explicitThreadId?: string) => {
    if (!AGENT_ID) {
      console.error("VITE_ELEVENLABS_AGENT_ID is not set");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const probe = await probeMicrophoneQuality();
      preferredInputDeviceIdRef.current = probe.inputDeviceId;
      micSettingsRef.current = probe.settings;
      if (probe.settings) {
        const sr = probe.settings.sampleRate || 0;
        if (sr > 0 && sr < 16000) {
          console.warn("Low microphone sample rate detected:", sr, probe.settings);
        }
      }

      const { token } = await getVoiceToken();
      const dynamicVariables = {
        auth_token: token,
        thread_id: explicitThreadId || threadId || "new",
        user_name: userName || "",
      };

      try {
        await conversation.startSession({
          agentId: AGENT_ID,
          connectionType: CONNECTION_TYPE,
          dynamicVariables,
          inputDeviceId: preferredInputDeviceIdRef.current,
        } as any);
      } catch (primaryErr) {
        if (CONNECTION_TYPE === "webrtc") {
          await conversation.startSession({
            agentId: AGENT_ID,
            connectionType: "websocket",
            dynamicVariables,
            inputDeviceId: preferredInputDeviceIdRef.current,
          } as any);
        } else {
          throw primaryErr;
        }
      }
    } catch (err: any) {
      console.error("Failed to start voice session:", err);
      setIsConnecting(false);
      setError("Could not start voice session. Check your microphone.");
    }
  }, [conversation, threadId, userName]);

  const endSession = useCallback(async () => {
    try {
      setCurrentCaption(null);
      pollAbortRef.current = true;
      stopAudioMeter();
      await conversation.endSession();
    } catch (err) {
      console.error("Failed to end voice session:", err);
    }
  }, [conversation]);

  useEffect(() => {
    return () => {
      pollAbortRef.current = true;
      stopAudioMeter();
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  // Resume voice when payment completes (isVoicePaused gets cleared)
  const resumeVoice = useCallback(() => {
    setIsVoicePaused(false);
    try { conversation.setVolume({ volume: 1 }); } catch { }
  }, [conversation]);

  return {
    isConnected: conversation.status === "connected",
    isConnecting,
    isSpeaking: conversation.isSpeaking,
    isVoicePaused,
    status: conversation.status,
    currentCaption,
    audioLevel,
    error,
    startSession,
    endSession,
    resumeVoice,
  };
}
