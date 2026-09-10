import { GoogleGenAI } from '@google/genai';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { safeParseAiJson } from '../_utils/parseAiJson';
import { generateContentWithRetry } from '../_utils/geminiCallWithRetry';
import { getGeminiApiKey } from './chat';

let aiInstance: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing');
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
}

export async function handleAnalyzeMessage(req: VercelRequest, res: VercelResponse) {
  try {
    const { messageText, lessonContext, analysisCriteria, lessonLanguage = 'en' } = req.body || {};

    if (!messageText || !messageText.trim()) {
      return res.status(400).json({ error: 'No text provided for analysis.' });
    }

    const ai = getAiClient();

    const langNameMap: Record<string, string> = {
      en: 'English',
      'pt-BR': 'Portuguese (Brazil)',
      pt: 'Portuguese',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian'
    };

    const targetLanguageName = langNameMap[lessonLanguage] || langNameMap[lessonLanguage.split('-')[0]] || 'English';

    const systemInstruction = `You are an expert educational AI assistant in emotional intelligence, communication, and relationship analysis.
Your task is to analyze the text or message sent by the student in the context of the course lesson.

GLOBAL LANGUAGE RULE:
All text values generated in the JSON response (level_title, explanation, signals, recommended_actions, avoid_actions, suggested_response, disclaimer, level) MUST BE WRITTEN STRICTLY IN ${targetLanguageName.toUpperCase()}!
Regardless of the language used in the student's input message (e.g. if student inputs Portuguese text into an English lesson), evaluate its meaning accurately, BUT write all analysis results, explanations, level titles, signals, recommendations, and disclaimers strictly in ${targetLanguageName}!

REQUIRED JSON FORMAT:
{
  "level": "COLD" | "WARM" | "HOT" | "ALERT" | "NEUTRAL",
  "level_title": "Descriptive title of level in ${targetLanguageName} (Ex: INTEREST LEVEL: WARM / DEFENSIVE COMMUNICATION)",
  "explanation": "Warm, direct explanation of message meaning in ${targetLanguageName}",
  "signals": ["Identified signal 1 in ${targetLanguageName}", "Identified signal 2"],
  "recommended_actions": ["What to do 1 in ${targetLanguageName}", "What to do 2"],
  "avoid_actions": ["What NOT to do 1 in ${targetLanguageName}", "What NOT to do 2"],
  "suggested_response": "Suggested posture or response strategy in ${targetLanguageName}",
  "disclaimer": "Educational disclaimer in ${targetLanguageName}: This is an educational interpretation based on lesson criteria. Isolated messages do not determine definitive feelings."
}

CLASSIFICATION GUIDELINES:
1. COLD / FRIO ❄️: Short, distant, evasive, single-word reply, no return questions, or clear disinterest.
2. WARM / MORNO 🌤️: Casual curiosity, friendly greeting, light checking-in, receptive without deep commitment.
3. HOT / QUENTE 🔥: Clear initiative, emotional openness, direct invitation, vulnerability, or genuine desire to connect.
4. ALERT / ALERTA ⚠️: Manipulative, aggressive, passive-aggressive, or guilt-tripping message.

Provide empathetic, clear, non-judgmental guidance prioritizing self-respect and emotional stability.`;

    const prompt = `Contexto da Aula: ${lessonContext || 'Análise de Mensagem do Relacionamento'}
Critérios Específicos do Curso: ${analysisCriteria || 'Interpretação de interesse e intenção com foco na autoproteção e inteligência emocional'}
Mensagem enviada pela aluna para analisar:
"${messageText}"`;

    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];

    const result = await generateContentWithRetry({
      ai,
      candidateModels,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.5,
        responseMimeType: 'application/json',
      },
      maxAttemptsPerModel: 2,
      baseDelayMs: 1200,
      logPrefix: '[Analyze Message API]'
    });

    const responseText = result.text;

    let parsedData: any = null;
    try {
      parsedData = safeParseAiJson(responseText);
    } catch (parseErr) {
      console.error('[Analyze Message API] JSON parse error:', responseText);
      return res.status(500).json({ error: 'Failed to format message analysis in JSON.' });
    }

    return res.status(200).json({
      success: true,
      analysis: parsedData
    });

  } catch (error: any) {
    console.error('[Analyze Message API] Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while analyzing message'
    });
  }
}
