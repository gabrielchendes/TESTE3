import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Settings,
  Sparkles,
  X,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Hls from 'hls.js';
import { GlowingSpinner } from './GlowingSpinner';
import { getCloudflareHlsUrl, getCloudflareStreamEmbedUrl, isCloudflareStreamUrl, cleanVideoUrl } from '../utils/videoUtils';

interface CustomDirectVideoPlayerProps {
  url: string;
  title: string;
  onEnded?: () => void;
  autoPlay?: boolean;
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const DEFAULT_QUALITIES = [
  { label: 'Auto', value: 'auto' },
  { label: '1080p (Full HD)', value: '1080p' },
  { label: '720p (HD)', value: '720p' },
  { label: '480p (SD)', value: '480p' },
  { label: '360p (Low)', value: '360p' },
];

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
  const [isSimulatedFullscreen, setIsSimulatedFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState('auto');
  const [hlsLevels, setHlsLevels] = useState<{ label: string; shortLabel: string; value: string; height?: number }[]>([]);
  const [activeHeight, setActiveHeight] = useState<number | null>(null);
  const [nativeResolution, setNativeResolution] = useState<string | null>(null);
  const [qualityNotification, setQualityNotification] = useState<string | null>(null);
  const qualityNotificationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const hlsRef = useRef<Hls | null>(null);
  const [skipFeedback, setSkipFeedback] = useState<{ id: number; type: 'back' | 'forward' } | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const wasPlayingBeforeScrubRef = useRef(false);
  const speedMenuRef = useRef<HTMLDivElement | null>(null);
  const qualityMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileQualityMenuRef = useRef<HTMLDivElement | null>(null);

  const showQualityNotification = (msg: string) => {
    if (qualityNotificationTimerRef.current) {
      clearTimeout(qualityNotificationTimerRef.current);
    }
    setQualityNotification(msg);
    qualityNotificationTimerRef.current = setTimeout(() => {
      setQualityNotification(null);
    }, 2500);
  };

  // Close menus on outside click & cleanup
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const clickedQuality = 
        (qualityMenuRef.current && qualityMenuRef.current.contains(target)) ||
        (mobileQualityMenuRef.current && mobileQualityMenuRef.current.contains(target));
      if (!clickedQuality) {
        setShowQualityMenu(false);
      }
      if (speedMenuRef.current && !speedMenuRef.current.contains(target)) {
        setShowSpeedMenu(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideClick);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      if (qualityNotificationTimerRef.current) {
        clearTimeout(qualityNotificationTimerRef.current);
      }
      document.body.style.overflow = '';
    };
  }, []);

  // Initialize media source: HLS for Cloudflare Stream & .m3u8, or native HTML5 for direct video
  useEffect(() => {
    setUseIframeFallback(false);
    setIsLoading(true);
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const cleanedUrl = cleanVideoUrl(url);
    const hlsUrl = getCloudflareHlsUrl(cleanedUrl);
    const effectiveUrl = hlsUrl || cleanedUrl;
    const isHls = effectiveUrl.includes('.m3u8') || effectiveUrl.includes('/manifest');

    // If it's explicitly an iframe URL already
    if (!hlsUrl && (cleanedUrl.includes('/iframe') || cleanedUrl.includes('iframe.videodelivery.net'))) {
      setUseIframeFallback(true);
      setIsLoading(false);
      return;
    }

    let networkRetries = 0;
    let mediaRetries = 0;

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 10, // Keep forward buffer responsive for instant quality changes
        maxMaxBufferLength: 20,
        backBufferLength: 10,
        capLevelToPlayerSize: false,
      });
      hlsRef.current = hls;

      hls.loadSource(effectiveUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setIsLoading(false);
        if (data.levels && data.levels.length > 0) {
          const parsed = data.levels.map((lvl, index) => {
            const h = lvl.height || (lvl as any).attrs?.RESOLUTION?.height || 0;
            let label = h ? `${h}p` : `Quality ${index + 1}`;
            if (h >= 1080) label += ' (Full HD)';
            else if (h >= 720) label += ' (HD)';
            else if (h >= 480) label += ' (SD)';
            else if (h > 0) label += ' (Low)';

            return {
              label,
              shortLabel: h ? `${h}p` : `Lvl ${index + 1}`,
              value: String(index),
              height: h,
            };
          });
          parsed.sort((a, b) => (b.height || 0) - (a.height || 0));
          setHlsLevels(parsed);
        }
        if (autoPlay) {
          video.play().catch((err) => {
            console.log('[Player] Autoplay prevented by browser, click play to start:', err?.message);
            setIsPlaying(false);
            setIsLoading(false);
          });
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const lvl = hls.levels[data.level];
        if (lvl && lvl.height) {
          setActiveHeight(lvl.height);
        }
        setIsBuffering(false);
      });

      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        setIsBuffering(false);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn('[Player] HLS event error:', data.type, data.details, data.response?.code);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: {
              networkRetries++;
              const statusCode = data.response?.code || 0;
              const isBlocked = statusCode === 401 || statusCode === 403 || statusCode === 0;

              // If origin blocked (CORS / Cloudflare Stream token / Vercel domain restriction):
              if ((isBlocked || networkRetries > 1) && (isCloudflareStreamUrl(cleanedUrl) || getCloudflareStreamEmbedUrl(cleanedUrl))) {
                console.warn('[Player] HLS stream blocked by origin/CORS or private token. Activating Cloudflare iframe player fallback...');
                setUseIframeFallback(true);
                setIsLoading(false);
                setIsBuffering(false);
              } else if (networkRetries <= 2) {
                console.warn('[Player] Retrying HLS stream load...');
                hls.startLoad();
              } else {
                setIsLoading(false);
                setIsBuffering(false);
              }
              break;
            }
            case Hls.ErrorTypes.MEDIA_ERROR: {
              mediaRetries++;
              if (mediaRetries <= 2) {
                hls.recoverMediaError();
              } else if (isCloudflareStreamUrl(cleanedUrl) || getCloudflareStreamEmbedUrl(cleanedUrl)) {
                setUseIframeFallback(true);
                setIsLoading(false);
                setIsBuffering(false);
              } else {
                setIsLoading(false);
                setIsBuffering(false);
              }
              break;
            }
            default: {
              console.warn('[Player] Fatal HLS error:', data);
              if (isCloudflareStreamUrl(cleanedUrl) || getCloudflareStreamEmbedUrl(cleanedUrl)) {
                setUseIframeFallback(true);
                setIsLoading(false);
                setIsBuffering(false);
              } else {
                setIsLoading(false);
                setIsBuffering(false);
              }
              break;
            }
          }
        }
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple Safari HLS playback
      video.src = effectiveUrl;
      if (autoPlay) {
        video.play().catch((err) => {
          console.log('[Player] Autoplay prevented by browser, click play to start:', err?.message);
          setIsPlaying(false);
          setIsLoading(false);
        });
      }
    } else {
      // Direct MP4, WebM, Cloudflare R2, Supabase Storage, etc.
      video.src = effectiveUrl;
      if (autoPlay) {
        video.play().catch((err) => {
          console.log('[Player] Autoplay prevented by browser, click play to start:', err?.message);
          setIsPlaying(false);
          setIsLoading(false);
        });
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, autoPlay]);

  // Initialize and attach video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration || 0);
      setIsLoading(false);
      if (video.videoHeight) {
        setNativeResolution(`${video.videoHeight}p`);
        if (!activeHeight) {
          setActiveHeight(video.videoHeight);
        }
      }
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
    const handleVideoError = () => {
      console.warn('[Player] Video element error:', video.error);
      setIsLoading(false);
      setIsBuffering(false);
      const cleaned = cleanVideoUrl(url);
      if (isCloudflareStreamUrl(cleaned) || getCloudflareStreamEmbedUrl(cleaned)) {
        console.warn('[Player] Video tag error on Cloudflare stream. Falling back to iframe embed...');
        setUseIframeFallback(true);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleVideoError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleVideoError);
    };
  }, [url, isScrubbing, onEnded]);

  // Fullscreen change listener supporting all engines and mobile browsers (iOS/WebKit)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isDocFs || isSimulatedFullscreen);
    };

    const video = videoRef.current;
    const handleVideoEnterFs = () => setIsFullscreen(true);
    const handleVideoExitFs = () => setIsFullscreen(false);

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    if (video) {
      video.addEventListener('webkitbeginfullscreen', handleVideoEnterFs);
      video.addEventListener('webkitendfullscreen', handleVideoExitFs);
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', handleVideoEnterFs);
        video.removeEventListener('webkitendfullscreen', handleVideoExitFs);
      }
    };
  }, [isSimulatedFullscreen]);

  // Handle ESC key for simulated fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSimulatedFullscreen) {
        setIsSimulatedFullscreen(false);
        setIsFullscreen(false);
        document.body.style.overflow = '';
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSimulatedFullscreen]);

  // Controls auto-hide timer
  const resetControlsTimer = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
    if (isPlaying && !showSpeedMenu && !showQualityMenu && !isScrubbing) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  };

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  const handleMouseLeave = () => {
    if (isPlaying && !showSpeedMenu && !showQualityMenu && !isScrubbing) {
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

  const handleVideoClick = () => {
    if (!showControls) {
      resetControlsTimer();
    } else {
      togglePlay();
    }
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

  const handleQualitySelect = (qualityValue: string, label?: string, shortLabel?: string) => {
    const displayLabel = shortLabel || label || qualityValue;
    setShowQualityMenu(false);
    resetControlsTimer();

    if (hlsRef.current) {
      const hls = hlsRef.current;
      const video = videoRef.current;

      if (qualityValue === 'auto') {
        hls.currentLevel = -1;
        hls.loadLevel = -1;
        hls.nextLevel = -1;
        setSelectedQuality('auto');
        showQualityNotification('Quality: Auto');
      } else {
        let lvlIdx = parseInt(qualityValue, 10);
        // If qualityValue was passed as a height like '720p' or '720' from default qualities or fallback:
        if (isNaN(lvlIdx) || lvlIdx > 20) {
          const heightNum = parseInt(qualityValue.replace(/\D/g, ''), 10);
          const foundIndex = hls.levels.findIndex(l => l.height === heightNum);
          if (foundIndex !== -1) {
            lvlIdx = foundIndex;
          } else {
            // Find closest level by height
            let closestIdx = 0;
            let minDiff = Infinity;
            hls.levels.forEach((l, idx) => {
              const diff = Math.abs((l.height || 0) - heightNum);
              if (diff < minDiff) {
                minDiff = diff;
                closestIdx = idx;
              }
            });
            lvlIdx = closestIdx;
          }
        }

        if (!isNaN(lvlIdx) && lvlIdx >= 0 && lvlIdx < hls.levels.length) {
          // 1. Set level immediately across all Hls pointers
          hls.currentLevel = lvlIdx;
          hls.loadLevel = lvlIdx;
          hls.nextLevel = lvlIdx;
          
          setSelectedQuality(displayLabel);
          const targetHeight = hls.levels[lvlIdx]?.height;
          if (targetHeight) {
            setActiveHeight(targetHeight);
          }
          showQualityNotification(`Quality changed: ${displayLabel}`);

          // 2. IMMEDIATE VISIBLE SWITCH:
          // In standard Hls.js, the player would continue playing whatever was already in buffer (30-60s).
          // To make the resolution change take effect immediately on screen:
          if (video) {
            const curTime = video.currentTime;
            const wasPlaying = !video.paused;

            // Show buffering feedback
            setIsBuffering(true);

            // Re-assigning currentTime forces Hls.js to flush forward buffer and reload at new resolution:
            video.currentTime = curTime;
            if (wasPlaying) {
              video.play().catch(() => {});
            }
          }
        }
      }
      return;
    }

    // Direct MP4 / non-HLS video fallback:
    setSelectedQuality(displayLabel);
    const video = videoRef.current;
    if (!video) return;

    if (url.includes('quality=') || url.includes('rendition=') || url.includes('res=')) {
      const currentPos = video.currentTime;
      const wasPlaying = !video.paused;
      const updatedUrl = url.replace(/(quality|rendition|res)=[^&]+/, `$1=${qualityValue}`);
      video.src = updatedUrl;
      video.currentTime = currentPos;
      if (wasPlaying) video.play().catch(() => {});
      showQualityNotification(`Quality: ${displayLabel}`);
    } else {
      const res = nativeResolution || (video.videoHeight ? `${video.videoHeight}p` : 'Original');
      showQualityNotification(`Original Resolution: ${res}`);
    }
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const isCurrentFs = isFullscreen || isSimulatedFullscreen || !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (isCurrentFs) {
      // Exit fullscreen mode
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          (document as any).msExitFullscreen();
        } else if (video && (video as any).webkitExitFullscreen) {
          (video as any).webkitExitFullscreen();
        }
      } catch (err) {
        console.warn('Exit fullscreen error:', err);
      }
      setIsSimulatedFullscreen(false);
      setIsFullscreen(false);
      document.body.style.overflow = '';
    } else {
      // Enter fullscreen mode
      let success = false;

      // 1. iPhone / iPod / iOS Mobile Safari:
      // On iPhone, standard HTML <div> elements cannot enter fullscreen via requestFullscreen.
      // Calling webkitEnterFullscreen directly on HTMLVideoElement is the native iOS way.
      const isIPhone = typeof navigator !== 'undefined' && (
        /iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && window.screen.width < 768)
      );

      if (isIPhone && video && typeof (video as any).webkitEnterFullscreen === 'function') {
        try {
          (video as any).webkitEnterFullscreen();
          success = true;
          setIsFullscreen(true);
          return;
        } catch (err) {
          console.warn('iOS webkitEnterFullscreen failed:', err);
        }
      }

      // 2. Try standard container fullscreen (Android Chrome, iPad, Desktop)
      if (!success && container.requestFullscreen) {
        try {
          await container.requestFullscreen();
          success = true;
          setIsFullscreen(true);
        } catch (err) {
          console.warn('Container requestFullscreen failed:', err);
        }
      }

      // 3. Try container webkitRequestFullscreen (WebKit desktop or non-iPhone)
      if (!success && !isIPhone && (container as any).webkitRequestFullscreen) {
        try {
          (container as any).webkitRequestFullscreen();
          success = true;
          setIsFullscreen(true);
        } catch (err) {
          console.warn('Container webkitRequestFullscreen failed:', err);
        }
      }

      // 4. Try video element directly (in case container is rejected by browser policy)
      if (!success && video) {
        try {
          if (video.requestFullscreen) {
            await video.requestFullscreen();
            success = true;
            setIsFullscreen(true);
          } else if ((video as any).webkitRequestFullscreen) {
            (video as any).webkitRequestFullscreen();
            success = true;
            setIsFullscreen(true);
          } else if (typeof (video as any).webkitEnterFullscreen === 'function') {
            (video as any).webkitEnterFullscreen();
            success = true;
            setIsFullscreen(true);
          }
        } catch (err) {
          console.warn('Video element fullscreen failed:', err);
        }
      }

      // 5. Portaled Simulated Fullscreen Fallback:
      // If native fullscreen is blocked (e.g. within restricted iframe or PWA policy),
      // activate Portaled Simulated Fullscreen which portals directly onto document.body.
      if (!success) {
        const wasPlaying = video && !video.paused;
        const currTime = video ? video.currentTime : 0;
        setIsSimulatedFullscreen(true);
        setIsFullscreen(true);
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = currTime;
            if (wasPlaying) {
              videoRef.current.play().catch(() => {});
            }
          }
        }, 50);
      }
    }

    resetControlsTimer();
  };

  const activeDisplayTime = isScrubbing ? scrubTime : currentTime;
  const progressPercent = duration > 0 ? (activeDisplayTime / duration) * 100 : 0;

  // If iframe fallback is triggered for Cloudflare Stream
  if (useIframeFallback) {
    const cleaned = cleanVideoUrl(url);
    const embedUrl = getCloudflareStreamEmbedUrl(cleaned) || cleaned;
    return (
      <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
        <iframe
          src={embedUrl}
          className="w-full h-full border-0 absolute inset-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          title={title}
        />
      </div>
    );
  }

  const qualityList = hlsLevels.length > 0
    ? [
        { 
          label: activeHeight ? `Auto (${activeHeight}p)` : 'Auto (Recommended)', 
          shortLabel: activeHeight ? `Auto (${activeHeight}p)` : 'Auto', 
          value: 'auto' 
        }, 
        ...hlsLevels
      ]
    : [
        { 
          label: nativeResolution ? `Original (${nativeResolution})` : 'Original Quality (Max)', 
          shortLabel: nativeResolution || 'Original', 
          value: 'auto' 
        },
        { label: '1080p (Full HD)', shortLabel: '1080p', value: '1080p' },
        { label: '720p (HD)', shortLabel: '720p', value: '720p' },
        { label: '480p (SD)', shortLabel: '480p', value: '480p' },
        { label: '360p (Low)', shortLabel: '360p', value: '360p' },
      ];

  let currentQualityDisplay = 'Auto';
  if (selectedQuality === 'auto') {
    currentQualityDisplay = activeHeight ? `Auto (${activeHeight}p)` : 'Auto';
  } else {
    currentQualityDisplay = selectedQuality;
  }

  const playerContent = (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative w-full h-full bg-black select-none overflow-hidden flex items-center justify-center font-sans ${
        isSimulatedFullscreen ? 'fixed inset-0 z-[9999999] w-screen h-screen' : ''
      }`}
    >
      {/* HTML5 Native Video Tag */}
      <video
        ref={videoRef}
        autoPlay={autoPlay}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
        onClick={handleVideoClick}
        className="w-full h-full object-contain cursor-pointer"
      />

      {/* On-Screen Quality Change Notification Toast */}
      <AnimatePresence>
        {qualityNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/20 shadow-2xl flex items-center gap-2.5 text-white pointer-events-none"
          >
            <Settings size={15} className="text-primary animate-spin" style={{ animationDuration: '4s' }} />
            <span className="text-xs font-semibold tracking-wide">{qualityNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Exit Fullscreen button on top right when in simulated fullscreen */}
      {isSimulatedFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`absolute top-4 right-4 z-50 px-3.5 py-2 rounded-xl bg-black/80 hover:bg-black/95 border border-white/25 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl backdrop-blur-md cursor-pointer active:scale-95 transition-opacity duration-300 ${
            showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          title="Exit Fullscreen"
          aria-label="Exit Fullscreen"
        >
          <X size={18} />
          <span className="hidden xs:inline">Exit</span>
        </button>
      )}

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

            {/* Desktop Rewind 10s */}
            <button
              type="button"
              onClick={() => seekRelative(-10)}
              className="hidden sm:flex p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-90"
              title="Rewind 10 seconds"
              aria-label="Rewind 10 seconds"
            >
              <Rewind10Icon className="w-5 h-5 text-white/90" />
            </button>

            {/* Mobile Video Quality Selector with Settings / Gear icon */}
            <div className="relative sm:hidden" ref={mobileQualityMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQualityMenu(!showQualityMenu);
                  setShowSpeedMenu(false);
                  resetControlsTimer();
                }}
                className="group/btn px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                title="Video quality"
                aria-label="Video quality"
              >
                <Settings size={14} className="text-primary flex-shrink-0 group-hover/btn:rotate-45 transition-transform duration-300" />
                <span className="text-[11px] font-semibold">{currentQualityDisplay}</span>
              </button>

              <AnimatePresence>
                {showQualityMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 mb-2.5 py-1.5 w-48 rounded-2xl bg-zinc-900/98 border border-white/20 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.8)] z-50 flex flex-col max-h-56 overflow-y-auto"
                  >
                    <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-white/50 tracking-wider border-b border-white/10 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Settings size={11} className="text-primary" />
                        <span>Quality</span>
                      </span>
                      <span className="text-primary font-mono text-[9px] font-bold px-1.5 py-0.5 bg-primary/10 rounded">HD</span>
                    </div>
                    {qualityList.map((q) => {
                      const isSelected = selectedQuality === 'auto' 
                        ? q.value === 'auto' 
                        : (selectedQuality === q.shortLabel || selectedQuality === q.label || selectedQuality === q.value);
                      return (
                        <button
                          key={q.value}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQualitySelect(q.value, q.label, q.shortLabel);
                          }}
                          className={`px-3 py-2 text-xs text-left font-medium transition-colors hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                            isSelected ? 'text-primary font-bold bg-primary/15' : 'text-white/80'
                          }`}
                        >
                          <span className="truncate">{q.label}</span>
                          {isSelected && <Check size={14} className="text-primary flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Forward 10s */}
            <button
              type="button"
              onClick={() => seekRelative(10)}
              className="hidden xs:flex p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all cursor-pointer active:scale-90"
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
            <div className="relative" ref={speedMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowQualityMenu(false);
                  resetControlsTimer();
                }}
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
                        className={`px-3 py-1.5 text-xs text-left font-medium transition-colors hover:bg-white/10 flex items-center justify-between cursor-pointer ${
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

            {/* Desktop Video Quality Selector with Settings / Gear icon */}
            <div className="relative hidden sm:block" ref={qualityMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQualityMenu(!showQualityMenu);
                  setShowSpeedMenu(false);
                  resetControlsTimer();
                }}
                className="group/btn px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-bold text-white transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
                title="Video quality"
                aria-label="Video quality"
              >
                <Settings size={15} className="text-primary group-hover/btn:rotate-45 transition-transform duration-300 flex-shrink-0" />
                <span className="text-xs font-semibold">{currentQualityDisplay}</span>
              </button>

              <AnimatePresence>
                {showQualityMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full right-0 mb-2.5 py-1.5 w-52 rounded-2xl bg-zinc-900/98 border border-white/20 backdrop-blur-2xl shadow-[0_10px_35px_rgba(0,0,0,0.8)] z-50 flex flex-col max-h-64 overflow-y-auto"
                  >
                    <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-white/50 tracking-wider border-b border-white/10 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Settings size={12} className="text-primary" />
                        <span>Video Quality</span>
                      </span>
                      <span className="text-primary font-mono text-[9px] font-bold px-1.5 py-0.5 bg-primary/10 rounded">HD</span>
                    </div>
                    {qualityList.map((q) => {
                      const isSelected = selectedQuality === 'auto' 
                        ? q.value === 'auto' 
                        : (selectedQuality === q.shortLabel || selectedQuality === q.label || selectedQuality === q.value);
                      return (
                        <button
                          key={q.value}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQualitySelect(q.value, q.label, q.shortLabel);
                          }}
                          className={`px-3 py-2 text-xs text-left font-medium transition-colors hover:bg-white/10 flex items-center justify-between cursor-pointer ${
                            isSelected ? 'text-primary font-bold bg-primary/15' : 'text-white/80'
                          }`}
                        >
                          <span className="truncate">{q.label}</span>
                          {isSelected && <Check size={14} className="text-primary flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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

  if (isSimulatedFullscreen && typeof document !== 'undefined') {
    return createPortal(playerContent, document.body);
  }

  return playerContent;
}
