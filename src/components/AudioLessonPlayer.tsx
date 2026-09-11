import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Headphones, 
  Radio, 
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileAudio
} from 'lucide-react';
import { motion } from 'motion/react';

interface AudioLessonPlayerProps {
  url: string;
  title: string;
  description?: string;
  coverUrl?: string;
  durationMinutes?: number;
  onEnded?: () => void;
  isCompleted?: boolean;
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

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
  title,
  description,
  coverUrl,
  durationMinutes,
  onEnded,
  isCompleted = false
}: AudioLessonPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const effectiveUrl = formatAudioStreamUrl(url);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setLoadError(null);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setCurrentTime(0);
    setIsPlaying(false);

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || (durationMinutes ? durationMinutes * 60 : 0));
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    const handleEnded = () => {
      setIsPlaying(false);
      if (onEnded) onEnded();
    };

    const handleError = () => {
      const currentAudio = audioRef.current;
      // Code 1 = MEDIA_ERR_ABORTED: The fetching process was aborted by the user agent or navigation.
      // Do NOT show error for normal aborts.
      if (currentAudio?.error && currentAudio.error.code === 1) {
        return;
      }
      setIsLoading(false);
      setLoadError('Não foi possível carregar o arquivo de áudio. Verifique se o link é público e válido.');
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);

    // If already loaded
    if (audio.readyState >= 1) {
      setDuration(audio.duration || 0);
      setIsLoading(false);
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
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
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((e: any) => {
          // AbortError is normal when user quickly pauses or changes state
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
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration || !effectiveUrl) return;

    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(clickX / rect.width, 1));
    const newTime = percentage * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
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

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.muted = false;
      setIsMuted(false);
    } else {
      audio.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Hidden audio element only rendered with a valid src to prevent browser fetch aborts */}
      {effectiveUrl && (
        <audio
          ref={audioRef}
          src={effectiveUrl}
          preload="metadata"
          playsInline
        />
      )}

      {/* Main Luxury Audio Card */}
      <div className="relative overflow-hidden rounded-3xl sm:rounded-[32px] bg-gradient-to-b from-zinc-900/90 via-zinc-900/95 to-black border border-white/10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl p-6 sm:p-10">
        
        {/* Ambient background glow matching playing state */}
        <div 
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none transition-opacity duration-1000 ${
            isPlaying ? 'opacity-70 scale-110' : 'opacity-20 scale-95'
          }`} 
        />
        
        {/* Top Header Badge */}
        <div className="relative z-10 flex items-center justify-between gap-4 mb-6 sm:mb-8 pb-4 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]">
              <Radio size={16} className={isPlaying ? 'animate-pulse' : ''} />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                PODCAST &middot; AULA EM ÁUDIO
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isCompleted && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                <CheckCircle2 size={12} />
                Ouvida
              </span>
            )}
            <span className="text-zinc-500 text-xs font-mono">
              {durationMinutes ? `${durationMinutes} MIN` : formatTime(duration || 0)}
            </span>
          </div>
        </div>

        {/* Content Section: Cover Art & Track Details */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6 sm:gap-8 mb-8">
          {/* Square Artwork with vinyl / equalizer pulse */}
          <div className="relative w-36 h-36 sm:w-44 sm:h-44 shrink-0 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10 group">
            {coverUrl && coverUrl.trim() ? (
              <img
                src={coverUrl.trim()}
                alt={title}
                className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? 'scale-105' : 'scale-100'}`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-black flex flex-col items-center justify-center text-primary/70">
                <Headphones size={48} className={`transition-transform duration-500 ${isPlaying ? 'scale-110 text-primary' : 'opacity-60'}`} />
                <span className="text-[9px] font-black tracking-widest uppercase mt-2 text-zinc-400">PODCAST</span>
              </div>
            )}

            {/* Pulsing Audio Wave overlay when playing */}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center gap-1">
                <motion.span 
                  animate={{ height: ['8px', '28px', '12px'] }} 
                  transition={{ repeat: Infinity, duration: 0.8, ease: 'easeInOut' }} 
                  className="w-1 bg-primary rounded-full" 
                />
                <motion.span 
                  animate={{ height: ['14px', '38px', '18px'] }} 
                  transition={{ repeat: Infinity, duration: 0.9, delay: 0.1, ease: 'easeInOut' }} 
                  className="w-1 bg-primary rounded-full" 
                />
                <motion.span 
                  animate={{ height: ['20px', '46px', '10px'] }} 
                  transition={{ repeat: Infinity, duration: 1.1, delay: 0.2, ease: 'easeInOut' }} 
                  className="w-1 bg-white rounded-full" 
                />
                <motion.span 
                  animate={{ height: ['10px', '32px', '24px'] }} 
                  transition={{ repeat: Infinity, duration: 0.7, delay: 0.15, ease: 'easeInOut' }} 
                  className="w-1 bg-primary rounded-full" 
                />
                <motion.span 
                  animate={{ height: ['6px', '22px', '8px'] }} 
                  transition={{ repeat: Infinity, duration: 0.85, delay: 0.05, ease: 'easeInOut' }} 
                  className="w-1 bg-primary rounded-full" 
                />
              </div>
            )}
          </div>

          {/* Episode Info */}
          <div className="flex-1 text-center sm:text-left min-w-0 w-full">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-zinc-400 bg-white/5 border border-white/5 px-2.5 py-0.5 rounded-md">
                <Sparkles size={11} className="text-amber-400" />
                Episódio de Áudio
              </span>
            </div>
            
            <h3 className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight line-clamp-2 uppercase italic mb-2">
              {title}
            </h3>

            {description && (
              <p className="text-sm text-zinc-400 line-clamp-2 sm:line-clamp-3 leading-relaxed font-normal">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Empty Audio URL Notice */}
        {!effectiveUrl && (
          <div className="relative z-10 mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-300 text-xs">
            <FileAudio size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Áudio não anexado</p>
              <p className="text-amber-300/80">Esta aula ainda não possui a URL do arquivo de áudio cadastrada. Edite a aula no painel para inserir o link (.mp3, .m4a, Google Drive).</p>
            </div>
          </div>
        )}

        {/* Load Error Alert */}
        {loadError && (
          <div className="relative z-10 mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Aviso de Reprodução:</p>
              <p className="text-rose-400/90">{loadError}</p>
            </div>
          </div>
        )}

        {/* Scrub Bar / Timeline */}
        <div className="relative z-10 space-y-2 mb-8">
          <div 
            ref={progressBarRef}
            onClick={handleProgressBarClick}
            className={`group relative h-2.5 sm:h-3 w-full bg-zinc-800/80 hover:bg-zinc-800 rounded-full transition-all overflow-hidden border border-white/5 ${
              effectiveUrl ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            }`}
          >
            {/* Filled Progress */}
            <div 
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-primary/80 to-primary group-hover:brightness-110 transition-all rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
            {/* Scrubber Knob indicator on hover */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Timestamps */}
          <div className="flex justify-between items-center text-xs font-mono font-medium text-zinc-400 px-0.5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration || (durationMinutes ? durationMinutes * 60 : 0))}</span>
          </div>
        </div>

        {/* Master Control Deck */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6 pt-2">
          
          {/* Speed Toggle Pill */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSpeedCycle}
              disabled={!effectiveUrl}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-black tracking-wider text-zinc-300 hover:text-white transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Velocidade de Reprodução"
            >
              {playbackRate}x
            </button>
          </div>

          {/* Primary Transport Buttons (15s back, Play/Pause, 15s forward) */}
          <div className="flex items-center gap-4 sm:gap-6">
            {/* -15 Seconds */}
            <button
              type="button"
              onClick={() => seekRelative(-15)}
              disabled={!effectiveUrl}
              className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Voltar 15 segundos"
            >
              <RotateCcw size={22} />
            </button>

            {/* Giant Play / Pause Button */}
            <button
              type="button"
              onClick={togglePlay}
              disabled={!effectiveUrl || isLoading}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary hover:brightness-110 text-white flex items-center justify-center shadow-[0_10px_35px_rgba(var(--primary-rgb),0.5)] transition-all cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              title={isPlaying ? 'Pausar' : 'Reproduzir'}
            >
              {isPlaying ? (
                <Pause size={28} className="fill-white" />
              ) : (
                <Play size={28} className="fill-white ml-1" />
              )}
            </button>

            {/* +15 Seconds */}
            <button
              type="button"
              onClick={() => seekRelative(15)}
              disabled={!effectiveUrl}
              className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Avançar 15 segundos"
            >
              <RotateCw size={22} />
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2 w-32">
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isMuted ? 'Ativar som' : 'Silenciar'}
            >
              {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-full accent-primary h-1 bg-zinc-700 rounded-lg cursor-pointer"
            />
          </div>

        </div>

      </div>
    </div>
  );
}

