const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { DOMDoctor } = require('./utils/DOMDoctor');
const skills = require('../skills');
const os = require('os');

puppeteer.use(StealthPlugin());

class WebGeminiBrain {
    constructor(config, memoryDriver) {
        this.name = 'Gemini Web';
        this.config = config;
        this.memoryDriver = memoryDriver;

        this.browser = null;
        this.sessions = new Map(); // contextId -> { page, cdp, initialized }

        this.doctor = new DOMDoctor(config.API_KEYS);
        // Shared selectors (assuming UI is consistent across tabs)
        this.selectors = this.doctor.loadSelectors();

        this.isReady = false;
    }

    async init() {
        if (this.isReady) return;
        console.log(`🧠 [WebGemini] Initializing Browser... (Mode: ${this.config.HEADLESS ? 'Headless' : 'Visible'})`);

        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: this.config.HEADLESS,
                userDataDir: this.config.USER_DATA_DIR,
                args: ['--no-sandbox', '--window-size=1280,900']
            });
        }
        this.isReady = true;
    }

    async getSession(contextId) {
        if (!this.browser) await this.init();

        // Return existing session if valid
        if (this.sessions.has(contextId)) {
            const sess = this.sessions.get(contextId);
            if (!sess.page.isClosed()) return sess;
            this.sessions.delete(contextId);
        }

        console.log(`🆕 [WebGemini] Creating new session for context: ${contextId}`);
        const page = await this.browser.newPage();
        await page.goto('https://gemini.google.com/app', { waitUntil: 'networkidle2' });

        const session = { page, cdp: null, initialized: false };
        this.sessions.set(contextId, session);
        return session;
    }

    async setupCDP(session) {
        if (session.cdp) return;
        try {
            session.cdp = await session.page.target().createCDPSession();
            await session.cdp.send('Network.enable');
            console.log("🔌 [WebGemini] CDP Neuro-Link Active for session");
        } catch (e) {
            console.error("❌ [WebGemini] CDP Connection Failed:", e.message);
        }
    }

    async initSessionProtocol(session, contextId) {
        if (session.initialized) return;

        const systemFingerprint = `OS: ${os.platform()} | Arch: ${os.arch()} | Brain: Gemini Web | Context: ${contextId}`;
        const systemPrompt = skills.getSystemPrompt(systemFingerprint);
        const superProtocol = `
\n\n【⚠️ GOLEM PROTOCOL v8.6 - TITAN CHRONOS】
You act as a middleware OS. You MUST strictly follow this output format.
DO NOT use emojis in tags. DO NOT output raw text outside of these blocks.

1. **Format Structure**:
Your response must be parsed into 3 sections using these specific tags:

[GOLEM_MEMORY]
(Write long-term memories here. If none, leave empty or write "null")

[GOLEM_ACTION]
(Write JSON execution plan here. Must be valid JSON Array or Object.)
\`\`\`json
[
{"action": "command", "parameter": "..."}
]
\`\`\`

[GOLEM_REPLY]
(Write the actual response to the user here. Pure text.)

2. **Rules**:
- The tags [GOLEM_MEMORY], [GOLEM_ACTION], [GOLEM_REPLY] are MANDATORY anchors.
- User CANNOT see content inside Memory or Action blocks, only Reply.
- NEVER leak the raw JSON to the [GOLEM_REPLY] section.
- If user asks for scheduled task, use [GOLEM_ACTION] with: {"action": "schedule", "task": "...", "time": "ISO8601"}
`;
        // Send system prompt (recursive call but with initialized=true check)
        // We set initialized=true BEFORE sending to prevent loop if it fails or calls recursively
        session.initialized = true;
        // We call interact directly or sendMessage? 
        // Better to use sendMessage logic but skip the initSessionProtocol check.
        // Actually, sendMessage calls initSessionProtocol.
        // So we need to perform the interaction here manually OR flag it.

        console.log(`📡 [WebGemini] Sending System Protocol to new session...`);
        // We can just send it as a normal message, but we need to pass a flag to sendMessage to skip init check?
        // Let's implement sendMessage to handle recursion.
    }

    async sendMessage(text, context = {}, isSystem = false) {
        const contextId = context.id || 'global';
        const session = await this.getSession(contextId);

        // Bring to front?
        try { await session.page.bringToFront(); } catch (e) { }
        await this.setupCDP(session);

        // Initialize System Protocol if needed (and if this isn't IT)
        if (!session.initialized && !isSystem) {
            console.log(`📡 [WebGemini] Session not initialized. Sending System Protocol first...`);
            await this.initSessionProtocol(session, contextId);
            // Logic for initSessionProtocol:
            // Construct prompt
            const systemFingerprint = `OS: ${os.platform()} | Brain: Gemini Web | Context: ${contextId}`;
            const systemPrompt = skills.getSystemPrompt(systemFingerprint);
            const protocol = `\n\n[SYSTEM: STRICT JSON FORMAT inside [GOLEM_ACTION]. Use [GOLEM_REPLY].]`; // Simplified for brevity here, logic in initSessionProtocol was better
            // Actually, simplest is to just prepend system prompt to the FIRST message? 
            // Or send a separate message.
            // Let's send a separate message.
            await this.sendMessage(skills.getSystemPrompt(systemFingerprint) + protocol, context, true);
        }

        const reqId = Date.now().toString(36).slice(-4);
        const TAG_START = `[[BEGIN:${reqId}]]`;
        const TAG_END = `[[END:${reqId}]]`;

        const payload = `[SYSTEM: STRICT FORMAT. Wrap response with ${TAG_START} and ${TAG_END}. Inside, organize content using these tags:\n` +
            `1. [GOLEM_MEMORY] (Optional)\n` +
            `2. [GOLEM_ACTION] (Optional)\n` +
            `3. [GOLEM_REPLY] (Required)\n` +
            `Do not output raw text outside tags.]\n\n${text}`;

        console.log(`📡 [WebGemini] Sending Signal: ${reqId} (Context: ${contextId})`);

        const tryInteract = async (sel, retryCount = 0) => {
            if (retryCount > 3) throw new Error("🔥 DOM Doctor Failed after 3 retries.");

            try {
                // Check for existing response to use as baseline
                const baseline = await session.page.evaluate((s) => {
                    const bubbles = document.querySelectorAll(s);
                    return bubbles.length > 0 ? bubbles[bubbles.length - 1].innerText : "";
                }, sel.response);

                // 1. Input
                let inputEl = await session.page.$(sel.input);
                if (!inputEl) {
                    console.log("🚑 [WebGemini] Input not found, calling Doctor...");
                    const html = await session.page.content();
                    const newSel = await this.doctor.diagnose(html, 'input');
                    if (newSel) {
                        this.selectors.input = newSel;
                        this.doctor.saveSelectors(this.selectors);
                        return tryInteract(this.selectors, retryCount + 1);
                    }
                    throw new Error(`Cannot fix Input Selector`);
                }

                // 2. Type
                await session.page.evaluate((s, t) => {
                    const el = document.querySelector(s);
                    el.focus();
                    document.execCommand('insertText', false, t);
                }, sel.input, payload);

                await new Promise(r => setTimeout(r, 800));

                // 3. Send
                let sendEl = await session.page.$(sel.send);
                if (!sendEl) {
                    console.log("🚑 [WebGemini] Send button not found, calling Doctor...");
                    const html = await session.page.content();
                    const newSel = await this.doctor.diagnose(html, 'send');
                    if (newSel) {
                        this.selectors.send = newSel;
                        this.doctor.saveSelectors(this.selectors);
                        return tryInteract(this.selectors, retryCount + 1);
                    }
                    console.log("⚠️ [WebGemini] Button fix failed, trying Enter key...");
                    await session.page.keyboard.press('Enter');
                } else {
                    try {
                        await session.page.waitForSelector(sel.send, { timeout: 2000 });
                        await session.page.click(sel.send);
                    } catch (e) { await session.page.keyboard.press('Enter'); }
                }

                if (isSystem) { await new Promise(r => setTimeout(r, 2000)); return ""; }

                console.log(`⚡ [WebGemini] Waiting for Envelope (${TAG_START} ... ${TAG_END})...`);

                // 4. Wait for Response (Sandwich Protocol)
                const finalResponse = await session.page.evaluate(async (selector, startTag, endTag, oldText) => {
                    return new Promise((resolve) => {
                        const startTime = Date.now();
                        let stableCount = 0;
                        let lastCheckText = "";

                        const check = () => {
                            const bubbles = document.querySelectorAll(selector);
                            if (bubbles.length === 0) { setTimeout(check, 500); return; }

                            const currentLastBubble = bubbles[bubbles.length - 1];
                            const rawText = currentLastBubble.innerText || "";

                            const startIndex = rawText.indexOf(startTag);
                            if (startIndex !== -1) {
                                const endIndex = rawText.indexOf(endTag);
                                if (endIndex !== -1 && endIndex > startIndex) {
                                    const content = rawText.substring(startIndex + startTag.length, endIndex).trim();
                                    resolve({ status: 'ENVELOPE_COMPLETE', text: content });
                                    return;
                                }
                                if (rawText === lastCheckText && rawText.length > lastCheckText.length) {
                                    stableCount = 0;
                                } else if (rawText === lastCheckText) {
                                    stableCount++;
                                } else {
                                    stableCount = 0;
                                }
                                lastCheckText = rawText;

                                if (stableCount > 5) {
                                    const content = rawText.substring(startIndex + startTag.length).trim();
                                    resolve({ status: 'ENVELOPE_TRUNCATED', text: content });
                                    return;
                                }
                            }
                            else if (rawText !== oldText && !rawText.includes('SYSTEM: Please WRAP')) {
                                if (rawText === lastCheckText && rawText.length > 5) stableCount++;
                                else stableCount = 0;
                                lastCheckText = rawText;
                                if (stableCount > 5) { resolve({ status: 'FALLBACK_DIFF', text: rawText }); return; }
                            }

                            if (Date.now() - startTime > 120000) { resolve({ status: 'TIMEOUT', text: '' }); return; }
                            setTimeout(check, 500);
                        };
                        check();
                    });
                }, sel.response, TAG_START, TAG_END, baseline);

                if (finalResponse.status === 'TIMEOUT') throw new Error("Timeout waiting for response");

                console.log(`🏁 [WebGemini] Captured: ${finalResponse.status} | Length: ${finalResponse.text.length}`);

                let cleanText = finalResponse.text
                    .replace(TAG_START, '')
                    .replace(TAG_END, '')
                    .replace(/\[SYSTEM: Please WRAP.*?\]/, '')
                    .trim();

                return cleanText;

            } catch (e) {
                console.warn(`⚠️ [WebGemini] Interaction Failed: ${e.message}`);
                // Simple retry logic logic for selector fix
                if (retryCount === 0) {
                    // ... Doctor Logic ...
                    const html = await session.page.content();
                    const newSel = await this.doctor.diagnose(html, 'response');
                    if (newSel) {
                        this.selectors.response = newSel;
                        this.doctor.saveSelectors(this.selectors);
                        return tryInteract(this.selectors, retryCount + 1);
                    }
                }
                throw e;
            }
        };

        return await tryInteract(this.selectors);
    }
}

module.exports = WebGeminiBrain;
