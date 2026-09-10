import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAiChat } from '../_ai/chat';

function parseRequestBody(req: VercelRequest): Record<string, any> {
  let body = req.body;
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      return {};
    }
  }
  return typeof body === 'object' ? body : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  req.body = parseRequestBody(req);

  try {
    return await handleAiChat(req, res);
  } catch (error: any) {
    console.error('[AI Chat Handler Error]:', error);
    return res.status(500).json({
      error: error?.message || 'Internal server error in AI chat endpoint.'
    });
  }
}
