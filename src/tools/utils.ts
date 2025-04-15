/**
 * 工具响应辅助函数
 * 
 * 提供用于处理和标准化工具响应的函数
 */

import {ToolResponse} from '../types.js';

/**
 * 创建标准化的工具响应对象
 * 确保所有字段都符合ToolResponse接口规范
 * 
 * @param options 工具响应选项
 * @returns 标准化的ToolResponse对象
 */
export function createToolResponse(
    options: {
        message?: string;
        paths?: Record<string, string>;
        rawContent?: any;
    } = {}
): ToolResponse {
    return {
        message: options.message || '',
        paths: options.paths || {},
        rawContent: options.rawContent || null
    };
}

/**
 * 验证工具响应是否符合标准格式
 * 
 * @param response 要验证的响应对象
 * @returns 标准化后的ToolResponse对象
 */
export function validateToolResponse(response: any): ToolResponse {
    // 如果输入为空或非对象，返回默认响应
    if (!response || typeof response !== 'object') {
        return createToolResponse({
            message: '无效的工具响应'
        });
    }
    
    // 确保所有字段都存在且类型正确
    return createToolResponse({
        message: typeof response.message === 'string' ? response.message : '',
        paths: response.paths && typeof response.paths === 'object' ? response.paths : {},
        rawContent: response.rawContent !== undefined ? response.rawContent : null
    });
}

/**
 * 合并多个工具响应
 * 
 * @param responses 要合并的响应数组
 * @returns 合并后的ToolResponse对象
 */
export function mergeToolResponses(responses: ToolResponse[]): ToolResponse {
    if (!responses || !Array.isArray(responses) || responses.length === 0) {
        return createToolResponse();
    }
    
    const validatedResponses = responses.map(validateToolResponse);
    
    // 合并消息
    const mergedMessage = validatedResponses
        .map(r => r.message)
        .filter(Boolean)
        .join('\n');
    
    // 合并文件路径
    const mergedPaths: Record<string, string> = {};
    for (const response of validatedResponses) {
        if (response.paths) {
            Object.assign(mergedPaths, response.paths);
        }
    }
    
    // 合并原始内容（如果多个，则使用数组）
    const rawContents = validatedResponses
        .map(r => r.rawContent)
        .filter(content => content !== undefined && content !== null);
    
    const mergedRawContent = rawContents.length === 1
        ? rawContents[0]
        : rawContents.length > 1
            ? rawContents
            : null;
    
    return {
        message: mergedMessage,
        paths: mergedPaths,
        rawContent: mergedRawContent
    };
} 