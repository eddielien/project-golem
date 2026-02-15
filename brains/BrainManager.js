const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { KeyChain } = require('./utils/DOMDoctor');

puppeteer.use(StealthPlugin());

class BrainManager {
    constructor(config, memoryDriver) {
        this.config = config;
        this.memoryDriver = memoryDriver;
        this.brains = []; // [Primary, Fallback1, Fallback2...]
        this.sessionMap = new Map(); // contextId -> { brainIndex, sessionId/tabId }

        this.browser = null; // Shared Browser Instance
        this.keyChain = new KeyChain(config.API_KEYS); // Shared KeyChain
    }

    // Register a brain instance
    addBrain(brain) {
        this.brains.push(brain);
        // Inject dependencies if brain supports them
        if (brain.setSharedDeps) {
            brain.setSharedDeps({
                browser: this.browser, // Might be null initially, but init() will handle it or we pass it then
                keyChain: this.keyChain
            });
        }
    }

    async init() {
        console.log(`🧠 [BrainManager] Initializing shared resources...`);

        // 1. Launch Shared Browser if any brain needs it (assuming all Web brains benefit from sharing)
        // We can check if any brain is a WebBrain, or just launch it if not headless-test-mode.
        // For now, always launch if HEADLESS is set or if we have web brains.
        // Let's lazy launch or launch here.
        if (!this.browser) {
            // Cleanup SingletonLock if exists to prevent crashes
            const lockFile = require('path').join(this.config.USER_DATA_DIR, 'SingletonLock');
            if (fs.existsSync(lockFile)) {
                try {
                    fs.unlinkSync(lockFile);
                    console.log("🧹 [BrainManager] Cleared stale SingletonLock.");
                } catch (e) {
                    console.warn("⚠️ [BrainManager] Could not clear SingletonLock:", e.message);
                }
            }

            try {
                this.browser = await puppeteer.launch({
                    headless: this.config.HEADLESS,
                    userDataDir: this.config.USER_DATA_DIR,
                    args: ['--no-sandbox', '--window-size=1280,900']
                });
                console.log("🌐 [BrainManager] Shared Browser Launched.");
            } catch (e) {
                console.error("❌ [BrainManager] Browser Launch Failed:", e.message);
                // Continue, maybe some brains don't need browser
            }
        }

        // 2. Inject Browser into Memory Driver (if compatible)
        if (this.browser && this.memoryDriver && this.memoryDriver.setSharedBrowser) {
            await this.memoryDriver.setSharedBrowser(this.browser);
        }

        console.log(`🧠 [BrainManager] Initializing ${this.brains.length} brains...`);
        for (const brain of this.brains) {
            try {
                // Pass shared browser if available
                if (brain.setSharedDeps) {
                    brain.setSharedDeps({ browser: this.browser, keyChain: this.keyChain });
                }

                await brain.init();
                console.log(`   ✅ ${brain.name} Ready.`);
            } catch (e) {
                console.error(`   ❌ ${brain.name} Init Failed:`, e.message);
            }
        }
    }

    /**
     * Get list of loaded brains and their status
     */
    getBrainList() {
        return this.brains.map((b, index) => ({
            name: b.name,
            ready: b.isReady,
            isPrimary: index === 0,
            type: b.constructor.name
        }));
    }

    /**
     * Set a brain as primary by name (case-insensitive partial match)
     * @param {string} name 
     * @returns {boolean} success
     */
    setPrimaryBrain(name) {
        const targetIndex = this.brains.findIndex(b =>
            b.name.toLowerCase().includes(name.toLowerCase()) ||
            b.constructor.name.toLowerCase().includes(name.toLowerCase())
        );

        if (targetIndex === -1) return false;

        if (targetIndex === 0) return true; // Already primary

        // Move to front
        const [targetBrain] = this.brains.splice(targetIndex, 1);
        this.brains.unshift(targetBrain);
        console.log(`🧠 [BrainManager] Brain sequence updated. Primary: ${targetBrain.name}`);
        return true;
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
