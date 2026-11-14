import fs from 'fs';
import path from 'path';

/**
 * Otak gratis kantor: model OpenRouter berakhiran ":free".
 *
 * - Memilih model :free otomatis (atau daftar yang ditentukan) dan pindah ke model
 *   lain kalau satu model sedang penuh / tidak tersedia.
 * - Menjaga kuota: batas per menit dan per hari (OpenRouter: 20/menit, 1.000/hari
 *   kalau total pembelian kredit sudah >= $10, 50/hari kalau belum).
 * - Pemakaian harian disimpan di data/kantor-usage.json supaya tetap terhitung
 *   setelah server restart.
 */

export interface FreeLlmOptions {
    apiKey: string;
    baseUrl: string;
    model: string; // "auto" atau "id1,id2"
    dailyLimit: number;
    perMinuteLimit: number;
    dataDir: string;
    /** Penyedia AI gratis cadangan (Gemini / Groq), dipakai kalau semua model OpenRouter sibuk. */
    backups?: BackupProvider[];
}

export interface BackupProvider {
    name: string;              // "Gemini" | "Groq"
    baseUrl: string;           // endpoint kompatibel OpenAI
    apiKey: string;
    model?: string;            // kosong = pilih otomatis
    prefer: RegExp[];          // urutan pilihan model otomatis
    avoid: RegExp;             // model yang tidak cocok (gambar, suara, dll.)
}

export function backupProviders(env: Record<string, string | undefined>): BackupProvider[] {
    const list: BackupProvider[] = [];
    if (env.GEMINI_API_KEY) list.push({
        name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL,
        prefer: [/flash-lite(?!.*preview)/, /flash(?!.*preview)/, /flash/],
        avoid: /image|tts|audio|live|embed|vision|thinking|learnlm|aqa|imagen|veo|robotics|computer/i
    });
    if (env.GROQ_API_KEY) list.push({
        name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL,
        prefer: [/^llama-3\.3-70b/, /llama-4/, /gpt-oss-120b/, /qwen/, /llama/],
        avoid: /whisper|tts|guard|playai|vision|compound|distil|orpheus/i
    });
    return list;
}

export interface UsageSnapshot {
    date: string;
    used: number;
    dailyLimit: number;
    activeModel: string | null;
    enabled: boolean;
    lastError: string | null;
}

// Urutan kesukaan saat memilih otomatis: model yang biasanya bagus mengikuti format JSON.
const PREFERENCE = ['deepseek', 'llama-3.3', 'llama-4', 'qwen', 'gemma', 'mistral', 'glm', 'kimi', 'nemotron'];

const utcDate = () => new Date().toISOString().slice(0, 10);

export class FreeLlm {
    private candidates: string[] = [];
    private cooldownUntil = new Map<string, number>();
    private recent: number[] = [];
    private usage = { date: utcDate(), used: 0 };
    private usageFile: string;
    private lastError: string | null = null;
    private lastModelRefresh = 0;
    /** Model yang terakhir berhasil menjawab: dicoba lebih dulu (biasanya sedang longgar). */
    private lastGood: string | null = null;
    private backupModels = new Map<string, { model: string | null; at: number }>();
    private backupCooldown = new Map<string, number>();
    private lastProvider: string | null = null;

    constructor(private opts: FreeLlmOptions) {
        this.usageFile = path.join(opts.dataDir, 'kantor-usage.json');
        try {
            fs.mkdirSync(opts.dataDir, { recursive: true });
            if (fs.existsSync(this.usageFile)) {
                const saved = JSON.parse(fs.readFileSync(this.usageFile, 'utf8'));
                if (saved?.date === utcDate()) this.usage = { date: saved.date, used: Number(saved.used) || 0 };
            }
        } catch {
            /* abaikan, mulai dari nol */
        }
    }

    get enabled(): boolean {
        return Boolean(this.opts.apiKey) || Boolean(this.opts.backups?.length);
    }

    snapshot(): UsageSnapshot {
        this.rollDay();
        return {
            date: this.usage.date,
            used: this.usage.used,
            dailyLimit: this.opts.dailyLimit,
            activeModel: this.lastProvider && this.lastProvider !== 'OpenRouter' ? `${this.lastProvider} (cadangan)` : this.currentModel(),
            enabled: this.enabled,
            lastError: this.lastError
        };
    }

    /** Sisa permintaan hari ini. */
    remainingToday(): number {
        this.rollDay();
        return Math.max(0, this.opts.dailyLimit - this.usage.used);
    }

    /** Apakah boleh memanggil AI sekarang: OpenRouter masih ada kuota, atau ada penyedia cadangan. */
    canCall(): boolean {
        return this.orCanCall() || Boolean(this.opts.backups?.length);
    }

    /** Kuota OpenRouter (harian & per menit). */
    private orCanCall(): boolean {
        if (!this.opts.apiKey) return false;
        if (this.remainingToday() <= 0) return false;
        const now = Date.now();
        this.recent = this.recent.filter((t) => now - t < 60_000);
        return this.recent.length < this.opts.perMinuteLimit;
    }

    private rollDay() {
        const today = utcDate();
        if (this.usage.date !== today) this.usage = { date: today, used: 0 };
    }

    private record() {
        this.rollDay();
        this.usage.used += 1;
        this.recent.push(Date.now());
        try {
            fs.writeFileSync(this.usageFile, JSON.stringify(this.usage));
        } catch {
            /* tidak fatal */
        }
    }

    private currentModel(exclude: string[] = []): string | null {
        const now = Date.now();
        const free = (m: string) => (this.cooldownUntil.get(m) || 0) <= now && !exclude.includes(m);
        if (this.lastGood && this.candidates.includes(this.lastGood) && free(this.lastGood)) return this.lastGood;
        return this.candidates.find(free) || null;
    }

    private async refreshModels(force = false) {
        const now = Date.now();
        if (!force && this.candidates.length && now - this.lastModelRefresh < 6 * 60 * 60 * 1000) return;
        this.lastModelRefresh = now;

        if (this.opts.model && this.opts.model !== 'auto') {
            const wanted = this.opts.model.split(',').map((s) => s.trim()).filter(Boolean);
            // Pengaman biaya: hanya model ":free", kecuali sengaja diizinkan.
            const allowPaid = ['1', 'true', 'ya', 'yes'].includes(String(process.env.KANTOR_ALLOW_PAID || '').toLowerCase());
            this.candidates = allowPaid ? wanted : wanted.filter((m) => m.endsWith(':free'));
            const rejected = wanted.filter((m) => !this.candidates.includes(m));
            if (rejected.length) {
                this.lastError = `Model berbayar diabaikan (${rejected.join(', ')}). Set KANTOR_ALLOW_PAID=1 kalau memang mau.`;
                console.warn('[FreeLlm]', this.lastError);
            }
            return;
        }

        try {
            const res = await fetch(`${this.opts.baseUrl}/models`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: any = await res.json();
            const free: Array<{ id: string; ctx: number }> = (data?.data || [])
                .filter((m: any) => typeof m?.id === 'string' && m.id.endsWith(':free'))
                .map((m: any) => ({ id: m.id, ctx: Number(m.context_length) || 0 }));

            const rank = (id: string) => {
                const i = PREFERENCE.findIndex((p) => id.toLowerCase().includes(p));
                return i === -1 ? PREFERENCE.length : i;
            };
            free.sort((a, b) => rank(a.id) - rank(b.id) || b.ctx - a.ctx);
            this.candidates = free.slice(0, 10).map((m) => m.id);
            console.log(`[FreeLlm] Model gratis tersedia: ${this.candidates.join(', ') || '(tidak ada)'}`);
        } catch (err: any) {
            this.lastError = `Gagal mengambil daftar model: ${err?.message || err}`;
            console.error('[FreeLlm]', this.lastError);
        }
    }

    /** Satu panggilan ke satu model OpenRouter. Mengembalikan teks atau null (dan mencatat cooldown). */
    private async callOpenRouter(model: string, system: string, user: string, maxTokens: number, signal?: AbortSignal): Promise<string | null> {
        this.record();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45_000);
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort);
        try {
            const res = await fetch(`${this.opts.baseUrl}/chat/completions`, {
                method: 'POST',
                signal: controller.signal,
                headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Kantor Virtual' },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                    temperature: 0.8,
                    max_tokens: maxTokens
                })
            });
            if (!res.ok) {
                const body = (await res.text()).slice(0, 200);
                this.lastError = `${model}: HTTP ${res.status} ${body}`;
                // 429 = sibuk/kuota, 404/400 = model hilang, 5xx = gangguan
                const cooldown = res.status === 429 ? 3 * 60_000 : res.status >= 500 ? 5 * 60_000 : 60 * 60_000;
                this.cooldownUntil.set(model, Date.now() + cooldown);
                if (this.lastGood === model) this.lastGood = null;
                console.warn('[FreeLlm]', this.lastError);
                return null;
            }
            const data: any = await res.json();
            const text: string = data?.choices?.[0]?.message?.content || '';
            if (!text.trim()) {
                this.cooldownUntil.set(model, Date.now() + 5 * 60_000);
                return null;
            }
            this.lastGood = model;
            this.lastProvider = 'OpenRouter';
            this.lastError = null;
            return text;
        } catch (err: any) {
            if (signal?.aborted) return null;   // dibatalkan karena model lain sudah menjawab
            this.lastError = `${model}: ${err?.name === 'AbortError' ? 'timeout' : err?.message || err}`;
            this.cooldownUntil.set(model, Date.now() + 5 * 60_000);
            if (this.lastGood === model) this.lastGood = null;
            console.warn('[FreeLlm]', this.lastError);
            return null;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }

    /** Pilih model untuk penyedia cadangan (sekali per 6 jam). */
    private async backupModel(b: BackupProvider): Promise<string | null> {
        if (b.model) return b.model;
        const cached = this.backupModels.get(b.name);
        if (cached && Date.now() - cached.at < 6 * 3600_000) return cached.model;
        let model: string | null = null;
        try {
            const res = await fetch(`${b.baseUrl}/models`, { headers: { Authorization: `Bearer ${b.apiKey}` } });
            const data: any = await res.json();
            const ids: string[] = (data?.data || []).map((m: any) => String(m.id || '').replace(/^models\//, '')).filter((id: string) => id && !b.avoid.test(id));
            for (const re of b.prefer) {
                const hit = ids.filter((id) => re.test(id)).sort().reverse()[0];
                if (hit) { model = hit; break; }
            }
            if (!model) model = ids[0] || null;
            console.log(`[FreeLlm] Cadangan ${b.name}: ${model || '(tidak ada model cocok)'}`);
        } catch (e: any) {
            console.warn(`[FreeLlm] Cadangan ${b.name} gagal dicek: ${e?.message || e}`);
        }
        this.backupModels.set(b.name, { model, at: Date.now() });
        return model;
    }

    /** Coba penyedia cadangan satu per satu. Tidak memakai kuota OpenRouter. */
    private async callBackups(system: string, user: string, maxTokens: number): Promise<string | null> {
        for (const b of this.opts.backups || []) {
            if ((this.backupCooldown.get(b.name) || 0) > Date.now()) continue;
            const model = await this.backupModel(b);
            if (!model) continue;
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 40_000);
                const res = await fetch(`${b.baseUrl}/chat/completions`, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: { Authorization: `Bearer ${b.apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
                        temperature: 0.8,
                        max_tokens: maxTokens
                    })
                });
                clearTimeout(timer);
                if (!res.ok) {
                    const body = (await res.text()).slice(0, 160);
                    this.lastError = `${b.name} ${model}: HTTP ${res.status} ${body}`;
                    this.backupCooldown.set(b.name, Date.now() + (res.status === 429 ? 2 * 60_000 : res.status === 401 || res.status === 403 ? 6 * 3600_000 : 5 * 60_000));
                    if (res.status === 404 || res.status === 400) this.backupModels.delete(b.name);
                    console.warn('[FreeLlm]', this.lastError);
                    continue;
                }
                const data: any = await res.json();
                const text: string = data?.choices?.[0]?.message?.content || '';
                if (!text.trim()) continue;
                this.lastProvider = b.name;
                this.lastError = null;
                return text;
            } catch (e: any) {
                this.lastError = `${b.name}: ${e?.name === 'AbortError' ? 'timeout' : e?.message || e}`;
                this.backupCooldown.set(b.name, Date.now() + 2 * 60_000);
                console.warn('[FreeLlm]', this.lastError);
            }
        }
        return null;
    }

    /**
     * Kirim prompt dan kembalikan teks jawaban, atau null kalau tidak bisa
     * (kuota habis, semua model sibuk, dsb.).
     *
     * race = true (pesan pemilik): dua model OpenRouter dipanggil bersamaan, jawaban
     * tercepat dipakai. Kalau semua model OpenRouter sibuk, pindah ke penyedia cadangan.
     */
    async complete(system: string, user: string, maxTokens = 350, attempts = 2, race = false): Promise<string | null> {
        const openRouterOk = Boolean(this.opts.apiKey) && this.remainingToday() > 0;
        if (!openRouterOk && !this.opts.backups?.length) return null;
        if (openRouterOk) await this.refreshModels();

        const tried: string[] = [];
        let left = openRouterOk ? attempts : 0;

        if (race && left >= 2 && this.orCanCall()) {
            const a = this.currentModel(tried);
            const b = a ? this.currentModel([...tried, a]) : null;
            if (a && b) {
                tried.push(a, b);
                left -= 2;
                const stop = new AbortController();
                const winner = await new Promise<string | null>((resolve) => {
                    let pending = 2;
                    for (const m of [a, b]) {
                        this.callOpenRouter(m, system, user, maxTokens, stop.signal).then((text) => {
                            if (text) { stop.abort(); resolve(text); }
                            else if (--pending === 0) resolve(null);
                        });
                    }
                });
                if (winner) return winner;
            }
        }

        while (left > 0) {
            let model = this.currentModel(tried);
            if (!model) {
                await this.refreshModels(true);
                model = this.currentModel(tried);
                if (!model) { this.lastError = 'Semua model gratis OpenRouter sedang sibuk.'; break; }
            }
            if (!this.orCanCall()) break;
            tried.push(model);
            left--;
            const text = await this.callOpenRouter(model, system, user, maxTokens);
            if (text) return text;
        }

        // Semua model OpenRouter gagal / sibuk → penyedia cadangan (gratis, kuota terpisah).
        return this.callBackups(system, user, maxTokens);
    }
}

/** Ambil objek JSON pertama dari jawaban model (yang kadang dibungkus ```json). */
export function extractJson(text: string): any | null {
    if (!text) return null;
    const cleaned = text.replace(/```(?:json)?/gi, '');
    const start = cleaned.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(cleaned.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}
