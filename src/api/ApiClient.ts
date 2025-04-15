/**
 * API客户端管理器
 *
 * 集中管理所有API客户端，提供统一的接口调用各种API服务
 */

import OpenAI from 'openai';

/**
 * API类型枚举
 */
export enum ApiType {
    OPENAI = 'openai',
    DEEPSEEK = 'deepseek'
}

/**
 * API配置接口
 */
export interface ApiConfig {
    /** API类型 */
    type: ApiType;
    /** API密钥 */
    apiKey?: string;
    /** API基础URL */
    apiBase?: string;
    /** 其他配置选项 */
    options?: Record<string, any>;
}

/**
 * API响应接口
 */
export interface ApiResponse<T = any> {
    /** 是否成功 */
    success: boolean;
    /** 响应数据 */
    data?: T;
    /** 错误信息 */
    error?: string;
    /** 原始响应 */
    raw?: any;
}

/**
 * API客户端管理器类
 */
export class ApiClient {
    private openaiClient: OpenAI | null = null;
    private configs: Map<ApiType, ApiConfig> = new Map();
    private static instance: ApiClient | null = null;

    /**
     * 构造函数 - 私有，使用getInstance获取实例
     */
    private constructor() {
        // 从环境变量加载默认配置
        this.loadConfigsFromEnv();
    }

    /**
     * 获取ApiClient单例
     */
    static getInstance(): ApiClient {
        if (!ApiClient.instance) {
            ApiClient.instance = new ApiClient();
        }
        return ApiClient.instance;
    }

    /**
     * 从环境变量加载API配置
     */
    private loadConfigsFromEnv(): void {
        // DeepSeek配置
        const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
        const deepseekApiBase = process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1';

        if (deepseekApiKey) {
            this.setConfig(ApiType.DEEPSEEK, {
                type: ApiType.DEEPSEEK,
                apiKey: deepseekApiKey,
                apiBase: deepseekApiBase
            });
        }

        // OpenAI配置
        const openaiApiKey = process.env.OPENAI_API_KEY;
        const openaiApiBase = process.env.OPENAI_API_BASE;

        if (openaiApiKey) {
            this.setConfig(ApiType.OPENAI, {
                type: ApiType.OPENAI,
                apiKey: openaiApiKey,
                apiBase: openaiApiBase
            });
        }
    }

    /**
     * 设置API配置
     * @param type API类型
     * @param config 配置对象
     */
    setConfig(type: ApiType, config: ApiConfig): void {
        this.configs.set(type, config);

        // 如果是OpenAI，重新初始化客户端
        if (type === ApiType.OPENAI && config.apiKey) {
            this.initOpenAIClient(config);
        }
    }

    /**
     * 获取API配置
     * @param type API类型
     * @returns 配置对象
     */
    getConfig(type: ApiType): ApiConfig | undefined {
        return this.configs.get(type);
    }

    /**
     * 初始化OpenAI客户端
     * @param config 配置对象
     */
    private initOpenAIClient(config: ApiConfig): void {
        if (!config.apiKey) {
            console.warn('未提供API密钥，无法初始化OpenAI客户端');
            return;
        }

        this.openaiClient = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.apiBase,
            ...config.options
        });
    }

    /**
     * 获取OpenAI客户端
     * @returns OpenAI客户端
     */
    getOpenAIClient(): OpenAI {
        if (!this.openaiClient) {
            const config = this.configs.get(ApiType.OPENAI);
            if (config?.apiKey) {
                this.initOpenAIClient(config);
            } else {
                // 尝试使用DeepSeek配置初始化
                const deepseekConfig = this.configs.get(ApiType.DEEPSEEK);
                if (deepseekConfig?.apiKey) {
                    this.initOpenAIClient({
                        type: ApiType.OPENAI,
                        apiKey: deepseekConfig.apiKey,
                        apiBase: deepseekConfig.apiBase
                    });
                } else {
                    throw new Error('未配置API密钥，无法获取OpenAI客户端');
                }
            }
        }

        if (!this.openaiClient) {
            throw new Error('初始化OpenAI客户端失败');
        }

        return this.openaiClient;
    }

    /**
     * 使用fetch API调用服务
     * @param url 请求URL
     * @param options 请求选项
     * @param retries 重试次数
     * @returns 响应对象
     */
    async fetchApi<T = any>(
        url: string,
        options: RequestInit = {},
        retries = 3
    ): Promise<ApiResponse<T>> {
        let lastError;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                if (attempt > 0) {
                    console.log(`第${attempt}次重试调用API: ${url}`);
                    // 指数退避策略
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
                }

                const response = await fetch(url, options);

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`API请求失败 (${response.status}): ${text}`);
                }

                const data = await response.json();

                return {
                    success: true,
                    data,
                    raw: response
                };
            } catch (error: any) {
                lastError = error;
                console.error(`API调用错误 (尝试${attempt + 1}/${retries + 1}):`, error.message);

                // 如果是最后一次尝试，抛出错误
                if (attempt === retries) {
                    break;
                }
            }
        }

        return {
            success: false,
            error: lastError?.message || '未知错误',
            raw: lastError
        };
    }

    /**
     * 调用DeepSeek聊天补全API
     * @param messages 消息数组
     * @param options 请求选项
     * @returns 响应对象
     */
    async callDeepSeekChatCompletion(
        messages: Array<{ role: string, content: string }>,
        options: {
            model?: string;
            temperature?: number;
            max_tokens?: number;
        } = {}
    ): Promise<ApiResponse> {
        const config = this.configs.get(ApiType.DEEPSEEK);

        if (!config?.apiKey) {
            return {
                success: false,
                error: '未配置DeepSeek API密钥'
            };
        }

        const url = `${config.apiBase || 'https://api.deepseek.com/v1'}/chat/completions`;

        const requestOptions: RequestInit = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: options.model || 'deepseek-chat',
                messages,
                temperature: options.temperature,
                max_tokens: options.max_tokens
            })
        };

        return this.fetchApi(url, requestOptions);
    }

    /**
     * 使用OpenAI SDK调用聊天补全API
     * @param messages 消息数组
     * @param options 请求选项
     * @returns 响应对象
     */
    async callOpenAIChatCompletion(
        messages: Array<{ role: string, content: string }>,
        options: {
            model?: string;
            temperature?: number;
            max_tokens?: number;
            tools?: any[];
            tool_choice?: any;
        } = {}
    ): Promise<ApiResponse> {
        try {
            const client = this.getOpenAIClient();

            const completion = await client.chat.completions.create({
                model: options.model || 'deepseek-chat',
                messages: messages as any,
                temperature: options.temperature,
                max_tokens: options.max_tokens,
                tools: options.tools,
                tool_choice: options.tool_choice
            });

            return {
                success: true,
                data: completion,
                raw: completion
            };
        } catch (error: any) {
            console.error('OpenAI API调用错误:', error.message);
            return {
                success: false,
                error: error.message,
                raw: error
            };
        }
    }
} 