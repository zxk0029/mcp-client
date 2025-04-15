import { createToolResponse } from '../utils.js';
import { ApiClient } from '../../api/ApiClient.js';
import { defaultStorage } from '../../storage/index.js';

// 元数据接口定义
interface VideoMetadata {
    title?: string;
    totalDuration?: string;
    [key: string]: any;
}

/**
 * 获取元数据字符串
 */
function getMetadataString(metadata: VideoMetadata | null): string {
    if (!metadata) {
        return '';
    }
    try {
        const { title, totalDuration } = metadata;
        const duration = totalDuration ? formatDuration(parseFloat(String(totalDuration))) : '未知时长';
        return `视频标题：${title || '未知'}\n时长：${duration}\n\n`;
    } catch (error) {
        console.error('解析元数据失败:', error);
        return '';
    }
}

/**
 * 格式化时长
 */
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

/**
 * 将文本分成多个块
 * 每个块大约包含30000个字符，并确保在段落边界处分割
 */
function splitIntoChunks(text: string, chunkSize: number = 30000): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    
    // 按段落分割
    const paragraphs = text.split(/\n\s*\n/);
    
    for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks;
}

/**
 * 计算token相关信息
 * 返回输入token数、输出token数和总token数
 */
function calculateTokens(transcript: string, isChunked: boolean = false): { 
    inputTokens: number; 
    outputTokens: number; 
    totalTokens: number;
} {
    // 粗略估计：1个中文字符约等于2个token，1个英文字符约等于1个token
    const chineseCharCount = (transcript.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishCharCount = transcript.length - chineseCharCount;
    const inputTokens = chineseCharCount * 2 + englishCharCount;
    
    // 根据是否分块决定输出token数
    let outputTokens;
    if (isChunked) {
        // 对于分块内容，尽量保留更多信息（最大8K）
        outputTokens = Math.floor(Math.min(Math.max(inputTokens / 2, 4000), 8000));
    } else {
        // 对于不分块内容，适当控制长度（最大4K）
        outputTokens = Math.floor(Math.min(Math.max(inputTokens / 4, 2000), 4000));
    }
    
    const totalTokens = inputTokens + outputTokens;
    
    return { inputTokens, outputTokens, totalTokens };
}

/**
 * 合并多个摘要
 */
async function mergeSummaries(summaries: string[]): Promise<string> {
    if (summaries.length === 1) {
        return summaries[0];
    }
    
    const apiClient = ApiClient.getInstance();
    const combinedSummary = summaries.join('\n\n---\n\n');
    
    // 计算合并摘要所需的token，标记为分块内容
    const { outputTokens } = calculateTokens(combinedSummary, true);
    
    const messages = [
        {
            role: "system",
            content: `你是一个专业的内容总结助手。请将以下多个摘要合并成一个连贯的、结构化的完整摘要。要求：
1. 保持所有重要观点和关键细节
2. 确保各部分之间的逻辑连贯性
3. 使用清晰的标题和子标题
4. 对于重要数据，保留具体数字
5. 对于技术概念，保留关键解释
6. 对于讨论或辩论，保留各方观点
7. 尽量保留原始内容的长度，不要过度压缩`
        },
        {
            role: "user",
            content: combinedSummary
        }
    ];
    
    try {
        const startTime = Date.now();
        console.log('开始合并摘要，总长度:', combinedSummary.length);
        
        const response = await apiClient.callDeepSeekChatCompletion(messages, {
            model: "deepseek-chat",
            temperature: 0.3,
            max_tokens: outputTokens
        });
        
        const endTime = Date.now();
        console.log(`合并摘要完成，耗时: ${(endTime - startTime) / 1000}秒`);
        
        if (!response.success || !response.data) {
            console.error('合并摘要失败:', response.error);
            return combinedSummary; // 如果合并失败，返回原始摘要的简单组合
        }
        
        const mergedSummary = response.data.choices?.[0]?.message?.content || combinedSummary;
        console.log('合并后摘要长度:', mergedSummary.length);
        return mergedSummary;
    } catch (error: any) {
        console.error('合并摘要时出错:', error);
        return combinedSummary;
    }
}

/**
 * 生成摘要的系统提示词
 */
const SUMMARY_SYSTEM_PROMPT = `你是一个专业的内容总结助手。请详细总结以下视频文本内容的主要观点和关键信息。要求：
1. 保留所有重要观点和关键细节
2. 保持原始内容的逻辑结构
3. 使用清晰的标题和子标题
4. 对于重要数据，尽量保留具体数字
5. 对于技术概念，保留关键解释
6. 对于讨论或辩论，保留各方观点`;

/**
 * 生成单个块的摘要
 */
async function generateChunkSummary(chunk: string, videoId: string, chunkIndex: number): Promise<string> {
    const apiClient = ApiClient.getInstance();
    const { outputTokens } = calculateTokens(chunk, false);
    
    const messages = [
        {
            role: "system",
            content: chunkIndex > 1 ? 
                `${SUMMARY_SYSTEM_PROMPT}\n\n这是视频的第 ${chunkIndex} 部分内容，请特别注意与前后内容的连贯性。` :
                SUMMARY_SYSTEM_PROMPT
        },
        {
            role: "user",
            content: chunk
        }
    ];
    
    try {
        const response = await apiClient.callDeepSeekChatCompletion(messages, {
            model: "deepseek-chat",
            temperature: 0.3,
            max_tokens: outputTokens
        });
        
        if (!response.success || !response.data) {
            console.error(`生成第 ${chunkIndex} 块摘要失败:`, response.error);
            return `第 ${chunkIndex} 部分摘要生成失败`;
        }
        
        return response.data.choices?.[0]?.message?.content || `第 ${chunkIndex} 部分摘要生成失败`;
    } catch (error: any) {
        console.error(`生成第 ${chunkIndex} 块摘要时出错:`, error);
        return `第 ${chunkIndex} 部分摘要生成失败: ${error.message}`;
    }
}

/**
 * 生成摘要
 */
async function generateSummary(transcript: string, videoId: string): Promise<string> {
    const startTime = Date.now();
    try {
        console.log('开始生成摘要，视频ID:', videoId);
        console.log('字幕内容长度:', transcript.length);
        
        // 计算token信息
        const { inputTokens, outputTokens, totalTokens } = calculateTokens(transcript, false);
        console.log('Token统计:');
        console.log('- 输入token:', inputTokens);
        console.log('- 输出token:', outputTokens);
        console.log('- 总token:', totalTokens);
        
        // 如果总token数超过64k，进行分块处理
        if (totalTokens > 64000) {
            console.log('内容过长，进行分块处理...');
            const chunks = splitIntoChunks(transcript);
            console.log(`字幕被分成 ${chunks.length} 个块`);
            
            const summaries: string[] = [];
            for (let i = 0; i < chunks.length; i++) {
                const chunkStartTime = Date.now();
                console.log(`处理第 ${i + 1}/${chunks.length} 块...`);
                const chunkSummary = await generateChunkSummary(chunks[i], videoId, i + 1);
                console.log(`第 ${i + 1} 块处理完成，耗时: ${(Date.now() - chunkStartTime) / 1000}秒`);
                summaries.push(chunkSummary);
            }
            
            console.log('开始合并摘要...');
            return await mergeSummaries(summaries);
        }
        
        // 如果内容不长，直接使用generateChunkSummary处理
        return await generateChunkSummary(transcript, videoId, 1);
    } catch (error: any) {
        console.error('生成摘要时出错:', error);
        return `生成摘要失败: ${error.message || '未知错误'}`;
    }
}

/**
 * 处理YouTube字幕
 */
export async function handleYoutubeTranscript(content: any): Promise<any> {
    try {
        // 验证输入内容
        if (!content) {
            return createToolResponse({
                message: '输入内容为空'
            });
        }

        // 打印内容结构，帮助调试
        console.log('YouTube字幕内容结构:', JSON.stringify(content, null, 2).substring(0, 300) + '...');

        // 1. 验证输入是包含至少一个对象的数组
        // (如果 content 可能是 JSON 字符串，先解析)
        let processedContent = content;
        if (typeof content === 'string') {
            try {
                processedContent = JSON.parse(content);
            } catch (error) {
                 console.error('解析JSON时出错:', error);
                 return createToolResponse({
                     message: `解析内容失败: ${error}`
                 });
            }
        }

        // 现在验证 processedContent
        if (!Array.isArray(processedContent) || processedContent.length === 0 || typeof processedContent[0] !== 'object' || processedContent[0] === null) {
             console.error('无效的服务器响应结构: 预期得到非空数组，实际得到:', processedContent);
             return createToolResponse({ message: '处理失败：服务器响应结构无效 (array)' });
        }
        
        // 2. 获取核心对象
        const firstItem = processedContent[0];

        // 3. 验证核心对象属性
        if (!firstItem.text || !firstItem.metadata) {
             console.error('无效的服务器响应结构: item 缺少 text 或 metadata', firstItem);
             return createToolResponse({ message: '处理失败：服务器响应结构无效 (item)' });
        }
        
        // 4. 验证 videoId
        if (typeof firstItem.metadata.videoId !== 'string' || !firstItem.metadata.videoId) {
             console.error('无效的服务器响应结构: metadata 缺少有效的 videoId', firstItem.metadata);
             return createToolResponse({ message: '处理失败：服务器响应缺少 videoId' });
        }

        // 5. 直接提取
        let transcriptTextRaw = firstItem.text; // 包含标题行
        const metadata: VideoMetadata = firstItem.metadata;
        const videoId = metadata.videoId;
        
        // 7. 处理 transcriptTextRaw (移除标题行)
        let transcript = transcriptTextRaw;
        if (transcriptTextRaw.startsWith('# ')) {
            const firstNewline = transcriptTextRaw.indexOf('\n');
            if (firstNewline !== -1) {
                // 获取标题后的内容并去除前导可能的空行/空格
                transcript = transcriptTextRaw.substring(firstNewline + 1).trimStart(); 
            }
        }
        
        console.log(`处理视频字幕: ${videoId}, 字幕长度: ${transcript.length}字符`);
        
        // 初始化存储
        await defaultStorage.initialize();
        
        // 创建完整元数据
        const fullMetadata: VideoMetadata = {
            ...metadata,
            processedAt: new Date().toISOString(),
            transcriptLength: transcript.length
        };
        
        // 添加标签
        const tags = ['youtube', 'transcript'];
        if (metadata?.title) tags.push('title:' + metadata.title);
        
        // 构建字幕内容(带元数据头)并保存
        const transcriptContentWithMeta = getMetadataString(metadata) + transcript;
        const transcriptPath = await defaultStorage.save(
            `youtube_transcripts/transcripts/${videoId}.txt`,
            transcriptContentWithMeta,
            {
                tags,
                metadata: fullMetadata
            }
        );
        
        // 生成摘要 (使用纯字幕文本 transcript)
        const summary = await generateSummary(transcript, videoId);
        
        // 保存原始JSON数据 (保存原始的 processedContent)
        const jsonPath = await defaultStorage.save(
            `youtube_transcripts/json/${videoId}.json`,
            processedContent, // 保存解析/验证后的内容
            {
                tags: [...tags, 'json', 'raw'],
                metadata: fullMetadata
            }
        );
        
        // 导出为Markdown并保存到summaries目录
        const markdownFilename = `youtube_transcripts/summaries/${videoId}.md`;
        const markdownPath = await defaultStorage.save(
            markdownFilename, 
            summary, 
            {
                tags: [...tags, 'markdown'],
                metadata: fullMetadata
            }
        );
        
        // 创建paths对象 - 移除 summary
        const paths: Record<string, string> = {
            transcript: transcriptPath,
            json: jsonPath,
            markdown: markdownPath
        };
        
        // 返回处理结果
        return createToolResponse({
            message: `已处理YouTube视频字幕: ${metadata?.title || videoId}，长度: ${transcript.length}字符，已生成摘要: ${summary.length}字符`,
            paths: paths,
            rawContent: { 
                transcript,
                summary, 
                videoId, 
                metadata: fullMetadata,
                exportFormats: ['markdown']
            }
        });

    } catch (error: any) {
        console.error('处理YouTube字幕时出错:', error);
        return createToolResponse({
            message: `处理YouTube字幕时出错: ${error.message || '未知错误'}`
        });
    }
} 