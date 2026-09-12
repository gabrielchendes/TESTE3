import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Headphones, 
  AlertCircle,
  FileAudio
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlowingSpinner } from './GlowingSpinner';

interface AudioLessonPlayerProps {
  url: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  durationMinutes?: number;
  onEnded?: () => void;
  isCompleted?: boolean;
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

/**
 * Elegant Rewind 15s Icon with '15s' integrated into the circular graphic
 */
function Rewind15Icon({ className = "w-7 h-7 sm:w-8 sm:h-8" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.8" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <text 
        x="12" 
        y="15.2" 
        textAnchor="middle" 
        fill="currentColor" 
        stroke="none" 
        fontSize="6.8" 
        fontWeight="900" 
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        letterSpacing="-0.3px"
      >
        15s
      </text>
    </svg>
  );
}

/**
 * Elegant Forward 15s Icon with '15s' integrated into the circular graphic
 */
function Forward15Icon({ className = "w-7 h-7 sm:w-8 sm:h-8" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.8" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.57 2.57L21 8" />
      <path d="M21 3v5h-5" />
      <text 
        x="12" 
        y="15.2" 
        textAnchor="middle" 
        fill="currentColor" 
        stroke="none" 
        fontSize="6.8" 
        fontWeight="900" 
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        letterSpacing="-0.3px"
      >
        15s
      </text>
    </svg>
  );
}

/**
 * Normalizes audio URLs including Google Drive sharing links
 */
function formatAudioStreamUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return '';

  // Google Drive sharing link conversion
  if (trimmed.includes('drive.google.com')) {
    const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      return `https://docs.google.com/uc?export=download&id=${fileIdMatch[1]}`;
    }
  }

  return trimmed;
}

export default function AudioLessonPlayer({
  url,
  coverUrl,
  durationMinutes,
  onEnded,
}: AudioLessonPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const wasPlayingBeforeScrubRef = useRef(false);

  const effectiveUrl = formatAudioStreamUrl(url);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<{ type: 'back' | 'forward'; id: number } | null>(null);

  const isAudioLoading = isLoading || isBuffering;

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSec = Math.floor(seconds);
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Listeners for native HTML5 audio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !effectiveUrl) {
      setIsLoading(false);
      setIsBuffering(false);
      setLoadError(null);
      return;
    }

    setIsLoading(true);
    setIsBuffering(false);
    setLoadError(null);
    setCurrentTime(0);
    setIsPlaying(false);

    const handleLoadStart = () => {
      setIsLoading(true);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || (durationMinutes ? durationMinutes * 60 : 0));
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setIsBuffering(false);
    };

    const handleCanPlayThrough = () => {
      setIsLoading(false);
      setIsBuffering(false);
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setIsBuffering(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };

    const handleSeeking = () => {
      setIsBuffering(true);
    };

    const handleSeeked = () => {
      setIsBuffering(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setIsBuffering(false);
      if (onEnded) onEnded();
    };

    const handleError = () => {
      const currentAudio = audioRef.current;
      if (currentAudio?.error && currentAudio.error.code === 1) {
        return;
      }
      setIsLoading(false);
      setIsBuffering(false);
      setLoadError('Unable to load the audio file. Please verify the link or file permissions.');
    };

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('canplaythrough', handleCanPlayThrough);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('seeking', handleSeeking);
    audio.addEventListener('seeked', handleSeeked);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    if (audio.readyState >= 3) {
      setDuration(audio.duration || 0);
      setIsLoading(false);
      setIsBuffering(false);
    } else if (audio.readyState >= 1) {
      setDuration(audio.duration || 0);
      setIsLoading(false);
    }

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('seeking', handleSeeking);
      audio.removeEventListener('seeked', handleSeeked);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      try {
        audio.pause();
      } catch {
        // ignore
      }
    };
  }, [effectiveUrl, durationMinutes, onEnded]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !effectiveUrl) return;

    if (isPlaying) {
      audio.pause();
    } else {
      if (audio.readyState < 3) {
        setIsBuffering(true);
      }
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsBuffering(false);
            setIsLoading(false);
          })
          .catch((e: any) => {
            setIsBuffering(false);
            if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
              return;
            }
            console.warn('Playback blocked or failed:', e);
          });
      }
    }
  };

  const seekRelative = (offsetSec: number) => {
    const audio = audioRef.current;
    if (!audio || !effectiveUrl) return;
    const newTime = Math.max(0, Math.min(audio.currentTime + offsetSec, duration || 999999));
    audio.currentTime = newTime;
    setCurrentTime(newTime);

    setSkipFeedback({
      type: offsetSec < 0 ? 'back' : 'forward',
      id: Date.now()
    });
    setTimeout(() => {
      setSkipFeedback(null);
    }, 850);
  };

  const calculateTimeFromPointer = (clientX: number): number => {
    const bar = progressBarRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(clickX / rect.width, 1));
    return percentage * duration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !effectiveUrl || !duration) return;

    // Capture pointer so drag continues seamlessly even outside the element
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored in environments where pointer capture is unsupported
    }

    wasPlayingBeforeScrubRef.current = !audio.paused;
    setIsScrubbing(true);

    const targetTime = calculateTimeFromPointer(e.clientX);
    setScrubTime(targetTime);
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing || !effectiveUrl || !duration) return;
    const targetTime = calculateTimeFromPointer(e.clientX);
    setScrubTime(targetTime);
    setCurrentTime(targetTime);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }

    setIsScrubbing(false);
    const targetTime = calculateTimeFromPointer(e.clientX);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
      if (wasPlayingBeforeScrubRef.current) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignored
    }
    setIsScrubbing(false);
  };

  const handleSpeedCycle = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const nextSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const activeDisplayTime = isScrubbing ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? (activeDisplayTime / duration) * 100 : 0;

  return (
    <div className="w-full max-w-xl sm:max-w-2xl mx-auto">
      {/* Hidden audio element with preload auto */}
      {effectiveUrl && (
        <audio
          ref={audioRef}
          src={effectiveUrl}
          preload="auto"
          playsInline
        />
      )}

      {/* Main Luxury Audio Card with Elegant Border */}
      <div className="relative overflow-hidden rounded-[28px] sm:rounded-[36px] bg-gradient-to-b from-zinc-900/95 via-zinc-950/98 to-black border border-white/15 ring-1 ring-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_40px_rgba(var(--primary-rgb),0.08)] backdrop-blur-2xl p-6 sm:p-10 transition-all">
        
        {/* Delicate top border highlight */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

        {/* Ambient background glow matching playing/loading state */}
        <div 
          className={`absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none transition-all duration-1000 ${
            isPlaying 
              ? 'opacity-70 scale-110' 
              : isAudioLoading 
                ? 'opacity-50 scale-105 animate-pulse' 
                : 'opacity-25 scale-95'
          }`} 
        />

        {/* Hero Media Display: Pure Image Artwork with Elegant Frame */}
        <div className="relative z-10 flex flex-col items-center justify-center mb-8">
          <div className="relative w-64 h-64 sm:w-80 sm:h-80 aspect-square rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)] border border-white/15 ring-1 ring-white/10 group">
            {coverUrl && coverUrl.trim() ? (
              <img
                src={coverUrl.trim()}
                alt="Capa da aula"
                className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? 'scale-105' : 'scale-100'}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black flex flex-col items-center justify-center text-primary/70">
                <Headphones size={64} className={`transition-transform duration-500 ${isPlaying ? 'scale-110 text-primary' : 'opacity-60'}`} />
              </div>
            )}

            {/* Pulsing Audio Wave Visualizer when playing */}
            {isPlaying && !isAudioLoading && (
              <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-1.5 py-1.5 px-3 mx-auto w-fit rounded-full bg-black/60 backdrop-blur-md border border-white/10 shadow-lg">
                <motion.span animate={{ height: ['6px', '18px', '8px'] }} transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }} className="w-1 bg-primary rounded-full" />
                <motion.span animate={{ height: ['10px', '24px', '12px'] }} transition={{ repeat: Infinity, duration: 0.9, delay: 0.1, ease: 'easeInOut' }} className="w-1 bg-primary rounded-full" />
                <motion.span animate={{ height: ['14px', '28px', '8px'] }} transition={{ repeat: Infinity, duration: 1.1, delay: 0.2, ease: 'easeInOut' }} className="w-1 bg-white rounded-full" />
                <motion.span animate={{ height: ['8px', '20px', '14px'] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0.15, ease: 'easeInOut' }} className="w-1 bg-primary rounded-full" />
                <motion.span animate={{ height: ['4px', '14px', '6px'] }} transition={{ repeat: Infinity, duration: 0.85, delay: 0.05, ease: 'easeInOut' }} className="w-1 bg-primary rounded-full" />
              </div>
            )}

            {/* Loading / Buffering Overlay on the artwork with GlowingSpinner */}
            <AnimatePresence>
              {isAudioLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-20"
                >
                  <GlowingSpinner size="lg" color="primary" glow={true} />
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 shadow-xl backdrop-blur-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white font-mono">
                      Loading audio...
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating 15s Skip Feedback Overlay */}
            <AnimatePresence>
              {skipFeedback && (
                <motion.div
                  key={skipFeedback.id}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                >
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-black/85 border border-white/20 backdrop-blur-md shadow-2xl text-white">
                    {skipFeedback.type === 'back' ? (
                      <>
                        <Rewind15Icon className="w-5 h-5 text-primary" />
                        <span className="text-xs font-black tracking-wider uppercase">-15s</span>
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-black tracking-wider uppercase">+15s</span>
                        <Forward15Icon className="w-5 h-5 text-primary" />
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Empty Audio URL Notice */}
        {!effectiveUrl && (
          <div className="relative z-10 mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-300 text-xs">
            <FileAudio size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Audio not attached</p>
              <p className="text-amber-300/80">This lesson does not have an audio link configured yet. Edit the lesson in the admin panel to attach the audio file.</p>
            </div>
          </div>
        )}

        {/* Load Error Alert */}
        {loadError && (
          <div className="relative z-10 mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Playback notice:</p>
              <p className="text-rose-400/90">{loadError}</p>
            </div>
          </div>
        )}

        {/* Scrub Bar / Timeline with Enhanced Dragging & Scrubbing */}
        <div className="relative z-10 space-y-2 mb-6 sm:mb-8 select-none">
          {/* Hit area container: 28px tall for effortless touch & mouse grabbing */}
          <div 
            ref={progressBarRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            className={`group relative h-7 w-full flex items-center touch-none select-none ${
              effectiveUrl ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
          >
            {/* Visible track container */}
            <div className={`relative h-2.5 sm:h-3 w-full bg-zinc-800/80 group-hover:bg-zinc-800 rounded-full transition-all overflow-hidden border border-white/5 ${
              isScrubbing ? 'ring-2 ring-primary/40' : ''
            }`}>
              {/* Filled Progress */}
              <div 
                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary/85 to-primary group-hover:brightness-110 rounded-full transition-[width] duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Knob indicator with scale animation on drag & hover */}
            <div 
              className={`absolute top-1/2 -translate-y-1/2 -ml-2 sm:-ml-2.5 w-4 h-4 sm:w-5 sm:h-5 bg-white rounded-full shadow-[0_2px_10px_rgba(0,0,0,0.5)] border-2 border-primary pointer-events-none transition-all duration-100 ${
                isScrubbing 
                  ? 'scale-125 opacity-100 ring-4 ring-primary/30' 
                  : 'opacity-0 group-hover:opacity-100 group-hover:scale-105'
              }`}
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Timestamps */}
          <div className="flex justify-between items-center text-xs font-mono font-medium text-zinc-400 px-0.5 select-none">
            <span className={isScrubbing ? 'text-primary font-bold transition-colors' : ''}>
              {formatTime(activeDisplayTime)}
            </span>
            {isAudioLoading ? (
              <span className="text-primary text-[10px] font-sans font-bold uppercase tracking-wider animate-pulse flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                Loading audio...
              </span>
            ) : (
              <span>{formatTime(duration || (durationMinutes ? durationMinutes * 60 : 0))}</span>
            )}
          </div>
        </div>

        {/* Master Control Deck: Speed, -15s, Play/Pause/Spinner, +15s */}
        <div className="relative z-10 flex items-center justify-between gap-4 pt-1">
          
          {/* Playback Speed Pill */}
          <div className="w-16 flex items-center justify-start">
            <button
              type="button"
              onClick={handleSpeedCycle}
              disabled={!effectiveUrl}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black tracking-wider text-zinc-300 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Playback speed"
            >
              {playbackRate}x
            </button>
          </div>

          {/* Primary Transport Controls */}
          <div className="flex items-center gap-4 sm:gap-6">
            {/* -15 Seconds Button */}
            <button
              type="button"
              onClick={() => seekRelative(-15)}
              disabled={!effectiveUrl}
              className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed group"
              title="Rewind 15 seconds"
              aria-label="Rewind 15 seconds"
            >
              <Rewind15Icon className="w-8 h-8 text-zinc-400 group-hover:text-white transition-colors" />
            </button>

            {/* Giant Play / Pause / Buffering Button */}
            <button
              type="button"
              onClick={togglePlay}
              disabled={!effectiveUrl}
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary hover:brightness-110 text-white flex items-center justify-center shadow-[0_10px_35px_rgba(var(--primary-rgb),0.5)] transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                isAudioLoading ? 'ring-4 ring-primary/40' : ''
              }`}
              title={isAudioLoading ? 'Loading audio...' : isPlaying ? 'Pause' : 'Play'}
              aria-label={isAudioLoading ? 'Loading audio...' : isPlaying ? 'Pause' : 'Play'}
            >
              {isAudioLoading ? (
                <GlowingSpinner size="sm" color="white" glow={false} />
              ) : isPlaying ? (
                <Pause size={28} className="fill-white" />
              ) : (
                <Play size={28} className="fill-white ml-1" />
              )}
            </button>

            {/* +15 Seconds Button */}
            <button
              type="button"
              onClick={() => seekRelative(15)}
              disabled={!effectiveUrl}
              className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed group"
              title="Forward 15 seconds"
              aria-label="Forward 15 seconds"
            >
              <Forward15Icon className="w-8 h-8 text-zinc-400 group-hover:text-white transition-colors" />
            </button>
          </div>

          {/* Right Balance Spacer so Play Button is perfectly centered */}
          <div className="w-16 flex items-center justify-end" />

        </div>

      </div>
    </div>
  );
}


