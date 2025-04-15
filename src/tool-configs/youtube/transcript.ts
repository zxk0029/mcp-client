/**
 * YouTube 字幕工具配置
 * 
 * 用于获取和处理 YouTube 视频字幕
 */

import { createToolConfig } from '../utils/index.js';
import { getToolHandler } from '../../tools/index.js';

/**
 * YouTube 字幕工具配置
 */
const youtubeTranscriptTool = createToolConfig(
    'youtube-transcript',
    'get_transcripts',
    {
        description: '获取和处理 YouTube 视频字幕',
        systemPrompt: '你是一个能够获取 YouTube 视频字幕并提供摘要的助手。',
        saveOutput: true,
        sendResultToAI: false,
        responseHandler: getToolHandler('youtube-transcript__get_transcripts')
    }
);

export default youtubeTranscriptTool;