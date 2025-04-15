import {createInterface} from 'readline';
import {MCPClient} from './client.js'; 
import config from '../mcp-server-config.js'; 

/**
 * Start interactive chat loop for processing queries
 * Handles user input and displays results
 * @param client The MCPClient instance to use for processing queries and cleanup
 */
async function chatLoop(client: MCPClient): Promise<void> {
    console.log("\nMCP Client Started!");
    console.log("Type your queries or 'quit' to exit.");

    const readline = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = () => {
        return new Promise<string>((resolve) => {
            readline.question("\nQuery: ", resolve);
        });
    };

    try {
        while (true) {
            const query = (await askQuestion()).trim();
            if (query.toLowerCase() === 'quit') {
                break;
            }

            try {
                // Use the passed client instance to process the query
                const response = await client.processQuery(query);
                // console.log("\n" + response.fullOutput);
                console.log("\n" + response.finalAiResponse);
            } catch (error) {
                console.error("\nError:", error);
            }
        }
    } finally {
        readline.close();
        // Ensure cleanup is called on the client instance
        await client.cleanup();
    }
}

async function main() {
    let client: MCPClient;

    if (process.argv.length > 2) {
        // Command line mode
        const serverPath = process.argv[2];
        // Ensure serverPath exists
        client = await MCPClient.fromCommandLine(serverPath);

        // Auto-discover and register tools
        const toolCounts = await client.discoverAndRegisterAllTools();
        console.log("Discovered tools:", [...toolCounts.entries()]
            .map(([server, count]) => `${server}: ${count}`)
            .join(", "));
    } else {
        // Configuration file mode
        const openServers = MCPClient.getOpenServers();
        console.log("Connecting to servers:", openServers.join(", "));

        client = new MCPClient();
        await client.initialize();

        // Connect to all configured servers
        for (const serverName of openServers) {
            const serverConfig = config.find(cfg => cfg.name === serverName);
            if (serverConfig) {
                try {
                    await client.connectToServer(serverConfig);
                } catch (error) {
                    console.error(`Failed to connect to server '${serverName}':`, error);
                }
            }
        }

        // Auto-discover and register tools
        console.log("\nDiscovering and registering tools...");
        const toolCounts = await client.discoverAndRegisterAllTools();
        for (const [server, count] of toolCounts) {
            console.log(`- ${server}: ${count} tools registered`);
        }
    }

    if (!client.hasActiveSessions()) {
        throw new Error("Failed to connect to any server");
    }

    // Call the chatLoop function, passing the client instance
    await chatLoop(client);
}

main().catch(error => {
    console.error("Application exited with error:", error);
    process.exit(1);
}); 