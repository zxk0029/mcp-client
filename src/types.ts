/**
 * Configuration for tool response handling and processing
 */
export interface ToolConfig {
    /** Tool name */
    name: string;
    /** Tool description (used for AI) */
    description?: string;
    /** Custom system prompt for the tool */
    systemPrompt?: string;
    /** Custom response handler */
    responseHandler?: (content: any) => Promise<any>;
    /** Whether to save tool output */
    saveOutput?: boolean;
    /** Whether to send the tool result back to the AI for further processing (e.g., summarization) */
    sendResultToAI?: boolean;
}

/**
 * 存储选项接口
 */
export interface StorageOptions {
    /** 标签（用于分类存储） */
    tags?: string[];
    /** 元数据（附加信息） */
    metadata?: Record<string, any>;
    /** 导出格式 */
    format?: string;
    /** 是否覆盖已存在的文件 */
    overwrite?: boolean;
}

/**
 * Storage handler interface for saving tool outputs
 */
export interface StorageHandler {
    /** Initialize storage system */
    initialize(): Promise<void>;
    
    /** Save content to storage */
    save(filename: string, content: any, options?: StorageOptions): Promise<string>;
    
    /** Read content from storage */
    read(filename: string, parseJson?: boolean): Promise<any>;
    
    /** Find files by tags */
    findByTags(tags: string[]): string[];
    
    /** Get metadata for a file */
    getMetadata(filename: string): Record<string, any> | undefined;
    
    /** Get storage path */
    getStoragePath(): string;
    
    /** Get subdirectory path */
    getSubdirectoryPath(subdir: string): string;
}

/**
 * Server configuration interface
 */
export interface ServerConfig {
    /** Server name */
    name: string;
    /** Server type */
    type: 'command' | 'sse';
    /** Command to start the server (for command type) */
    command?: string;
    /** Arguments for the command */
    args?: string[];
    /** Environment variables */
    env?: Record<string, string>;
    /** Server URL (for SSE type) */
    url?: string;
    /** Whether the server is available */
    isOpen: boolean;
    /** Default behavior for sending tool results to AI for this server */
    sendResultToAI?: boolean;
}

/**
 * Message interface for AI communication
 */
export interface Message {
    role: 'user' | 'assistant' | 'tool' | 'system';
    content: string;
    tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }>;
    tool_call_id?: string;
    name?: string;
}

/**
 * OpenAI tool interface
 */
export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

/**
 * 工具响应接口
 */
export interface ToolResponse {
    /** 响应消息 */
    message?: string;
    /** 保存的文件路径 */
    paths?: Record<string, string>;
    /** 原始内容 */
    rawContent?: any;
}

/**
 * 工具处理结果
 */
export interface ToolResult {
    /** 工具名称 */
    toolName: string;
    /** 处理结果 */
    result: any;
    /** 是否成功 */
    success: boolean;
    /** 错误信息 */
    error?: string;
}

/**
 * Result structure for the processQuery method
 */
export interface ProcessQueryResult {
    /** The full concatenated output log of the query process */
    fullOutput: string;
    /** The final content string from the AI after processing tool results, if available */
    finalAiResponse?: string; 
} 