import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlowingSpinner } from './GlowingSpinner';

interface CustomDirectVideoPlayerProps {
  url: string;
  title: string;
  onEnded?: () => void;
  autoPlay?: boolean;
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

function Rewind10Icon({ className = "w-5 h-5 sm:w-6 sm:h-6" }: { className?: string }) {
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
        fontSize="6.5" 
        fontWeight="900" 
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        letterSpacing="-0.3px"
      >
        10s
      </text>
    </svg>
  );
}

function Forward10Icon({ className = "w-5 h-5 sm:w-6 sm:h-6" }: { className?: string }) {
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
        fontSize="6.5" 
        fontWeight="900" 
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        letterSpacing="-0.3px"
      >
        10s
      </text>
    </svg>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}:${remMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function CustomDirectVideoPlayer({
  url,
  title,
  onEnded,
  autoPlay = true,
}: CustomDirectVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [skipFeedback, setSkipFeedback] = useState<{ id: number; type: 'back' | 'forward' } | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const wasPlayingBeforeScrubRef = useRef(false);

  // Initialize and attach video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(video.currentTime);
      }
      if (video.buffered.length > 0 && video.duration > 0) {
        setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsLoading(false);
    };
    const handleCanPlay = () => {
      setIsBuffering(false);
      setIsLoading(false);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('ended', handleEnded);
    };
  }, [isScrubbing, onEnded]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Controls auto-hide timer
  const resetControlsTimer = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    if (isPlaying && !showSpeedMenu && !isScrubbing) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3200);
    }
  };

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  const handleMouseLeave = () => {
    if (isPlaying && !showSpeedMenu && !isScrubbing) {
      setShowControls(false);
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    resetControlsTimer();
  };

  const seekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.currentTime + seconds, video.duration || 0));
    video.currentTime = newTime;
    setCurrentTime(newTime);
    setSkipFeedback({ id: Date.now(), type: seconds < 0 ? 'back' : 'forward' });
    setTimeout(() => setSkipFeedback(null), 700);
    resetControlsTimer();
  };

  // Timeline scrub handling
  const getTimeFromPointer = (clientX: number): number => {
    const bar = timelineRef.current;
    if (!bar || !duration) return 0;
    const rect = bar.getBoundingClientRect();
    const percent = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    return percent * duration;
  };

  const handleTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    wasPlayingBeforeScrubRef.current = !video.paused;
    if (!video.paused) {
      video.pause();
    }
    setIsScrubbing(true);
    const target = getTimeFromPointer(e.clientX);
    setScrubTime(target);
    video.currentTime = target;
    setCurrentTime(target);
  };

  const handleTimelinePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing || !videoRef.current || !duration) return;
    const target = getTimeFromPointer(e.clientX);
    setScrubTime(target);
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleTimelinePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setIsScrubbing(false);
    const target = getTimeFromPointer(e.clientX);
    if (videoRef.current) {
      videoRef.current.currentTime = target;
      setCurrentTime(target);
      if (wasPlayingBeforeScrubRef.current) {
        videoRef.current.play().catch(() => {});
      }
    }
    resetControlsTimer();
  };

  const handleVolumeChange = (newVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(1, newVolume));
    video.volume = clamped;
    setVolume(clamped);
    if (clamped === 0) {
      video.muted = true;
      setIsMuted(true);
    } else if (video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
    resetControlsTimer();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      video.volume = volume || 0.8;
    } else {
      video.muted = true;
      setIsMuted(true);
    }
    resetControlsTimer();
  };

  const handleSpeedSelect = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
    resetControlsTimer();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    resetControlsTimer();
  };

  const activeDisplayTime = isScrubbing ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? (activeDisplayTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="group relative w-full h-full bg-black select-none overflow-hidden flex items-center justify-center font-sans"
    >
      {/* HTML5 Native Video Tag */}
      <video
        ref={videoRef}
        src={url}
        autoPlay={autoPlay}
        playsInline
        preload="metadata"
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* Loading / Buffering Spinner Overlay with Glow */}
      <AnimatePresence>
        {(isLoading || isBuffering) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3.5 z-20 pointer-events-none"
          >
            <GlowingSpinner size="lg" color="primary" glow={true} />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 backdrop-blur-md shadow-xl text-white text-[11px] font-mono font-medium tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
              <span>{isLoading ? 'Loading video...' : 'Buffering...'}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip 10s Feedback Animation */}
      <AnimatePresence>
        {skipFeedback && (
          <motion.div
            key={skipFeedback.id}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
          >
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/80 border border-white/20 backdrop-blur-md shadow-2xl text-white">
              {skipFeedback.type === 'back' ? (
                <>
                  <Rewind10Icon className="w-6 h-6 text-primary" />
                  <span className="text-sm font-black tracking-wider uppercase">-10s</span>
                </>
              ) : (
                <>
                  <span className="text-sm font-black tracking-wider uppercase">+10s</span>
                  <Forward10Icon className="w-6 h-6 text-primary" />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Center Click-to-Play Pulse Visualizer when Paused */}
      {!isPlaying && !isLoading && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute z-10 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/90 hover:bg-primary text-white flex items-center justify-center shadow-[0_0_50px_rgba(var(--primary-rgb),0.7)] backdrop-blur-sm border border-white/25 transition-all hover:scale-110 active:scale-95 cursor-pointer"
          title="Play"
          aria-label="Play"
        >
          <Play size={28} className="fill-white ml-1" />
        </button>
      )}

      {/* Bottom Gradient & Control Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-3.5 px-4 sm:px-6 z-20 transition-opacity duration-300 ${
          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Timeline Scrubber */}
        <div className="relative mb-2 sm:mb-3">
          <div
            ref={timelineRef}
            onPointerDown={handleTimelinePointerDown}
            onPointerMove={handleTimelinePointerMove}
            onPointerUp={handleTimelinePointerUp}
            className="group/track relative h-6 w-full flex items-center cursor-pointer touch-none select-none"
          >
            {/* Background Track */}
            <div className="relative h-1.5 sm:h-2 w-full bg-white/20 group-hover/track:h-2.5 rounded-full overflow-hidden transition-all duration-150">
              {/* Buffer Progress */}
              <div 
                className="absolute top-0 bottom-0 left-0 bg-white/25 rounded-full transition-all"
                style={{ width: `${buffered}%` }}
              />
              {/* Played Progress */}
              <div 
                className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary/90 to-primary rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Knob */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.6)] border-2 border-primary pointer-events-none transition-transform duration-100 ${
                isScrubbing ? 'scale-125 ring-4 ring-primary/40' : 'scale-90 group-hover/track:scale-110'
              }`}
              style={{ left: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Lower Control Deck: Left (Play, Skips, Time) | Right (Speed, Vol, Fullscreen) */}
        <div className="flex items-center justify-between gap-3 text-white">
          
          {/* Left Controls */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Play / Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={20} className="fill-white" /> : <Play size={20} className="fill-white" />}
            </button>

            {/* Rewind 10s */}
            <button
              type="button"
              onClick={() => seekRelative(-10)}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-90"
              title="Rewind 10 seconds"
              aria-label="Rewind 10 seconds"
            >
              <Rewind10Icon className="w-5 h-5 text-white/90" />
            </button>

            {/* Forward 10s */}
            <button
              type="button"
              onClick={() => seekRelative(10)}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-90"
              title="Forward 10 seconds"
              aria-label="Forward 10 seconds"
            >
              <Forward10Icon className="w-5 h-5 text-white/90" />
            </button>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-1 group/vol">
              <button
                type="button"
                onClick={toggleMute}
                className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-14 sm:w-20 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-primary"
                title="Volume"
              />
            </div>

            {/* Timestamp Display */}
            <div className="text-[11px] sm:text-xs font-mono font-medium text-white/80 pl-1.5 whitespace-nowrap">
              <span>{formatDuration(activeDisplayTime)}</span>
              <span className="mx-1 text-white/40">/</span>
              <span className="text-white/50">{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1 sm:gap-2">
            
            {/* Speed Selector Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold text-white transition-all cursor-pointer active:scale-95"
                title="Playback speed"
              >
                {playbackRate}x
              </button>

              <AnimatePresence>
                {showSpeedMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full right-0 mb-2 py-1.5 w-24 rounded-2xl bg-zinc-900/95 border border-white/15 backdrop-blur-xl shadow-2xl z-50 flex flex-col"
                  >
                    <div className="px-3 py-1 text-[10px] uppercase font-bold text-white/40 tracking-wider border-b border-white/5">
                      Speed
                    </div>
                    {PLAYBACK_SPEEDS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleSpeedSelect(rate)}
                        className={`px-3 py-1.5 text-xs text-left font-medium transition-colors hover:bg-white/10 flex items-center justify-between ${
                          playbackRate === rate ? 'text-primary font-bold bg-primary/10' : 'text-white/80'
                        }`}
                      >
                        <span>{rate}x</span>
                        {playbackRate === rate && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Restart Button */}
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play().catch(() => {});
                }
              }}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-90"
              title="Restart from beginning"
              aria-label="Restart from beginning"
            >
              <RotateCcw size={18} />
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-90"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>

          </div>

        </div>
      </div>
    </div>
  );
}
