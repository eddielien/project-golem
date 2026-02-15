const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { DOMDoctor } = require('./utils/DOMDoctor');
const skills = require('../skills');
const os = require('os');

puppeteer.use(StealthPlugin());

class WebGeminiBrain {
    constructor(config, memoryDriver) {
        this.name = 'web/gemini';
        this.config = config;
        this.memoryDriver = memoryDriver;

        this.browser = null; // Injected
        this.sessions = new Map(); // contextId -> { page, cdp, initialized }

        this.doctor = null; // Injected or lazy loaded
        this.selectors = null;

        this.isReady = false;
    }

    setSharedDeps({ browser, keyChain }) {
        this.browser = browser;
        if (keyChain) {
            this.doctor = new DOMDoctor(this.config.API_KEYS, keyChain); // Modified DOMDoctor to accept keyChain
            this.selectors = this.doctor.loadSelectors();
        }
    }

    async init() {
        if (this.isReady) return;
        // Browser is injected by BrainManager, so we just mark ready.
        // If browser is null, it means BrainManager failed to launch it or hasn't injected it yet.
        if (!this.browser) {
            console.warn(`⚠️ [WebGemini] Shared browser not available. Waiting...`);
        }
        this.isReady = true;
    }

    async getSession(contextId) {
        if (!this.browser) {
            throw new Error("Browser not initialized via BrainManager");
        }

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

        session.initialized = true;

        console.log(`📡 [WebGemini] Sending System Protocol to new session...`);
        const protocol = `\n\n[SYSTEM: STRICT JSON FORMAT inside [GOLEM_ACTION]. Use [GOLEM_REPLY].]`;
        await this.sendMessage(skills.getSystemPrompt(systemFingerprint) + protocol, { id: contextId }, true);
    }

    async sendMessage(text, context = {}, isSystem = false) {
        const contextId = context.id || 'global';
        const session = await this.getSession(contextId);

        try { await session.page.bringToFront(); } catch (e) { }
        await this.setupCDP(session);

        if (!session.initialized && !isSystem) {
            console.log(`📡 [WebGemini] Session not initialized. Sending System Protocol first...`);
            await this.initSessionProtocol(session, contextId);
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
