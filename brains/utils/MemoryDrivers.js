const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync } = require('child_process');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class SystemQmdDriver {
    constructor(config) {
        this.baseDir = path.join(process.cwd(), 'golem_memory', 'knowledge');
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
        this.qmdCmd = 'qmd';
        this.config = config;
    }
    async init() {
        console.log("🔍 [Memory:Qmd] Probe...");
        try {
            if (this.config.QMD_PATH && this.config.QMD_PATH !== 'qmd' && fs.existsSync(this.config.QMD_PATH)) {
                this.qmdCmd = `"${this.config.QMD_PATH}"`;
            } else {
                // Simplified check
                this.qmdCmd = 'qmd';
            }
            console.log(`🧠 [Memory:Qmd] Engine Active: ${this.qmdCmd}`);
        } catch (e) {
            console.error(`❌ [Memory:Qmd] Failed.`);
            throw new Error("QMD_MISSING");
        }
    }
    async recall(query) {
        return new Promise((resolve) => {
            const safeQuery = query.replace(/"/g, '\\"');
            const cmd = `${this.qmdCmd} search golem-core "${safeQuery}" --hybrid --limit 3`;
            exec(cmd, (err, stdout) => {
                if (err) { resolve([]); return; }
                const result = stdout.trim();
                if (result) resolve([{ text: result, score: 0.95, metadata: { source: 'qmd' } }]);
                else resolve([]);
            });
        });
    }
    async memorize(text, metadata) {
        const filename = `mem_${Date.now()}.md`;
        const filepath = path.join(this.baseDir, filename);
        fs.writeFileSync(filepath, `---\ndate: ${new Date().toISOString()}\ntype: ${metadata.type || 'general'}\n---\n${text}`, 'utf8');
        exec(`${this.qmdCmd} embed golem-core "${filepath}"`, (err) => { });
    }
    async addSchedule(task, time) { console.warn("⚠️ QMD Mode: Schedule not supported"); }
    async checkDueTasks() { return []; }
}

class SystemNativeDriver {
    constructor() {
        this.baseDir = path.join(process.cwd(), 'golem_memory', 'knowledge');
        if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true });
    }
    async init() { console.log("🧠 [Memory:Native] Active"); }
    async recall(query) {
        try {
            const files = fs.readdirSync(this.baseDir).filter(f => f.endsWith('.md'));
            const results = [];
            for (const file of files) {
                const content = fs.readFileSync(path.join(this.baseDir, file), 'utf8');
                const keywords = query.toLowerCase().split(/\s+/);
                let score = 0;
                keywords.forEach(k => { if (content.toLowerCase().includes(k)) score += 1; });
                if (score > 0) results.push({ text: content.replace(/---[\s\S]*?---/, '').trim(), score: score / keywords.length, metadata: { source: file } });
            }
            return results.sort((a, b) => b.score - a.score).slice(0, 3);
        } catch (e) { return []; }
    }
    async memorize(text, metadata) {
        const filename = `mem_${Date.now()}.md`;
        const filepath = path.join(this.baseDir, filename);
        fs.writeFileSync(filepath, `---\ndate: ${new Date().toISOString()}\ntype: ${metadata.type || 'general'}\n---\n${text}`, 'utf8');
    }
    async addSchedule(task, time) { console.warn("⚠️ Native Mode: Schedule not supported"); }
    async checkDueTasks() { return []; }
}

class BrowserMemoryDriver {
    constructor(config) {
        this.config = config;
        this.browser = null;
        this.memoryPage = null;
    }

    async init() {
        // Do nothing here for Browser mode. We wait for shared browser.
        console.log(`🧠 [Memory:Browser] Standing by for Shared Browser...`);
    }

    async setSharedBrowser(browser) {
        if (this.memoryPage) return;
        this.browser = browser;
        try {
            console.log(`🧠 [Memory:Browser] Connecting to Shared Browser...`);
            this.memoryPage = await this.browser.newPage();
            const memoryPath = 'file:///' + path.join(process.cwd(), 'memory.html').replace(/\\/g, '/');
            console.log(`🧠 [Memory:Browser] Mounting Hippocampus: ${memoryPath}`);
            await this.memoryPage.goto(memoryPath);
        } catch (e) {
            console.error("❌ [Memory:Browser] Failed to attach:", e.message);
        }
    }

    async recall(query) {
        if (!this.memoryPage) return [];
        return await this.memoryPage.evaluate(async (txt) => {
            return window.queryMemory ? await window.queryMemory(txt) : [];
        }, query);
    }
    async memorize(text, metadata) {
        if (!this.memoryPage) return;
        await this.memoryPage.evaluate(async (t, m) => {
            if (window.addMemory) await window.addMemory(t, m);
        }, text, metadata);
    }
    async addSchedule(task, time) {
        if (!this.memoryPage) return;
        await this.memoryPage.evaluate(async (t, time) => {
            if (window.addSchedule) await window.addSchedule(t, time);
        }, task, time);
    }
    async checkDueTasks() {
        if (!this.memoryPage) return [];
        return await this.memoryPage.evaluate(async () => {
            return window.checkSchedule ? await window.checkSchedule() : [];
        });
    }
}

module.exports = { SystemQmdDriver, SystemNativeDriver, BrowserMemoryDriver };
