const fs = require('fs');

class BrainManager {
    constructor(config, memoryDriver) {
        this.config = config;
        this.memoryDriver = memoryDriver;
        this.brains = []; // [Primary, Fallback1, Fallback2...]
        this.sessionMap = new Map(); // contextId -> { brainIndex, sessionId/tabId }
    }

    // Register a brain instance
    addBrain(brain) {
        this.brains.push(brain);
    }

    async init() {
        console.log(`🧠 [BrainManager] Initializing ${this.brains.length} brains...`);
        for (const brain of this.brains) {
            try {
                await brain.init();
                console.log(`   ✅ ${brain.name} Ready.`);
            } catch (e) {
                console.error(`   ❌ ${brain.name} Init Failed:`, e.message);
            }
        }
    }

    /**
     * Unified Send Message with Fallback Chain
     * @param {string} text - User message
     * @param {object} context - { id: 'discord-123', platform: 'discord', ... }
     * @param {boolean} isSystem - Is system prompt?
     */
    async sendMessage(text, context = {}, isSystem = false) {
        const errors = [];

        // Try each brain in the chain
        for (let i = 0; i < this.brains.length; i++) {
            const brain = this.brains[i];
            try {
                // Ensure brain is ready
                if (!brain.isReady) await brain.init();

                console.log(`📤 [BrainManager] Sending to [${brain.name}] (Context: ${context.id || 'Global'})...`);

                // Delegate to brain
                const response = await brain.sendMessage(text, context, isSystem);

                if (response) {
                    // Success! Update session map if needed
                    return response;
                }
            } catch (e) {
                console.warn(`⚠️ [BrainManager] [${brain.name}] Failed: ${e.message}`);
                errors.push(`${brain.name}: ${e.message}`);
            }
        }

        throw new Error(`All brains failed. Errors: ${errors.join(', ')}`);
    }

    async memorize(text, metadata) {
        if (this.memoryDriver) await this.memoryDriver.memorize(text, metadata);
    }

    async recall(query) {
        if (this.memoryDriver) return await this.memoryDriver.recall(query);
        return [];
    }

    // Proxy other methods if needed (e.g., specific memory ops)
}

module.exports = BrainManager;
