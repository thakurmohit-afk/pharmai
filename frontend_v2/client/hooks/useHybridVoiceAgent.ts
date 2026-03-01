/**
 * Hybrid voice hook:
 * - STT: Whisper via backend /api/voice/turn
 * - Reasoning: existing backend chat workflow
 * - TTS: ElevenLabs stream via /api/voice/speak
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { runHybridVoiceTurn, speakUrl } from "@/services/api";
import type { Message } from "@/types/chat";

const INPUT_METER_INTERVAL_MS = 60;
const MIN_SPEECH_MS = 180;
const MAX_TURN_AUDIO_MS = 18000;
const ERROR_MESSAGE_COOLDOWN_MS = 7000;
const ERROR_CAPTURE_BACKOFF_MS = 3000;
const SILENCE_STOP_MS = Number(import.meta.env.VITE_HYBRID_SILENCE_STOP_MS || 1200);
const START_THRESHOLD = Number(import.meta.env.VITE_HYBRID_START_THRESHOLD || 0.02);
const CONTINUE_THRESHOLD = Number(import.meta.env.VITE_HYBRID_CONTINUE_THRESHOLD || 0.014);

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000, min: 16000 },
  sampleSize: { ideal: 16 },
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export interface VoiceCaption {
  text: string;
  source: "user" | "ai";
}

interface UseHybridVoiceAgentOptions {
  threadId: string | null;
  onMessage: (msg: Message) => void;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function calcRms(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number {
  analyser.getByteTimeDomainData(data);
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const centered = (data[i] - 128) / 128;
    sumSq += centered * centered;
  }
  return Math.sqrt(sumSq / data.length);
}

export default function useHybridVoiceAgent({ threadId, onMessage }: UseHybridVoiceAgentOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<VoiceCaption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const activeThreadRef = useRef<string | null>(threadId);
  const sessionActiveRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const isCapturingRef = useRef(false);
  const speechCandidateStartRef = useRef<number | null>(null);
  const lastVoiceTsRef = useRef(0);
  const captureStartTsRef = useRef(0);
  const turnInFlightRef = useRef(false);
  const messageCounterRef = useRef(0);
  const fatalErrorRef = useRef(false);
  const errorBackoffUntilRef = useRef(0);
  const lastErrorMessageRef = useRef("");
  const lastErrorAtRef = useRef(0);

  useEffect(() => {
    activeThreadRef.current = threadId;
  }, [threadId]);

  const setCaption = useCallback((text: string, source: "user" | "ai") => {
    setCurrentCaption({ text, source });
    if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
    captionTimerRef.current = setTimeout(() => setCurrentCaption(null), 4000);
  }, []);

  const stopTts = useCallback(() => {
    const audio = ttsAudioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore
    }
    ttsAudioRef.current = null;
    setIsSpeaking(false);
  }, []);

  const playTts = useCallback((text: string) => {
    if (!text.trim()) return;
    stopTts();
    const audio = new Audio(speakUrl(text));
    audio.preload = "auto";
    audio.onplay = () => setIsSpeaking(true);
    audio.onended = () => {
      if (ttsAudioRef.current === audio) {
        ttsAudioRef.current = null;
      }
      setIsSpeaking(false);
    };
    audio.onerror = () => {
      if (ttsAudioRef.current === audio) {
        ttsAudioRef.current = null;
      }
      setIsSpeaking(false);
    };
    ttsAudioRef.current = audio;
    audio.play().catch(() => {
      setIsSpeaking(false);
    });
  }, [stopTts]);

  const handleTurn = useCallback(async (blob: Blob) => {
    const thread = activeThreadRef.current;
    if (!thread) {
      turnInFlightRef.current = false;
      setError("Voice thread is missing. Please retry.");
      return;
    }

    try {
      const response = await runHybridVoiceTurn(blob, thread);

      const transcript = String(response?.transcription || "").trim();
      if (transcript) {
        const userMessage: Message = {
          id: `voice-hybrid-user-${Date.now()}-${++messageCounterRef.current}`,
          role: "user",
          content: transcript,
          isNew: true,
        };
        onMessage(userMessage);
        setCaption(transcript, "user");
      }

      const assistantText = String(response?.message || "").trim();
      const assistantMessage: Message = {
        id: `voice-hybrid-ai-${Date.now()}-${++messageCounterRef.current}`,
        role: "assistant",
        content: assistantText || "I couldn't process that, please repeat.",
        isNew: true,
        action: response?.action,
        quote: response?.quote,
        payment: response?.payment,
        recommendations: response?.recommendations,
        uiPayload: response?.ui_payload,
      };
      onMessage(assistantMessage);
      if (assistantText) {
        setCaption(assistantText, "ai");
        playTts(assistantText);
      }
      setError(null);
      fatalErrorRef.current = false;
      errorBackoffUntilRef.current = 0;
    } catch (err: any) {
      const text = err?.message || "Voice turn failed";
      const normalized = String(text || "").trim().toLowerCase();
      const isNotFound = Number(err?.status || 0) === 404 || normalized === "not found" || normalized.includes("not found");

      if (isNotFound) {
        fatalErrorRef.current = true;
        errorBackoffUntilRef.current = Number.MAX_SAFE_INTEGER;
        setError("Hybrid voice endpoint unavailable. Reload backend or switch to 11Labs.");
        sessionActiveRef.current = false;
        stopRequestedRef.current = true;
        isCapturingRef.current = false;
        setIsConnected(false);
        setIsConnecting(false);
      } else {
        setError(text);
        errorBackoffUntilRef.current = Date.now() + ERROR_CAPTURE_BACKOFF_MS;
      }

      const now = Date.now();
      const fallbackLine = isNotFound
        ? "Hybrid voice endpoint is unavailable right now. Please switch to 11Labs or retry after backend restart."
        : "I'm having trouble right now. Please repeat that once.";
      const shouldEmitFallback = (
        lastErrorMessageRef.current !== fallbackLine
        || now - lastErrorAtRef.current >= ERROR_MESSAGE_COOLDOWN_MS
      );
      if (shouldEmitFallback) {
        onMessage({
          id: `voice-hybrid-ai-error-${Date.now()}-${++messageCounterRef.current}`,
          role: "assistant",
          content: fallbackLine,
          isNew: true,
        });
        lastErrorMessageRef.current = fallbackLine;
        lastErrorAtRef.current = now;
      }
    } finally {
      turnInFlightRef.current = false;
    }
  }, [onMessage, playTts, setCaption]);

  const startCapture = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "inactive" || turnInFlightRef.current || fatalErrorRef.current) return;
    chunksRef.current = [];
    lastVoiceTsRef.current = Date.now();
    captureStartTsRef.current = Date.now();
    try {
      recorder.start();
      isCapturingRef.current = true;
    } catch (err) {
      setError("Unable to start recording.");
      isCapturingRef.current = false;
    }
  }, []);

  const stopCapture = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    isCapturingRef.current = false;
    turnInFlightRef.current = true;
    try {
      recorder.stop();
    } catch {
      turnInFlightRef.current = false;
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (meterTimerRef.current) clearInterval(meterTimerRef.current);
    meterTimerRef.current = null;
    setAudioLevel(0);
  }, []);

  const endSession = useCallback(async () => {
    sessionActiveRef.current = false;
    stopRequestedRef.current = true;
    stopMeter();
    stopTts();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    isCapturingRef.current = false;
    turnInFlightRef.current = false;
    speechCandidateStartRef.current = null;

    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    mediaStreamRef.current = null;

    const ctx = audioContextRef.current;
    if (ctx) {
      try {
        await ctx.close();
      } catch {
        // ignore
      }
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    setIsSpeaking(false);
    setCurrentCaption(null);
    setIsConnecting(false);
    setIsConnected(false);
  }, [stopMeter, stopTts]);

  const startSession = useCallback(async (explicitThreadId?: string) => {
    const targetThreadId = explicitThreadId || activeThreadRef.current;
    if (!targetThreadId) {
      setError("Missing thread for voice session.");
      return;
    }
    activeThreadRef.current = targetThreadId;

    if (isConnected || isConnecting) return;

    setIsConnecting(true);
    setError(null);
    stopRequestedRef.current = false;
    sessionActiveRef.current = true;
    fatalErrorRef.current = false;
    errorBackoffUntilRef.current = 0;
    lastErrorMessageRef.current = "";
    lastErrorAtRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);

      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        if (stopRequestedRef.current || !sessionActiveRef.current || fatalErrorRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        chunksRef.current = [];
        if (!blob.size) {
          turnInFlightRef.current = false;
          return;
        }
        await handleTurn(blob);
      };
      mediaRecorderRef.current = recorder;

      meterTimerRef.current = setInterval(() => {
        const activeAnalyser = analyserRef.current;
        if (!activeAnalyser || !sessionActiveRef.current) return;
        if (fatalErrorRef.current) return;
        const rms = calcRms(activeAnalyser, data);
        setAudioLevel(Math.max(0, Math.min(1, rms * 8)));

        const now = Date.now();
        if (now < errorBackoffUntilRef.current) return;
        const isLoud = rms >= START_THRESHOLD;
        const isVoiceLike = rms >= CONTINUE_THRESHOLD;

        if (isLoud && ttsAudioRef.current && !ttsAudioRef.current.paused) {
          stopTts();
        }

        if (turnInFlightRef.current) return;

        if (!isCapturingRef.current) {
          if (isLoud) {
            if (!speechCandidateStartRef.current) {
              speechCandidateStartRef.current = now;
            } else if (now - speechCandidateStartRef.current >= MIN_SPEECH_MS) {
              speechCandidateStartRef.current = null;
              startCapture();
            }
          } else {
            speechCandidateStartRef.current = null;
          }
          return;
        }

        if (isVoiceLike) {
          lastVoiceTsRef.current = now;
        }

        const silenceMs = now - lastVoiceTsRef.current;
        const durationMs = now - captureStartTsRef.current;
        if (silenceMs >= SILENCE_STOP_MS || durationMs >= MAX_TURN_AUDIO_MS) {
          stopCapture();
        }
      }, INPUT_METER_INTERVAL_MS);

      setIsConnected(true);
      setIsConnecting(false);
    } catch (err: any) {
      setIsConnecting(false);
      setIsConnected(false);
      setError(err?.message || "Could not start hybrid voice session.");
      await endSession();
    }
  }, [endSession, handleTurn, isConnected, isConnecting, startCapture, stopCapture, stopTts]);

  useEffect(() => {
    return () => {
      endSession();
      if (captionTimerRef.current) clearTimeout(captionTimerRef.current);
    };
  }, [endSession]);

  return {
    isConnected,
    isConnecting,
    isSpeaking,
    isVoicePaused: false,
    status: isConnected ? "connected" : (isConnecting ? "connecting" : "disconnected"),
    currentCaption,
    audioLevel,
    error,
    startSession,
    endSession,
    resumeVoice: () => {},
  };
}
