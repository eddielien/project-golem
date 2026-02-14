const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { DOMDoctor } = require('./utils/DOMDoctor');
const skills = require('../skills');
const os = require('os');

puppeteer.use(StealthPlugin());

class WebChatGPTBrain {
    constructor(config, memoryDriver) {
        this.name = 'ChatGPT Web';
        this.config = config;
        this.memoryDriver = memoryDriver;

        this.browser = null;
        this.doctor = new DOMDoctor(config.API_KEYS);

        // Context ID -> { page, cdp, initialized }
        this.sessions = new Map();

        this.selectors = {
            input: '#prompt-textarea, div[contenteditable="true"]',
            send: 'button[data-testid="send-button"]',
            response: '.markdown, div[data-message-author-role="assistant"]'
        };

        this.isReady = false;
    }

    async init() {
        if (this.isReady) return;
        console.log(`🧠 [WebChatGPT] Initializing...`);

        this.browser = await puppeteer.launch({
            headless: this.config.HEADLESS,
            userDataDir: this.config.USER_DATA_DIR, // Share same user data or separate?
            args: ['--no-sandbox', '--window-size=1280,900']
        });

        this.isReady = true;
    }

    async getSession(contextId) {
        if (this.sessions.has(contextId)) return this.sessions.get(contextId);

        console.log(`🆕 [WebChatGPT] Creating new session for context: ${contextId}`);
        const page = await this.browser.newPage();
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2' });

        const session = { page, cdp: null, initialized: false };
        this.sessions.set(contextId, session);
        return session;
    }

    async sendMessage(text, context = {}, isSystem = false) {
        if (!this.browser) await this.init();

        const contextId = context.id || 'global';
        const session = await this.getSession(contextId);
        const page = session.page;

        try { await page.bringToFront(); } catch (e) { }

        // Initialize System Prompt for new sessions
        if (!session.initialized && !isSystem) {
            session.initialized = true;
            const systemFingerprint = `OS: ${os.platform()} | Brain: ChatGPT Web | Context: ${contextId}`;
            const systemPrompt = skills.getSystemPrompt(systemFingerprint);
            const superProtocol = `\n\n[SYSTEM: You are Golem. STRICTLY output in [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY] format.]`;
            // Simplified protocol for ChatGPT to avoid triggering moderation or refusal easily
            await this.sendMessage(systemPrompt + superProtocol, context, true);
        }

        const reqId = Date.now().toString(36).slice(-4);
        const TAG_START = `[[BEGIN:${reqId}]]`;
        const TAG_END = `[[END:${reqId}]]`;

        const payload = `[SYSTEM: Wrap response with ${TAG_START} and ${TAG_END}. Tags: [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY].]\n\n${text}`;

        console.log(`📡 [WebChatGPT] Sending to ${contextId}: ${reqId}`);

        // Input
        await page.waitForSelector(this.selectors.input, { timeout: 5000 });
        await page.focus(this.selectors.input);
        await page.keyboard.type(payload);
        await new Promise(r => setTimeout(r, 800));

        // Send
        await page.click(this.selectors.send);

        if (isSystem) { await new Promise(r => setTimeout(r, 3000)); return ""; }

        console.log(`⚡ [WebChatGPT] Waiting for response...`);

        // Wait for response stability (Simplified logic for ChatGPT)
        // ChatGPT streams response. We wait for the stream to stop.
        // Usually the "Stop generating" button appears, then disappears/changes to "Regenerate".

        try {
            await page.waitForSelector(this.selectors.response, { timeout: 10000 });
        } catch (e) {
            console.warn("⚠️ [WebChatGPT] No response element found.");
        }

        // Wait for generation to finish (naive wait + stability check)
        await new Promise(r => setTimeout(r, 2000));

        const finalResponse = await page.evaluate((selector, startTag) => {
            return new Promise(resolve => {
                let lastText = "";
                let stableCount = 0;
                const interval = setInterval(() => {
                    const bubbles = document.querySelectorAll(selector);
                    if (bubbles.length === 0) return;
                    const text = bubbles[bubbles.length - 1].innerText;

                    if (text === lastText && text.length > 20) {
                        stableCount++;
                        if (stableCount > 4) { // 2 seconds stable
                            clearInterval(interval);
                            resolve(text);
                        }
                    } else {
                        stableCount = 0;
                        lastText = text;
                    }
                }, 500);
            });
        }, this.selectors.response, TAG_START);

        // Cleanup tags
        let cleanText = finalResponse
            .replace(TAG_START, '')
            .replace(TAG_END, '')
            .replace(/\[SYSTEM:.*?\]/g, '')
            .trim();

        return cleanText;
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

module.exports = WebChatGPTBrain;
