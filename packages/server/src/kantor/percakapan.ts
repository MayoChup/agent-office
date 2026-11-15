import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { extractJson } from './freeLlm';

/**
 * Chat ala WhatsApp dengan AI Hermes yang ASLI (pakai SOUL, ingatan, dan skill masing-masing).
 *  - Thread pribadi: satu per profil Hermes ("default" = Joni).
 *  - Thread "grup": semua AI membaca; yang membalas hanya yang di-@mention atau yang paling relevan.
 * Balasan dibuat dengan `hermes [-p profil] -z "<prompt>"` (sekali jalan, tanpa token Telegram).
 */

export interface Pesan { id: string; dari: string; nama: string; teks: string; at: number; status?: 'gagal'; berat?: boolean }
export interface Anggota { id: string; nama: string; peran: string; deskripsi: string }
type Llm = { complete(system: string, user: string, maxTokens?: number, attempts?: number): Promise<string | null> } | null;

const MAX_SIMPAN = 300;
const RIWAYAT_PROMPT = 14;
const BATAS_WAKTU = 6 * 60_000;

/** Batas harian pemakaian model berbayar ("berat") supaya tagihan tidak kebablasan. */
export class KuotaBerat {
    private file: string;
    constructor(dataDir: string, public model: string, public perHari: number) {
        try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* */ }
        this.file = path.join(dataDir, 'kantor-berat.json');
    }
    private hari() { return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); }
    terpakai(): number {
        try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); return j.hari === this.hari() ? Number(j.n) || 0 : 0; } catch { return 0; }
    }
    /** true = boleh pakai model berbayar (dan langsung dihitung). */
    ambil(): boolean {
        const n = this.terpakai();
        if (n >= this.perHari) return false;
        try { fs.writeFileSync(this.file, JSON.stringify({ hari: this.hari(), n: n + 1 })); } catch { /* */ }
        return true;
    }
}

/** Jalankan satu AI Hermes sekali. berat = pakai model berbayar (Claude) untuk tugas sulit. */
export async function hermesSekali(run: (bin: string, args: string[]) => Promise<string>, bin: string, profil: string, prompt: string, modelBerat?: string): Promise<string> {
    const prof = profil === 'default' ? [] : ['-p', profil];
    const model = modelBerat ? ['-m', modelBerat, '--provider', 'openrouter'] : [];
    try { return bersihkan(await run(bin, [...prof, ...model, '-z', prompt])); }
    catch (e: any) {
        // Hermes versi lama belum punya -z (oneshot) → pakai "chat -Q -q".
        if (!/unrecognized|invalid choice|no such option|unknown option/i.test(String(e?.message))) throw e;
        return bersihkan(await run(bin, [...prof, ...model, 'chat', '-Q', '-q', prompt]));
    }
}

export class Percakapan {
    private dir: string;
    private menulis = new Map<string, Set<string>>(); // thread → id AI yang sedang mengetik
    private antrean = new Map<string, Promise<void>>(); // satu proses Hermes per profil
    private jalan = 0;
    private seq = Date.now();

    constructor(
        dataDir: string,
        private hermesBin: string,
        private ownerName: string,
        private roster: () => Anggota[],
        private llm: () => Llm,
        private kuota: KuotaBerat | null = null,
        private run: (bin: string, args: string[]) => Promise<string> = jalankan
    ) {
        this.dir = path.join(dataDir, 'percakapan');
        fs.mkdirSync(this.dir, { recursive: true });
    }

    /* ── Penyimpanan ── */
    private file(thread: string) { return path.join(this.dir, `${thread.replace(/[^a-z0-9_-]/gi, '_')}.json`); }
    baca(thread: string): Pesan[] {
        try { return JSON.parse(fs.readFileSync(this.file(thread), 'utf8')); } catch { return []; }
    }
    private tulis(thread: string, list: Pesan[]) {
        fs.writeFileSync(this.file(thread), JSON.stringify(list.slice(-MAX_SIMPAN)));
    }
    private tambah(thread: string, p: Omit<Pesan, 'id'>): Pesan {
        const list = this.baca(thread);
        const msg = { ...p, id: (this.seq++).toString(36) };
        list.push(msg);
        this.tulis(thread, list);
        return msg;
    }

    /** Daftar thread untuk layar depan chat. */
    daftar() {
        const roster = this.roster();
        const item = (id: string, nama: string, peran: string) => {
            const list = this.baca(id);
            const last = list[list.length - 1];
            return { id, nama, peran, terakhir: last ? { nama: last.nama, teks: last.teks.slice(0, 120), at: last.at } : null, menulis: Array.from(this.menulis.get(id) || []) };
        };
        return [item('grup', 'Grup Kantor', `${roster.length} anggota`), ...roster.map((a) => item(a.id, a.nama, a.peran))];
    }

    thread(id: string) {
        return { id, pesan: this.baca(id).slice(-150), menulis: Array.from(this.menulis.get(id) || []) };
    }

    /* ── Kirim pesan dari Pak Rico ── */
    kirim(thread: string, teks: string): Pesan {
        const roster = this.roster();
        if (thread !== 'grup' && !roster.some((a) => a.id === thread)) throw new Error('Chat tidak ditemukan.');
        const t = teks.trim().slice(0, 2000);
        if (!t) throw new Error('Pesan kosong.');
        const msg = this.tambah(thread, { dari: 'owner', nama: this.ownerName, teks: t, at: Date.now() });
        if (thread === 'grup') this.balasGrup(t).catch((e) => console.warn('[Chat] grup:', e?.message || e));
        else this.balas(thread, thread).catch((e) => console.warn('[Chat]', e?.message || e));
        return msg;
    }

    /** Anggota yang di-@sebut (atau @semua = para kepala). Kosong = Joni yang menentukan. */
    disebut(teks: string): string[] {
        const roster = this.roster();
        if (/@(semua|all)\b/i.test(teks)) return roster.filter((a) => a.id === 'default' || !a.id.includes('-')).map((a) => a.id);
        return roster.filter((a) => new RegExp(`@(${esc(a.nama)}|${esc(a.id)})\\b`, 'i').test(teks)).slice(0, 4).map((a) => a.id);
    }

    private riwayat(thread: string) {
        return this.baca(thread).slice(-RIWAYAT_PROMPT)
            .map((p) => `${p.dari === 'owner' ? this.ownerName : p.nama}: ${p.teks.slice(0, 1200)}`).join('\n');
    }

    private async balasGrup(teks: string) {
        const sebut = this.disebut(teks);
        if (sebut.length) { for (const id of sebut) await this.balas('grup', id); return; }

        // Tanpa tag: Joni (kepala) membaca, lalu menjawab sendiri atau menugaskan anggota yang tepat.
        const roster = this.roster();
        const joni = roster.find((a) => a.id === 'default');
        if (!joni) return;
        const daftar = roster.filter((a) => a.id !== 'default').map((a) => `- ${a.id}: ${a.nama} (${a.peran}) — ${a.deskripsi}`.slice(0, 220)).join('\n');
        const prompt = [
            `[Grup chat "Grup Kantor" di aplikasi Kantor Virtual. Kamu ${joni.nama}, kepala kantor & moderator grup.]`,
            'Riwayat terakhir:', this.riwayat('grup'), '',
            'Anggota & jobdesk:', daftar, '',
            `Tentukan cara terbaik menanggapi pesan terakhir ${this.ownerName}:`,
            '- Kalau sapaan/umum/koordinasi atau tidak cocok untuk siapa pun → jawab sendiri.',
            '- Kalau cocok dengan jobdesk anggota → tugaskan 1–3 anggota (urut: yang hasilnya dibutuhkan yang lain lebih dulu), beri instruksi lengkap & jelas.',
            '- "berat": true HANYA kalau tugas butuh analisis panjang/berlapis, dokumen penting, atau model gratis kemungkinan gagal. Selain itu false (gratis).',
            'Jawab HANYA JSON tanpa teks lain:',
            '{"pesan":"kalimat singkatmu di grup, mis. \\"Uang, tolong cek pengeluaran bulan ini ya.\\"","jawaban":"isi jawabanmu kalau kamu menjawab sendiri; kosongkan kalau menugaskan","tugaskan":[{"id":"<id-profil>","instruksi":"...","berat":false}]}'
        ].join('\n');
        const out = await this.jalankanAi('grup', 'default', prompt, false).catch((e) => { this.gagal('grup', joni, e); return null; });
        if (out === null) return;
        const j = extractJson(out);
        const tugas: Array<{ id: string; instruksi: string; berat: boolean }> = (Array.isArray(j?.tugaskan) ? j.tugaskan : [])
            .map((t: any) => ({ id: String(t?.id || ''), instruksi: String(t?.instruksi || '').slice(0, 1500), berat: t?.berat === true }))
            .filter((t: any) => t.id !== 'default' && roster.some((a) => a.id === t.id)).slice(0, 3);
        if (!j || (!tugas.length && !String(j.jawaban || j.pesan || '').trim())) {
            this.tambah('grup', { dari: 'default', nama: joni.nama, teks: out || '(tidak ada jawaban)', at: Date.now() });
            return;
        }
        if (!tugas.length) {
            this.tambah('grup', { dari: 'default', nama: joni.nama, teks: String(j.jawaban || j.pesan).trim(), at: Date.now() });
            return;
        }
        const nama = (id: string) => roster.find((a) => a.id === id)?.nama || id;
        this.tambah('grup', { dari: 'default', nama: joni.nama, teks: String(j.pesan || '').trim() || `${tugas.map((t) => nama(t.id)).join(' & ')}, tolong ditangani ya.`, at: Date.now() });
        for (const t of tugas) await this.balas('grup', t.id, { instruksi: t.instruksi, berat: t.berat });
    }

    /** Minta satu AI membalas di thread tertentu. */
    balas(thread: string, aiId: string, opts: { instruksi?: string; berat?: boolean } = {}): Promise<void> {
        const prev = this.antrean.get(aiId) || Promise.resolve();
        const next = prev.then(() => this.balasSekarang(thread, aiId, opts)).catch(() => undefined);
        this.antrean.set(aiId, next);
        return next;
    }

    private gagal(thread: string, ai: Anggota, e: any) {
        this.tambah(thread, { dari: ai.id, nama: ai.nama, teks: `⚠️ ${ai.nama} gagal membalas: ${String(e?.message || e).slice(0, 200)}`, at: Date.now(), status: 'gagal' });
    }

    /** Jalankan Hermes untuk satu AI sambil menampilkan "mengetik…". Mengembalikan teks jawaban. */
    private async jalankanAi(thread: string, aiId: string, prompt: string, berat: boolean): Promise<string> {
        while (this.jalan >= 3) await new Promise((r) => setTimeout(r, 1500)); // maks 3 AI berpikir bersamaan
        this.jalan++;
        const set = this.menulis.get(thread) || new Set<string>();
        set.add(aiId); this.menulis.set(thread, set);
        try {
            return await hermesSekali(this.run, this.hermesBin, aiId, prompt, berat ? this.kuota?.model : undefined);
        } finally {
            this.jalan--;
            set.delete(aiId);
        }
    }

    private async balasSekarang(thread: string, aiId: string, opts: { instruksi?: string; berat?: boolean }) {
        const ai = this.roster().find((a) => a.id === aiId);
        if (!ai) return;
        const grup = thread === 'grup';
        const berat = Boolean(opts.berat && this.kuota?.ambil());
        const prompt = [
            grup
                ? `[Grup chat "Grup Kantor" di aplikasi Kantor Virtual. Anggota: ${this.roster().map((a) => `${a.nama} (${a.peran})`).join(', ')}. Semua membaca; kamu diminta menjawab.]`
                : `[Chat pribadi dengan ${this.ownerName} di aplikasi Kantor Virtual (bukan Telegram).]`,
            'Riwayat terakhir:',
            this.riwayat(thread),
            '',
            opts.instruksi ? `Instruksi dari ${this.roster().find((a) => a.id === 'default')?.nama || 'kepala kantor'} untukmu: ${opts.instruksi}` : '',
            `Balas sebagai ${ai.nama} (${ai.peran}) dalam Bahasa Indonesia. Gaya chat: singkat, jelas, tanpa basa-basi.`,
            grup ? 'Jawab hanya bagian yang sesuai keahlianmu; jangan mengulang jawaban anggota lain. Kalau perlu orang lain, sebut namanya.' : '',
            'Kalau diminta mengerjakan sesuatu, kerjakan dengan alat/skill-mu seperti biasa, lalu laporkan hasilnya di sini.'
        ].filter(Boolean).join('\n');
        try {
            const out = await this.jalankanAi(thread, aiId, prompt, berat);
            this.tambah(thread, { dari: aiId, nama: ai.nama, teks: out || '(tidak ada jawaban)', at: Date.now(), ...(berat ? { berat: true } : {}) });
        } catch (e: any) { this.gagal(thread, ai, e); }
    }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function bersihkan(s: string) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '').trim().slice(0, 8000);
}

export function jalankan(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(bin, args, { timeout: BATAS_WAKTU, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } }, (err, stdout, stderr) => {
            if (err) {
                const killed = (err as any).killed || (err as any).signal === 'SIGTERM';
                reject(new Error(killed ? 'terlalu lama (lebih dari 6 menit)' : (String(stderr || '').trim().split('\n').pop() || err.message)));
                return;
            }
            resolve(String(stdout));
        });
    });
}
