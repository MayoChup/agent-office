/**
 * Jembatan ke Kronos — model dasar sumber terbuka untuk candlestick (github.com/shiyu-coder/Kronos, MIT).
 * Kronos berjalan di VPS sebagai proses Python terpisah (PyTorch CPU); data harga tidak dikirim ke pihak lain.
 * - pasang(): memasang lingkungan Python + bobot model (sekali, lewat tombol di halaman Trading).
 * - prediksi(): meminta N jalur candlestick ke depan dari riwayat batang yang diberikan.
 * Pekerja Python dinyalakan saat dibutuhkan dan dimatikan setelah 10 menit menganggur (menghemat RAM VPS).
 */
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import RUNNER from './kronos/runner.py';
import PASANG from './kronos/pasang.sh';

export interface BarK { t: string; o: number; h: number; l: number; c: number; v?: number }
export interface StatusKronos { terpasang: boolean; memasang: boolean; log: string[]; error: string; model: string; siap: boolean; muatDetik?: number }
const MODEL: Record<string, [string, string, number]> = {
    mini: ['NeoQuasar/Kronos-mini', 'NeoQuasar/Kronos-Tokenizer-2k', 2048],
    small: ['NeoQuasar/Kronos-small', 'NeoQuasar/Kronos-Tokenizer-base', 512],
    base: ['NeoQuasar/Kronos-base', 'NeoQuasar/Kronos-Tokenizer-base', 512]
};

export class Kronos {
    private dir: string;
    private ukuran: string;
    private memasang = false;
    private log: string[] = [];
    private error = '';
    private proc: ChildProcessWithoutNullStreams | null = null;
    private siap: Promise<void> | null = null;
    private info: { muatDetik?: number } = {};
    private tunggu = new Map<string, { ok: (v: any) => void; gagal: (e: Error) => void; t: NodeJS.Timeout }>();
    private antre: Promise<any> = Promise.resolve();
    private diam: NodeJS.Timeout | null = null;
    private seq = 0;

    constructor(dataDir: string, ukuran = process.env.KRONOS_UKURAN || 'small') {
        this.dir = path.join(dataDir, 'kronos');
        this.ukuran = MODEL[ukuran] ? ukuran : 'small';
        try { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(path.join(this.dir, 'runner.py'), RUNNER); fs.writeFileSync(path.join(this.dir, 'pasang.sh'), PASANG); } catch (e: any) { console.warn('[Kronos]', e?.message || e); }
    }
    private get py() { return path.join(this.dir, 'venv', 'bin', 'python'); }
    get terpasang() { return fs.existsSync(path.join(this.dir, 'terpasang')) && fs.existsSync(this.py); }
    get maksKonteks() { return MODEL[this.ukuran][2]; }
    status(): StatusKronos { return { terpasang: this.terpasang, memasang: this.memasang, log: this.log.slice(-8), error: this.error, model: MODEL[this.ukuran][0], siap: !!this.proc, muatDetik: this.info.muatDetik }; }

    /** Pasang Kronos (±1,5 GB, beberapa menit). Aman diulang. */
    pasang(): boolean {
        if (this.memasang) return false;
        this.memasang = true; this.error = ''; this.log = ['Mulai memasang…'];
        const [m, tk] = MODEL[this.ukuran];
        const p = spawn('bash', [path.join(this.dir, 'pasang.sh'), this.dir, m, tk], { env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', HF_HUB_DISABLE_TELEMETRY: '1' } });
        const tulis = (b: Buffer) => { for (const l of String(b).split(/\r?\n/)) if (l.trim()) { this.log.push(l.trim().slice(0, 300)); if (this.log.length > 60) this.log.shift(); } };
        p.stdout.on('data', tulis); p.stderr.on('data', tulis);
        p.on('error', (e) => { this.memasang = false; this.error = String(e.message || e); });
        p.on('close', (kode) => { this.memasang = false; if (kode !== 0) this.error = this.log.filter((l) => /GAGAL|ERROR|Error/.test(l)).slice(-1)[0] || `Pemasangan berhenti (kode ${kode}).`; });
        return true;
    }

    private nyalakan(): Promise<void> {
        if (this.siap) return this.siap;
        if (!this.terpasang) return Promise.reject(new Error('Kronos belum terpasang di VPS.'));
        const [m, tk, ctx] = MODEL[this.ukuran];
        this.siap = new Promise<void>((ok, gagal) => {
            const p = spawn(this.py, ['-u', path.join(this.dir, 'runner.py')], { env: { ...process.env, KRONOS_REPO: path.join(this.dir, 'repo'), KRONOS_MODEL: m, KRONOS_TOKENIZER: tk, KRONOS_MAX_CONTEXT: String(ctx), HF_HUB_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' } });
            this.proc = p;
            let errTeks = '';
            p.stderr.on('data', (b) => { errTeks = (errTeks + String(b)).slice(-600); });
            const rl = readline.createInterface({ input: p.stdout });
            const batas = setTimeout(() => { gagal(new Error('Kronos terlalu lama dimuat.')); this.matikan(); }, 180_000);
            rl.on('line', (line) => {
                let j: any; try { j = JSON.parse(line); } catch { return; }
                if ('siap' in j) { clearTimeout(batas); if (j.siap) { this.info.muatDetik = j.muat_detik; ok(); } else { gagal(new Error(j.error || 'Kronos gagal dimuat.')); this.matikan(); } return; }
                const w = this.tunggu.get(String(j.id)); if (!w) return;
                clearTimeout(w.t); this.tunggu.delete(String(j.id));
                if (j.ok) w.ok(j); else w.gagal(new Error(j.error || 'Kronos gagal memprediksi.'));
            });
            p.on('close', () => {
                clearTimeout(batas);
                if (this.proc === p) { this.proc = null; this.siap = null; }
                for (const [, w] of this.tunggu) { clearTimeout(w.t); w.gagal(new Error(`Kronos berhenti. ${errTeks.split('\n').filter(Boolean).slice(-1)[0] || ''}`.trim())); }
                this.tunggu.clear();
                gagal(new Error(`Kronos tidak bisa dijalankan. ${errTeks.split('\n').filter(Boolean).slice(-1)[0] || ''}`.trim()));
            });
            p.on('error', (e) => gagal(e));
        });
        this.siap.catch(() => { this.siap = null; });
        return this.siap;
    }
    matikan() { try { this.proc?.kill(); } catch { /* */ } this.proc = null; this.siap = null; }

    /** N jalur candlestick ke depan. Satu permintaan dalam satu waktu (CPU VPS terbatas). */
    prediksi(bars: BarK[], yT: string[], n: number, T = 1.0, topP = 0.9): Promise<{ paths: number[][][]; detik: number; konteks: number }> {
        const kerja = async () => {
            await this.nyalakan();
            if (this.diam) clearTimeout(this.diam);
            const id = String(++this.seq);
            try {
                return await new Promise<any>((ok, gagal) => {
                    const t = setTimeout(() => { this.tunggu.delete(id); gagal(new Error('Kronos terlalu lama (>4 menit).')); this.matikan(); }, 240_000);
                    this.tunggu.set(id, { ok, gagal, t });
                    this.proc!.stdin.write(JSON.stringify({ id, bars, y_t: yT, n, T, top_p: topP }) + '\n');
                });
            } finally {
                this.diam = setTimeout(() => this.matikan(), 10 * 60_000);
            }
        };
        const p = this.antre.then(kerja, kerja);
        this.antre = p.catch(() => undefined);
        return p;
    }
}

/** Hari bursa berikutnya (lewati Sabtu/Minggu) setelah tanggal terakhir. */
export function hariBursaBerikut(terakhir: string, n: number): string[] {
    const out: string[] = []; const d = new Date(`${terakhir.slice(0, 10)}T00:00:00Z`);
    while (out.length < n) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10)); }
    return out;
}
