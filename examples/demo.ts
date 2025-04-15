import { MCPClient } from '../src/client.js';
import * as dotenv from 'dotenv';
import { defaultStorage } from '../src/storage/index.js';
import { existsSync } from 'fs';

dotenv.config();

/**
 * 演示程序
 * 展示MCP客户端和存储功能
 */
async function main() {
    console.log("=== MCP客户端演示程序 ===");
    
    try {
        // 1. 初始化MCP客户端
        console.log("\n1. 初始化MCP客户端...");
        const client = new MCPClient();
        await client.initialize();
        console.log("✅ MCP客户端初始化完成");
        
        // 2. 连接到服务器
        console.log("\n2. 连接到可用服务器...");
        const connectedServers = await client.connectToAllServers();
        
        if (connectedServers.length === 0) {
            console.error("❌ 未能连接到任何服务器，请检查配置");
            process.exit(1);
        }
        
        console.log(`✅ 已连接到 ${connectedServers.length} 个服务器:`, connectedServers.join(', '))
        
        // 3. 使用YouTube字幕工具（如果可用）
        if (client.getSession('youtube-transcript')) {
            console.log("\n3. 处理YouTube字幕...");
            
            // 示例YouTube视频URL - 使用用户指定的视频
            const youtubeUrl = "https://www.youtube.com/watch?v=AJpK3YTTKZ4"; // 短视频
            // const youtubeUrl = "https://www.youtube.com/watch?v=3haw9tY4A2g"; // 长视频
            
            try {
                console.log(`开始处理视频: ${youtubeUrl}`);
                const result = await client.processQuery(`${youtubeUrl} 总结这个的内容`);
                console.log("\n处理结果:", result);
                
                // 检查存储路径
                console.log("\n存储路径:", defaultStorage.getStoragePath());
                
                // 查找所有与YouTube相关的文件
                const youtubeFiles = defaultStorage.findByTags(["youtube"]);
                console.log(`\n✅ 找到 ${youtubeFiles.length} 个与YouTube相关的文件`);
                
                if (youtubeFiles.length > 0) {
                    console.log("\n处理的文件列表:");
                    youtubeFiles.forEach(file => {
                        console.log(`- ${file}`);
                        const fileMeta = defaultStorage.getMetadata(file.replace(defaultStorage.getStoragePath() + '/', ''));
                        if (fileMeta?.title) {
                            console.log(`  标题: ${fileMeta.title}`);
                        }
                    });
                } else {
                    console.log("\n❌ 没有找到任何YouTube相关文件");
                    // 检查存储目录是否存在
                    const storagePath = defaultStorage.getStoragePath();
                    console.log(`存储目录: ${storagePath}`);
                    console.log(`存储目录是否存在: ${existsSync(storagePath)}`);
                }
            } catch (error) {
                console.error("❌ 处理YouTube字幕失败:", error);
            }
        }
        
        console.log("\n演示程序执行完成!");
    } catch (error) {
        console.error("程序执行出错:", error);
    } finally {
        // 程序执行完成后自动退出
        process.exit(0);
    }
}

// 运行演示程序
main().catch(error => {
    console.error("程序执行出错:", error);
    process.exit(1);
}); 