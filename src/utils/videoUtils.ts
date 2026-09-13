/**
 * Video Utilities for embedding and playing Cloudflare Stream, Cloudflare R2,
 * YouTube, Vimeo, Google Drive, and direct HTML5 videos.
 */

export function extractCloudflareStreamId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // If user pasted raw iframe code like <iframe src="..." />
  const iframeMatch = trimmed.match(/src=["']([^"']+)["']/i);
  const target = iframeMatch ? iframeMatch[1] : trimmed;

  // Cloudflare Stream video IDs are standard 32-character hexadecimal strings
  const hexMatch = target.match(/([a-f0-9]{32})/i);
  if (hexMatch) {
    return hexMatch[1];
  }

  // Fallback match for custom IDs
  const match = target.match(/(?:videodelivery\.net|cloudflarestream\.com)\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1] && !['watch', 'manifest', 'iframe', 'downloads'].includes(match[1].toLowerCase())) {
    return match[1];
  }

  return null;
}

export function getCloudflareStreamEmbedUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();

  // Check if it is a Cloudflare Stream URL
  const isCloudflare = 
    trimmed.includes('cloudflarestream.com') || 
    trimmed.includes('videodelivery.net') ||
    trimmed.includes('watch.cloudflarestream.com');

  if (!isCloudflare) return null;

  const streamId = extractCloudflareStreamId(trimmed);
  if (!streamId) {
    // If it already points to an iframe or embed
    if (trimmed.includes('/iframe') || trimmed.includes('iframe.videodelivery.net')) {
      return trimmed;
    }
    return null;
  }

  // Preserve unique customer subdomain if present (e.g. customer-m033avy0s0e470.cloudflarestream.com)
  const customerSubdomainMatch = trimmed.match(/(customer-[a-zA-Z0-9_-]+\.cloudflarestream\.com)/i);

  if (customerSubdomainMatch) {
    return `https://${customerSubdomainMatch[1]}/${streamId}/iframe`;
  }

  return `https://iframe.videodelivery.net/${streamId}`;
}

export function getCloudflareHlsUrl(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();

  // If user passed a direct .m3u8 link already
  if (trimmed.includes('.m3u8')) {
    return trimmed;
  }

  const isCloudflare = 
    trimmed.includes('cloudflarestream.com') || 
    trimmed.includes('videodelivery.net') ||
    trimmed.includes('watch.cloudflarestream.com');

  if (!isCloudflare) return null;

  const streamId = extractCloudflareStreamId(trimmed);
  if (!streamId) return null;

  const customerSubdomainMatch = trimmed.match(/(customer-[a-zA-Z0-9_-]+\.cloudflarestream\.com)/i);
  if (customerSubdomainMatch) {
    return `https://${customerSubdomainMatch[1]}/${streamId}/manifest/video.m3u8`;
  }

  return `https://videodelivery.net/${streamId}/manifest/video.m3u8`;
}

export function isCloudflareStreamUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('cloudflarestream.com') || 
    url.includes('videodelivery.net') ||
    url.includes('watch.cloudflarestream.com')
  );
}

export function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('r2.dev') ||
    url.includes('cloudflare') ||
    url.includes('.m3u8') ||
    /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url)
  );
}
