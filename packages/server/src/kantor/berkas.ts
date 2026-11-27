import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type express from 'express';
type Request = express.Request;
type Response = express.Response;

/**
 * Berkas: "cloud" pribadi di VPS dengan kuota (bawaan 5 GB).
 *  - Unggah dikirim mentah (stream) supaya file besar tidak memenuhi memori.
 *  - Unduh/pratinjau memakai tautan sekali pakai berumur 10 menit (bisa dibuka langsung oleh browser/HP).
 *  - Hapus = pindah ke .sampah (dibersihkan otomatis setelah 30 hari).
 */
export interface Item { nama: string; path: string; folder: boolean; size: number; mtime: number; jenis: string }

const JENIS: Array<[RegExp, string]> = [
    [/\.(png|jpe?g|gif|webp|heic|avif|svg)$/i, 'gambar'], [/\.(mp4|mov|webm|mkv)$/i, 'video'], [/\.(mp3|m4a|wav|ogg|aac)$/i, 'audio'],
    [/\.pdf$/i, 'pdf'], [/\.(docx?|odt|rtf|pages)$/i, 'dokumen'], [/\.(xlsx?|csv|ods|numbers)$/i, 'tabel'], [/\.(pptx?|key|odp)$/i, 'presentasi'],
    [/\.(zip|rar|7z|tar|gz)$/i, 'arsip'], [/\.(txt|md|json|log)$/i, 'teks']
];
const jenisDari = (n: string) => JENIS.find(([re]) => re.test(n))?.[1] || 'lain';

export class Berkas {
    private tokens = new Map<string, { abs: string; exp: number; unduh: boolean }>();
    private pakaiCache: { at: number; n: number } | null = null;

    constructor(public root: string, public kuota: number) {
        fs.mkdirSync(path.join(root, '.sampah'), { recursive: true });
        setInterval(() => this.bersihkanSampah(), 6 * 3600_000).unref();
    }

    private aman(rel: string) {
        const parts = String(rel || '').replace(/\\/g, '/').split('/').filter(Boolean);
        if (parts.some((p) => p === '..' || p.startsWith('.'))) throw new Error('Path tidak diizinkan');
        const abs = path.resolve(this.root, ...parts);
        if (abs !== this.root && !abs.startsWith(this.root + path.sep)) throw new Error('Path tidak diizinkan');
        return abs;
    }
    private rel(abs: string) { return path.relative(this.root, abs).split(path.sep).join('/'); }
    private namaAman(n: string) { const x = String(n || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/^\.+/, '').trim().slice(0, 140); if (!x) throw new Error('Nama tidak valid'); return x; }

    terpakai(): number {
        if (this.pakaiCache && Date.now() - this.pakaiCache.at < 30_000) return this.pakaiCache.n;
        let n = 0;
        const jalan = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) jalan(p); else { try { n += fs.statSync(p).size; } catch { /* */ } } } };
        jalan(this.root);
        this.pakaiCache = { at: Date.now(), n };
        return n;
    }
    disk() { try { const s = (fs as any).statfsSync(this.root); return { bebas: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch { return null; } }

    daftar(rel: string) {
        const abs = this.aman(rel);
        if (!fs.existsSync(abs)) throw new Error('Folder tidak ada');
        const items: Item[] = fs.readdirSync(abs, { withFileTypes: true }).filter((e) => !e.name.startsWith('.')).map((e) => {
            const p = path.join(abs, e.name); const st = fs.statSync(p);
            return { nama: e.name, path: this.rel(p), folder: e.isDirectory(), size: e.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, jenis: e.isDirectory() ? 'folder' : jenisDari(e.name) };
        }).sort((a, b) => (a.folder === b.folder ? a.nama.localeCompare(b.nama, 'id', { numeric: true }) : a.folder ? -1 : 1));
        return { path: this.rel(abs), items, terpakai: this.terpakai(), kuota: this.kuota, disk: this.disk() };
    }

    cari(q: string) {
        const k = q.trim().toLowerCase(); if (k.length < 2) return [];
        const out: Item[] = [];
        const jalan = (d: string) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (e.name.startsWith('.') || out.length >= 100) continue;
                const p = path.join(d, e.name);
                if (e.name.toLowerCase().includes(k)) { const st = fs.statSync(p); out.push({ nama: e.name, path: this.rel(p), folder: e.isDirectory(), size: e.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, jenis: e.isDirectory() ? 'folder' : jenisDari(e.name) }); }
                if (e.isDirectory()) jalan(p);
            }
        };
        jalan(this.root);
        return out;
    }

    buatFolder(rel: string, nama: string) { const abs = path.join(this.aman(rel), this.namaAman(nama)); fs.mkdirSync(abs, { recursive: true }); return { path: this.rel(abs) }; }
    pindah(dari: string, keFolder: string, namaBaru?: string) {
        const a = this.aman(dari);
        if (!fs.existsSync(a) || a === this.root) throw new Error('Tidak ditemukan');
        const b = path.join(this.aman(keFolder), namaBaru ? this.namaAman(namaBaru) : path.basename(a));
        if (b.startsWith(a + path.sep)) throw new Error('Tidak bisa memindah folder ke dalam dirinya sendiri');
        if (fs.existsSync(b)) throw new Error('Nama itu sudah ada di tujuan');
        fs.renameSync(a, b);
        return { path: this.rel(b) };
    }
    hapus(rel: string) {
        const a = this.aman(rel);
        if (!fs.existsSync(a) || a === this.root) throw new Error('Tidak ditemukan');
        const t = path.join(this.root, '.sampah', `${Date.now()}__${path.basename(a)}`);
        fs.renameSync(a, t);
        this.pakaiCache = null;
        return { ok: true };
    }
    private bersihkanSampah() {
        const d = path.join(this.root, '.sampah');
        for (const n of fs.readdirSync(d)) { const t = Number(n.split('__')[0]); if (t && Date.now() - t > 30 * 86400_000) fs.rmSync(path.join(d, n), { recursive: true, force: true }); }
        this.pakaiCache = null;
    }

    /** Unggah stream mentah: POST ?p=folder&nama=file&ukuran=byte. */
    async unggah(req: Request, res: Response) {
        try {
            const x = await this.terima(req, String(req.query.p || ''), String(req.query.nama || 'berkas'), Number(req.query.ukuran || 0));
            res.json({ ok: true, ...x });
        } catch (e: any) {
            res.status(400).json({ ok: false, error: String(e?.message || e) });
        }
    }
    /** Simpan body request (stream mentah) ke folder Berkas dengan nama unik. Dipakai unggah biasa & hasil Studio lokal. */
    async terima(req: Request, folderRel: string, namaMinta: string, ukuranMinta = 0): Promise<{ path: string; size: number }> {
        const folder = this.aman(folderRel);
        if (!fs.existsSync(folder)) throw new Error('Folder tidak ada');
        const ukuran = Number(ukuranMinta || req.headers['content-length'] || 0);
        if (this.terpakai() + ukuran > this.kuota) throw new Error(`Kuota ${(this.kuota / 1e9).toFixed(1)} GB penuh. Hapus berkas lain dulu.`);
        const d = this.disk();
        if (d && d.bebas - ukuran < 2e9) throw new Error('Sisa disk VPS hampir habis (disisakan 2 GB untuk sistem).');
        const nama = this.namaAman(namaMinta || 'berkas');
        let tujuan = path.join(folder, nama);
        for (let i = 2; fs.existsSync(tujuan); i++) { const ext = path.extname(nama); tujuan = path.join(folder, `${path.basename(nama, ext)} (${i})${ext}`); }
        const tmp = path.join(this.root, '.sampah', `.unggah-${crypto.randomBytes(6).toString('hex')}`);
        let n = 0; let gagal = '';
        try {
            await new Promise<void>((resolve, reject) => {
                const out = fs.createWriteStream(tmp);
                req.on('data', (c: Buffer) => { n += c.length; if (this.terpakai() + n > this.kuota && !gagal) { gagal = 'Kuota penuh'; req.unpipe(out); out.destroy(); req.resume(); reject(new Error(gagal)); } });
                req.pipe(out);
                out.on('finish', () => resolve());
                out.on('error', reject); req.on('error', reject); req.on('aborted', () => reject(new Error('Unggahan terputus')));
            });
        } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch { /* */ } throw e; }
        fs.renameSync(tmp, tujuan);
        this.pakaiCache = null;
        return { path: this.rel(tujuan), size: n };
    }

    /** Hapus PERMANEN (tanpa tempat sampah). Hanya dipakai aturan otomatis yang disetujui Pak Rico: video sosmed yang sudah terbit. */
    hapusPermanen(rel: string) { const abs = this.aman(rel); if (abs === this.root || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return false; fs.rmSync(abs, { force: true }); this.pakaiCache = null; return true; }
    /** Lokasi berkas di disk (untuk diunggah langsung dari VPS, mis. ke YouTube/TikTok). Tetap lewat pemeriksaan path aman. */
    lokasi(rel: string) { const abs = this.aman(rel); if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) throw new Error('Berkas tidak ditemukan'); return abs; }
    /** Tautan sekali pakai (10 menit) untuk unduh/pratinjau tanpa header login. */
    tautan(rel: string, unduh: boolean) {
        const abs = this.aman(rel);
        if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) throw new Error('Berkas tidak ditemukan');
        const t = crypto.randomBytes(24).toString('base64url');
        this.tokens.set(t, { abs, exp: Date.now() + 10 * 60_000, unduh });
        for (const [k, v] of this.tokens) if (v.exp < Date.now()) this.tokens.delete(k);
        return { url: `/api/kantor/berkas/f/${t}/${encodeURIComponent(path.basename(abs))}` };
    }
    kirim(token: string, res: Response) {
        const x = this.tokens.get(token);
        if (!x || x.exp < Date.now()) { res.status(410).send('Tautan kedaluwarsa. Buka lagi dari menu Berkas.'); return; }
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Berkas yang bisa menjalankan skrip di browser selalu diunduh, tidak pernah ditampilkan.
        const berbahaya = /\.(html?|xhtml|svg|xml|js|mjs)$/i.test(x.abs);
        if (berbahaya) res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        if (x.unduh || berbahaya) res.attachment(path.basename(x.abs));
        res.sendFile(x.abs, { dotfiles: 'allow' });
    }
}
