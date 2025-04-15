import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport, StdioServerParameters} from '@modelcontextprotocol/sdk/client/stdio.js';
import {SSEClientTransport} from '@modelcontextprotocol/sdk/client/sse.js';
import {homedir} from 'os';
import * as dotenv from 'dotenv';
import config from '../mcp-server-config.js';
import {Message, OpenAITool, ProcessQueryResult, ServerConfig, StorageHandler, ToolConfig} from './types.js';
import {parse} from 'path';
import {FileSystemStorage} from './storage/index.js';
import {ApiClient} from './api/ApiClient.js';

// Import tool configurations
import {getToolConfigs} from './tool-configs/index.js';
// import {createToolConfig} from './tool-configs/utils/index.js'; // Removed as it's unused after refactoring
import * as process from "node:process";

dotenv.config();

/**
 * MCP Client Class
 * Used for interacting with MCP servers
 */
export class MCPClient {
    /**
     * Get list of open servers from configuration
     * @returns {string[]} Array of server names that are marked as open
     */
    static getOpenServers(): string[] {
        return config.filter(cfg => cfg.isOpen).map(cfg => cfg.name);
    }

    private sessions: Map<string, Client> = new Map();
    private transports: Map<string, StdioClientTransport | SSEClientTransport> = new Map();
    private toolConfigs: Map<string, ToolConfig> = new Map();
    private storage: StorageHandler;
    private apiClient: ApiClient;
    private serverConfigs: Map<string, ServerConfig> = new Map();

    /**
     * Create a new MCP client
     * @param storage Storage handler
     */
    constructor(storage?: StorageHandler) {
        // Initialize storage
        this.storage = storage || new FileSystemStorage();

        // Initialize API client
        this.apiClient = ApiClient.getInstance();

        // Load server configurations into the map
        for (const cfg of config) {
            this.serverConfigs.set(cfg.name, cfg);
        }
    }

    /**
     * Load tool configurations
     */
    private async loadToolConfigs(): Promise<Map<string, ToolConfig>> {
        // Load configurations from imported settings into the local map
        const configs = getToolConfigs();

        for (const [id, config] of Object.entries(configs)) {
            this.toolConfigs.set(id, config);
        }

        return this.toolConfigs;
    }

    /**
     * Initialize the client
     */
    async initialize(): Promise<void> {
        try {
            // Initialize storage system
            await this.storage.initialize();

            // Load tool configurations
            await this.loadToolConfigs();
        } catch (error) {
            console.error('Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Create MCPClient instance from command line arguments
     * @param {string} serverPath - Path to server script (JS or Python)
     * @returns {Promise<MCPClient>} New MCPClient instance connected to the server
     * @throws {Error} If connection fails
     */
    static async fromCommandLine(serverPath: string): Promise<MCPClient> {
        const parsedPath = parse(serverPath);
        const client = new MCPClient();
        await client.initialize();

        // Determine base command based on file extension
        const isPy = serverPath.endsWith('.py');
        const baseCommand = isPy
            ? process.platform === "win32" ? "python" : "python3"
            : process.execPath; // Use current Node executable path

        const serverConfig: ServerConfig = {
            name: parsedPath.name,
            type: 'command',
            command: baseCommand, // e.g., "node" or "python3"
            args: [serverPath],   // The script path is the argument
            // env: {}, // Let environment inherit by default in CLI mode unless specified
            isOpen: true
        };

        await client.connectToServer(serverConfig);
        return client;
    }

    /**
     * Connect to an MCP server using provided configuration
     * @param {ServerConfig} serverConfig - Server configuration object
     * @throws {Error} If connection fails or configuration is invalid
     */
    async connectToServer(serverConfig: ServerConfig): Promise<void> {
        let transport: StdioClientTransport | SSEClientTransport;

        if (serverConfig.type === 'command') { // Simplified check as command presence is checked in createCommandTransport
            transport = await this.createCommandTransport(serverConfig); // Pass the whole config
        } else if (serverConfig.type === 'sse' && serverConfig.url) {
            transport = this.createSSETransport(serverConfig.url);
        } else {
            throw new Error(`Invalid or unsupported server configuration type for: ${serverConfig.name}`);
        }

        const client = new Client(
            {
                name: "mcp-client",
                version: "1.0.0"
            },
            {
                capabilities: {
                    prompts: {},
                    resources: {},
                    tools: {}
                }
            }
        );
        await client.connect(transport);

        this.sessions.set(serverConfig.name, client);
        this.transports.set(serverConfig.name, transport);
    }

    /**
     * Create a command-based transport
     * @param serverConfig The server configuration object
     * @returns Promise resolving to a command transport
     * @throws Error if command is missing
     */
    private async createCommandTransport(serverConfig: ServerConfig): Promise<StdioClientTransport> {
        return new Promise((resolve, reject) => {
            if (!serverConfig.command) {
                return reject(new Error(`Missing command for server ${serverConfig.name}`));
            }

            const cmd = serverConfig.command;
            // Process tilde expansion for arguments
            const args = (serverConfig.args || []).map(arg => {
                if (arg.startsWith('~/')) {
                    return arg.replace('~', homedir());
                }
                return arg;
            });

            // Merge process.env with serverConfig.env, serverConfig.env takes precedence
            const baseEnv = Object.fromEntries(
                Object.entries(process.env).filter(([_, v]) => v !== undefined)
            ) as Record<string, string>;
            const mergedEnv = {
                ...baseEnv,
                ...(serverConfig.env || {}) // serverConfig.env overrides baseEnv
            };

            const serverParams: StdioServerParameters = {
                command: cmd,
                args: args,
                env: mergedEnv
            };

            const transport = new StdioClientTransport(serverParams);
            resolve(transport);
        });
    }

    /**
     * Create an SSE-based transport
     * @param url Server URL
     * @returns SSE transport
     */
    private createSSETransport(url: string): SSEClientTransport {
        return new SSEClientTransport(new URL(url));
    }

    /**
     * Get a tool configuration by ID
     * @param toolId Tool ID in format 'serverName__toolName'
     * @returns Tool configuration if found, or a default config for specific servers, undefined otherwise
     */
    getToolConfig(toolId: string): ToolConfig | undefined {
        // 1. Try to get a specific, statically defined configuration first
        return this.toolConfigs.get(toolId);
    }

    /**
     * Process tool response with appropriate handler
     */
    private async processToolResponse(
        toolFullName: string,
        content: any
    ): Promise<string[]> {
        const outputText: string[] = [];
        const config = this.getToolConfig(toolFullName);

        try {
            // Add tool call information to output
            // outputText.push(`[Executing tool: ${toolFullName}]`);

            // Use custom handler if available
            if (config?.responseHandler) {
                // console.log('Using custom handler for:', toolFullName);
                let handlerResponse = await config.responseHandler(content);

                // Validate response format
                try {
                    // Import validation function
                    const {validateToolResponse} = await import('./tools/utils.js');
                    // Ensure the response conforms to the ToolResponse interface specification
                    handlerResponse = validateToolResponse(handlerResponse);

                    // Print the file storage path generated by the handler (saving is controlled by the handler, paths returns the stored file address)
                    if (handlerResponse.paths && config.saveOutput) {
                        for (const [format, filePath] of Object.entries(handlerResponse.paths)) {
                            if (!filePath) continue;
                        }
                    }

                    // If there is no message but there is raw content, try to extract a simple description
                    if (!handlerResponse.message && handlerResponse.rawContent) {
                        if (typeof handlerResponse.rawContent === 'string') {
                            outputText.push(handlerResponse.rawContent.substring(0, 100) + '...');
                        } else if (handlerResponse.rawContent && typeof handlerResponse.rawContent === 'object') {
                            outputText.push('Processing successful, structured data obtained');
                        }
                    }
                } catch (validationError) {
                    console.warn('Error validating tool response, using raw response:', validationError);
                    // Directly add raw content to output
                    if (typeof content === 'string') {
                        outputText.push(content);
                    } else if (content && typeof content === 'object') {
                        outputText.push(JSON.stringify(content, null, 2));
                    }
                }
            } else {
                // console.log('No custom handler for:', toolFullName);

                // Directly add raw content to output
                if (typeof content === 'string') {
                    outputText.push(content);
                } else if (content && typeof content === 'object') {
                    outputText.push(JSON.stringify(content, null, 2));
                }
            }
        } catch (error) {
            console.error('Error processing tool response:', error);
            outputText.push(`[Error processing ${toolFullName}: ${error}]`);
        }

        return outputText;
    }

    /**
     * Fetches and formats the list of available tools from all connected servers.
     * @returns {Promise<OpenAITool[]>} A promise that resolves to an array of tools formatted for the OpenAI API.
     * @private
     */
    private async _getAvailableToolsFormatted(): Promise<OpenAITool[]> {
        const availableTools: OpenAITool[] = [];
        for (const [serverName, session] of this.sessions) {
            try {
                const response = await session.listTools();
                const tools = response.tools.map(tool => {
                    const fullName = `${serverName}__${tool.name}`;
                    let description = `[${serverName}] ${tool.description || ''}`;

                    return {
                        type: "function" as const,
                        function: {
                            name: fullName,
                            description: description,
                            parameters: tool.inputSchema || {}
                        }
                    };
                });
                availableTools.push(...tools);
            } catch (error) {
                console.error(`Error listing tools for server ${serverName}:`, error);
            }
        }
        return availableTools;
    }

    /**
     * Calls the configured AI model (via ApiClient) to process messages and potentially select tools.
     * @param {Message[]} messages - The message history to send to the AI.
     * @param {OpenAITool[]} tools - The list of available tools formatted for the AI.
     * @returns {Promise<any>} A promise that resolves to the AI's response message object.
     * @throws {Error} If the API call fails or returns an invalid response.
     * @private
     */
    private async _callAIForProcessing(messages: Message[], tools?: OpenAITool[]): Promise<any> {
        try {
            const systemPrompt = {
                role: "system",
                content: "You are a helpful assistant that can use various tools to help users. Please analyze the user's request and use appropriate tools to fulfill it."
            };

            const formattedMessages = messages.map(msg => ({
                ...msg,
                content: msg.content
            }));

            const apiOptions: any = { 
                model: "deepseek-chat" // Consider making model configurable
            };

            if (tools && tools.length > 0) { // Only add tools and tool_choice if tools are provided
                apiOptions.tools = tools;
                apiOptions.tool_choice = "auto";
            }

            const response = await this.apiClient.callOpenAIChatCompletion(
                [systemPrompt, ...formattedMessages],
                apiOptions // Pass the dynamically built options
            );

            if (!response.success || !response.data || !response.data.choices || response.data.choices.length === 0) {
                throw new Error(response.error || 'AI API call failed or returned invalid response');
            }

            // the structure is OpenAI-like
            return response.data.choices[0].message;
        } catch (error) {
            console.error('Error calling AI API:', error);
            // Refined error message generation for unknown type
            let errorMessage = 'AI API call failed with an unknown error';
            if (error instanceof Error) {
                errorMessage = `AI API call failed: ${error.message}`;
            } else if (typeof error === 'string') {
                errorMessage = `AI API call failed: ${error}`;
            }
            throw new Error(errorMessage);
        }
    }

    /**
     * Executes a specific tool call and processes its response.
     * Returns both user-facing output strings and a potential message to send back to the AI.
     * @param {any} toolCall - The tool call object from the AI response.
     * @returns {Promise<{outputMessages: string[], messageForAI: Message | null}>} A promise resolving to an object containing output messages and an optional message for the AI.
     * @private
     */
    private async _executeAndProcessToolCall(toolCall: any): Promise<{
        outputMessages: string[],
        messageForAI: Message | null
    }> {
        const toolFullName = toolCall.function.name;
        const [serverName, toolName] = toolFullName.split('__');
        const session = this.sessions.get(serverName);
        const toolCallId = toolCall.id; // Get the tool_call_id
        
        // Get specific tool config and server config
        const specificToolConfig = this.getToolConfig(toolFullName); 
        const serverConfig = this.serverConfigs.get(serverName);

        let outputMessages: string[] = [];
        let messageForAI: Message | null = null;

        if (!session) {
            console.error(`Server ${serverName} not found for tool call ${toolFullName}`);
            outputMessages.push(`[Error: Server ${serverName} not found]`);
            return {outputMessages, messageForAI};
        }

        try {
            // Safely parse arguments
            let toolArgs;
            try {
                toolArgs = JSON.parse(toolCall.function.arguments);
            } catch (parseError) {
                console.error(`Error parsing arguments for tool ${toolFullName}:`, parseError);
                outputMessages.push(`[Error: Invalid arguments for ${toolFullName}]`);
                return {outputMessages, messageForAI};
            }

            const result = await session.callTool({
                name: toolName,
                arguments: toolArgs
            });

            let content = result.content;
            let contentStringForAI: string; // String representation for the AI message
            contentStringForAI = JSON.stringify(content);

            // Process the response using the existing handler logic
            // Note: processToolResponse only returns display messages now.
            outputMessages = await this.processToolResponse(
                toolFullName,
                content // Pass potentially parsed content to handler
            );

            // Determine if we need to send the result back to the AI
            // Priority: Specific Tool Config > Server Config Default > false
            let shouldSendToAI = serverConfig?.sendResultToAI ?? false; // Start with server default or false
            if (specificToolConfig && typeof specificToolConfig.sendResultToAI === 'boolean') {
                shouldSendToAI = specificToolConfig.sendResultToAI; // Override with specific config if set
            }

            // Check if we need to send the result back to the AI
            if (shouldSendToAI) { // Use the determined boolean
                messageForAI = {
                    role: 'tool',
                    tool_call_id: toolCallId,
                    name: toolFullName,
                    content: contentStringForAI // Send the stringifies content back to AI
                };
            }

        } catch (error) {
            console.error(`Error executing tool ${toolFullName}:`, error);

            // Explicitly determine the error message string
            let errorDetail: string;
            if (error instanceof Error) {
                errorDetail = error.message;
            } else if (typeof error === 'string') {
                errorDetail = error;
            } else {
                errorDetail = 'An unknown error occurred';
            }
            const errorMessage = `[Error executing ${toolFullName}: ${errorDetail}]`;

            outputMessages.push(errorMessage);

            // Also create an error message to send back to the AI if configured to do so
            // Apply the same priority logic for sending errors back
            let shouldSendErrorToAI = serverConfig?.sendResultToAI ?? false;
            if (specificToolConfig && typeof specificToolConfig.sendResultToAI === 'boolean') {
                shouldSendErrorToAI = specificToolConfig.sendResultToAI;
            }

            if (shouldSendErrorToAI) { // Use the determined boolean
                messageForAI = {
                    role: 'tool',
                    tool_call_id: toolCallId,
                    name: toolFullName,
                    content: JSON.stringify({error: errorMessage}) // Send structured error back to AI
                };
            }
        }

        return {outputMessages, messageForAI};
    }

    /**
     * Process a user query using available tools. Refactored version.
     */
    async processQuery(query: string): Promise<ProcessQueryResult> {
        if (this.sessions.size === 0) {
            throw new Error("Not connected to any server");
        }

        // 1. Prepare initial message list
        const messages: Message[] = [
            {
                role: "user",
                content: query
            }
        ];

        const finalOutputText: string[] = []; // Accumulates user-facing output
        let finalAiContent: string | undefined = undefined; // Declare variable for final AI response

        try {
            // 2. Get available tools
            const availableTools = await this._getAvailableToolsFormatted();

            // 3. First call to AI for processing
            const firstAiMessage = await this._callAIForProcessing(messages, availableTools);
            // console.log("firstAiMessage-choices-tool_calls", firstAiMessage.tool_calls.map((toolCall: any) =>
            //     `function: ${toolCall.function.name}, arguments: ${toolCall.function.arguments}`
            // )) 

            messages.push(firstAiMessage); // Add AI's response (potential tool calls) to history

            // 4. Handle AI response
            // If AI provides direct content and no tool calls
            if (firstAiMessage.content && !firstAiMessage.tool_calls) {
                finalOutputText.push(firstAiMessage.content);
            }

            // If AI requests tool calls
            if (firstAiMessage.tool_calls) {
                const toolMessagesForAI: Message[] = []; // Collect messages to send back to AI

                // Execute tool calls in parallel
                const toolExecutionPromises = firstAiMessage.tool_calls.map((toolCall: any) =>
                    this._executeAndProcessToolCall(toolCall)
                );

                const toolExecutionResults = await Promise.all(toolExecutionPromises);

                // Process results: collect user output and messages for AI
                toolExecutionResults.forEach(result => {
                    finalOutputText.push(...result.outputMessages);
                    if (result.messageForAI) {
                        toolMessagesForAI.push(result.messageForAI);
                    }
                });

                // 5. Second AI call if tool results need to be sent back
                if (toolMessagesForAI.length > 0) {
                    messages.push(...toolMessagesForAI); // Add tool results to message history
                    const secondAiMessage = await this._callAIForProcessing(messages);

                    // Add final AI response to output if content exists
                    if (secondAiMessage.content) {
                        finalOutputText.push("\n[AI Summary]:"); // Add a separator for clarity
                        finalOutputText.push(secondAiMessage.content);
                        finalAiContent = secondAiMessage.content; // Store the final AI response
                    }
                }
            }
            // Update return statement for try block
            return { 
                fullOutput: finalOutputText.join("\n"), 
                finalAiResponse: finalAiContent 
            };
        } catch (error) {
            console.error("Error processing query:", error);
            const errorMessage = `Error processing query: ${this._formatErrorMessage(error)}`;
            finalOutputText.push(errorMessage);
            // Update return statement for catch block
            return { 
                fullOutput: finalOutputText.join("\n"), 
                finalAiResponse: undefined 
            };
        }
    }

    /**
     * Clean up resources and close connections
     * Should be called before application exit
     */
    async cleanup(): Promise<void> {
        for (const transport of this.transports.values()) {
            await transport.close();
        }
        this.transports.clear();
        this.sessions.clear();
    }

    /**
     * Check if client has any active server sessions
     * @returns {boolean} True if there are active sessions
     */
    hasActiveSessions(): boolean {
        return this.sessions.size > 0;
    }

    /**
     * Connect to all available servers
     * @returns {Promise<string[]>} Array of connected server names
     */
    async connectToAllServers(): Promise<string[]> {
        const openServers = config.filter(cfg => cfg.isOpen);
        console.log('Connecting to servers:', openServers.map(s => s.name).join(', '));

        const connectedServers: string[] = [];
        for (const serverConfig of openServers) {
            try {
                await this.connectToServer(serverConfig);
                connectedServers.push(serverConfig.name);
            } catch (error) {
                console.error(`Failed to connect to server ${serverConfig.name}:`, this._formatErrorMessage(error)); // Use formatter here too
            }
        }

        return connectedServers;
    }

    /**
     * Get session for a server
     * @param serverName Server name
     * @returns Session if exists, null otherwise
     */
    getSession(serverName: string): Client | null {
        return this.sessions.get(serverName) || null;
    }

    /**
     * Automatically discover and log tools from a server, checking for available configurations.
     * @param serverName Server name
     * @returns Number of discovered tools for which a configuration (static or dynamic) exists.
     */
    async discoverAndRegisterTools(serverName: string): Promise<number> {
        const session = this.sessions.get(serverName);
        if (!session) {
            console.error(`Cannot discover tools: server ${serverName} not connected`);
            return 0;
        }

        try {
            const response = await session.listTools();
            
            // Log the number of tools discovered from the server
            console.log(`Server [${serverName}]: Discovered ${response.tools.length} tools.`);

            // Return the total number of tools reported by the server
            return response.tools.length;
        } catch (error) {
            console.error(`Error discovering tools for ${serverName}:`, this._formatErrorMessage(error));
            return 0;
        }
    }

    /**
     * Discover and register tools from all connected servers
     * @returns Map of server names to number of registered tools
     */
    async discoverAndRegisterAllTools(): Promise<Map<string, number>> {
        const results = new Map<string, number>();

        for (const serverName of this.sessions.keys()) {
            const count = await this.discoverAndRegisterTools(serverName);
            results.set(serverName, count);
        }

        return results;
    }

    /**
     * Helper method to format error messages consistently.
     * @param error The error object (can be of unknown type).
     * @returns A string representation of the error message.
     * @private
     */
    private _formatErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        } else if (typeof error === 'string') {
            return error;
        } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
            // Handle cases where error is an object with a message property (like some API errors)
            return error.message;
        } else {
            return 'An unknown error occurred';
        }
    }

    /**
     * Get available tools from all connected servers
     * @returns {Promise<Map<string, any>>} Map of server names to their available tools
     */
    async getAvailableTools(): Promise<Map<string, any>> {
        const tools = new Map();
        for (const [serverName, client] of this.sessions) {
            try { // Add try-catch here for robustness
                const serverTools = await client.listTools();
                tools.set(serverName, serverTools);
            } catch (error) {
                console.error(`Failed to list tools for server ${serverName}:`, this._formatErrorMessage(error));
                tools.set(serverName, {tools: [], error: this._formatErrorMessage(error)}); // Provide error info in map
            }
        }
        return tools;
    }

}