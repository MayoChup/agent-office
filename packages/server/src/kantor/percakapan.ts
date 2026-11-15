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

export interface Pesan { id: string; dari: string; nama: string; teks: string; at: number; status?: 'gagal' }
export interface Anggota { id: string; nama: string; peran: string; deskripsi: string }
type Llm = { complete(system: string, user: string, maxTokens?: number, attempts?: number): Promise<string | null> } | null;

const MAX_SIMPAN = 300;
const RIWAYAT_PROMPT = 14;
const BATAS_WAKTU = 6 * 60_000;

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

    /** Siapa yang menjawab di grup: yang di-@mention, kalau tidak ada dipilih AI gratis (maks 2), cadangan Joni. */
    async pilihPenjawab(teks: string): Promise<string[]> {
        const roster = this.roster();
        const norm = (s: string) => s.toLowerCase();
        const mention = roster.filter((a) => new RegExp(`@${norm(a.nama)}\\b|@${norm(a.id)}\\b`, 'i').test(teks));
        if (/@(semua|all)\b/i.test(teks)) return roster.filter((a) => a.id === 'default' || !a.id.includes('-')).map((a) => a.id);
        if (mention.length) return mention.slice(0, 4).map((a) => a.id);
        const llm = this.llm();
        if (llm) {
            const daftar = roster.map((a) => `${a.id}: ${a.nama} — ${a.peran}. ${a.deskripsi}`.slice(0, 200)).join('\n');
            const out = await llm.complete(
                'Kamu pengatur percakapan grup kantor. Pilih 1–2 anggota yang PALING tepat menjawab pesan pemilik. Jawab HANYA JSON {"ids":["..."]}. Kalau umum/sapaan/tidak jelas, pilih "default".',
                `Anggota:\n${daftar}\n\nPesan Pak Rico: ${teks.slice(0, 600)}`, 80, 2
            ).catch(() => null);
            const ids: string[] = (extractJson(out || '')?.ids || []).filter((id: string) => roster.some((a) => a.id === id));
            if (ids.length) return Array.from(new Set(ids)).slice(0, 2);
        }
        return ['default'];
    }

    private async balasGrup(teks: string) {
        const ids = await this.pilihPenjawab(teks);
        // Berurutan: penjawab kedua bisa membaca jawaban pertama.
        for (const id of ids) await this.balas('grup', id);
    }

    /** Minta satu AI membalas di thread tertentu. */
    balas(thread: string, aiId: string): Promise<void> {
        const prev = this.antrean.get(aiId) || Promise.resolve();
        const next = prev.then(() => this.balasSekarang(thread, aiId)).catch(() => undefined);
        this.antrean.set(aiId, next);
        return next;
    }

    private async balasSekarang(thread: string, aiId: string) {
        const ai = this.roster().find((a) => a.id === aiId);
        if (!ai) return;
        while (this.jalan >= 3) await new Promise((r) => setTimeout(r, 1500)); // maks 3 AI berpikir bersamaan
        this.jalan++;
        const set = this.menulis.get(thread) || new Set<string>();
        set.add(aiId); this.menulis.set(thread, set);
        try {
            const riwayat = this.baca(thread).slice(-RIWAYAT_PROMPT)
                .map((p) => `${p.dari === 'owner' ? this.ownerName : p.nama}: ${p.teks.slice(0, 1200)}`).join('\n');
            const grup = thread === 'grup';
            const prompt = [
                grup
                    ? `[Grup chat "Grup Kantor" di aplikasi Kantor Virtual. Anggota: ${this.roster().map((a) => `${a.nama} (${a.peran})`).join(', ')}. Semua membaca; kamu diminta menjawab.]`
                    : `[Chat pribadi dengan ${this.ownerName} di aplikasi Kantor Virtual (bukan Telegram).]`,
                'Riwayat terakhir:',
                riwayat,
                '',
                `Balas sebagai ${ai.nama} (${ai.peran}) dalam Bahasa Indonesia. Gaya chat: singkat, jelas, tanpa basa-basi.`,
                grup ? 'Jawab hanya bagian yang sesuai keahlianmu; jangan mengulang jawaban anggota lain. Kalau perlu orang lain, sebut namanya.' : '',
                'Kalau diminta mengerjakan sesuatu, kerjakan dengan alat/skill-mu seperti biasa, lalu laporkan hasilnya di sini.'
            ].filter(Boolean).join('\n');
            const prof = aiId === 'default' ? [] : ['-p', aiId];
            let out: string;
            try { out = bersihkan(await this.run(this.hermesBin, [...prof, '-z', prompt])); }
            catch (e: any) {
                // Hermes versi lama belum punya -z (oneshot) → pakai "chat -Q -q".
                if (!/unrecognized|invalid choice|no such option|unknown option/i.test(String(e?.message))) throw e;
                out = bersihkan(await this.run(this.hermesBin, [...prof, 'chat', '-Q', '-q', prompt]));
            }
            this.tambah(thread, { dari: aiId, nama: ai.nama, teks: out || '(tidak ada jawaban)', at: Date.now() });
        } catch (e: any) {
            this.tambah(thread, { dari: aiId, nama: ai.nama, teks: `⚠️ ${ai.nama} gagal membalas: ${String(e?.message || e).slice(0, 200)}`, at: Date.now(), status: 'gagal' });
        } finally {
            this.jalan--;
            set.delete(aiId);
        }
    }
}

function bersihkan(s: string) {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\r/g, '').trim().slice(0, 8000);
}

function jalankan(bin: string, args: string[]): Promise<string> {
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
