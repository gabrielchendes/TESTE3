import React, { Suspense, lazy } from 'react';
import { Loader2 } from 'lucide-react';

const LazyReactPlayer: any = lazy(() => import('react-player'));

interface LessonVideoPlayerProps {
  url: string;
  title: string;
  onEnded?: () => void;
}

export default function LessonVideoPlayer({ url, title, onEnded }: LessonVideoPlayerProps) {
  if (!url || url === 'undefined') return null;

  let content: React.ReactNode = null;

  // 1. YouTube (Native zero-bundle iframe)
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    let videoId = '';
    if (url.includes('v=')) videoId = url.split('v=')[1]?.split('&')[0] || '';
    else if (url.includes('youtu.be/')) videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    else if (url.includes('youtube.com/shorts/')) videoId = url.split('youtube.com/shorts/')[1]?.split('?')[0] || '';
    else if (url.includes('embed/')) videoId = url.split('embed/')[1]?.split('?')[0] || '';

    if (videoId) {
      content = (
        <iframe
          key={videoId}
          src={`https://www.youtube.com/embed/${videoId}?modestbranding=1&rel=0&autoplay=1&playsinline=1`}
          className="w-full h-full border-0 absolute inset-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          title={title}
        />
      );
    }
  }
  // 2. Vimeo (Native zero-bundle iframe)
  else if (url.includes('vimeo.com')) {
    const videoId = url.split('vimeo.com/')[1]?.split('?')[0];
    if (videoId) {
      content = (
        <iframe
          key={videoId}
          src={`https://player.vimeo.com/video/${videoId}?autoplay=1&dnt=1&playsinline=1`}
          className="w-full h-full border-0 absolute inset-0"
          allow="autoplay; fullscreen; picture-in-picture"
          title={title}
        />
      );
    }
  }
  // 3. Google Drive (Native zero-bundle iframe)
  else if (url.includes('drive.google.com')) {
    let videoId = '';
    if (url.includes('/d/')) videoId = url.split('/d/')[1]?.split('/')[0] || '';
    else if (url.includes('id=')) videoId = url.split('id=')[1]?.split('&')[0] || '';
    else if (url.includes('/file/d/')) videoId = url.split('/file/d/')[1]?.split('/')[0] || '';

    if (videoId) {
      content = (
        <iframe
          key={videoId}
          src={`https://drive.google.com/file/d/${videoId}/preview`}
          className="w-full h-full border-0 absolute inset-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          title={title}
        />
      );
    }
  }
  // 4. OneDrive Support (Native iframe)
  else if (url.includes('onedrive.live.com') || url.includes('1drv.ms')) {
    let embedUrl = url;
    if (url.includes('1drv.ms')) {
      embedUrl = url.replace('redir', 'embed').replace('view.aspx', 'embed.aspx');
    } else if (url.includes('onedrive.live.com') && !url.includes('embed')) {
      embedUrl = url.replace('view.aspx', 'embed.aspx').replace('redir', 'embed');
    }

    if (embedUrl.includes('?')) {
      if (!embedUrl.includes('nav=0')) embedUrl += '&nav=0';
    } else {
      embedUrl += '?nav=0';
    }

    content = (
      <iframe
        src={embedUrl}
        className="w-full h-full border-0 absolute inset-0"
        frameBorder="0"
        scrolling="no"
        allowFullScreen
        title={title}
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      />
    );
  }
  // 5. Cloudflare Stream, Cloudflare R2, or native HTML5 video (mp4, webm, mov, ogg, etc.)
  else if (
    url.includes('r2.dev') || 
    url.includes('cloudflare') || 
    url.includes('videodelivery.net') || 
    url.includes('cloudflarestream.com') ||
    url.match(/\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i)
  ) {
    if (url.includes('iframe.videodelivery.net') || (url.includes('cloudflarestream.com') && url.includes('/iframe'))) {
      content = (
        <iframe
          src={url}
          className="w-full h-full border-0 absolute inset-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
          title={title}
        />
      );
    } else if (url.includes('cloudflarestream.com') || url.includes('videodelivery.net')) {
      const streamId = url.split('/').pop()?.split('?')[0];
      content = (
        <iframe
          src={`https://iframe.videodelivery.net/${streamId}`}
          className="w-full h-full border-0 absolute inset-0"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
          title={title}
        />
      );
    } else {
      content = (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          className="w-full h-full object-contain"
          onEnded={onEnded}
        />
      );
    }
  }
  // 6. Generic Fallback: Dynamic ReactPlayer loaded strictly on-demand
  else {
    content = (
      <Suspense fallback={
        <div className="w-full h-full flex items-center justify-center bg-black">
          <Loader2 className="w-8 h-8 animate-spin text-white/40" />
        </div>
      }>
        <LazyReactPlayer 
          key={url}
          url={url} 
          width="100%" 
          height="100%" 
          style={{ position: 'absolute', top: 0, left: 0 }}
          controls 
          playing
          playsinline
          config={{
            file: {
              attributes: {
                preload: 'metadata',
                playsInline: true,
                'webkit-playsinline': 'true'
              }
            }
          } as any}
          onEnded={onEnded}
        />
      </Suspense>
    );
  }

  return (
    <div className="absolute inset-0 bg-black group/video-container overflow-hidden rounded-xl">
      {content}
      
      {/* OneDrive specific overlay remains if needed */}
      {(url.includes('onedrive.live.com') || url.includes('1drv.ms')) && (
        <div className="absolute bottom-0 right-0 w-32 h-12 z-10 pointer-events-none" />
      )}
    </div>
  );
}
