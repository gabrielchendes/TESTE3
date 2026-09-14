import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Safari and WebKit require strict CORS and Range headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, User-Agent');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = (req.query?.url as string) || '';
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing "url" parameter' });
  }

  try {
    // Clean and normalize target URL
    let targetUrl = rawUrl.trim();
    if (targetUrl.includes('%3A') || targetUrl.includes('%2F')) {
      try {
        targetUrl = decodeURIComponent(targetUrl);
      } catch {}
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return res.status(400).json({ error: 'Invalid URL scheme' });
    }

    // Ensure valid URI encoding (encodes spaces as %20 without double encoding)
    try {
      targetUrl = new URL(targetUrl).href;
    } catch {
      return res.status(400).json({ error: 'Malformed video URL' });
    }

    const upstreamHeaders: Record<string, string> = {
      'User-Agent': (req.headers['user-agent'] as string) || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Accept': '*/*',
      // CRITICAL for Cloudflare R2: prevent CDN from gzipping video chunks which scrambles byte offsets
      'Accept-Encoding': 'identity',
    };

    // Forward Safari's Range header (e.g. bytes=0-1 or bytes=0-1048576)
    const rangeHeader = req.headers.range;
    if (rangeHeader) {
      upstreamHeaders['Range'] = String(rangeHeader);
    }

    const upstreamRes = await fetch(targetUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: upstreamHeaders,
    });

    let status = upstreamRes.status;
    let contentType = upstreamRes.headers.get('content-type') || 'video/mp4';
    
    // Cloudflare R2 often returns application/octet-stream or binary/octet-stream if mime wasn't explicitly set on upload.
    // Safari strictly refuses to play MP4 video unless the Content-Type is video/mp4 (or matching video/*).
    if (contentType.includes('octet-stream') || contentType === 'application/x-download' || contentType.includes('application/octet')) {
      const cleanPath = targetUrl.split('?')[0].toLowerCase();
      if (cleanPath.endsWith('.webm')) contentType = 'video/webm';
      else if (cleanPath.endsWith('.m3u8')) contentType = 'application/x-mpegURL';
      else if (cleanPath.endsWith('.mov')) contentType = 'video/mp4';
      else contentType = 'video/mp4';
    }

    const contentLength = upstreamRes.headers.get('content-length');
    let contentRange = upstreamRes.headers.get('content-range');
    const acceptRanges = upstreamRes.headers.get('accept-ranges') || 'bytes';

    res.setHeader('Accept-Ranges', acceptRanges);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');

    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    // In case upstream responded with 200 OK despite a Range request,
    // Safari will fail unless status is 206 Partial Content.
    if (status === 200 && rangeHeader && contentLength) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const totalSize = parseInt(contentLength, 10);
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        status = 206;
        contentRange = `bytes ${start}-${end}/${totalSize}`;
        res.setHeader('Content-Range', contentRange);
        res.setHeader('Content-Length', String(end - start + 1));
      }
    }

    res.status(status);

    if (req.method === 'HEAD' || !upstreamRes.body) {
      return res.end();
    }

    // Pipe response stream to client
    const nodeReadable = Readable.fromWeb(upstreamRes.body as any);
    nodeReadable.pipe(res);

    nodeReadable.on('error', (err) => {
      console.warn('[video-proxy] Stream piping notice:', err?.message);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });
  } catch (err: any) {
    console.error('[video-proxy] Exception proxying video:', err);
    if (!res.headersSent) {
      return res.status(502).json({ error: 'Failed to proxy video', message: err?.message });
    }
  }
}
