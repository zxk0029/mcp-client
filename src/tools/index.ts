import { ToolResponse } from '../types.js';
import { handleYoutubeTranscript } from './youtube/transcriptHandler.js';
import { validateToolResponse } from './utils.js';

type ToolHandlers = {
  [key: string]: (response: any) => Promise<ToolResponse>;
};

/**
 * 包装处理器函数，确保返回的响应符合ToolResponse接口规范
 * @param handler 原始处理器函数
 * @returns 包装后的处理器函数
 */
const wrapToolHandler = (handler: (content: any) => Promise<any>) => {
  return async (content: any): Promise<any> => {
    try {
      // 打印接收到的内容类型，帮助调试
      console.log(`工具处理器收到内容类型: ${typeof content}`);
      
      // 调用原始处理函数
      const result = await handler(content);
      
      // 验证并返回结果
      return validateToolResponse(result);
    } catch (error) {
      console.error('工具处理器错误:', error);
      // 返回错误响应
      return validateToolResponse({
        message: `工具处理错误: ${error}`
      });
    }
  };
};

// 将所有工具处理器集中导出
export const toolHandlers: ToolHandlers = {
  'youtube-transcript__get_transcripts': wrapToolHandler(handleYoutubeTranscript),
  // 可以在这里添加更多工具处理器
};

/**
 * 根据工具ID获取处理器
 * @param toolId 工具ID
 * @returns 工具处理器函数，如果未找到则返回null
 */
export function getToolHandler(toolId: string) {
  return toolHandlers[toolId] || null;
} 