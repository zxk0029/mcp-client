/**
 * 工具配置工厂
 * 
 * 提供用于创建工具配置的工厂函数
 */

import { ToolConfig, ToolResponse } from '../../types.js';

/**
 * 创建标准工具ID
 * @param serverName 服务器名称
 * @param toolName 工具名称
 * @returns 标准格式的工具ID
 */
export function createToolId(serverName: string, toolName: string): string {
    return `${serverName}__${toolName}`;
}

/**
 * 工具配置工厂函数
 * 创建标准化的工具配置对象
 * 
 * @param serverName 服务器名称
 * @param toolName 工具名称
 * @param options 工具选项
 * @returns 工具配置对象
 */
export function createToolConfig(
    serverName: string,
    toolName: string,
    options: {
        description?: string;
        systemPrompt?: string;
        saveOutput?: boolean;
        sendResultToAI?: boolean;
        responseHandler?: (content: any) => Promise<ToolResponse>;
        metadata?: Record<string, any>;
    } = {}
): ToolConfig {
    const config: ToolConfig = {
        name: toolName,
        systemPrompt: options.systemPrompt,
        saveOutput: options.saveOutput !== undefined ? options.saveOutput : true,
        sendResultToAI: options.sendResultToAI !== undefined ? options.sendResultToAI : false,
        responseHandler: options.responseHandler,
    };
    if (options.metadata) {
        // If ToolConfig type needs metadata, add it here
        // config.metadata = options.metadata; 
    }
    return config;
} 