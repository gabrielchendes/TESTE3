import React from 'react';
import CustomDirectVideoPlayer from './CustomDirectVideoPlayer';
import { cleanVideoUrl } from '../utils/videoUtils';

interface LessonVideoPlayerProps {
  url: string;
  title: string;
  onEnded?: () => void;
}

export default function LessonVideoPlayer({ url, title, onEnded }: LessonVideoPlayerProps) {
  if (!url || url === 'undefined') return null;

  const cleanUrl = cleanVideoUrl(url);

  let content: React.ReactNode = null;

  // 1. YouTube (Native zero-bundle iframe)
  if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
    let videoId = '';
    if (cleanUrl.includes('v=')) videoId = cleanUrl.split('v=')[1]?.split('&')[0] || '';
    else if (cleanUrl.includes('youtu.be/')) videoId = cleanUrl.split('youtu.be/')[1]?.split('?')[0] || '';
    else if (cleanUrl.includes('youtube.com/shorts/')) videoId = cleanUrl.split('youtube.com/shorts/')[1]?.split('?')[0] || '';
    else if (cleanUrl.includes('embed/')) videoId = cleanUrl.split('embed/')[1]?.split('?')[0] || '';

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
  else if (cleanUrl.includes('vimeo.com')) {
    const videoId = cleanUrl.split('vimeo.com/')[1]?.split('?')[0];
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
  else if (cleanUrl.includes('drive.google.com')) {
    let videoId = '';
    if (cleanUrl.includes('/d/')) videoId = cleanUrl.split('/d/')[1]?.split('/')[0] || '';
    else if (cleanUrl.includes('id=')) videoId = cleanUrl.split('id=')[1]?.split('&')[0] || '';
    else if (cleanUrl.includes('/file/d/')) videoId = cleanUrl.split('/file/d/')[1]?.split('/')[0] || '';

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
  else if (cleanUrl.includes('onedrive.live.com') || cleanUrl.includes('1drv.ms')) {
    let embedUrl = cleanUrl;
    if (cleanUrl.includes('1drv.ms')) {
      embedUrl = cleanUrl.replace('redir', 'embed').replace('view.aspx', 'embed.aspx');
    } else if (cleanUrl.includes('onedrive.live.com') && !cleanUrl.includes('embed')) {
      embedUrl = cleanUrl.replace('view.aspx', 'embed.aspx').replace('redir', 'embed');
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
  // 5. Cloudflare Stream, Cloudflare R2, Supabase Storage, and native HTML5 / HLS video player
  else {
    content = (
      <CustomDirectVideoPlayer
        url={cleanUrl}
        title={title}
        onEnded={onEnded}
        autoPlay={true}
      />
    );
  }

  return (
    <div className="absolute inset-0 bg-black group/video-container overflow-hidden rounded-2xl sm:rounded-3xl">
      {content}
      
      {/* OneDrive specific overlay remains if needed */}
      {(url.includes('onedrive.live.com') || url.includes('1drv.ms')) && (
        <div className="absolute bottom-0 right-0 w-32 h-12 z-10 pointer-events-none" />
      )}
    </div>
  );
}
