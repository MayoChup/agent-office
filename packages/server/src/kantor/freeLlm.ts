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
        return Boolean(this.opts.apiKey);
    }

    snapshot(): UsageSnapshot {
        this.rollDay();
        return {
            date: this.usage.date,
            used: this.usage.used,
            dailyLimit: this.opts.dailyLimit,
            activeModel: this.currentModel(),
            enabled: this.enabled,
            lastError: this.lastError
        };
    }

    /** Sisa permintaan hari ini. */
    remainingToday(): number {
        this.rollDay();
        return Math.max(0, this.opts.dailyLimit - this.usage.used);
    }

    /** Apakah boleh memanggil AI sekarang (kuota harian & per menit). */
    canCall(): boolean {
        if (!this.enabled) return false;
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

    private currentModel(): string | null {
        const now = Date.now();
        return this.candidates.find((m) => (this.cooldownUntil.get(m) || 0) <= now) || null;
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

    /**
     * Kirim prompt dan kembalikan teks jawaban, atau null kalau tidak bisa
     * (kuota habis, semua model sibuk, dsb.).
     */
    async complete(system: string, user: string, maxTokens = 350, attempts = 2): Promise<string | null> {
        if (!this.canCall()) return null;
        await this.refreshModels();

        // Maksimal 2 percobaan per "berpikir": percobaan gagal ikut memakan kuota harian.
        for (let attempt = 0; attempt < attempts; attempt++) {
            const model = this.currentModel();
            if (!model) {
                // Semua sedang cooldown: coba ambil ulang daftar sekali.
                await this.refreshModels(true);
                if (!this.currentModel()) {
                    this.lastError = 'Semua model gratis sedang sibuk.';
                    return null;
                }
                continue;
            }
            if (!this.canCall()) return null;
            this.record();

            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 45_000);
                const res = await fetch(`${this.opts.baseUrl}/chat/completions`, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: {
                        Authorization: `Bearer ${this.opts.apiKey}`,
                        'Content-Type': 'application/json',
                        'X-Title': 'Kantor Virtual'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: 'system', content: system },
                            { role: 'user', content: user }
                        ],
                        temperature: 0.8,
                        max_tokens: maxTokens
                    })
                });
                clearTimeout(timer);

                if (!res.ok) {
                    const body = (await res.text()).slice(0, 200);
                    this.lastError = `${model}: HTTP ${res.status} ${body}`;
                    // 429 = sibuk/kuota, 404/400 = model hilang, 5xx = gangguan
                    const cooldown = res.status === 429 ? 3 * 60_000 : res.status >= 500 ? 5 * 60_000 : 60 * 60_000;
                    this.cooldownUntil.set(model, Date.now() + cooldown);
                    console.warn('[FreeLlm]', this.lastError);
                    continue;
                }

                const data: any = await res.json();
                const text: string = data?.choices?.[0]?.message?.content || '';
                if (!text.trim()) {
                    this.cooldownUntil.set(model, Date.now() + 5 * 60_000);
                    continue;
                }
                this.lastError = null;
                return text;
            } catch (err: any) {
                this.lastError = `${model}: ${err?.name === 'AbortError' ? 'timeout' : err?.message || err}`;
                this.cooldownUntil.set(model, Date.now() + 5 * 60_000);
                console.warn('[FreeLlm]', this.lastError);
            }
        }
        return null;
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
