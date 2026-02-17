const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { DOMDoctor } = require('./utils/DOMDoctor');
const skills = require('../skills');
const os = require('os');

puppeteer.use(StealthPlugin());

class WebChatGPTBrain {
    constructor(config, memoryDriver) {
        this.name = 'web/chatgpt';
        this.config = config;
        this.memoryDriver = memoryDriver;

        this.browser = null; // Injected
        this.doctor = null; // Injected
        this.selectors = null;

        this.sessions = new Map(); // contextId -> { page, cdp, initialized }
        this.isReady = false;
    }

    setSharedDeps({ browser, keyChain }) {
        this.browser = browser;
        if (keyChain) {
            this.doctor = new DOMDoctor(this.config.API_KEYS, keyChain);
            this.selectors = this.doctor.loadSelectors();
        } else {
            // Fallback if no keychain provided (should not happen with correct BrainManager)
            this.doctor = new DOMDoctor(this.config.API_KEYS);
            this.selectors = this.doctor.loadSelectors();
        }
    }

    async init() {
        if (this.isReady) return;
        // Shared browser is passed in via setSharedDeps. 
        // We just verify it's there.
        if (!this.browser) {
            console.warn(`⚠️ [WebChatGPT] Shared browser not available during init. Waiting...`);
        }
        this.isReady = true;
    }

    async getSession(contextId) {
        if (!this.browser) throw new Error("Browser not initialized via BrainManager");

        if (this.sessions.has(contextId)) {
            const sess = this.sessions.get(contextId);
            if (!sess.page.isClosed()) return sess;
            this.sessions.delete(contextId);
        }

        console.log(`🆕 [WebChatGPT] Creating new session for context: ${contextId}`);
        const page = await this.browser.newPage();
        await page.goto('https://chatgpt.com', { waitUntil: 'networkidle2' });

        const session = { page, cdp: null, initialized: false };
        this.sessions.set(contextId, session);
        return session;
    }

    async sendMessage(text, context = {}, isSystem = false) {
        // Context ID Normalization for DMs
        // If context is "dm" or from a known DM platform, we can use a shared session 
        // to avoid re-sending system prompts constantly. 
        // User asked: "discord dm and telegram dm should use the same session"
        // Let's normalize contextId.
        let safeContextId = context.id || 'global';
        if (context.source === 'telegram_dm' || context.source === 'discord_dm' || safeContextId.includes('dm')) {
            safeContextId = 'shared_dm_session';
        }

        const session = await this.getSession(safeContextId);
        const page = session.page;

        try { await page.bringToFront(); } catch (e) { }

        // Initialize System Prompt for new sessions (single message, no chunking)
        if (!session.initialized && !isSystem) {
            session.initialized = true;
            const systemFingerprint = `OS: ${os.platform()} | Brain: ChatGPT Web | Context: ${safeContextId}`;
            const fullPrompt = skills.getSystemPrompt(systemFingerprint);
            const superProtocol = ` [SYSTEM: You are Golem. STRICTLY output in [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY] format.]`;

            // Strip newlines to avoid keyboard.type sending prematurely via Enter
            const cleanPrompt = (fullPrompt + superProtocol).replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ');

            console.log(`📡 [WebChatGPT] Sending System Prompt (${cleanPrompt.length} chars, single message)...`);
            await this.sendMessage(cleanPrompt, { ...context, id: safeContextId }, true);
        }

        const reqId = Date.now().toString(36).slice(-4);
        const TAG_START = `[[BEGIN:${reqId}]]`;
        const TAG_END = `[[END:${reqId}]]`;

        const payload = `[SYSTEM: Wrap response with ${TAG_START} and ${TAG_END}. Tags: [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY].]\n\n${text}`;

        console.log(`📡 [WebChatGPT] Sending to ${safeContextId}: ${reqId}`);

        const inputSel = this.selectors.input || '#prompt-textarea';
        // Comprehensive list of Send Button Selectors
        const sendSelectors = [
            this.selectors.send,
            'button[data-testid="send-button"]',
            'button[aria-label="Send prompt"]',
            'button[aria-label="Send"]',
            '[data-testid="send-button"]',
            'div[role="textbox"] + button',
            '#__next button[disabled] svg path', // Attempt to detect disabled button sometimes helpful context
        ].filter(Boolean);

        const responseSel = this.selectors.response || '.markdown';

        // 1. Wait for Input
        try {
            await page.waitForSelector(inputSel, { timeout: 10000 });
        } catch (e) {
            console.log("⚠️ [WebChatGPT] Input not found.");
            throw e;
        }

        // 2. Check for "Stop generating" (Busy State) and Wait
        try {
            const stopSelectors = [
                'button[aria-label="Stop generating"]',
                'button[aria-label="Stop streaming"]',
                'button[data-testid="stop-button"]'
            ];
            for (const stopSel of stopSelectors) {
                if (await page.$(stopSel)) {
                    console.log("⏳ [WebChatGPT] Waiting for previous generation to finish...");
                    await page.waitForSelector(stopSel, { hidden: true, timeout: 60000 });
                    await new Promise(r => setTimeout(r, 1000)); // Extra buffer
                    break;
                }
            }
        } catch (e) { }

        // 3. Input the message via clipboard paste (NOT keyboard.type!)
        //    keyboard.type() processes \n as Enter, which sends ChatGPT messages prematurely.
        //    Clipboard paste inserts full text atomically.
        await page.focus(inputSel);

        // Copy payload to clipboard and paste
        await page.evaluate(async (text) => {
            // Use the Clipboard API to write text
            const textarea = document.querySelector('#prompt-textarea');
            if (textarea) {
                // For contenteditable divs (ChatGPT uses this)
                textarea.focus();
                // Insert text via execCommand (works in contenteditable)
                document.execCommand('insertText', false, text);
            }
        }, payload);

        await new Promise(r => setTimeout(r, 500));

        // Verify text was inserted
        const hasText = await page.evaluate(() => {
            const textarea = document.querySelector('#prompt-textarea');
            return textarea ? textarea.innerText.length > 5 : false;
        });

        if (!hasText) {
            // Fallback: try typing without newlines
            console.warn("⚠️ [WebChatGPT] Clipboard paste failed, trying keyboard type...");
            const safePayload = payload.replace(/\n/g, ' ');
            await page.keyboard.type(safePayload);
        }

        await new Promise(r => setTimeout(r, 500));

        // 4. Send — PRIMARY METHOD: Press Enter (most reliable for ChatGPT)
        //    ChatGPT's input box sends on Enter key. This bypasses all selector issues.
        let sent = false;
        try {
            await page.keyboard.press('Enter');
            sent = true;
            console.log(`✅ [WebChatGPT] Sent via Enter key.`);
        } catch (e) {
            console.warn(`⚠️ [WebChatGPT] Enter key failed: ${e.message}`);
        }

        // 5. Fallback: Try clicking Send button if Enter didn't work
        if (!sent) {
            // ChatGPT-specific selectors (NOT Gemini ones)
            const chatgptSendSelectors = [
                'button[aria-label="Send prompt"]',
                'button[data-testid="send-button"]',
                '[data-testid="send-button"]',
                'button[aria-label="Send"]',
            ];

            for (let attempt = 0; attempt < 3; attempt++) {
                for (const sel of chatgptSendSelectors) {
                    const element = await page.$(sel);
                    if (element) {
                        const isDisabled = await page.evaluate(el => el.disabled, element);
                        console.log(`🔍 [WebChatGPT] Found selector: ${sel} (disabled: ${isDisabled})`);
                        if (!isDisabled) {
                            try {
                                await page.click(sel);
                                sent = true;
                                console.log(`✅ [WebChatGPT] Sent via click: ${sel}`);
                                break;
                            } catch (e) {
                                console.warn(`⚠️ [WebChatGPT] Click failed on ${sel}: ${e.message}`);
                            }
                        }
                    }
                }
                if (sent) break;
                console.log(`🔄 [WebChatGPT] Send attempt ${attempt + 1}/3 failed, retrying...`);
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        if (!sent) {
            console.error("❌ [WebChatGPT] Failed to send message. All methods failed.");
            throw new Error("Send button not found");
        }

        if (isSystem) {
            // Wait a bit for processing
            await new Promise(r => setTimeout(r, 2000));
            return "";
        }

        console.log(`⚡ [WebChatGPT] Waiting for response...`);

        try {
            await page.waitForSelector(responseSel, { timeout: 30000 });
        } catch (e) {
            console.warn("⚠️ [WebChatGPT] No response element found.");
        }

        // Wait for generation to finish (naive wait + stability check)
        await new Promise(r => setTimeout(r, 2000));

        const finalResponse = await page.evaluate((selector, startTag, endTag) => {
            return new Promise(resolve => {
                let lastText = "";
                let stableCount = 0;
                let startTime = Date.now();

                const interval = setInterval(() => {
                    // Timeout safety (120s)
                    if (Date.now() - startTime > 120000) {
                        clearInterval(interval);
                        resolve(lastText || "[TIMEOUT]");
                    }

                    const bubbles = document.querySelectorAll(selector);
                    if (bubbles.length === 0) return;

                    // Get the last bubble
                    const lastBubble = bubbles[bubbles.length - 1];
                    const html = lastBubble.innerText;

                    // Check for completion tag
                    if (html.includes(endTag)) {
                        clearInterval(interval);
                        resolve(html);
                        return;
                    }

                    // Stability check (fallback if tag missing)
                    if (html === lastText && html.length > 20) {
                        stableCount++;
                        if (stableCount > 8) { // 4 seconds stable
                            clearInterval(interval);
                            resolve(html);
                        }
                    } else {
                        stableCount = 0;
                        lastText = html;
                    }
                }, 500);
            });
        }, responseSel, TAG_START, TAG_END);

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
