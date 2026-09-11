import { Chapter } from '../types/lms';

export const HTML_APP_PREFIX = '<!-- HTML_APP -->';
export const AUDIO_LESSON_PREFIX = '<!-- AUDIO_LESSON -->';
export const AUDIO_PODCAST_PREFIX = '<!-- AUDIO_PODCAST -->';

/**
 * Checks if the content string is an HTML Mini App.
 */
export function isHtmlAppContent(content?: string | null): boolean {
  if (!content) return false;
  const trimmed = content.trim();

  // Explicit prefix marker
  if (trimmed.startsWith(HTML_APP_PREFIX)) return true;

  // JSON format marker: {"type":"html_app", ...}
  if (trimmed.startsWith('{"type":"html_app"') || trimmed.startsWith('{"type": "html_app"')) return true;

  // Raw HTML heuristics (if not an AI-blocks JSON lesson)
  if (!trimmed.startsWith('{')) {
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('<!doctype html') ||
      lower.includes('<html') ||
      lower.includes('<head') ||
      lower.includes('<body') ||
      (lower.includes('<script') && lower.includes('</script>')) ||
      (lower.includes('<style') && lower.includes('</style>'))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a chapter represents an HTML Mini App
 */
export function isHtmlAppChapter(chapter?: Partial<Chapter> | null): boolean {
  if (!chapter) return false;
  if (chapter.content_type === 'html_app') return true;
  if (chapter.content_type === 'interactive' || chapter.content_type === 'text') {
    return isHtmlAppContent(chapter.rich_text);
  }
  return false;
}

/**
 * Checks if a chapter represents an Audio / Podcast Lesson
 */
export function isAudioChapter(chapter?: Partial<Chapter> | null): boolean {
  if (!chapter) return false;
  if (chapter.content_type === 'audio') return true;

  const richText = (chapter.rich_text || '').trim();
  if (richText.startsWith(AUDIO_LESSON_PREFIX) || richText.startsWith(AUDIO_PODCAST_PREFIX)) {
    return true;
  }
  if (richText.startsWith('{"type":"audio"') || richText.startsWith('{"type": "audio"')) {
    return true;
  }

  // Audio file extension in video_url
  if (chapter.video_url) {
    const cleanUrl = chapter.video_url.split('?')[0].toLowerCase();
    if (
      cleanUrl.endsWith('.mp3') ||
      cleanUrl.endsWith('.m4a') ||
      cleanUrl.endsWith('.wav') ||
      cleanUrl.endsWith('.ogg') ||
      cleanUrl.endsWith('.aac') ||
      cleanUrl.endsWith('.flac') ||
      cleanUrl.endsWith('.opus')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Formats HTML content for database storage, ensuring it satisfies the DB check constraint
 * while preserving detection as an HTML Mini App.
 */
export function formatHtmlAppContent(rawHtml: string): string {
  const trimmed = (rawHtml || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(HTML_APP_PREFIX)) {
    return trimmed;
  }
  return `${HTML_APP_PREFIX}\n${trimmed}`;
}

/**
 * Extracts the clean HTML code for execution and editing, stripping any internal markers.
 */
export function extractHtmlAppContent(storedContent?: string | null): string {
  if (!storedContent) return '';
  const trimmed = storedContent.trim();
  if (trimmed.startsWith(HTML_APP_PREFIX)) {
    return trimmed.slice(HTML_APP_PREFIX.length).replace(/^\r?\n/, '');
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && (parsed.type === 'html_app' || parsed.is_html_app) && parsed.html) {
        return parsed.html;
      }
    } catch {
      // Not JSON, return as is
    }
  }
  return storedContent;
}

/**
 * Formats audio content for database storage, preserving compatibility with
 * postgres check constraint chapters_content_type_check.
 */
export function formatAudioContent(rawContent: string = ''): string {
  const trimmed = (rawContent || '').trim();
  if (trimmed.startsWith(AUDIO_LESSON_PREFIX) || trimmed.startsWith(AUDIO_PODCAST_PREFIX)) {
    return trimmed;
  }
  return trimmed ? `${AUDIO_LESSON_PREFIX}\n${trimmed}` : AUDIO_LESSON_PREFIX;
}

/**
 * Extracts clean text from an audio lesson's rich_text, stripping audio prefix.
 */
export function extractAudioContent(storedContent?: string | null): string {
  if (!storedContent) return '';
  let trimmed = storedContent.trim();
  if (trimmed.startsWith(AUDIO_LESSON_PREFIX)) {
    trimmed = trimmed.slice(AUDIO_LESSON_PREFIX.length).replace(/^\r?\n/, '');
  } else if (trimmed.startsWith(AUDIO_PODCAST_PREFIX)) {
    trimmed = trimmed.slice(AUDIO_PODCAST_PREFIX.length).replace(/^\r?\n/, '');
  }
  return trimmed;
}

/**
 * Prepares chapter data for database saving, ensuring postgres check constraint
 * `chapters_content_type_check` is NEVER violated:
 * - 'audio' -> stored as 'video' with AUDIO_LESSON_PREFIX marker in rich_text
 * - 'html_app' -> stored as 'interactive' with HTML_APP_PREFIX marker in rich_text
 */
export function prepareChapterForDb(chapter: {
  content_type?: string;
  rich_text?: string | null;
}): {
  content_type: 'video' | 'pdf' | 'text' | 'link' | 'checklist' | 'interactive';
  rich_text: string;
} {
  const isAudio = chapter.content_type === 'audio';
  const isHtml = chapter.content_type === 'html_app';

  let dbContentType: 'video' | 'pdf' | 'text' | 'link' | 'checklist' | 'interactive' = 'video';
  if (isAudio) {
    dbContentType = 'video';
  } else if (isHtml) {
    dbContentType = 'interactive';
  } else if (
    chapter.content_type === 'video' ||
    chapter.content_type === 'pdf' ||
    chapter.content_type === 'text' ||
    chapter.content_type === 'link' ||
    chapter.content_type === 'checklist' ||
    chapter.content_type === 'interactive'
  ) {
    dbContentType = chapter.content_type;
  }

  let dbRichText = chapter.rich_text || '';
  if (isAudio) {
    dbRichText = formatAudioContent(dbRichText);
  } else if (isHtml) {
    dbRichText = formatHtmlAppContent(dbRichText);
  } else {
    dbRichText = extractAudioContent(extractHtmlAppContent(dbRichText));
  }

  return {
    content_type: dbContentType,
    rich_text: dbRichText
  };
}

/**
 * Maps a database chapter to frontend representation.
 * If the database stored an Audio Lesson with 'video' + marker, maps it to 'audio'.
 * If the database stored an HTML Mini App with 'interactive' + marker, maps it to 'html_app'.
 */
export function fromDbChapter<T extends Partial<Chapter>>(ch: T): T {
  if (isAudioChapter(ch)) {
    return {
      ...ch,
      content_type: 'audio',
      rich_text: extractAudioContent(ch.rich_text)
    };
  }
  if (isHtmlAppChapter(ch)) {
    return {
      ...ch,
      content_type: 'html_app',
      rich_text: extractHtmlAppContent(ch.rich_text)
    };
  }
  return ch;
}

