import fs from 'fs';
import { GAYA_MANUSIA } from './gayaManusia';
import path from 'path';
import { execFile } from 'child_process';
import { extractJson } from './freeLlm';
import type { ModelRouter } from './model';
import type { Rem } from './rem';

/**
 * Chat ala WhatsApp dengan AI Hermes yang ASLI (pakai SOUL, ingatan, dan skill masing-masing).
 *  - Thread pribadi: satu per profil Hermes ("default" = Joni).
 *  - Thread "grup": semua AI membaca; yang membalas hanya yang di-@mention atau yang paling relevan.
 * Balasan dibuat dengan `hermes [-p profil] -z "<prompt>"` (sekali jalan, tanpa token Telegram).
 */

/** Lampiran: berkas di Berkas (cloud pribadi) — rel = path relatif di Berkas. */
export interface Lampiran { rel: string; nama: string; ukuran: number; jenis: 'gambar' | 'berkas' }
export interface Pesan { id: string; dari: string; nama: string; teks: string; at: number; status?: 'gagal'; berat?: boolean; lampiran?: Lampiran[] }
/** Grup buatan Pak Rico (seperti grup WhatsApp): nama, ikon emoji, anggota AI. */
export interface GrupChat { id: string; nama: string; ikon: string; anggota: string[]; dibuat: number }
export interface Anggota { id: string; nama: string; peran: string; deskripsi: string }
type Llm = { complete(system: string, user: string, maxTokens?: number, attempts?: number): Promise<string | null> } | null;

const MAX_SIMPAN = 300;
const RIWAYAT_PROMPT = 14;
const BATAS_WAKTU = 6 * 60_000;
/** Prompt yang menyuruh memakai skill / web harus tetap lewat Hermes (punya alat). */
const BUTUH_ALAT = /pakai skill|buka web|cari di web|\/ig-[a-z]|\/reels-cepat|\/video-edit/i;

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
    /** Papan kerja AI (opsional): tiap kali AI bekerja dicatat To do → Proses → Selesai. */
    papan?: { catat: (x: { ai: string; nama: string; judul: string; detail?: string; sumber: 'chat' | 'trading' | 'tugas'; status?: 'todo' | 'proses' }) => string; ubah: (id: string | undefined, status: 'proses' | 'selesai' | 'gagal', hasil?: string) => void };
    private catatKerja(thread: string, aiId: string): string | undefined {
        if (!this.papan) return undefined;
        const ai = this.roster().find((a) => a.id === aiId);
        const trading = thread.startsWith('trading-');
        const terakhir = [...this.baca(thread)].reverse().find((m) => m.dari === 'owner')?.teks || '';
        return this.papan.catat({ ai: aiId, nama: ai?.nama || aiId, judul: trading ? 'Konsultasi di halaman Trading' : thread === 'grup' || this.grupCari(thread) ? `Membalas di grup ${this.infoThread(thread).nama}` : 'Membalas chat pribadi', detail: terakhir, sumber: trading ? 'trading' : 'chat', status: 'todo' });
    }

    /** R8 · catatan serah-terima nyata (Joni menugaskan → anggota melapor balik), untuk amplop di peta kantor. */
    serah: Array<{ id: number; dari: string; ke: string; judul: string; jenis: 'tugas' | 'laporan'; at: number }> = [];
    private serahSeq = 0;
    catatSerah(dari: string, ke: string, judul: string, jenis: 'tugas' | 'laporan') {
        this.serah.push({ id: ++this.serahSeq, dari, ke, judul: judul.replace(/\s+/g, ' ').slice(0, 100), jenis, at: Date.now() });
        this.serah = this.serah.slice(-100);
    }
    /** R5 · potongan ingatan rekan setim yang relevan dengan pesan terakhir (diisi index.ts). */
    ingatanRekan?: (aiId: string, teks: string) => string;
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

    private rekanUntuk(aiId: string, thread: string) {
        try { const t = [...this.baca(thread)].reverse().find((m) => m.dari === 'owner')?.teks || ''; return t ? this.ingatanRekan?.(aiId, t) || '' : ''; } catch { return ''; }
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
        if (msg.dari !== 'owner') try { this.onPesan?.(thread, msg); } catch (e: any) { console.warn('[Chat] notifikasi:', e?.message || e); }
        return msg;
    }
    /** Dipanggil tiap ada pesan baru dari AI (untuk notifikasi HP). */
    onPesan?: (thread: string, p: Pesan) => void;

    /* ── Grup buatan sendiri ── */
    private fileGrup() { return path.join(this.dir, '_grup.json'); }
    grupList(): GrupChat[] { try { return JSON.parse(fs.readFileSync(this.fileGrup(), 'utf8')); } catch { return []; } }
    private grupSimpan(g: GrupChat[]) { fs.writeFileSync(this.fileGrup(), JSON.stringify(g)); }
    grupCari(id: string) { return this.grupList().find((g) => g.id === id); }
    /** Info judul untuk thread mana pun (dipakai notifikasi & tampilan). */
    infoThread(id: string): { nama: string; ikon: string; grup: boolean } {
        if (id === 'grup') return { nama: 'Grup Kantor', ikon: '👥', grup: true };
        const g = this.grupCari(id); if (g) return { nama: g.nama, ikon: g.ikon, grup: true };
        const a = this.roster().find((x) => x.id === id); return { nama: a ? a.nama : id, ikon: '🤖', grup: false };
    }
    private anggotaThread(thread: string): Anggota[] {
        const r = this.roster();
        if (thread === 'grup') return r;
        const g = this.grupCari(thread); if (g) return r.filter((a) => g.anggota.includes(a.id));
        return r.filter((a) => a.id === thread);
    }
    grupSimpanSatu(x: { id?: string; nama: string; ikon: string; anggota: string[] }): GrupChat {
        const ids = new Set(this.roster().map((a) => a.id));
        const nama = String(x.nama || '').trim().slice(0, 50), ikon = Array.from(String(x.ikon || '👥').trim()).slice(0, 2).join('') || '👥';
        const anggota = [...new Set((x.anggota || []).map(String))].filter((a) => ids.has(a)).slice(0, 30);
        if (!nama) throw new Error('Nama grup wajib diisi.');
        if (!anggota.length) throw new Error('Pilih minimal satu anggota.');
        const list = this.grupList();
        if (x.id) {
            const g = list.find((y) => y.id === x.id); if (!g) throw new Error('Grup tidak ditemukan.');
            const lama = new Set(g.anggota);
            Object.assign(g, { nama, ikon, anggota }); this.grupSimpan(list);
            const masuk = anggota.filter((a) => !lama.has(a)).map((a) => this.roster().find((r) => r.id === a)?.nama).filter(Boolean);
            const keluar = [...lama].filter((a) => !anggota.includes(a)).map((a) => this.roster().find((r) => r.id === a)?.nama).filter(Boolean);
            if (masuk.length || keluar.length) this.tambahSistem(g.id, [masuk.length ? `${this.ownerName} menambahkan ${masuk.join(', ')}` : '', keluar.length ? `${this.ownerName} mengeluarkan ${keluar.join(', ')}` : ''].filter(Boolean).join(' · '));
            return g;
        }
        const g: GrupChat = { id: `g-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, nama, ikon, anggota, dibuat: Date.now() };
        list.push(g); this.grupSimpan(list);
        this.tambahSistem(g.id, `${this.ownerName} membuat grup "${nama}" dan menambahkan ${anggota.map((a) => this.roster().find((r) => r.id === a)?.nama || a).join(', ')}`);
        return g;
    }
    grupHapus(id: string) { this.grupSimpan(this.grupList().filter((g) => g.id !== id)); try { fs.rmSync(this.file(id), { force: true }); } catch { /* */ } }
    private tambahSistem(thread: string, teks: string) { const list = this.baca(thread); list.push({ id: (this.seq++).toString(36), dari: 'sistem', nama: 'info', teks, at: Date.now() }); this.tulis(thread, list); }

    /* ── Lampiran ── */
    /** Folder Berkas tempat AI menaruh file untuk Pak Rico (diisi index.ts). */
    berkasRoot?: string;
    private teksLampiran(l?: Lampiran[]) {
        if (!l?.length || !this.berkasRoot) return '';
        return `\nLampiran dari ${this.ownerName} (bisa kamu buka/baca di komputer ini${l.some((x) => x.jenis === 'gambar') ? '; gambar bisa kamu lihat dengan alat visi bila ada' : ''}):\n${l.map((x) => `- ${path.join(this.berkasRoot!, x.rel)} (${x.nama})`).join('\n')}`;
    }
    /** Hasil baca gambar per berkas (supaya gambar yang sama tidak dibaca ulang tiap balasan). */
    private cacheGambar = new Map<string, string>();
    /**
     * Gambar dari Pak Rico dibaca dulu dengan model visi ATAS NAMA AI yang menjawab (gotong royong, tercatat di papan),
     * lalu isinya dimasukkan ke prompt — jadi AI mana pun (termasuk lewat Hermes) bisa "melihat" gambarnya.
     */
    private async bacaGambar(aiId: string, nama: string, l?: Lampiran[]): Promise<string> {
        const gb = (l || []).filter((x) => x.jenis === 'gambar').slice(0, 3);
        const root = this.berkasRoot, router = this.router;
        if (!gb.length || !router?.visiAda() || !root) return '';
        const hasil: string[] = [];
        const belum = gb.filter((x) => !this.cacheGambar.has(x.rel));
        if (belum.length) {
            const kerja = this.papan?.catat({ ai: aiId, nama, judul: `Melihat ${belum.length} gambar dari ${this.ownerName}`, detail: belum.map((x) => x.nama).join(', '), sumber: 'chat', status: 'proses' });
            try {
                const data = belum.map((x) => {
                    const abs = path.join(root, x.rel);
                    if (!abs.startsWith(root) || x.ukuran > 8 * 1024 * 1024) throw new Error(`${x.nama} terlalu besar (maks 8 MB).`);
                    const ext = path.extname(x.nama).toLowerCase();
                    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
                    return { mime, data: fs.readFileSync(abs) };
                });
                const r = await router.lihat(aiId, nama, `Jelaskan isi ${belum.length > 1 ? 'tiap gambar (beri nomor sesuai urutan)' : 'gambar ini'} selengkap mungkin untuk rekan kerja yang tidak bisa melihatnya: teks yang terbaca (salin persis angka, nama, tanggal), objek, grafik (judul, sumbu, tren, nilai penting), tabel. Jangan menebak hal yang tidak terlihat.`, data);
                const bagian = r.teks;
                for (const x of belum) this.cacheGambar.set(x.rel, belum.length > 1 ? `(gabungan ${belum.map((y) => y.nama).join(', ')}) ${bagian}` : bagian);
                if (this.cacheGambar.size > 200) this.cacheGambar.delete(this.cacheGambar.keys().next().value as string);
                this.papan?.ubah(kerja, 'selesai', `[${r.model}] ${r.teks.slice(0, 300)}`);
            } catch (e: any) {
                this.papan?.ubah(kerja, 'gagal', String(e?.message || e));
                return `\n(Gambar dari ${this.ownerName} belum bisa dibaca otomatis: ${String(e?.message || e).slice(0, 160)}. Kalau kamu punya alat visi, buka berkasnya langsung.)`;
            }
        }
        const sudah = new Set<string>();
        for (const x of gb) { const t = this.cacheGambar.get(x.rel); if (t && !sudah.has(t)) { sudah.add(t); hasil.push(`- ${x.nama}: ${t.slice(0, 3000)}`); } }
        return hasil.length ? `\nISI GAMBAR yang dikirim ${this.ownerName} (sudah kamu lihat dengan model visi):\n${hasil.join('\n')}` : '';
    }
    private petunjukKirimFile(aiNama: string) {
        if (!this.berkasRoot) return '';
        const dir = path.join(this.berkasRoot, 'Dari AI', aiNama.replace(/[^\w .-]+/g, ''));
        return `Kalau kamu membuat file/gambar untuk ${this.ownerName}, simpan di folder ${dir}/ lalu tulis satu baris per file: [[lampiran: Dari AI/${aiNama.replace(/[^\w .-]+/g, '')}/nama-file.ext]] — file itu akan muncul sebagai lampiran di chat.`;
    }
    /** Ambil penanda [[lampiran: ...]] dari jawaban AI → lampiran sungguhan (hanya file yang benar-benar ada di Berkas). */
    private ambilLampiran(out: string): { teks: string; lampiran: Lampiran[] } {
        const lampiran: Lampiran[] = [];
        const teks = out.replace(/\[\[\s*lampiran\s*:\s*([^\]]+?)\s*\]\]/gi, (_m, p: string) => {
            if (!this.berkasRoot) return '';
            let rel = p.trim().replace(/^\/+/, '');
            if (path.isAbsolute(p.trim()) && p.trim().startsWith(this.berkasRoot)) rel = path.relative(this.berkasRoot, p.trim());
            const abs = path.resolve(this.berkasRoot, rel);
            if (!abs.startsWith(path.resolve(this.berkasRoot) + path.sep)) return '';
            try { const st = fs.statSync(abs); if (st.isFile() && lampiran.length < 10) lampiran.push({ rel: path.relative(this.berkasRoot, abs), nama: path.basename(abs), ukuran: st.size, jenis: /\.(png|jpe?g|gif|webp)$/i.test(abs) ? 'gambar' : 'berkas' }); } catch { /* file tidak ada */ }
            return '';
        }).replace(/\n{3,}/g, '\n\n').trim();
        return { teks, lampiran };
    }

    /** Daftar thread untuk layar depan chat. */
    daftar() {
        const roster = this.roster();
        const item = (id: string, nama: string, peran: string) => {
            const list = this.baca(id);
            const last = list[list.length - 1];
            return { id, nama, peran, terakhir: last ? { nama: last.nama, teks: last.teks.slice(0, 120), at: last.at } : null, menulis: Array.from(this.menulis.get(id) || []) };
        };
        const grup = this.grupList().map((g) => ({ ...item(g.id, g.nama, `${g.anggota.length} anggota`), grup: true, ikon: g.ikon, anggota: g.anggota }));
        return [{ ...item('grup', 'Grup Kantor', `${roster.length} anggota`), grup: true, ikon: '👥', anggota: roster.map((a) => a.id) }, ...grup, ...roster.map((a) => item(a.id, a.nama, a.peran))];
    }

    thread(id: string) {
        return { id, pesan: this.baca(id).slice(-150), menulis: Array.from(this.menulis.get(id) || []) };
    }

    /* ── Kirim pesan dari Pak Rico ── */
    kirim(thread: string, teks: string, lampiran: Lampiran[] = []): Pesan {
        const roster = this.roster();
        const kustom = this.grupCari(thread);
        if (thread !== 'grup' && !kustom && !roster.some((a) => a.id === thread)) throw new Error('Chat tidak ditemukan.');
        const t = teks.trim().slice(0, 2000);
        if (!t && !lampiran.length) throw new Error('Pesan kosong.');
        const msg = this.tambah(thread, { dari: 'owner', nama: this.ownerName, teks: t, at: Date.now(), ...(lampiran.length ? { lampiran: lampiran.slice(0, 10) } : {}) });
        if (thread === 'grup' || kustom) this.balasGrup(t || '(mengirim lampiran)', thread).catch((e) => console.warn('[Chat] grup:', e?.message || e));
        else this.balas(thread, thread).catch((e) => console.warn('[Chat]', e?.message || e));
        return msg;
    }

    /** Chat konsultasi dengan data terlampir (mis. halaman Trading): thread terpisah, jawaban HANYA dari data. */
    kirimDenganData(thread: string, aiId: string, teks: string, data: string, aturan: string): Pesan {
        if (!this.roster().some((a) => a.id === aiId)) throw new Error('AI tidak ditemukan.');
        const t = teks.trim().slice(0, 2000);
        if (!t) throw new Error('Pesan kosong.');
        const msg = this.tambah(thread, { dari: 'owner', nama: this.ownerName, teks: t, at: Date.now() });
        this.balas(thread, aiId, { data, aturan }).catch((e) => console.warn('[Chat data]', e?.message || e));
        return msg;
    }

    /**
     * Beri pekerjaan langsung ke satu AI (lewat Hermes, antre per AI) tanpa menulis ke chat.
     * Tercatat di papan kerja atas nama AI itu. Mengembalikan teks hasilnya.
     */
    tugas(aiId: string, judul: string, prompt: string, detail?: string, sumber: 'tugas' | 'trading' = 'tugas', alat = false): Promise<string> {
        const ai = this.roster().find((a) => a.id === aiId);
        if (!ai) return Promise.reject(new Error(`AI "${aiId}" tidak ada di kantor.`));
        const kerja = this.papan?.catat({ ai: aiId, nama: ai.nama, judul, detail, sumber, status: 'todo' });
        const prev = this.antrean.get(aiId) || Promise.resolve();
        const hasil = prev.then(() => this.jalankanTugas(aiId, ai.nama, prompt, kerja, alat || BUTUH_ALAT.test(prompt)));
        this.antrean.set(aiId, hasil.then(() => undefined, () => undefined));
        return hasil;
    }
    /** Pengatur model (hemat token): tugas teks tanpa alat dicoba dulu di model langsung (Gemini/Groq), lalu Hermes. */
    router?: ModelRouter;
    private langsungJalan = 0;
    private async jalankanTugas(aiId: string, nama: string, prompt: string, kerja: string | undefined, alat: boolean): Promise<string> {
        const r = this.router;
        if (r && !alat) {
            const sigT = `tugas:${prompt.replace(/\s+/g, ' ').slice(0, 80)}`;
            await this.remCek(aiId, sigT, kerja);
            for (const o of r.rute(aiId)) {
                if (o.cara === 'hermes') break;
                while (this.langsungJalan >= 4) await new Promise((res) => setTimeout(res, 800));
                this.langsungJalan++; this.papan?.ubah(kerja, 'proses');
                try {
                    const out = bersihkan(await r.langsung(o, aiId, nama, prompt));
                    r.catat(aiId, o.id, prompt.length, out.length, true);
                    this.rem?.catat(aiId, prompt.length, out.length, true, sigT);
                    this.papan?.ubah(kerja, 'selesai', `[${o.label}] ${out}`);
                    return out;
                } catch (e: any) { r.catat(aiId, o.id, prompt.length, 0, false); console.warn(`[Model] ${aiId} via ${o.id} gagal:`, e?.message || e); }
                finally { this.langsungJalan--; }
            }
        }
        return this.jalankanAi(`kerja-${aiId}`, aiId, prompt, false, kerja);
    }
    /** Pesan dari AI/sistem ke sebuah thread tanpa memicu balasan (mis. laporan HR, permintaan persetujuan Joni). */
    pesan(thread: string, dari: string, nama: string, teks: string): Pesan {
        return this.tambah(thread, { dari, nama, teks: teks.slice(0, 6000), at: Date.now() });
    }
    /** Kapan terakhir Pak Rico menulis di chat mana pun (untuk "minggu ini belum ada perintah"). */
    terakhirOwner(): number {
        let t = 0;
        for (const id of ['grup', ...this.grupList().map((g) => g.id), ...this.roster().map((a) => a.id)]) for (const m of this.baca(id)) if (m.dari === 'owner' && m.at > t) t = m.at;
        return t;
    }

    /** Anggota yang di-@sebut (atau @semua = para kepala). Kosong = Joni yang menentukan. */
    disebut(teks: string, thread = 'grup'): string[] {
        const roster = this.anggotaThread(thread);
        if (/@(semua|all)\b/i.test(teks)) return roster.filter((a) => a.id === 'default' || !a.id.includes('-')).map((a) => a.id);
        return roster.filter((a) => new RegExp(`@(${esc(a.nama)}|${esc(a.id)})\\b`, 'i').test(teks)).slice(0, 4).map((a) => a.id);
    }

    private riwayat(thread: string) {
        return this.baca(thread).filter((p) => p.dari !== 'sistem').slice(-RIWAYAT_PROMPT)
            .map((p) => `${p.dari === 'owner' ? this.ownerName : p.nama}: ${p.teks.slice(0, 1200)}${p.lampiran?.length ? ` [lampiran: ${p.lampiran.map((l) => l.nama).join(', ')}]` : ''}`).join('\n');
    }

    private async balasGrup(teks: string, thread = 'grup') {
        const sebut = this.disebut(teks, thread);
        if (sebut.length) { for (const id of sebut) await this.balas(thread, id); return; }
        const roster = this.anggotaThread(thread);
        const namaGrup = this.infoThread(thread).nama;
        // Grup kecil berisi satu AI → langsung dia yang menjawab.
        if (roster.length === 1) { await this.balas(thread, roster[0].id); return; }
        // Tanpa tag: moderator (Joni kalau ada di grup; kalau tidak, kepala divisi pertama / anggota pertama) membaca, lalu menjawab atau menugaskan.
        const joni = roster.find((a) => a.id === 'default') || roster.find((a) => !a.id.includes('-')) || roster[0];
        if (!joni) return;
        const daftar = roster.filter((a) => a.id !== joni.id).map((a) => `- ${a.id}: ${a.nama} (${a.peran}) — ${a.deskripsi}`.slice(0, 220)).join('\n');
        const prompt = [
            `[Grup chat "${namaGrup}" di aplikasi Kantor Virtual. Kamu ${joni.nama} (${joni.peran}), moderator grup ini.]`,
            'Riwayat terakhir:', this.riwayat(thread), '',
            'Anggota & jobdesk:', daftar, '',
            `Tentukan cara terbaik menanggapi pesan terakhir ${this.ownerName}:`,
            '- Kalau sapaan/umum/koordinasi atau tidak cocok untuk siapa pun → jawab sendiri.',
            '- Kalau cocok dengan jobdesk anggota → tugaskan 1–3 anggota (urut: yang hasilnya dibutuhkan yang lain lebih dulu), beri instruksi lengkap & jelas.',
            '- "berat": true HANYA kalau tugas butuh analisis panjang/berlapis, dokumen penting, atau model gratis kemungkinan gagal. Selain itu false (gratis).',
            'Jawab HANYA JSON tanpa teks lain:',
            '{"pesan":"kalimat singkatmu di grup, mis. \\"Uang, tolong cek pengeluaran bulan ini ya.\\"","jawaban":"isi jawabanmu kalau kamu menjawab sendiri; kosongkan kalau menugaskan","tugaskan":[{"id":"<id-profil>","instruksi":"...","berat":false}]}'
        ].join('\n');
        const out = await this.jalankanAi(thread, joni.id, prompt, false).catch((e) => { this.gagal(thread, joni, e); return null; });
        if (out === null) return;
        const j = extractJson(out);
        const tugas: Array<{ id: string; instruksi: string; berat: boolean }> = (Array.isArray(j?.tugaskan) ? j.tugaskan : [])
            .map((t: any) => ({ id: String(t?.id || ''), instruksi: String(t?.instruksi || '').slice(0, 1500), berat: t?.berat === true }))
            .filter((t: any) => t.id !== joni.id && roster.some((a) => a.id === t.id)).slice(0, 3);
        if (!j || (!tugas.length && !String(j.jawaban || j.pesan || '').trim())) {
            this.tambah(thread, { dari: joni.id, nama: joni.nama, teks: out || '(tidak ada jawaban)', at: Date.now() });
            return;
        }
        if (!tugas.length) {
            this.tambah(thread, { dari: joni.id, nama: joni.nama, teks: String(j.jawaban || j.pesan).trim(), at: Date.now() });
            return;
        }
        const nama = (id: string) => roster.find((a) => a.id === id)?.nama || id;
        this.tambah(thread, { dari: joni.id, nama: joni.nama, teks: String(j.pesan || '').trim() || `${tugas.map((t) => nama(t.id)).join(' & ')}, tolong ditangani ya.`, at: Date.now() });
        for (const t of tugas) this.catatSerah(joni.id, t.id, t.instruksi, 'tugas');
        for (const t of tugas) { await this.balas(thread, t.id, { instruksi: t.instruksi, berat: t.berat }); this.catatSerah(t.id, joni.id, t.instruksi, 'laporan'); }
    }

    /** Minta satu AI membalas di thread tertentu. */
    balas(thread: string, aiId: string, opts: { instruksi?: string; berat?: boolean; data?: string; aturan?: string } = {}): Promise<void> {
        const prev = this.antrean.get(aiId) || Promise.resolve();
        const kerja = this.catatKerja(thread, aiId); // masuk antrean → "To do"
        const next = prev.then(() => this.balasSekarang(thread, aiId, { ...opts, kerja })).catch(() => undefined);
        this.antrean.set(aiId, next);
        return next;
    }

    private gagal(thread: string, ai: Anggota, e: any) {
        this.tambah(thread, { dari: ai.id, nama: ai.nama, teks: `⚠️ ${ai.nama} gagal membalas: ${String(e?.message || e).slice(0, 200)}`, at: Date.now(), status: 'gagal' });
    }

    /** Jalankan Hermes untuk satu AI sambil menampilkan "mengetik…". Mengembalikan teks jawaban. */
    /** Rem otonomi (pemutus sirkuit) per AI. Diisi index.ts. */
    rem?: Rem;
    private async remCek(aiId: string, sig: string, idK?: string) {
        if (!this.rem) return;
        const iz = this.rem.izin(aiId, sig);
        if (!iz.boleh) {
            const nama = this.roster().find((a) => a.id === aiId)?.nama || aiId;
            const msg = `Rem otonomi: ${nama} dihentikan sementara (${iz.sebab}). Bapak bisa menekan "Lanjutkan" di Kantor → Tim AI.`;
            this.papan?.ubah(idK, 'gagal', msg);
            throw new Error(msg);
        }
        if (iz.tundaMs > 0) await new Promise((r) => setTimeout(r, Math.min(iz.tundaMs, 10 * 60_000)));
    }
    private async jalankanAi(thread: string, aiId: string, prompt: string, berat: boolean, kerja?: string): Promise<string> {
        const idK = kerja ?? this.catatKerja(thread, aiId);
        const sig = thread.startsWith('kerja-') ? `tugas:${prompt.replace(/\s+/g, ' ').slice(0, 80)}` : `chat:${thread}`;
        await this.remCek(aiId, sig, idK);
        while (this.jalan >= 3) await new Promise((r) => setTimeout(r, 1500)); // maks 3 AI berpikir bersamaan
        this.jalan++;
        const set = this.menulis.get(thread) || new Set<string>();
        set.add(aiId); this.menulis.set(thread, set);
        this.papan?.ubah(idK, 'proses');
        try {
            const out = await hermesSekali(this.run, this.hermesBin, aiId, prompt, berat ? this.kuota?.model : undefined);
            this.router?.catat(aiId, berat ? 'berat' : 'hermes', prompt.length, out.length, true);
            this.rem?.catat(aiId, prompt.length, out.length, true, sig);
            this.papan?.ubah(idK, 'selesai', out);
            return out;
        } catch (e: any) {
            this.router?.catat(aiId, berat ? 'berat' : 'hermes', prompt.length, 0, false);
            this.rem?.catat(aiId, prompt.length, 0, false, sig);
            this.papan?.ubah(idK, 'gagal', String(e?.message || e));
            throw e;
        } finally {
            this.jalan--;
            set.delete(aiId);
        }
    }

    private async balasSekarang(thread: string, aiId: string, opts: { instruksi?: string; berat?: boolean; data?: string; aturan?: string; kerja?: string }) {
        const ai = this.roster().find((a) => a.id === aiId);
        if (!ai) { this.papan?.ubah(opts.kerja, 'gagal', 'AI tidak ditemukan.'); return; }
        const grup = thread === 'grup' || !!this.grupCari(thread);
        const info = this.infoThread(thread);
        const lampOwner = [...this.baca(thread)].reverse().find((m) => m.dari === 'owner')?.lampiran;
        const isiGambar = await this.bacaGambar(aiId, ai.nama, lampOwner);
        const berat = Boolean(opts.berat && this.kuota?.ambil());
        const prompt = opts.data ? [
            opts.aturan || '',
            '', '=== DATA (satu-satunya sumber yang boleh dipakai) ===', opts.data, '=== AKHIR DATA ===', '',
            'Riwayat chat konsultasi ini:', this.riwayat(thread), '',
            `Balas pesan terakhir ${this.ownerName} sebagai ${ai.nama} (${ai.peran}) dalam Bahasa Indonesia, singkat & jelas.`, GAYA_MANUSIA
        ].join('\n') : [
            grup
                ? `[Grup chat "${info.nama}" di aplikasi Kantor Virtual. Anggota: ${this.anggotaThread(thread).map((a) => `${a.nama} (${a.peran})`).join(', ')}. Semua membaca; kamu diminta menjawab.]`
                : `[Chat pribadi dengan ${this.ownerName} di aplikasi Kantor Virtual (bukan Telegram).]`,
            'Riwayat terakhir:',
            this.riwayat(thread),
            '',
            opts.instruksi ? `Instruksi dari ${this.roster().find((a) => a.id === 'default')?.nama || 'kepala kantor'} untukmu: ${opts.instruksi}` : '',
            `Balas sebagai ${ai.nama} (${ai.peran}) dalam Bahasa Indonesia. Gaya chat: singkat, jelas, tanpa basa-basi.`,
            GAYA_MANUSIA,
            grup ? 'Jawab hanya bagian yang sesuai keahlianmu; jangan mengulang jawaban anggota lain. Kalau perlu orang lain, sebut namanya.' : '',
            'Kalau diminta mengerjakan sesuatu, kerjakan dengan alat/skill-mu seperti biasa, lalu laporkan hasilnya di sini.',
            this.teksLampiran(lampOwner),
            isiGambar,
            this.rekanUntuk(aiId, thread),
            this.petunjukKirimFile(ai.nama)
        ].filter(Boolean).join('\n');
        try {
            const out = await this.jalankanAi(thread, aiId, prompt, berat, opts.kerja);
            const { teks, lampiran } = this.ambilLampiran(out || '');
            this.tambah(thread, { dari: aiId, nama: ai.nama, teks: teks || (lampiran.length ? '' : '(tidak ada jawaban)'), at: Date.now(), ...(berat ? { berat: true } : {}), ...(lampiran.length ? { lampiran } : {}) });
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
