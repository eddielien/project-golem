const os = require('os');
const skills = require('../skills');

// Simple fetch implementation (assuming Node 18+)
// If older node, might need node-fetch, but project dependency list didn't show it. 
// index.js uses native fetch or https. We will use native fetch.

class OllamaBrain {
    constructor(config, memoryDriver) {
        this.name = 'Ollama Local';
        this.config = config; // { OLLAMA_BASE_URL, OLLAMA_MODEL ... }
        this.memoryDriver = memoryDriver;
        this.baseUrl = config.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.model = config.OLLAMA_MODEL || 'llama3';

        // Context ID -> History Array
        this.histories = new Map();

        this.isReady = true;
    }

    async init() {
        console.log(`🧠 [Ollama] Initialized. Target: ${this.baseUrl} | Model: ${this.model}`);
        // Optional: Check connection
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`);
            if (res.ok) console.log("✅ [Ollama] Service is reachable.");
            else console.warn("⚠️ [Ollama] Service might be down.");
        } catch (e) {
            console.warn(`⚠️ [Ollama] Connection failed: ${e.message}`);
        }
    }

    async sendMessage(text, context = {}, isSystem = false) {
        const contextId = context.id || 'global';

        if (!this.histories.has(contextId)) {
            // Init history with system prompt
            const systemFingerprint = `OS: ${os.platform()} | Brain: Ollama (${this.model}) | Context: ${contextId}`;
            const systemPrompt = skills.getSystemPrompt(systemFingerprint);
            const superProtocol = `\n\n[SYSTEM: STRICT JSON FORMAT inside [GOLEM_ACTION]. Use [GOLEM_REPLY] for text. Tags are: [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY].]`;

            this.histories.set(contextId, [
                { role: 'system', content: systemPrompt + superProtocol }
            ]);
        }

        const history = this.histories.get(contextId);

        // Add User Message
        history.push({ role: 'user', content: text });

        console.log(`📡 [Ollama] Sending request to ${this.model}...`);

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages: history,
                    stream: false
                })
            });

            if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);

            const data = await response.json();
            const reply = data.message.content;

            // Add Assistant Message to History
            history.push({ role: 'assistant', content: reply });

            // Limit history size (last 20 messages) to prevent context overflow
            if (history.length > 20) {
                // Keep system prompt + last 19
                const system = history[0];
                const recent = history.slice(-19);
                this.histories.set(contextId, [system, ...recent]);
            }

            return reply;

        } catch (e) {
            console.error(`❌ [Ollama] Request Failed: ${e.message}`);
            throw e;
        }
    }

    async recall(query) {
        if (!this.memoryDriver) return [];
        return await this.memoryDriver.recall(query);
    }

    async memorize(text, metadata = {}) {
        if (!this.memoryDriver) return;
        try { await this.memoryDriver.memorize(text, metadata); } catch (e) { }
    }
}

module.exports = OllamaBrain;
