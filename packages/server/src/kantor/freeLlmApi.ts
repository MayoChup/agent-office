/**
 * FreeLLMAPI (MIT, github.com/tashfeenahmed/freellmapi) dijalankan kantor sebagai proses anak di VPS.
 * - Hanya mendengar di 127.0.0.1 (tidak bisa diakses dari internet).
 * - Kunci enkripsi dibuat sekali di data/freellm/kunci (izin 600), tidak pernah ditampilkan.
 * - Kunci penyedia yang SUDAH ada di VPS (Gemini, Groq, OpenRouter) diteruskan lewat konfigurasi deklaratif di memori
 *   (FREEAPI_CONFIG_JSON), tidak ditulis ke berkas oleh kantor. Kunci penyedia lain Pak Rico isi sendiri di dasbornya.
 * - Kebijakan kantor: jalur ini HANYA untuk tugas non-pribadi (berita, konten, Reels, riset). Keuangan & chat pribadi tidak lewat sini.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync, type ChildProcess } from 'child_process';

export class FreeLlmApi {
    private proc: ChildProcess | null = null;
    private dir: string; private data: string;
    private kunciApi = ''; private mulaiAt = 0; private gagalBeruntun = 0;
    port: number;
    status: { jalan: boolean; versi: string | null; pesan: string; model: number | null; cekAt: number } = { jalan: false, versi: null, pesan: 'Belum dipasang.', model: null, cekAt: 0 };

    constructor(appDir: string, dataDir: string, private env: Record<string, string | undefined>) {
        this.dir = path.join(appDir, 'freellm');
        this.data = path.join(dataDir, 'freellm');
        this.port = Number(env.FREELLM_PORT) || 3001;
    }
    terpasang() { return fs.existsSync(path.join(this.dir, 'server', 'dist', 'index.js')); }
    siap() { return this.status.jalan && !!this.kunciApi; }

    private kunciEnkripsi() {
        fs.mkdirSync(this.data, { recursive: true, mode: 0o700 });
        const f = path.join(this.data, 'kunci');
        if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
        return fs.readFileSync(f, 'utf8').trim();
    }
    private konfig() {
        const keys: Array<{ platform: string; key: string; label: string }> = [];
        const tambah = (platform: string, nama: string) => { const k = this.env[nama]; if (k) keys.push({ platform, key: k, label: 'dari VPS kantor' }); };
        tambah('google', 'GEMINI_API_KEY'); tambah('groq', 'GROQ_API_KEY'); tambah('openrouter', 'OPENROUTER_API_KEY');
        tambah('cerebras', 'CEREBRAS_API_KEY'); tambah('mistral', 'MISTRAL_API_KEY'); tambah('nvidia', 'NVIDIA_API_KEY');
        return JSON.stringify({ keys, routing: { strategy: 'balanced' } });
    }

    start() {
        if (!this.terpasang()) { this.status.pesan = 'Belum terpasang (menunggu pembaruan otomatis VPS).'; return; }
        if (this.proc) return;
        try { this.status.versi = fs.readFileSync(path.join(this.dir, 'VERSI'), 'utf8').trim().slice(0, 12); } catch { /* */ }
        const log = fs.openSync(path.join((fs.mkdirSync(this.data, { recursive: true }), this.data), 'log.txt'), 'w');
        this.mulaiAt = Date.now();
        this.proc = spawn(process.execPath, [path.join(this.dir, 'server', 'dist', 'index.js')], {
            cwd: path.join(this.dir, 'server'),
            env: {
                PATH: process.env.PATH || '', HOME: process.env.HOME || '', NODE_ENV: 'production',
                HOST: '127.0.0.1', PORT: String(this.port),
                ENCRYPTION_KEY: this.kunciEnkripsi(),
                FREEAPI_DB_PATH: path.join(this.data, 'freeapi.db'),
                FREEAPI_CONFIG_JSON: this.konfig(),
                FREELLMAPI_INSTALL_METHOD: 'kantor-virtual'
            },
            stdio: ['ignore', log, log]
        });
        this.status.pesan = 'Menyalakan…';
        this.proc.on('exit', (code) => {
            this.proc = null; this.status.jalan = false; this.kunciApi = '';
            this.gagalBeruntun = Date.now() - this.mulaiAt < 60_000 ? this.gagalBeruntun + 1 : 0;
            this.status.pesan = `Berhenti (kode ${code}). ${this.gagalBeruntun >= 5 ? 'Gagal berulang, dicoba lagi 30 menit lagi.' : 'Menyalakan ulang…'}`;
            setTimeout(() => this.start(), this.gagalBeruntun >= 5 ? 30 * 60_000 : 10_000 * Math.max(1, this.gagalBeruntun));
        });
        setTimeout(() => void this.cek(), 8000);
    }
    stop() { try { this.proc?.kill(); } catch { /* */ } }

    /** Ambil kunci terpadu dari database FreeLLMAPI (dibaca dengan better-sqlite3 milik paketnya sendiri). Hanya disimpan di memori. */
    private bacaKunci(): string {
        const r = spawnSync(process.execPath, ['-e', "const D=require('better-sqlite3');const db=new D(process.argv[1],{readonly:true,fileMustExist:true});const x=db.prepare(\"SELECT value FROM settings WHERE key='unified_api_key'\").get();process.stdout.write(x&&x.value||'')", path.join(this.data, 'freeapi.db')], { cwd: this.dir, encoding: 'utf8', timeout: 10_000 });
        return /^freellmapi-[0-9a-f]{20,}$/.test((r.stdout || '').trim()) ? r.stdout.trim() : '';
    }
    async cek() {
        if (!this.proc) return this.status;
        try {
            if (!this.kunciApi) this.kunciApi = this.bacaKunci();
            if (!this.kunciApi) throw new Error('kunci terpadu belum ada');
            const r = await fetch(`http://127.0.0.1:${this.port}/v1/models`, { headers: { Authorization: `Bearer ${this.kunciApi}` }, signal: AbortSignal.timeout(8000) });
            if (r.status === 401) { this.kunciApi = ''; throw new Error('kunci terpadu berubah'); }
            const j: any = await r.json();
            this.status = { ...this.status, jalan: true, model: Array.isArray(j?.data) ? j.data.length : null, pesan: 'Jalan', cekAt: Date.now() };
        } catch (e: any) {
            this.status = { ...this.status, jalan: false, pesan: `Belum siap: ${String(e?.message || e).slice(0, 120)}`, cekAt: Date.now() };
            setTimeout(() => void this.cek(), 30_000);
        }
        return this.status;
    }
    /** Panggilan teks (OpenAI-compatible). model "auto" = router memilih model gratis terbaik yang tersedia. */
    async chat(sistem: string, prompt: string, maks = 4000, model = this.env.FREELLM_MODEL || 'auto'): Promise<{ teks: string; model: string }> {
        if (!this.siap()) throw new Error(`FreeLLM belum siap (${this.status.pesan}).`);
        const r = await fetch(`http://127.0.0.1:${this.port}/v1/chat/completions`, {
            method: 'POST', signal: AbortSignal.timeout(120_000), headers: { Authorization: `Bearer ${this.kunciApi}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'system', content: sistem }, { role: 'user', content: prompt }], temperature: 0.7, max_tokens: maks })
        });
        if (!r.ok) throw new Error(`FreeLLM: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
        const j: any = await r.json();
        const teks = String(j?.choices?.[0]?.message?.content || '').trim();
        if (!teks) throw new Error('FreeLLM: jawaban kosong.');
        return { teks, model: String(j?.model || model) };
    }
}
