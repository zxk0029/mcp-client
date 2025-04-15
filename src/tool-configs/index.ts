/**
 * 工具配置管理
 * 
 * 负责从 MCP Service 获取工具列表，并提供工具配置管理功能
 */

import {ToolConfig} from '../types.js';
import youtubeTranscriptTool from './youtube/transcript.js';

/**
 * 工具配置缓存
 * 用于存储从 Service 获取的工具配置
 */
const toolConfigs: Record<string, ToolConfig> = {
    'youtube-transcript__get_transcripts': youtubeTranscriptTool,
};

/**
 * 获取所有工具配置
 */
export function getToolConfigs(): Record<string, ToolConfig> {
    return {
        ...toolConfigs
    };
}