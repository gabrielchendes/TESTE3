import { VercelRequest, VercelResponse } from '@vercel/node';
import { handleAiChat } from '../_ai/chat';
import { handleAiCourseEditor } from '../_ai/courseEditor';
import { handleAnalyzeMessage } from '../_ai/analyzeMessage';
import { handleBuildCompleteCourse } from '../_ai/buildCourse';
import { handleGenerateCourseCopy } from '../_ai/courseCopy';
import { handleGenerateLesson } from '../_ai/generateLesson';
import { handleRefineSalesCopy } from '../_ai/refineCopy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '';
  const queryAction = req.query?.action as string;
  const pathParts = url.split('?')[0].split('/');
  const urlAction = pathParts[pathParts.length - 1];
  const bodyAction = req.body?.action as string;

  let action = queryAction || bodyAction || urlAction;

  // Normalize action name
  if (action) {
    action = action.toLowerCase().trim();
  }

  try {
    switch (action) {
      case 'ai-chat':
      case 'chat':
        return await handleAiChat(req, res);

      case 'ai-course-editor':
      case 'course-editor':
      case 'course_editor':
        return await handleAiCourseEditor(req, res);

      case 'analyze-message':
      case 'analyze':
      case 'message-analyzer':
        return await handleAnalyzeMessage(req, res);

      case 'build-complete-course':
      case 'build-course':
      case 'build_course':
        return await handleBuildCompleteCourse(req, res);

      case 'generate-course-copy':
      case 'course-copy':
      case 'course_copy':
        return await handleGenerateCourseCopy(req, res);

      case 'generate-lesson':
      case 'lesson':
      case 'generate_lesson':
        return await handleGenerateLesson(req, res);

      case 'refine-sales-copy':
      case 'refine-copy':
      case 'refine_copy':
        return await handleRefineSalesCopy(req, res);

      default:
        return res.status(400).json({
          error: `Invalid or missing AI action: "${action}". Supported actions: ai-chat, ai-course-editor, analyze-message, build-complete-course, generate-course-copy, generate-lesson, refine-sales-copy.`
        });
    }
  } catch (error: any) {
    console.error(`[AI Router Error] Action "${action}":`, error);
    return res.status(500).json({
      error: error.message || 'Internal server error in AI handler'
    });
  }
}
