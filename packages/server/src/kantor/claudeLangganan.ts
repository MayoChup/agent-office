/**
 * Otak berat dari langganan Claude Pak Rico (jatah "pemakaian otomatis": kredit bulanan senilai biaya langganan, tarif API).
 * - Memanggil Claude Code RESMI (`claude -p`) yang Pak Rico login sendiri di VPS. Kantor tidak pernah membaca/menyimpan token login.
 * - Hanya untuk tugas BERAT. Chat & tugas rutin tetap FreeLLM/Hermes.
 * - Hanya-baca: --permission-mode dontAsk + alat Read/Grep/Glob/WebSearch/WebFetch, di folder kerja kosong (data/claude-kerja),
 *   jadi tidak bisa mengubah berkas kantor atau menjalankan perintah.
 * - Anggaran: kredit bulanan (bawaan $20, KANTOR_CLAUDE_BULANAN) dibagi rata ke sisa hari bulan itu; tiap panggilan dibatasi --max-budget-usd.
 *   Habis / gagal / belum login → tugas berat otomatis pindah ke OpenRouter (model berbayar lama), lalu model gratis.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

interface Catatan { bulan: string; usdBulan: number; hari: string; usdHari: number; n: number; gagal: number; beruntun?: number; galat: string; galatAt: number; butuhLoginAt: number; terakhirAt: number }
const wib = () => new Date(Date.now() + 7 * 3600_000);
const bulanIni = () => wib().toISOString().slice(0, 7);
const hariIni = () => wib().toISOString().slice(0, 10);

export class ClaudeLangganan {
    private file: string; private kerja: string;
    private c: Catatan;
    constructor(private dataDir: string, private hermesHome: string, private env: Record<string, string | undefined> = process.env) {
        this.file = path.join(dataDir, 'claude-langganan.json');
        this.kerja = path.join(dataDir, 'claude-kerja');
        try { this.c = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.c = { bulan: bulanIni(), usdBulan: 0, hari: hariIni(), usdHari: 0, n: 0, gagal: 0, galat: '', galatAt: 0, butuhLoginAt: 0, terakhirAt: 0 }; }
    }
    private simpan() { try { fs.writeFileSync(this.file, JSON.stringify(this.c)); } catch { /* */ } }
    private gulir() {
        if (this.c.bulan !== bulanIni()) { this.c.bulan = bulanIni(); this.c.usdBulan = 0; this.c.n = 0; this.c.gagal = 0; }
        if (this.c.hari !== hariIni()) { this.c.hari = hariIni(); this.c.usdHari = 0; }
    }
    bin(): string | null {
        const kandidat = [this.env.CLAUDE_BIN, path.join(os.homedir(), '.local', 'bin', 'claude'), path.join(os.homedir(), '.claude', 'local', 'claude'), '/usr/local/bin/claude', '/usr/bin/claude'];
        for (const k of kandidat) if (k && fs.existsSync(k)) return k;
        return null;
    }
    /** Kredit bulanan (dikurangi $1 cadangan supaya tidak menyentuh "extra usage"). */
    private bulanan() { return Math.max(1, (Number(this.env.KANTOR_CLAUDE_BULANAN) || 20) - 1); }
    /** Jatah hari ini = sisa kredit bulan ini dibagi sisa hari (termasuk hari ini). Hemat hari ini = lebih longgar besok. */
    jatahHari() {
        this.gulir();
        const w = wib(); const akhir = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + 1, 0)).getUTCDate();
        const sisaHari = akhir - w.getUTCDate() + 1;
        const sisaBulan = Math.max(0, this.bulanan() - this.c.usdBulan + this.c.usdHari);
        return +(sisaBulan / sisaHari).toFixed(3);
    }
    /** Boleh dipakai sekarang? (terpasang, tidak sedang menunggu login, masih ada jatah hari ini) */
    boleh(): boolean {
        if (this.env.KANTOR_CLAUDE_MATI === '1' || !this.bin()) return false;
        if (this.c.butuhLoginAt && Date.now() - this.c.butuhLoginAt < 6 * 3600_000) return false;
        if (this.c.galatAt && Date.now() - this.c.galatAt < 30 * 60_000 && (this.c.beruntun || 0) >= 3) return false;
        return this.jatahHari() - this.c.usdHari > 0.05;
    }
    status() {
        this.gulir();
        const bin = this.bin();
        const login = this.c.butuhLoginAt && Date.now() - this.c.butuhLoginAt < 6 * 3600_000;
        return {
            terpasang: !!bin, perluLogin: !!login, aktif: this.boleh(),
            bulan: this.c.bulan, terpakaiBulan: +this.c.usdBulan.toFixed(3), kreditBulan: this.bulanan() + 1,
            terpakaiHari: +this.c.usdHari.toFixed(3), jatahHari: this.jatahHari(), tugasBulan: this.c.n, gagalBulan: this.c.gagal,
            galat: this.c.galat, galatAt: this.c.galatAt, terakhirAt: this.c.terakhirAt
        };
    }
    /** Persona AI dari Hermes (SOUL.md + ingatan) supaya Claude menjawab sebagai anggota tim yang sama. */
    private persona(aiId: string) {
        const dir = aiId === 'default' ? this.hermesHome : path.join(this.hermesHome, 'profiles', aiId);
        const baca = (f: string, n: number) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').slice(0, n); } catch { return ''; } };
        return [baca('SOUL.md', 12_000), baca(path.join('memories', 'USER.md'), 4000), baca(path.join('memories', 'MEMORY.md'), 8000)].filter(Boolean).join('\n\n---\n\n');
    }
    /** Jalankan satu tugas berat. Melempar galat kalau gagal (pemanggil pindah ke OpenRouter). */
    async jalankan(aiId: string, prompt: string): Promise<{ teks: string; usd: number }> {
        const bin = this.bin(); if (!bin) throw new Error('Claude Code belum terpasang di VPS.');
        fs.mkdirSync(this.kerja, { recursive: true });
        const batas = Math.max(0.05, Math.min(Number(this.env.KANTOR_CLAUDE_PER_TUGAS) || 1, this.jatahHari() - this.c.usdHari));
        const sistem = [
            this.persona(aiId),
            'Kamu sedang dijalankan oleh aplikasi Kantor Virtual sebagai "otak berat" untuk satu tugas sulit. Kamu hanya bisa membaca & mencari di web; tidak bisa menjalankan perintah atau mengubah berkas.',
            'Kalau tugas butuh aksi (mengirim berkas, mengubah jadwal, mencatat transaksi), jelaskan hasil analisismu lalu tulis langkah yang perlu dijalankan; anggota tim akan mengerjakannya.'
        ].filter(Boolean).join('\n\n');
        const args = ['-p', 'Kerjakan tugas yang diberikan lewat masukan (stdin) di bawah ini. Jawab langsung hasilnya.', '--output-format', 'json', '--permission-mode', 'dontAsk', '--allowedTools', 'Read,Grep,Glob,WebSearch,WebFetch',
            '--max-budget-usd', batas.toFixed(2), '--append-system-prompt', sistem];
        if (this.env.KANTOR_CLAUDE_MODEL) args.push('--model', this.env.KANTOR_CLAUDE_MODEL);
        const keluar = await new Promise<{ code: number | null; out: string; err: string }>((ok) => {
            const p = spawn(bin, args, { cwd: this.kerja, env: { PATH: process.env.PATH || '', HOME: os.homedir(), LANG: 'C.UTF-8' }, stdio: ['pipe', 'pipe', 'pipe'] });
            let out = '', err = '';
            const t = setTimeout(() => p.kill('SIGINT'), 10 * 60_000);
            p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
            p.on('close', (code) => { clearTimeout(t); ok({ code, out, err }); });
            p.on('error', (e) => { clearTimeout(t); ok({ code: -1, out, err: String(e?.message || e) }); });
            p.stdin.end(prompt.slice(0, 900_000));
        });
        let j: any = null; try { j = JSON.parse(keluar.out.trim().split('\n').filter(Boolean).pop() || ''); } catch { /* bukan JSON */ }
        const usd = Number(j?.total_cost_usd) || 0;
        this.gulir();
        this.c.usdBulan += usd; this.c.usdHari += usd; this.c.terakhirAt = Date.now();
        const teks = String(j?.result ?? '').trim();
        const galat = j?.is_error || keluar.code !== 0 || !teks;
        if (galat) {
            const pesan = (teks || keluar.err || keluar.out || 'tidak ada jawaban').replace(/\s+/g, ' ').slice(0, 300);
            if (/login|log in|authenticat|api key|credential|unauthori|401|oauth/i.test(pesan)) this.c.butuhLoginAt = Date.now();
            this.c.gagal++; this.c.beruntun = (this.c.beruntun || 0) + 1; this.c.galat = pesan; this.c.galatAt = Date.now(); this.simpan();
            throw new Error(`Claude (langganan): ${pesan}`);
        }
        this.c.n++; this.c.butuhLoginAt = 0; this.c.beruntun = 0; this.simpan();
        return { teks, usd };
    }
}
