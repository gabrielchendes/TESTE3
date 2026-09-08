import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';

export interface GeminiRetryOptions {
  ai: GoogleGenAI;
  candidateModels?: string[];
  contents: GenerateContentParameters['contents'];
  config?: GenerateContentParameters['config'];
  maxAttemptsPerModel?: number;
  baseDelayMs?: number;
  logPrefix?: string;
}

export function isRetryableGeminiError(error: any): boolean {
  if (!error) return false;
  const rawStr = typeof error === 'string' ? error : (JSON.stringify(error) || String(error));
  const msg = (error.message || error.error?.message || rawStr).toLowerCase();
  const status = error.status || error.code || error.statusCode || error.error?.code || error.error?.status;

  if (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 504 ||
    status === 'UNAVAILABLE' ||
    status === 'RESOURCE_EXHAUSTED'
  ) {
    return true;
  }

  if (
    msg.includes('high demand') ||
    msg.includes('spikes in demand') ||
    msg.includes('unavailable') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota exceeded') ||
    msg.includes('overloaded') ||
    msg.includes('try again later') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  ) {
    return true;
  }

  return false;
}

export async function generateContentWithRetry(
  options: GeminiRetryOptions
): Promise<{ text: string; modelUsed: string; response: GenerateContentResponse }> {
  const {
    ai,
    candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'],
    contents,
    config,
    maxAttemptsPerModel = 2,
    baseDelayMs = 800,
    logPrefix = '[Gemini Call]'
  } = options;

  let lastError: any = null;

  for (const modelName of candidateModels) {
    for (let attempt = 1; attempt <= maxAttemptsPerModel; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config,
        });

        if (response.text) {
          return {
            text: response.text,
            modelUsed: modelName,
            response,
          };
        }
      } catch (err: any) {
        lastError = err;
        const isRetryable = isRetryableGeminiError(err);
        const rawErrStr = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || String(err));

        console.warn(
          `${logPrefix} Model ${modelName} (attempt ${attempt}/${maxAttemptsPerModel}) error:`,
          rawErrStr
        );

        // If high demand 503 error, immediately fall through to the next candidate model
        const isHighDemand = rawErrStr.toLowerCase().includes('high demand') ||
                             rawErrStr.toLowerCase().includes('unavailable') ||
                             err?.status === 503 ||
                             err?.code === 503 ||
                             err?.error?.code === 503;

        if (isHighDemand) {
          console.info(`${logPrefix} Model ${modelName} experiencing high demand; falling over immediately to next candidate model.`);
          break;
        }

        if (!isRetryable && attempt === 1) {
          break;
        }

        const delay = Math.round(
          baseDelayMs * Math.pow(1.5, attempt - 1) + Math.random() * 300
        );

        if (attempt < maxAttemptsPerModel || modelName !== candidateModels[candidateModels.length - 1]) {
          console.info(`${logPrefix} Waiting ${delay}ms before retrying or switching models...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  throw lastError || new Error(`${logPrefix} All candidate models failed to generate content.`);
}
