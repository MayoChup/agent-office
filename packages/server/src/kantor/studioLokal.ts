/**
 * Sinkron dengan "Studio Video Rico" — website lokal (Remotion) di PC Pak Rico.
 *
 * VPS tidak bisa menghubungi PC, jadi studio yang MENGAMBIL sendiri (tiap ±1 menit selama menyala):
 *   GET  /api/studio/antrean           → konten video yang prompt produksinya sudah siap & belum ada videonya
 *   GET  /api/studio/brief/:id         → brief JSON lengkap + tautan sementara (10 menit) untuk aset
 *   POST /api/studio/status/:id        → kabar tahap dari studio (diterima/disusun/dirender/gagal) — tampil di kantor
 *   POST /api/studio/hasil/:id?nama=   → unggah MP4 hasil render (raw body) → dipasang sebagai media konten
 *
 * Keamanan: token khusus studio (hanya hash yang disimpan), terpisah dari login kantor, hanya bisa memakai 4 rute di atas.
 * Hasil render TIDAK pernah diposting otomatis: konten jadi status "aset" dan tetap menunggu Pak Rico menekan Setujui.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response, RequestHandler } from 'express';
import type { Konten, Sosmed } from './sosmed';

export interface CtxStudioLokal { a: { id: string; nama: string; platform: string; handle?: string }; s: Sosmed }
export interface AsetStudio { id: string; jenis: string; nama: string; ket: string; path: string }
interface Tahap { tahap: string; pesan?: string; at: number }
interface Simpanan { tokenHash?: string; dibuat?: number; terlihat?: number; versi?: string; otomatis: boolean; status: Record<string, Tahap> }

const FORMAT_VIDEO = (f: string) => f === 'reel' || f === 'story' || f === 'video';
const TAHAP = ['diterima', 'disusun', 'dirender', 'mengunggah', 'selesai', 'gagal', 'dilewati'];

export function pasangStudioLokal(d: {
    app: Express; requireToken: RequestHandler; dataDir: string; berkas: any;
    semua: () => CtxStudioLokal[]; folderAkun: (a: CtxStudioLokal['a']) => string;
    aset: (c: CtxStudioLokal, k: Konten) => AsetStudio[]; brand: (c: CtxStudioLokal) => { warna: string[]; fontJudul: string; fontIsi: string } | null;
    kabar?: (teks: string) => void;
}) {
    const file = path.join(d.dataDir, 'studio-lokal.json');
    let st: Simpanan = { otomatis: true, status: {} };
    try { st = { ...st, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* baru */ }
    const simpan = () => { try { fs.writeFileSync(file, JSON.stringify(st)); } catch (e: any) { console.warn('[Studio lokal] simpan:', e?.message || e); } };
    const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
    const idDari = (c: CtxStudioLokal, k: Konten) => `${c.a.id}:${k.id}`;

    /* ── Auth token studio ── */
    const authStudio: RequestHandler = (req, res, next) => {
        const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        if (!st.tokenHash || !t) { res.status(401).json({ ok: false, error: 'Token studio belum diatur atau salah.' }); return; }
        const a = Buffer.from(hash(t)), b = Buffer.from(st.tokenHash);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) { res.status(401).json({ ok: false, error: 'Token studio salah atau sudah dicabut.' }); return; }
        st.terlihat = Date.now(); const v = String(req.headers['x-studio-versi'] || '').slice(0, 40); if (v) st.versi = v;
        next();
    };
    const r = (fn: (req: Request) => any): RequestHandler => async (req, res) => { try { res.json({ ok: true, ...(await fn(req)) }); } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); } };

    /** Konten yang boleh diambil studio: video, prompt produksi sudah siap (sketsa sudah dipilih), belum ada media, belum terbit. */
    const siap = (k: Konten) => FORMAT_VIDEO(k.format) && k.status === 'prompt' && !k.aset && !!(k.promptVideo || k.promptEdit || k.storyboard?.length);
    const cari = (id: string) => {
        const [akun, kid] = String(id).split(':');
        const c = d.semua().find((x) => x.a.id === akun); if (!c) throw new Error('Akun tidak ditemukan.');
        const k = c.s.st.konten.find((x) => x.id === kid); if (!k) throw new Error('Konten tidak ditemukan.');
        return { c, k };
    };
    const rasio = (_c: CtxStudioLokal, k: Konten) => (k.format === 'video' ? '16:9' : '9:16');

    /** Brief dalam format yang disepakati dengan studio (Lampiran D prompt Antigravity). */
    function brief(c: CtxStudioLokal, k: Konten) {
        const s = c.s, g = s.gayaDari(k), b = d.brand(c);
        const aset = d.aset(c, k).map((x) => { try { return { id: x.id, jenis: x.jenis, nama: x.nama, ket: x.ket, file: path.basename(x.path), url: d.berkas.tautan(x.path, true).url }; } catch { return null; } }).filter(Boolean);
        let acuanGaya: any = null;
        if (g?.contoh?.path) { try { acuanGaya = { nama: g.contoh.nama, file: path.basename(g.contoh.path), url: d.berkas.tautan(g.contoh.path, true).url }; } catch { /* berkas hilang */ } }
        return {
            v: 1, sumber: 'kantor-rico', id: idDari(c, k), diubah: k.diubah,
            akun: { id: c.a.id, nama: c.a.nama, platform: c.a.platform, handle: c.a.handle || undefined },
            kode: k.kode, tanggal: k.tgl, jam: k.jam, judul: k.judul, platform: c.a.platform, format: k.format,
            rasio: rasio(c, k), durasi: s.durasiDari(k),
            gaya: g ? { id: g.id, jenis: g.jenis, nama: g.nama, deskripsi: g.deskripsi } : null,
            look: k.look || '', grade: k.grade || '', efek: k.efek || [],
            hook: k.hook || '', voiceover: k.voiceover || '', subtitle: k.subtitle || [],
            storyboard: (k.storyboard || []).map((a) => ({ detik: a.detik, visual: a.visual, teksLayar: a.teksLayar, narasi: a.narasi, sfx: a.sfx || '', efek: a.efek || '', sketsa: a.sketsa })),
            promptVideo: k.promptVideo || '', promptEdit: k.promptEdit || '', rekam: k.rekam || '', promptSuara: k.promptSuara || null,
            musik: k.musik || '', sampul: k.sampul || '', caption: k.caption || '', hashtag: k.hashtag || [], ajakan: k.ajakan || '',
            brand: b, aset, acuanGaya,
            catatan: 'Tautan aset berlaku 10 menit sejak brief diambil; unduh segera. Video hasil diunggah ke POST /api/studio/hasil/:id.'
        };
    }

    /* ── Rute untuk studio (token studio) ── */
    d.app.get('/api/studio/antrean', authStudio, r(() => {
        const out: any[] = [];
        if (st.otomatis) for (const c of d.semua()) for (const k of c.s.st.konten) {
            if (!siap(k)) continue;
            const id = idDari(c, k), t = st.status[id];
            if (t?.tahap === 'dilewati') continue;
            out.push({ id, akun: c.a.nama, judul: k.judul, format: k.format, tanggal: k.tgl, jam: k.jam, diubah: k.diubah, tahap: t?.tahap || 'baru', tahapAt: t?.at });
        }
        simpan();
        return { otomatis: st.otomatis, antrean: out.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal))) };
    }));
    d.app.get('/api/studio/brief/:id', authStudio, r((req) => { const { c, k } = cari(String(req.params.id)); if (!FORMAT_VIDEO(k.format)) throw new Error('Konten ini bukan video.'); return { brief: brief(c, k) }; }));
    d.app.post('/api/studio/status/:id', authStudio, r((req) => {
        const { c, k } = cari(String(req.params.id)); const tahap = String(req.body?.tahap || '');
        if (!TAHAP.includes(tahap)) throw new Error(`Tahap tidak dikenal. Pakai: ${TAHAP.join(', ')}.`);
        const pesan = String(req.body?.pesan || '').replace(/\s+/g, ' ').slice(0, 300) || undefined;
        st.status[idDari(c, k)] = { tahap, pesan, at: Date.now() };
        if (tahap === 'gagal') { k.galat = `Studio lokal: ${pesan || 'gagal'}`.slice(0, 200); c.s.simpan(); }
        // rapikan catatan lama (konten terhapus)
        const ada = new Set(d.semua().flatMap((x) => x.s.st.konten.map((y) => idDari(x, y))));
        for (const kunci of Object.keys(st.status)) if (!ada.has(kunci)) delete st.status[kunci];
        simpan(); return {};
    }));
    d.app.post('/api/studio/hasil/:id', authStudio, async (req: Request, res: Response) => {
        try {
            const { c, k } = cari(String(req.params.id));
            if (!FORMAT_VIDEO(k.format)) throw new Error('Konten ini bukan video.');
            if (['terbit', 'mengunggah', 'terjadwal'].includes(k.status)) throw new Error('Konten ini sudah dijadwalkan/terbit; hasil baru tidak dipasang.');
            const tipe = String(req.headers['content-type'] || '');
            if (!/^video\/(mp4|quicktime)|application\/octet-stream/.test(tipe)) throw new Error('Kirim berkas MP4 (Content-Type: video/mp4).');
            const ukuran = Number(req.headers['content-length'] || 0);
            if (ukuran > 800e6) throw new Error('Video terlalu besar (maks 800 MB).');
            const dasar = d.folderAkun(c.a); try { d.berkas.buatFolder(dasar, 'Hasil Studio'); } catch { /* ada */ }
            let nama = String(req.query.nama || `${k.kode || ''} ${k.judul}`).replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').trim().slice(0, 70) || 'video';
            if (!/\.(mp4|mov)$/i.test(nama)) nama += '.mp4';
            const x = await d.berkas.terima(req, `${dasar}/Hasil Studio`, nama);
            c.s.pasangAset(k.id, x.path);
            st.status[idDari(c, k)] = { tahap: 'selesai', pesan: `Video terpasang (${(x.size / 1e6).toFixed(1)} MB), menunggu Setujui.`, at: Date.now() }; simpan();
            d.kabar?.(`🎬 Studio lokal selesai: "${k.judul}" (${c.a.nama}) sudah ada videonya. Cek lalu Setujui di Sosmed → Antrean unggah.`);
            res.json({ ok: true, path: x.path, size: x.size });
        } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
    });

    /* ── Rute untuk kantor (login Pak Rico) ── */
    const info = () => ({ ada: !!st.tokenHash, dibuat: st.dibuat, terlihat: st.terlihat, versi: st.versi, otomatis: st.otomatis,
        tersambung: !!st.terlihat && Date.now() - st.terlihat < 3 * 60_000,
        antrean: d.semua().reduce((n, c) => n + c.s.st.konten.filter(siap).length, 0) });
    d.app.get('/api/kantor/studio-lokal', d.requireToken, r(() => ({ studio: info(), status: st.status })));
    d.app.post('/api/kantor/studio-lokal/token', d.requireToken, r(() => {
        const t = `svr_${crypto.randomBytes(24).toString('base64url')}`;
        st.tokenHash = hash(t); st.dibuat = Date.now(); st.terlihat = undefined; simpan();
        return { token: t, studio: info() }; // satu-satunya saat token terlihat utuh
    }));
    d.app.post('/api/kantor/studio-lokal/cabut', d.requireToken, r(() => { st.tokenHash = undefined; st.terlihat = undefined; simpan(); return { studio: info() }; }));
    d.app.post('/api/kantor/studio-lokal/atur', d.requireToken, r((req) => { if (req.body?.otomatis !== undefined) st.otomatis = !!req.body.otomatis; simpan(); return { studio: info() }; }));
    d.app.post('/api/kantor/studio-lokal/konten/:id/:aksi', d.requireToken, r((req) => {
        const { c, k } = cari(String(req.params.id)); const id = idDari(c, k), aksi = String(req.params.aksi);
        if (aksi === 'lewati') st.status[id] = { tahap: 'dilewati', at: Date.now() };
        else if (aksi === 'kirim-ulang') delete st.status[id];
        else throw new Error('Aksi tidak dikenal.');
        simpan(); return { status: st.status[id] || null };
    }));

    return { statusUntuk: (akun: string, id: string) => st.status[`${akun}:${id}`] || null };
}
