# MCP 工具配置系统

本目录包含 MCP 客户端的工具配置系统，用于管理各种工具配置并提供一致的接口。

## 设计理念

1. **模块化**: 每个工具或相关工具集有自己独立的配置文件，便于维护和扩展。
2. **分类管理**: 按类别 (例如 YouTube、EVM) 组织工具配置。
3. **统一接口**: 所有工具配置遵循相同的接口规范，推荐使用 `createToolConfig` 工厂创建。
4. **可扩展性**: 支持通过添加新的配置文件并更新 `index.ts` 来添加新工具配置。

## 目录结构 (示例)

```
src/tool-configs/
├── README.md            # 本文档
├── index.ts             # 主入口，合并并导出**静态**工具配置
├── utils/               # 工具配置相关的辅助函数
│   └── configFactory.ts # 创建工具配置的工厂函数
│   └── index.ts         # 导出 utils
├── youtube/             # YouTube 相关工具
│   └── transcript.ts    # 字幕工具配置
└── ...                  # 其他静态工具配置
```

## 配置格式 (使用工厂函数)

推荐使用 `createToolConfig` 工厂函数创建配置，它能确保结构一致性并提供默认值。

```typescript
// 示例: src/tool-configs/some-tool.ts
import { createToolConfig } from './utils/configFactory.js';
import { ToolResponse } from '../../types.js'; // 确认路径

const serverName = 'your-server';
const toolName = 'your-tool';

const toolConfig = createToolConfig(serverName, toolName, {
  // description: '工具描述 (通常由服务器提供)',
  // systemPrompt: '给 AI 的系统提示 (可选)',
  saveOutput: false, // 是否保存输出 (默认 true)
  sendResultToAI: true, // 是否将结果发送回 AI (默认 false)
  responseHandler: async (content: any): Promise<ToolResponse> => {
    // 自定义处理服务器返回的 content
    console.log("[Handler] Received:", content);
    let message = "处理完成。";
    // ... 解析 content, 生成 message ...
    return {
      rawContent: content, // 保留原始数据
      message: message // 生成用户友好的消息
    };
  },
  // metadata: { ... } // 其他元数据 (可选)
});

export default { [createToolId(serverName, toolName)]: toolConfig }; // 按 ToolID 导出
```

## 配置加载与使用

在 `MCPClient` 中，工具配置的加载和使用流程如下：

1.  **初始化**: 
    ```typescript
    // index.ts 或 client 实例化时
    await client.initialize(); 
    ```
    `initialize` 方法会调用 `loadToolConfigs`，后者调用 `src/tool-configs/index.ts` 中的 `getToolConfigs()`。`getToolConfigs` 负责合并所有分散定义的配置（如 `youtubeTranscriptTool`, `evmToolsConfigs` 等）到一个大的配置映射中。这个映射以 `serverName__toolName` 作为键，存储在客户端实例的 `this.toolConfigs` 中。

2.  **连接与工具发现**: 
    ```typescript
    // cli.ts 或连接逻辑中
    await client.connectToServer(serverConfig);
    await client.discoverAndRegisterAllTools();
    ```
    当客户端连接到一个服务器（如 `evm-mcp-server`）并调用 `discoverAndRegisterAllTools` 时，它会：
    *   通过 MCP 协议向服务器请求其可用工具列表 (`session.listTools()`)。
    *   对于服务器返回的每个工具名 (如 `getBalance`)，客户端构造完整的工具 ID (`evm-mcp-server__getBalance`)。
    *   使用这个 ID 在**预加载的** `this.toolConfigs` 映射中查找对应的配置。
    *   如果找到匹配的配置，就认为该工具被"注册"了（意味着客户端知道如何处理它，例如是否将结果发给 AI）。日志中显示的"registered tools"数量反映了找到匹配配置的工具数。

3.  **工具调用与处理**: 
    ```typescript
    // client.processQuery 内部
    const result = await session.callTool({ name: toolName, arguments: args });
    // Client looks up configuration using getToolConfig(toolFullName)
    await this.processToolResponse(toolFullName, result.content, toolCall);
    ```
    当 AI 选择调用一个工具时：
    *   客户端向对应服务器发送 `callTool` 请求。
    *   收到服务器响应 (`result.content`) 后，客户端使用完整的工具 ID (`toolFullName`) 调用 `MCPClient.getToolConfig` 查找对应的配置。
    *   **配置查找逻辑 (`getToolConfig`)**: 
        *   首先，在 `this.toolConfigs` (通过 `getToolConfigs` 加载的静态配置) 中查找精确匹配的配置。
        *   如果**未找到**静态配置，则检查服务器名称。对于预定义的服务器列表（如 `evm-mcp-server`），会**动态生成一个默认配置**（例如，设置 `sendResultToAI: true`）并返回。
        *   如果既没有静态配置，也不属于需要动态默认配置的服务器，则返回 `undefined`。
    *   根据找到的配置（静态或动态生成的默认配置），决定后续行为：
        *   如果配置中定义了 `responseHandler`，则调用它来处理 `result.content`。
        *   根据配置中的 `sendResultToAI` 标志（无论是静态设置还是动态默认设置），决定是否将结果发送回 AI。

## 添加新工具配置

如果你需要为某个工具（即使是来自 `evm-mcp-server` 这种有动态默认配置的服务器上的工具）添加**特定的、非默认**的行为（例如自定义 `responseHandler` 或设置 `sendResultToAI: false`），你可以：

1.  在 `src/tool-configs/` 下（或其子目录）创建新的配置文件（如 `my-specific-evm-tool.ts`）。
2.  使用 `createToolConfig` 工厂函数实现该特定工具的详细配置。
3.  在 `src/tool-configs/index.ts` 的 `getToolConfigs()` 函数中，导入你的新配置并将其合并到返回的总配置对象中。这个**静态配置会优先于**动态生成的默认配置被使用。

## 注意事项

- 客户端查找配置使用的键是标准的工具 ID (`serverName__toolName`)。
- 确保 `createToolConfig` 的参数和 `ToolConfig` 类型定义保持同步。
- 对于没有静态配置、也不属于动态默认配置范围的工具，客户端仍会尝试执行调用（如果 AI 请求），但后续处理将按最基本的方式进行（无 `responseHandler`，`sendResultToAI` 为 `false`）。 