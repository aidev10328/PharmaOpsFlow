'use client';

import { useState, useRef, useCallback } from 'react';

type Props = {
  onRecordingComplete: (audioBlob: Blob, transcript: string) => void;
};

export default function VoiceRecorder({ onRecordingComplete }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // For now, transcript is a placeholder — future: integrate speech-to-text API
        const transcript = '[Voice recording attached — transcript pending]';
        onRecordingComplete(blob, transcript);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      setAudioUrl(null);

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, [onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
  }, []);

  const resetRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDuration(0);
    chunksRef.current = [];
  }, [audioUrl]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="border rounded-lg p-3 bg-gray-50">
      <div className="flex items-center gap-3">
        {!isRecording && !audioUrl && (
          <button
            onClick={startRecording}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            Start Recording
          </button>
        )}

        {isRecording && (
          <>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
              <span className="text-sm font-mono font-medium text-gray-700">{formatTime(duration)}</span>
            </div>

            {!isPaused ? (
              <button onClick={pauseRecording} className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300">
                Pause
              </button>
            ) : (
              <button onClick={resumeRecording} className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200">
                Resume
              </button>
            )}

            <button onClick={stopRecording} className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200">
              Stop
            </button>
          </>
        )}

        {audioUrl && (
          <div className="flex items-center gap-3 flex-1">
            <audio src={audioUrl} controls className="h-8 flex-1" />
            <span className="text-xs text-gray-500">{formatTime(duration)}</span>
            <button onClick={resetRecording} className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300">
              Re-record
            </button>
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-400 mt-2">
        Record a voice description of the issue. Max 5 minutes recommended.
      </p>
    </div>
  );
}
