/**
 * Robust JSON extraction and parsing utility for AI / LLM responses.
 */

export function safeParseAiJson<T = any>(text: string, fallback?: T): T {
  if (!text || typeof text !== 'string') {
    if (fallback !== undefined) return fallback;
    throw new Error('Empty AI response text');
  }

  const trimmed = text.trim();

  // Attempt 1: Direct parse
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // Attempt 2: Strip standard markdown fences
  const stripped = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(stripped);
  } catch (_) {}

  // Attempt 3: Balanced-brace scanner to safely isolate the exact JSON object or array
  const firstCurly = trimmed.indexOf('{');
  const firstSquare = trimmed.indexOf('[');

  let startIdx = -1;
  let isArray = false;

  if (firstCurly !== -1 && firstSquare !== -1) {
    if (firstCurly < firstSquare) {
      startIdx = firstCurly;
      isArray = false;
    } else {
      startIdx = firstSquare;
      isArray = true;
    }
  } else if (firstCurly !== -1) {
    startIdx = firstCurly;
    isArray = false;
  } else if (firstSquare !== -1) {
    startIdx = firstSquare;
    isArray = true;
  }

  if (startIdx !== -1) {
    const openChar = isArray ? '[' : '{';
    const closeChar = isArray ? ']' : '}';

    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

    for (let i = startIdx; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === '\\') {
        escape = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (ch === openChar) {
          depth++;
        } else if (ch === closeChar) {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx !== -1) {
      const balancedSubstring = trimmed.slice(startIdx, endIdx + 1).trim();
      try {
        return JSON.parse(balancedSubstring);
      } catch (_) {
        try {
          const sanitized = sanitizeJsonString(balancedSubstring);
          return JSON.parse(sanitized);
        } catch (_) {}
      }
    }
  }

  // Attempt 5: Slice between outermost braces as fallback
  const lastCurly = trimmed.lastIndexOf('}');
  if (firstCurly !== -1 && lastCurly > firstCurly) {
    const candidate = trimmed.slice(firstCurly, lastCurly + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch (_) {
      try {
        return JSON.parse(sanitizeJsonString(candidate));
      } catch (_) {}
    }
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Failed to parse valid JSON from AI output: ${trimmed.slice(0, 180)}...`);
}

function sanitizeJsonString(jsonStr: string): string {
  return jsonStr
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => {
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      if (c === '\t') return '\\t';
      return '';
    });
}
