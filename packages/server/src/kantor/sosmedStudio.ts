/**
 * Studio konten per akun:
 *  - Gudang aset (logo, maskot, foto produk, latar, …) — diunggah Pak Rico atau dibuat atas perintahnya; AI memberi label.
 *  - Brand kit (palet, font, gaya desain, logo, foto profil, cover highlight).
 *  - Gambar AI (OpenRouter) HANYA saat Pak Rico menekan "Buat" — saran dari tim tidak pernah otomatis dibuat.
 *  - Desain carousel/feed: mesin desain kantor (templat, gratis) atau Claude sebagai penata (jatah langganan), lalu digambar di VPS.
 *  - "Kirim ke Claude": teks siap tempel + paket aset (zip) untuk dikerjakan di aplikasi Claude.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { Express, RequestHandler, Request } from 'express';
import type { Berkas } from './berkas';
import type { Papan } from './papan';
import type { ModelRouter } from './model';
import type { ClaudeLangganan } from './claudeLangganan';
import { GambarAi } from './gambarAi';
import { GAYA_DESAIN, DAFTAR_FONT, gayaDesain, renderCarousel, renderSlide, contohSlide, renderLogo, renderCover, renderFotoProfil, renderKartuFont, kecilkan, desainSiap, type IsiSlide, type InfoMerek, type KonsepLogo } from './desainSosmed';
import { ambilJson, bacaSlide, FORMAT_VIDEO, type Konten, type Sosmed, type Slide } from './sosmed';

type Ctx = { a: { id: string; nama: string; platform: string; handle: string }; s: Sosmed };
export const JENIS_ASET = ['logo', 'maskot', 'produk', 'foto', 'latar', 'ikon', 'elemen', 'highlight', 'profil', 'lain'] as const;
export const NAMA_JENIS: Record<string, string> = { logo: 'Logo', maskot: 'Maskot', produk: 'Foto produk', foto: 'Foto (orang/tempat)', latar: 'Latar', ikon: 'Ikon & stiker', elemen: 'Elemen konten', highlight: 'Cover highlight', profil: 'Foto profil', lain: 'Lainnya' };
/** Aset yang biasanya ditempel utuh (tidak dipotong). */
const UTUH = new Set(['logo', 'maskot', 'produk', 'ikon', 'elemen']);

export interface ItemGudang { id: string; jenis: string; nama: string; ket: string; path: string; mime: string; sumber: 'unggah' | 'ai' | 'kantor'; at: number; label: 'menunggu' | 'ok' | 'gagal'; calon?: string; galat?: string }
export interface Brand { warna: string[]; fontJudul: string; fontIsi: string; gayaDesain: string; aksenMerek: boolean; logoId?: string; at: number; /** dipasang otomatis dari usulan, belum dipilih Pak Rico */ sementara?: boolean; palet?: number }
export interface Palet { nama: string; nuansa: string; warna: string[]; fontJudul: string; fontIsi: string; gayaDesain: string }
interface Usulan { at: number; warna: string[]; fontJudul: string; fontIsi: string; gayaDesain: string; alasan: string; logo: KonsepLogo[]; highlight: string[]; palet?: Palet[]; arahan?: string }
interface Kerja { id: string; jenis: 'gambar' | 'brand' | 'desain' | 'label'; judul: string; status: 'jalan' | 'selesai' | 'gagal'; galat?: string; at: number; usd?: number; batch?: string; konten?: string }
interface Gudang { item: ItemGudang[]; brand: Brand | null; usulan: Usulan | null; kerja: Kerja[]; claudeHari: { hari: string; n: number } }

const gid = () => Math.random().toString(36).slice(2, 9);
const hariWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const mimeDari = (p: string) => (/\.png$/i.test(p) ? 'image/png' : /\.webp$/i.test(p) ? 'image/webp' : /\.gif$/i.test(p) ? 'image/gif' : 'image/jpeg');
const GAMBAR = /\.(png|jpe?g|webp|gif)$/i;
const namaAman = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/^\.+/, '').trim().slice(0, 60) || 'aset';

/* ── ZIP sederhana (tanpa kompresi; gambar sudah terkompresi) ── */
export function buatZip(files: Array<{ nama: string; data: Buffer }>): Buffer {
    const lokal: Buffer[] = [], pusat: Buffer[] = []; let ofs = 0;
    const d = new Date(), waktu = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), tgl = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
        const nama = Buffer.from(f.nama, 'utf8'), crc = zlib.crc32(f.data) >>> 0;
        const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(waktu, 10); h.writeUInt16LE(tgl, 12);
        h.writeUInt32LE(crc, 14); h.writeUInt32LE(f.data.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(nama.length, 26); h.writeUInt16LE(0, 28);
        lokal.push(h, nama, f.data);
        const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(waktu, 12); c.writeUInt16LE(tgl, 14);
        c.writeUInt32LE(crc, 16); c.writeUInt32LE(f.data.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(nama.length, 28); c.writeUInt32LE(ofs, 42);
        pusat.push(c, nama);
        ofs += 30 + nama.length + f.data.length;
    }
    const cd = Buffer.concat(pusat), e = Buffer.alloc(22);
    e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(ofs, 16);
    return Buffer.concat([...lokal, cd, e]);
}

export interface DepsStudio {
    app: Express; requireToken: RequestHandler; berkas: Berkas; papan: Papan; dataDir: string;
    ctxReq: (req: Request) => Ctx; semua: () => Ctx[]; folderAkun: (a: Ctx['a']) => string; label: (a: Ctx['a']) => string;
    router: () => ModelRouter | undefined; claude?: ClaudeLangganan;
    kerjaSosmed: (aiId: string, judul: string, prompt: string, detail?: string) => Promise<string>;
}

export function pasangStudio(d: DepsStudio) {
    const { app, requireToken, berkas, papan } = d;
    const gambarAi = new GambarAi(d.dataDir, () => (d.router() as any)?.kunciOpenRouter?.() || process.env.OPENROUTER_API_KEY || '');
    const cache = new Map<string, Gudang>();
    const fileG = (id: string) => path.join(d.dataDir, `sosmed-gudang-${id}.json`);
    const dirThumb = (id: string) => path.join(d.dataDir, 'sosmed-thumb', id);
    const gudang = (c: Ctx): Gudang => {
        let g = cache.get(c.a.id);
        if (!g) {
            g = { item: [], brand: null, usulan: null, kerja: [], claudeHari: { hari: '', n: 0 } };
            try { g = { ...g, ...JSON.parse(fs.readFileSync(fileG(c.a.id), 'utf8')) }; } catch { /* baru */ }
            for (const k of g!.kerja) if (k.status === 'jalan') { k.status = 'gagal'; k.galat = 'Terputus (kantor dimulai ulang).'; }
            cache.set(c.a.id, g!);
        }
        return g!;
    };
    const simpan = (c: Ctx) => { try { fs.writeFileSync(fileG(c.a.id), JSON.stringify(gudang(c))); } catch (e: any) { console.warn('[Studio] simpan:', e?.message || e); } };
    const abs = (rel: string) => berkas.lokasi(rel);
    const folder = (c: Ctx, sub = '') => {
        const dasar = d.folderAkun(c.a);
        try { berkas.buatFolder(dasar, 'Aset'); } catch { /* ada */ }
        if (sub) { try { berkas.buatFolder(`${dasar}/Aset`, sub); } catch { /* ada */ } return `${dasar}/Aset/${sub}`; }
        return `${dasar}/Aset`;
    };
    /** Tulis berkas ke folder Berkas (nama unik). */
    const tulis = (folderRel: string, nama: string, data: Buffer) => {
        const dir = path.join(berkas.root, ...folderRel.split('/'));
        fs.mkdirSync(dir, { recursive: true });
        const ext = path.extname(nama), dasar = path.basename(nama, ext);
        let n = nama; for (let i = 2; fs.existsSync(path.join(dir, n)); i++) n = `${dasar} (${i})${ext}`;
        fs.writeFileSync(path.join(dir, n), data);
        return `${folderRel}/${n}`;
    };
    const baca = (it: ItemGudang) => fs.readFileSync(abs(it.path));
    const cariItem = (c: Ctx, id: string) => { const it = gudang(c).item.find((x) => x.id === id); if (!it) throw new Error('Aset tidak ditemukan.'); return it; };
    const tersedia = (c: Ctx) => gudang(c).item.filter((x) => !x.calon && fs.existsSync(path.join(berkas.root, ...x.path.split('/'))));
    const teksGudang = (c: Ctx) => tersedia(c).filter((x) => x.jenis !== 'highlight' && x.jenis !== 'profil').slice(0, 60)
        .map((x) => `[${x.id}] ${NAMA_JENIS[x.jenis] || x.jenis} — ${x.nama}${x.ket ? `: ${x.ket}` : ''}`).join('\n');
    const kerjaBaru = (c: Ctx, k: Omit<Kerja, 'id' | 'at' | 'status'>) => { const g = gudang(c); const x: Kerja = { id: gid(), at: Date.now(), status: 'jalan', ...k }; g.kerja = [...g.kerja, x].slice(-20); simpan(c); return x; };
    const kerjaSelesai = (c: Ctx, x: Kerja, galat?: string, usd?: number) => { x.status = galat ? 'gagal' : 'selesai'; x.galat = galat?.slice(0, 300); if (usd != null) x.usd = +usd.toFixed(4); simpan(c); };

    /* ── Label aset dengan AI visi (antrean satu per satu) ── */
    let antreLabel: Promise<void> = Promise.resolve();
    const labeli = (c: Ctx, it: ItemGudang) => {
        it.label = 'menunggu'; simpan(c);
        antreLabel = antreLabel.then(async () => {
            const r = d.router(); if (!r) { it.label = 'gagal'; it.galat = 'AI visi belum siap.'; simpan(c); return; }
            try {
                const kecil = await kecilkan(baca(it), 768);
                const o = await r.lihat('sosmed', 'Maya', [
                    'Ini aset untuk akun media sosial. Tentukan:', `- "jenis": salah satu dari ${JENIS_ASET.filter((j) => j !== 'highlight' && j !== 'profil').join(', ')}`,
                    '- "nama": nama singkat yang jelas (mis. "Kopi Susu Aren 1L", "Maskot Kiko – senyum", "Logo utama")', '- "ket": 1 kalimat: isi gambar, warna dominan, latar (polos/transparan/ramai), cocok dipakai untuk apa.',
                    it.nama && it.nama !== 'aset' ? `Nama dari pemilik (pertahankan kalau masuk akal): ${it.nama}` : '', 'Jawab JSON saja: {"jenis":"…","nama":"…","ket":"…"}'
                ].filter(Boolean).join('\n'), [{ mime: 'image/jpeg', data: kecil }], 400);
                const j = ambilJson(o.teks);
                if (!j) throw new Error('Jawaban AI tidak terbaca.');
                if (JENIS_ASET.includes(j.jenis) && it.sumber === 'unggah' && !it.galat?.startsWith('jenis:')) it.jenis = j.jenis;
                if (j.nama && (it.nama === 'aset' || /^(img|image|dsc|photo|whatsapp|screenshot|pxl|foto)[-_ ]?\d*/i.test(it.nama))) it.nama = String(j.nama).slice(0, 80);
                it.ket = String(j.ket || '').slice(0, 300); it.label = 'ok'; it.galat = undefined;
            } catch (e: any) { it.label = 'gagal'; it.galat = String(e?.message || e).slice(0, 160); }
            simpan(c);
        }).catch(() => undefined);
    };

    /* ── Thumbnail (dari cache di data/, bukan di Berkas) ── */
    const thumb = async (c: Ctx, it: ItemGudang): Promise<Buffer> => {
        const f = path.join(dirThumb(c.a.id), `${it.id}.jpg`);
        try { return fs.readFileSync(f); } catch { /* buat */ }
        const b = await kecilkan(baca(it), 420);
        fs.mkdirSync(dirThumb(c.a.id), { recursive: true }); fs.writeFileSync(f, b); return b;
    };

    /* ── Merek untuk mesin desain ── */
    const merek = (c: Ctx): InfoMerek => {
        const g = gudang(c), b = g.brand, s = c.s;
        const logo = b?.logoId ? g.item.find((x) => x.id === b.logoId) : tersedia(c).find((x) => x.jenis === 'logo');
        let logoBuf: Buffer | null = null; try { if (logo) logoBuf = baca(logo); } catch { /* */ }
        return { nama: s.st.paketProfil?.namaTampilan?.[0] || c.a.nama, handle: (c.a.handle || s.st.profil.akun || '').replace(/^@/, ''), warna: b?.warna, logo: logoBuf, fontJudul: b?.fontJudul, fontIsi: b?.fontIsi, aksenMerek: !!b?.aksenMerek };
    };
    const ukuran = (c: Ctx) => (c.a.platform === 'tiktok' ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 });

    /* ── Desain carousel / feed ── */
    const slideDari = (c: Ctx, k: Konten, src0?: Slide[]): IsiSlide[] => {
        const src: Slide[] = src0 || (k.slide?.length ? k.slide : k.hook ? [{ no: 1, judul: k.hook, isi: '', visual: '' }] : []);
        const peta = new Map(tersedia(c).map((x) => [x.id, x]));
        const bacaId = (id?: string) => { const it = id ? peta.get(id) : undefined; try { return it ? { it, b: baca(it) } : null; } catch { return null; } };
        const maskot = tersedia(c).find((x) => x.jenis === 'maskot');
        const hiasan = k.hiasan || 'otomatis';
        return src.slice(0, 10).map((sl, i) => {
            // Sampul tanpa gambar: pakai produk/maskot yang memang dipilih untuk konten ini (bukan mengarang).
            const asetSampul = !sl.aset && i === 0 && (sl.tata === 'sampul' || !sl.tata) ? (k.pakaiAset || []).find((id) => ['produk', 'maskot'].includes(peta.get(id)?.jenis || '')) : undefined;
            const a = bacaId(sl.aset || asetSampul), e2 = bacaId(sl.elemenId);
            const kom = sl.komentar ? c.s.st.komentar.find((x) => x.id === sl.komentar) : undefined; // hanya komentar ASLI
            let elemen = hiasan === 'tanpa' ? [] : (sl.elemen || []).slice(0, hiasan === 'sedikit' ? 1 : 2);
            if (!maskot) elemen = elemen.filter((e) => e.jenis !== 'maskot');
            const mk = elemen.some((e) => e.jenis === 'maskot') || sl.tata === 'penutup' ? bacaId(maskot?.id) : null;
            return {
                judul: i === 0 && k.hook && k.format === 'carousel' && !sl.judul ? k.hook : sl.judul, isi: sl.isi, label: k.pilar, gambar: a?.b || null, utuh: a ? UTUH.has(a.it.jenis) : undefined,
                tata: (k.format === 'feed' && !sl.tata ? 'sampul' : sl.tata) as any, angka: sl.angka, poin: sl.poin, kiri: sl.kiri, kanan: sl.kanan, labelKiri: sl.labelKiri, labelKanan: sl.labelKanan, kutipan: sl.kutipan, sumber: sl.sumber,
                elemen, gambar2: hiasan === 'tanpa' ? null : e2?.b || null, maskot: mk?.b || null, komentar: kom && hiasan !== 'tanpa' ? { teks: kom.teks.slice(0, 160), nama: `@${kom.user || 'pengikut'}` } : null
            };
        });
    };
    /** Elemen konten (ilustrasi benda pendukung) dibuat OTOMATIS lewat gambar AI — batas harian sendiri; dipakai ulang kalau sudah ada. */
    const kunciNama = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
    async function siapkanElemen(c: Ctx, k: Konten, gaya: string) {
        if ((k.hiasan || 'otomatis') !== 'otomatis' || !k.slide?.length) return;
        const perlu = k.slide.filter((sl) => sl.gambarElemen && !sl.elemenId).slice(0, 2);
        for (const sl of perlu) {
            const kata = kunciNama(sl.gambarElemen!);
            const lama = tersedia(c).filter((x) => x.jenis === 'elemen').find((x) => { const kx = kunciNama(x.nama); return kata.length && kata.filter((w) => kx.includes(w)).length / kata.length >= 0.6; });
            if (lama) { sl.elemenId = lama.id; continue; }
            if (!gambarAi.bolehOtomatis()) break;
            const b = gudang(c).brand, gy = gayaDesain(gaya);
            const corak = ['paper-ink', 'vintage-editorial', 'dark-botanical'].includes(gy.id) ? 'ilustrasi gaya tinta/linocut sederhana' : gy.id === 'neon-cyber' || gy.id === 'terminal-green' ? 'ilustrasi flat dengan garis neon tipis' : 'ilustrasi stiker flat vector, garis luar rapi, bayangan lembut';
            try {
                const r = await gambarAi.buat({ prompt: `${sl.gambarElemen}. ${corak}, satu objek utuh di tengah, sudut pandang 3/4 yang menarik, warna selaras ${b?.warna?.slice(0, 3).join(', ') || gy.nama}, latar transparan, tanpa teks, tanpa logo merek.`, n: 1, rasio: '1:1', latarTransparan: true, otomatis: true, untuk: `${d.label(c.a)}: elemen ${sl.gambarElemen}` });
                const gb = r.gambar[0]; if (!gb) continue;
                const rel = tulis(folder(c, 'Elemen'), `${namaAman(sl.gambarElemen!)}.png`, gb.data);
                const it: ItemGudang = { id: gid(), jenis: 'elemen', nama: sl.gambarElemen!.slice(0, 80), ket: `Ilustrasi otomatis (${gy.nama})`, path: rel, mime: gb.mime, sumber: 'ai', at: Date.now(), label: 'ok' };
                gudang(c).item.push(it); simpan(c); sl.elemenId = it.id;
            } catch (e: any) { console.warn('[Studio] elemen otomatis:', e?.message || e); break; }
        }
        c.s.simpan();
    }
    const bolehClaude = (c: Ctx, otomatis: boolean) => {
        if (!d.claude?.boleh()) return false;
        const g = gudang(c), batas = Math.max(0, Number(process.env.KANTOR_CAROUSEL_CLAUDE_HARI ?? 1));
        if (g.claudeHari.hari !== hariWib()) g.claudeHari = { hari: hariWib(), n: 0 };
        return otomatis ? g.claudeHari.n < batas : true;
    };
    /** Claude sebagai penata: memilih gaya, merapikan teks slide, menandai kata yang ditekankan, menempatkan aset. Kantor yang menggambar. */
    async function tataClaude(c: Ctx, k: Konten, gayaAwal: string): Promise<{ gaya: string; slide: Slide[]; catatan: string; usd: number }> {
        const prompt = ['Kamu art director & copywriter carousel Instagram kelas agency. Tata ulang carousel di bawah supaya maksimal: berhenti-scroll di slide 1, satu ide per slide, mudah dibaca di HP, slide terakhir ajakan simpan/bagikan/ikuti.',
            'Kamu TIDAK menggambar; mesin desain kantor yang menggambar. Tugasmu memilih gaya, merapikan kata-kata, dan menandai penekanan.',
            '- Judul ≤ 8 kata (slide 1 boleh ≤ 12). Isi ≤ 28 kata. Bahasa sama dengan aslinya, natural, tanpa klise AI, tanpa tanda pisah panjang.',
            '- Tandai 1–3 kata terpenting di judul dengan **dua bintang** (warna aksen). Jangan menandai di isi.',
            '- "label" pendek (1–2 kata) untuk pojok slide, mis. nama seri/pilar.',
            '- "aset": id aset gudang yang paling cocok untuk slide itu, atau "" (jangan memaksa gambar di setiap slide; produk/maskot di slide yang relevan saja).',
            `- "gaya": pilih satu id gaya yang paling cocok untuk merek & topik ini. Gaya pilihan pemilik saat ini: ${gayaAwal}. Ganti hanya kalau jelas lebih baik.`,
            `GAYA TERSEDIA:\n${GAYA_DESAIN.map((g) => `${g.id}: ${g.nama} — ${g.nuansa}; cocok: ${g.cocok}`).join('\n')}`,
            `AKUN: ${c.a.nama} (${c.a.platform}) · niche: ${c.s.st.strategi?.niche || c.s.st.profil.topik} · audiens: ${c.s.st.strategi?.audiens || c.s.st.profil.audiens}`,
            `GUDANG ASET:\n${teksGudang(c) || '(kosong)'}`,
            c.s.bagianDesain(),
            `CAROUSEL SAAT INI (${k.judul}):\n${(k.slide || []).map((s) => `${s.no}. ${JSON.stringify({ judul: s.judul, isi: s.isi, tata: s.tata, angka: s.angka, poin: s.poin, kiri: s.kiri, kanan: s.kanan, elemen: s.elemen, gambarElemen: s.gambarElemen, aset: s.aset })}`).join('\n') || `1. ${k.hook}`}`,
            'Keluarkan JSON saja: {"gaya":"id","slide":[{"judul":"…","isi":"…","label":"…","aset":"id atau kosong","tata":"…","elemen":[{"jenis":"…","teks":"…"}],"gambarElemen":"…"}],"catatan":"1 kalimat alasan pilihan desain"}'].join('\n\n');
        const r = await d.claude!.jalankan('sosmed', prompt);
        const j = ambilJson(r.teks); if (!j || !Array.isArray(j.slide) || !j.slide.length) throw new Error('Tata letak dari Claude tidak terbaca.');
        const sah = new Set(tersedia(c).map((x) => x.id));
        const slide: Slide[] = j.slide.slice(0, 10).map((x: any, i: number) => { const sl = bacaSlide(x, i); sl.aset = sah.has(String(x?.aset || '')) ? String(x.aset) : undefined; const lama = k.slide?.[i]; if (lama) { sl.visual = lama.visual; if (lama.elemenId && sl.gambarElemen === lama.gambarElemen) sl.elemenId = lama.elemenId; } return sl; }).filter((x: Slide) => x.judul);
        return { gaya: GAYA_DESAIN.some((g) => g.id === j.gaya) ? j.gaya : gayaAwal, slide, catatan: String(j.catatan || '').slice(0, 300), usd: r.usd };
    }
    async function desainKonten(c: Ctx, k: Konten, mode: 'templat' | 'claude' | 'otomatis', gayaPilih?: string) {
        if (FORMAT_VIDEO(k.format)) throw new Error('Desain otomatis hanya untuk carousel dan postingan gambar.');
        const ds = desainSiap(); if (!ds.siap) throw new Error(ds.pesan);
        const g = gudang(c);
        let gaya = gayaPilih && GAYA_DESAIN.some((x) => x.id === gayaPilih) ? gayaPilih : g.brand?.gayaDesain || GAYA_DESAIN[0].id;
        let slide = slideDari(c, k), oleh: 'templat' | 'claude' = 'templat', catatan = '';
        if (!slide.length) throw new Error('Konten ini belum punya teks slide.');
        if ((mode === 'claude' || mode === 'otomatis') && bolehClaude(c, mode === 'otomatis')) {
            try {
                const t = await papan.jalankan({ ai: 'sosmed-produksi', nama: 'Vino · otak Claude', judul: `[${d.label(c.a)}] Tata desain: ${k.judul}`, detail: 'Claude menata gaya, teks, dan penempatan aset; kantor yang menggambar.', sumber: 'tugas' }, () => tataClaude(c, k, gaya));
                gaya = t.gaya; oleh = 'claude'; catatan = t.catatan;
                // Teks & tata hasil Claude disimpan ke konten (judul tanpa tanda ** disimpan apa adanya; penekanan dipakai mesin desain).
                k.slide = t.slide;
                g.claudeHari.n++; simpan(c);
            } catch (e: any) {
                if (mode === 'claude') throw e;
                console.warn('[Studio] tata Claude gagal, pakai templat:', e?.message || e);
            }
        }
        await siapkanElemen(c, k, gaya);
        slide = slideDari(c, k);
        const png = k.format === 'feed' ? [await renderSlide(gaya, slide[0], 1, 1, merek(c), ukuran(c))] : await renderCarousel(gaya, slide, merek(c), ukuran(c));
        const dasar = d.folderAkun(c.a); try { berkas.buatFolder(dasar, 'Desain'); } catch { /* ada */ }
        // Desain ulang: berkas desain lama konten ini dibuang (masuk tempat sampah Berkas), tidak menumpuk.
        for (const lama of [k.aset, ...(k.asetLain || [])]) if (lama?.path?.startsWith(`${dasar}/Desain/`)) { try { berkas.hapus(lama.path); } catch { /* sudah hilang */ } }
        const nama = namaAman(`${c.s.labelBerkas(k)} ${k.judul}`);
        png.forEach((b, i) => { const rel = tulis(`${dasar}/Desain`, `${nama}${png.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : ''}.png`, b); c.s.pasangAset(k.id, rel, i > 0); });
        k.desain = { gaya, oleh, at: Date.now(), catatan: catatan || undefined }; c.s.simpan();
        return { gaya, oleh, n: png.length };
    }

    /* ── Gambar AI atas perintah Pak Rico ── */
    async function buatGambar(c: Ctx, o: { prompt: string; jenis: string; nama: string; acuan: string[]; n: number; tinggi: boolean; rasio?: string; transparan?: boolean; saran?: { konten: string; id: string } }) {
        const batch = gid();
        const x = kerjaBaru(c, { jenis: 'gambar', judul: `Buat ${o.n} pilihan: ${o.nama}`, batch, konten: o.saran?.konten });
        const acuan = o.acuan.map((id) => gudang(c).item.find((y) => y.id === id)).filter(Boolean) as ItemGudang[];
        const brand = gudang(c).brand;
        const prompt = [o.prompt,
            acuan.length ? `Gambar acuan terlampir: ${acuan.map((a, i) => `#${i + 1} ${a.nama}${a.ket ? ` (${a.ket})` : ''}`).join('; ')}. Pertahankan tokoh/produk yang SAMA PERSIS (bentuk, warna, proporsi, label/teks produk) — hanya pose/sudut/latar yang berubah.` : '',
            brand?.warna?.length ? `Palet merek: ${brand.warna.join(', ')}.` : '',
            o.transparan ? 'Latar transparan, subjek utuh tidak terpotong, tanpa bayangan lantai.' : '',
            'Tanpa teks/tulisan tambahan, tanpa watermark. Kualitas tinggi, pencahayaan rapi, tidak terlihat seperti gambar AI murahan.'].filter(Boolean).join('\n');
        papan.jalankan({ ai: 'sosmed-produksi', nama: 'Vino', judul: `[${d.label(c.a)}] Gambar AI: ${o.nama}`, detail: `${o.n} pilihan · ${o.tinggi ? 'kualitas tinggi' : 'standar'}${acuan.length ? ` · acuan: ${acuan.map((a) => a.nama).join(', ')}` : ''}`, sumber: 'tugas' }, async () => {
            const bahan = await Promise.all(acuan.map(async (a) => ({ mime: 'image/jpeg', data: await kecilkan(baca(a), 1024) })));
            const r = await gambarAi.buat({ prompt, n: o.n, rasio: o.rasio, acuan: bahan, tinggi: o.tinggi, latarTransparan: o.transparan, untuk: `${d.label(c.a)}: ${o.nama}` });
            const dir = folder(c, 'AI');
            r.gambar.forEach((gb, i) => {
                const rel = tulis(dir, `${namaAman(o.nama)} – pilihan ${i + 1}.${/webp/.test(gb.mime) ? 'webp' : /jpe?g/.test(gb.mime) ? 'jpg' : 'png'}`, gb.data);
                gudang(c).item.push({ id: gid(), jenis: o.jenis, nama: o.nama, ket: o.prompt.slice(0, 200), path: rel, mime: gb.mime, sumber: 'ai', at: Date.now(), label: 'ok', calon: batch });
            });
            kerjaSelesai(c, x, undefined, r.usd);
            return r;
        }).catch((e) => kerjaSelesai(c, x, String(e?.message || e)));
        return { batch };
    }

    /* ── Brand kit (usulan Maya) ── */
    /** Maya menyusun 4 pilihan palet (+ font & gaya), 4 konsep logo, dan nama highlight. lempar = untuk langkah setup (galat diteruskan). */
    async function usulBrand(c: Ctx, arahan: string, o: { lempar?: boolean; paletSaja?: boolean } = {}) {
        const s = c.s, st = s.st;
        const x = kerjaBaru(c, { jenis: 'brand', judul: o.paletSaja ? 'Pilihan palet baru' : 'Usulan brand kit' });
        try {
            const lama = gudang(c).usulan;
            const prompt = ['Kamu brand designer di agency social media. Susun BRAND KIT untuk akun ini supaya feed konsisten, menarik, & mudah dikenali.',
                `AKUN: ${c.a.nama} (${c.a.platform}) · niche: ${st.strategi?.niche || st.profil.topik} · audiens: ${st.strategi?.audiens || st.profil.audiens} · nada: ${st.profil.gaya}`,
                st.strategi?.janji ? `JANJI AKUN: ${st.strategi.janji}` : '', st.paketProfil?.namaTampilan?.length ? `NAMA TAMPILAN: ${st.paketProfil.namaTampilan.join(' / ')}` : '',
                `GUDANG ASET: ${teksGudang(c) || '(kosong)'}`, arahan ? `ARAHAN PEMILIK (wajib diikuti): ${arahan}` : '',
                o.paletSaja && lama?.palet?.length ? `JANGAN ulangi palet ini (buat yang benar-benar berbeda): ${lama.palet.map((p) => `${p.nama} ${p.warna.join(' ')}`).join(' | ')}` : '',
                '- "palet": 4 PILIHAN yang jelas berbeda karakternya (mis. hangat-akrab, bersih-premium, cerah-ceria, tegas-kontras). Tiap pilihan: {"nama":"2–3 kata yang menggugah, mis. Kopi Senja","nuansa":"3–5 kata","warna":["utama","gelap","terang","aksen","netral"] (5 hex; teks gelap harus terbaca di atas terang dan sebaliknya),"fontJudul","fontIsi","gayaDesain"}.',
                `  Font hanya dari: ${DAFTAR_FONT.join(', ')}. Gaya hanya id dari: ${GAYA_DESAIN.map((g) => `${g.id} (${g.nuansa})`).join('; ')}.`,
                o.paletSaja ? '' : '- "logo": 4 konsep logo berbasis tipografi yang berbeda: tiap konsep {"jenis":"monogram|wordmark|lencana|garis","teks":"…(monogram 1–3 huruf)","sub":"opsional, mis. kota/slogan pendek","font":"dari daftar","warna":"#hex","latar":"#hex"} — pakai warna dari palet pertama.',
                o.paletSaja ? '' : '- "highlight": 5 nama sorotan story (1 kata, ≤10 huruf), mis. Menu, Testi, Promo, Tips, FAQ.',
                '- "alasan": 2 kalimat kenapa pilihan pertama paling cocok.',
                `JSON saja: {"palet":[…4…],${o.paletSaja ? '' : '"logo":[…],"highlight":["…"],'}"alasan":"…"}`].filter(Boolean).join('\n');
            const raw = await d.kerjaSosmed('sosmed', `[${d.label(c.a)}] ${o.paletSaja ? 'Pilihan palet' : 'Brand kit'}`, prompt, '4 pilihan palet + font + gaya' + (o.paletSaja ? '' : ', 4 konsep logo, cover highlight.'));
            const j = ambilJson(raw); if (!j || !Array.isArray(j.palet) || !j.palet.length) throw new Error('Usulan brand dari AI tidak terbaca.');
            const hex = (v: any) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : '');
            const font = (v: any, cad: string) => (DAFTAR_FONT.includes(String(v)) ? String(v) : cad);
            const palet: Palet[] = j.palet.slice(0, 4).map((p: any, i: number) => ({ nama: String(p?.nama || `Pilihan ${i + 1}`).slice(0, 40), nuansa: String(p?.nuansa || '').slice(0, 60), warna: (Array.isArray(p?.warna) ? p.warna : []).map(hex).filter(Boolean).slice(0, 5), fontJudul: font(p?.fontJudul, 'Outfit'), fontIsi: font(p?.fontIsi, 'Outfit'), gayaDesain: GAYA_DESAIN.some((g) => g.id === p?.gayaDesain) ? p.gayaDesain : GAYA_DESAIN[5].id }))
                .filter((p: Palet) => p.warna.length >= 4);
            if (!palet.length) throw new Error('Palet dari AI tidak lengkap.');
            const p0 = palet[0];
            const u: Usulan = {
                at: Date.now(), warna: p0.warna, fontJudul: p0.fontJudul, fontIsi: p0.fontIsi, gayaDesain: p0.gayaDesain, alasan: String(j.alasan || '').slice(0, 400), palet, arahan: arahan || undefined,
                logo: o.paletSaja ? lama?.logo || [] : (Array.isArray(j.logo) ? j.logo : []).slice(0, 4).map((l: any) => ({ jenis: ['monogram', 'wordmark', 'lencana', 'garis'].includes(l?.jenis) ? l.jenis : 'wordmark', teks: String(l?.teks || c.a.nama).slice(0, 24), sub: l?.sub ? String(l.sub).slice(0, 28) : undefined, font: font(l?.font, 'Outfit'), warna: hex(l?.warna) || p0.warna[2] || '#ffffff', latar: hex(l?.latar) || p0.warna[0] || '#111111' })),
                highlight: o.paletSaja ? lama?.highlight || [] : (Array.isArray(j.highlight) ? j.highlight : []).map((h: any) => String(h).slice(0, 12)).filter(Boolean).slice(0, 6)
            };
            const g = gudang(c); g.usulan = u;
            // Belum ada brand pilihan Pak Rico → palet pertama dipakai SEMENTARA supaya desain pertama sudah berwarna merek.
            if (!g.brand || g.brand.sementara) g.brand = { warna: p0.warna, fontJudul: p0.fontJudul, fontIsi: p0.fontIsi, gayaDesain: p0.gayaDesain, aksenMerek: true, logoId: g.brand?.logoId, at: Date.now(), sementara: true, palet: 0 };
            if (!o.paletSaja) {
                // Logo konsep digambar sebagai calon (dipilih Pak Rico; yang tidak dipilih dibuang).
                const batch = gid(), dir = folder(c, 'Brand');
                for (const [i, l] of u.logo.entries()) {
                    const b = await renderLogo(l);
                    g.item.push({ id: gid(), jenis: 'logo', nama: `Logo ${l.teks} (${l.jenis})`, ket: `Konsep ${i + 1}: ${l.jenis}, font ${l.font}, ${l.warna} di atas ${l.latar}`, path: tulis(dir, `Logo konsep ${i + 1}.png`, b), mime: 'image/png', sumber: 'kantor', at: Date.now(), label: 'ok', calon: batch });
                }
                x.batch = batch;
            }
            pratinjauPaletCache.delete(c.a.id);
            kerjaSelesai(c, x);
        } catch (e: any) { kerjaSelesai(c, x, String(e?.message || e)); if (o.lempar) throw e; }
    }
    /** Pratinjau tiap pilihan palet: kartu font, avatar, dan 6 slide contoh (grid feed mini). */
    const pratinjauPaletCache = new Map<string, { kunci: string; data: any }>();
    async function pratinjauPalet(c: Ctx) {
        const g = gudang(c), u = g.usulan; if (!u?.palet?.length) return { palet: [] };
        const kunci = `${u.at}:${g.brand?.logoId || ''}`;
        const ada = pratinjauPaletCache.get(c.a.id); if (ada?.kunci === kunci) return ada.data;
        const m0 = merek(c), topik = c.s.st.strategi?.niche || c.s.st.profil.topik || c.a.nama;
        const contoh = contohSlide(topik);
        const ragam: IsiSlide[] = [
            { tata: 'sampul', judul: contoh[0].judul, isi: contoh[0].isi, label: 'Tips' },
            { tata: 'angka', angka: '3x', judul: 'Lebih **sering disimpan**', isi: 'Carousel yang rapi dan konsisten membuat orang kembali.', elemen: [{ jenis: 'garis-bawah' }] },
            { tata: 'daftar', judul: 'Yang Bapak **dapat**', poin: ['Tips praktis tiap minggu', 'Info promo lebih dulu', 'Jawaban pertanyaan pengikut'], elemen: [{ jenis: 'bintang' }] },
            { tata: 'kutipan', kutipan: 'Konsisten **mengalahkan** sempurna.', sumber: m0.nama, judul: '' },
            { tata: 'banding', judul: 'Dulu vs **sekarang**', labelKiri: 'Dulu', kiri: 'Posting tanpa rencana, warna beda-beda.', labelKanan: 'Sekarang', kanan: 'Satu gaya, feed rapi dan mudah dikenali.' },
            { tata: 'penutup', judul: 'Ikuti untuk **tips berikutnya**', isi: `@${m0.handle || m0.nama}` }
        ];
        const hasil = [] as any[];
        for (const p of u.palet) {
            const m = { ...m0, warna: p.warna, fontJudul: p.fontJudul, fontIsi: p.fontIsi, aksenMerek: true };
            const grid: string[] = [];
            for (const [i, sl] of ragam.entries()) grid.push(`data:image/jpeg;base64,${(await kecilkan(await renderSlide(p.gayaDesain, sl, i + 1, ragam.length, m, { w: 1080, h: 1350 }), 300)).toString('base64')}`);
            const avatar = m0.logo ? await renderFotoProfil(m0.logo, p.warna[2] || '#ffffff', 240) : await renderLogo({ jenis: 'monogram', teks: (m0.nama.match(/\b\w/g) || ['K']).slice(0, 2).join(''), font: p.fontJudul, warna: p.warna[2] || '#ffffff', latar: p.warna[0] || '#111111' }, 240);
            hasil.push({ ...p, gaya: gayaDesain(p.gayaDesain).nama, grid, avatar: `data:image/png;base64,${avatar.toString('base64')}`, font: `data:image/png;base64,${(await renderKartuFont(p.fontJudul, p.fontIsi, m0.nama, p.warna)).toString('base64')}` });
        }
        const data = { palet: hasil, nama: m0.nama, handle: m0.handle, bio: c.s.st.paketProfil?.bio?.[0]?.teks || c.s.st.strategi?.janji || '', alasan: u.alasan, pilihan: g.brand?.sementara ? null : g.brand?.palet ?? null, sementara: !!g.brand?.sementara };
        pratinjauPaletCache.set(c.a.id, { kunci, data });
        return data;
    }
    async function buatKit(c: Ctx, jenis: 'profil' | 'highlight') {
        const g = gudang(c), b = g.brand; if (!b) throw new Error('Simpan brand kit dulu (warna & font).');
        const dir = folder(c, 'Brand');
        if (jenis === 'profil') {
            const logo = b.logoId ? g.item.find((x) => x.id === b.logoId) : tersedia(c).find((x) => x.jenis === 'logo');
            if (!logo) throw new Error('Pilih atau unggah logo dulu.');
            const png = await renderFotoProfil(baca(logo), b.warna[2] || '#ffffff');
            g.item.push({ id: gid(), jenis: 'profil', nama: 'Foto profil', ket: `Dari ${logo.nama}, aman untuk bingkai bulat`, path: tulis(dir, 'Foto profil.png', png), mime: 'image/png', sumber: 'kantor', at: Date.now(), label: 'ok' });
            simpan(c); return 1;
        }
        const nama = g.usulan?.highlight?.length ? g.usulan.highlight : ['Tips', 'Promo', 'Testi', 'FAQ', 'Info'];
        for (const [i, t] of nama.entries()) {
            const bg = i % 2 ? b.warna[1] || '#111111' : b.warna[0] || '#111111';
            const png = await renderCover(t, bg, b.warna[2] || '#ffffff', b.fontJudul);
            g.item.push({ id: gid(), jenis: 'highlight', nama: `Highlight ${t}`, ket: 'Cover sorotan story', path: tulis(dir, `Highlight ${t}.png`, png), mime: 'image/png', sumber: 'kantor', at: Date.now(), label: 'ok' });
        }
        simpan(c); return nama.length;
    }

    /* ── Kirim ke Claude ── */
    const asetKonten = (c: Ctx, k: Konten) => {
        const g = gudang(c), id = new Set<string>([...(k.pakaiAset || []), ...(k.slide || []).flatMap((s) => [s.aset || '', s.elemenId || '']).filter(Boolean), ...(k.saranAset || []).map((x) => x.status === 'dibuat' ? x.hasil || '' : x.status === 'pakai' ? x.pengganti || '' : '').filter(Boolean)]);
        const logo = g.brand?.logoId || tersedia(c).find((x) => x.jenis === 'logo')?.id; if (logo) id.add(logo);
        return tersedia(c).filter((x) => id.has(x.id));
    };
    const namaFile = (it: ItemGudang, i: number) => `${String(i + 1).padStart(2, '0')} ${namaAman(`${NAMA_JENIS[it.jenis] || it.jenis} - ${it.nama}`)}${path.extname(it.path) || '.png'}`;
    function teksClaude(c: Ctx, k: Konten) {
        const s = c.s, g = gudang(c), b = g.brand, aset = asetKonten(c, k), gy = gayaDesain(k.desain?.gaya || b?.gayaDesain);
        const plat = ({ instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook' } as Record<string, string>)[c.a.platform] || c.a.platform;
        const handle = (c.a.handle || s.st.profil.akun || '').replace(/^@/, '');
        const video = FORMAT_VIDEO(k.format);
        const ukur = c.a.platform === 'tiktok' || k.format === 'reel' || k.format === 'story' ? '1080×1920 (9:16)' : k.format === 'video' ? '1920×1080 (16:9)' : '1080×1350 (4:5)';
        const brand = b ? `BRAND: warna ${b.warna.join(', ')} · font judul ${b.fontJudul}, isi ${b.fontIsi}${b.logoId ? ' · logo terlampir' : ''}.` : '';
        const daftarAset = aset.length ? `ASET TERLAMPIR (zip "Paket aset") — WAJIB dipakai apa adanya, jangan digambar ulang:\n${aset.map((a, i) => `- ${namaFile(a, i)} → ${NAMA_JENIS[a.jenis] || a.jenis}: ${a.nama}${a.ket ? ` (${a.ket})` : ''}`).join('\n')}` : '';
        const kepala = `Halo Claude, tolong kerjakan konten ${plat} untuk akun "${s.st.paketProfil?.namaTampilan?.[0] || c.a.nama}"${handle ? ` (@${handle})` : ''}. Ukuran ${ukur}.`;
        if (video) {
            const isi = [kepala, `Pakai skill /video-edit.`, `JUDUL: ${k.judul}`, k.hook ? `HOOK: ${k.hook}` : '',
                k.promptEdit ? `ARAHAN EDIT:\n${k.promptEdit}` : '', k.promptVideo && !k.promptEdit ? `PROMPT VIDEO:\n${k.promptVideo}` : '',
                k.voiceover ? `VOICEOVER:\n${k.voiceover}` : '', k.subtitle?.length ? `SUBTITLE:\n${k.subtitle.join(' / ')}` : '',
                brand, daftarAset, 'Logo/maskot/produk dari aset terlampir dipakai untuk overlay, intro/outro, dan b-roll bila cocok.',
                'Hasil akhir: satu file MP4 siap unggah. Tunjukkan dulu potongan kasarnya kalau ada yang perlu saya putuskan.'];
            return isi.filter(Boolean).join('\n\n');
        }
        const isi = [kepala, `Buat ${k.format === 'carousel' ? `CAROUSEL ${k.slide?.length || 6} slide` : 'POSTINGAN 1 GAMBAR'} siap unggah (PNG per slide).`,
            `GAYA DESAIN: ${gy.nama} — ${gy.nuansa}. Font judul ${b?.fontJudul || gy.judul.f}, isi ${b?.fontIsi || gy.isi.f}. Warna ${b?.aksenMerek && b?.warna?.length ? `merek ${b.warna.join(', ')}` : Object.values(gy.w).join(', ')}.`,
            'Aturan: hook besar di slide 1, satu ide per slide, tata letak tiap slide bervariasi sesuai catatan [tata], kata bertanda **…** ditekankan, elemen tangan (lingkaran spidol, garis bawah coretan, stabilo, catatan tulisan tangan, polaroid+selotip, stiker) dipakai secukupnya sesuai catatan, teks terbaca di HP (judul besar, isi pendek), tepi aman ±90px, nomor/progres kecil di bawah, panah geser kecuali slide terakhir, slide terakhir ajakan simpan/ikuti. Tanpa gambar AI tambahan — pakai aset terlampir; edit seperlunya (hapus latar, potong, beri bayangan halus, sesuaikan warna).',
            `ISI SLIDE:\n${(k.slide || []).map((sl) => { const a = sl.aset ? aset.findIndex((x) => x.id === sl.aset) : -1; const tambah = [sl.tata && sl.tata !== 'klasik' ? `tata: ${sl.tata}` : '', sl.angka ? `angka besar: ${sl.angka}` : '', sl.poin?.length ? `poin: ${sl.poin.join(' / ')}` : '', sl.kiri ? `${sl.labelKiri || 'Salah'}: ${sl.kiri} | ${sl.labelKanan || 'Benar'}: ${sl.kanan}` : '', (k.hiasan || 'otomatis') !== 'tanpa' && sl.elemen?.length ? `elemen tangan: ${sl.elemen.map((e) => e.jenis + (e.teks ? ` "${e.teks}"` : '')).join(', ')}` : '', sl.elemenId ? `ilustrasi: ${aset.find((x) => x.id === sl.elemenId)?.nama || sl.gambarElemen}` : ''].filter(Boolean).join('; '); return `${sl.no}. ${sl.judul}${sl.isi ? ` — ${sl.isi}` : ''}${tambah ? ` [${tambah}]` : ''}${a >= 0 ? ` [pakai ${namaFile(aset[a], a)}]` : sl.visual ? ` (visual: ${sl.visual})` : ''}`; }).join('\n') || k.hook || k.judul}`,
            brand, daftarAset, 'Setelah jadi, tampilkan pratinjau semua slide, lalu berikan file PNG-nya.'];
        return isi.filter(Boolean).join('\n\n');
    }
    function paketClaude(c: Ctx, k: Konten) {
        const aset = asetKonten(c, k);
        const files = aset.map((a, i) => { try { return { nama: `Paket aset/${namaFile(a, i)}`, data: baca(a) }; } catch { return null; } }).filter(Boolean) as Array<{ nama: string; data: Buffer }>;
        files.unshift({ nama: 'Brief untuk Claude.txt', data: Buffer.from(teksClaude(c, k), 'utf8') });
        const dasar = d.folderAkun(c.a); try { berkas.buatFolder(dasar, 'Paket Claude'); } catch { /* ada */ }
        const rel = tulis(`${dasar}/Paket Claude`, `${namaAman(`${c.s.labelBerkas(k)} ${k.judul}`)}.zip`, buatZip(files));
        return { rel, n: files.length - 1 };
    }

    /* ── Pratinjau gaya (dengan nama, warna, & logo akun) ── */
    const pratinjauCache = new Map<string, { at: number; peta: Record<string, string> }>();
    async function pratinjau(c: Ctx): Promise<Record<string, string>> {
        const b = gudang(c).brand, kunci = `${c.a.id}:${JSON.stringify(b)}:${c.s.st.profil.topik}`;
        const ada = pratinjauCache.get(c.a.id); if (ada && (ada as any).kunci === kunci) return ada.peta;
        const contoh = contohSlide(c.s.st.strategi?.niche || c.s.st.profil.topik || c.a.nama), m = merek(c), peta: Record<string, string> = {};
        for (const g of GAYA_DESAIN) {
            const png = await renderSlide(g.id, contoh[0], 1, 3, m, { w: 1080, h: 1350 });
            peta[g.id] = `data:image/jpeg;base64,${(await kecilkan(png, 360)).toString('base64')}`;
        }
        pratinjauCache.set(c.a.id, { at: Date.now(), peta, kunci } as any);
        return peta;
    }

    /* ── Rute ── */
    const r = (fn: (req: Request) => any): RequestHandler => async (req, res) => { try { res.json({ ok: true, ...(await fn(req)) }); } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); } };
    const infoItem = (it: ItemGudang) => ({ id: it.id, jenis: it.jenis, nama: it.nama, ket: it.ket, sumber: it.sumber, at: it.at, label: it.label, calon: it.calon, galat: it.galat, path: it.path });
    app.get('/api/kantor/sosmed/gudang', requireToken, r((req) => {
        const c = d.ctxReq(req), g = gudang(c);
        return { item: g.item.filter((x) => fs.existsSync(path.join(berkas.root, ...x.path.split('/')))).map(infoItem), brand: g.brand, usulan: g.usulan, kerja: g.kerja.slice(-8).reverse(),
            jenis: JENIS_ASET.map((j) => ({ id: j, nama: NAMA_JENIS[j] })), gambarAi: gambarAi.status(), desain: desainSiap(),
            gaya: GAYA_DESAIN.map((x) => ({ id: x.id, nama: x.nama, nuansa: x.nuansa, cocok: x.cocok, gelap: x.gelap, judul: x.judul.f, isi: x.isi.f, warna: Object.values(x.w).slice(0, 4) })), font: DAFTAR_FONT,
            claude: d.claude ? { aktif: d.claude.boleh(), carouselHari: g.claudeHari.hari === hariWib() ? g.claudeHari.n : 0, batasHari: Math.max(0, Number(process.env.KANTOR_CAROUSEL_CLAUDE_HARI ?? 1)) } : null };
    }));
    app.get('/api/kantor/sosmed/gudang/thumb/:id', requireToken, async (req, res) => {
        try { const c = d.ctxReq(req), it = cariItem(c, String(req.params.id)); const b = await thumb(c, it); res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'private, max-age=86400'); res.end(b); }
        catch (e: any) { res.status(404).json({ ok: false, error: String(e?.message || e) }); }
    });
    app.post('/api/kantor/sosmed/gudang/folder', requireToken, r((req) => ({ folder: folder(d.ctxReq(req)) })));
    app.post('/api/kantor/sosmed/gudang/daftar', requireToken, r((req) => {
        const c = d.ctxReq(req), p = String(req.body?.path || '');
        if (!GAMBAR.test(p)) throw new Error('Gudang aset hanya untuk gambar (PNG, JPG, WEBP).');
        abs(p); // memastikan berkas ada & di dalam Berkas
        if (gudang(c).item.some((x) => x.path === p)) throw new Error('Aset ini sudah ada di gudang.');
        const jenis = JENIS_ASET.includes(req.body?.jenis) ? String(req.body.jenis) : 'lain';
        const it: ItemGudang = { id: gid(), jenis, nama: String(req.body?.nama || path.basename(p, path.extname(p))).slice(0, 80), ket: '', path: p, mime: mimeDari(p), sumber: 'unggah', at: Date.now(), label: 'menunggu', galat: req.body?.jenis ? 'jenis:pemilik' : undefined };
        gudang(c).item.push(it); simpan(c); labeli(c, it);
        return { item: infoItem(it) };
    }));
    app.post('/api/kantor/sosmed/gudang/buat', requireToken, r(async (req) => {
        const c = d.ctxReq(req), b = req.body || {};
        const prompt = String(b.prompt || '').trim(); if (prompt.length < 8) throw new Error('Tulis dulu gambar seperti apa yang mau dibuat.');
        const saran = b.saran?.konten ? { konten: String(b.saran.konten), id: String(b.saran.id) } : undefined;
        if (saran) { const k = c.s.cari(saran.konten), sr = k.saranAset?.find((x) => x.id === saran.id); if (!sr) throw new Error('Saran tidak ditemukan.'); }
        return buatGambar(c, { prompt: prompt.slice(0, 2000), jenis: JENIS_ASET.includes(b.jenis) ? b.jenis : 'lain', nama: String(b.nama || 'Aset baru').slice(0, 80), acuan: (Array.isArray(b.acuan) ? b.acuan : []).map(String).slice(0, 8), n: Math.max(1, Math.min(4, +b.n || 3)), tinggi: !!b.tinggi, rasio: String(b.rasio || '1:1'), transparan: !!b.transparan, saran });
    }));
    app.post('/api/kantor/sosmed/gudang/pilih', requireToken, r((req) => {
        const c = d.ctxReq(req), g = gudang(c), batch = String(req.body?.batch || ''), pilih = String(req.body?.id || '');
        const calon = g.item.filter((x) => x.calon === batch); if (!calon.length) throw new Error('Pilihan sudah tidak ada.');
        for (const x of calon) {
            if (x.id === pilih) { x.calon = undefined; continue; }
            try { berkas.hapus(x.path); } catch { /* sudah hilang */ }
        }
        g.item = g.item.filter((x) => x.calon !== batch);
        const dipilih = g.item.find((x) => x.id === pilih);
        // Kalau dari saran konten: tandai saran itu "dibuat" dan pakai asetnya di konten.
        const kerja = g.kerja.find((x) => x.batch === batch);
        if (dipilih && kerja?.konten) {
            try {
                const k = c.s.cari(kerja.konten);
                const sr = k.saranAset?.find((x) => x.status === 'saran' && x.nama === dipilih.nama) || k.saranAset?.find((x) => x.status === 'saran');
                if (sr) { sr.status = 'dibuat'; sr.hasil = dipilih.id; }
                k.pakaiAset = [...new Set([...(k.pakaiAset || []), dipilih.id])]; c.s.simpan();
            } catch { /* konten sudah dihapus */ }
        }
        if (dipilih?.jenis === 'logo' && g.brand && !g.brand.logoId) g.brand.logoId = dipilih.id;
        simpan(c); return { item: dipilih ? infoItem(dipilih) : null };
    }));
    app.post('/api/kantor/sosmed/gudang/:id/:aksi', requireToken, r(async (req) => {
        const c = d.ctxReq(req), it = cariItem(c, String(req.params.id)), aksi = String(req.params.aksi), b = req.body || {};
        if (aksi === 'ubah') {
            if (b.jenis && JENIS_ASET.includes(b.jenis)) { it.jenis = b.jenis; it.galat = 'jenis:pemilik'; }
            if (b.nama != null) it.nama = String(b.nama).trim().slice(0, 80) || it.nama;
            if (b.ket != null) it.ket = String(b.ket).trim().slice(0, 300);
            simpan(c); return { item: infoItem(it) };
        }
        if (aksi === 'hapus') {
            try { berkas.hapus(it.path); } catch { /* */ }
            const g = gudang(c); g.item = g.item.filter((x) => x.id !== it.id); if (g.brand?.logoId === it.id) g.brand.logoId = undefined; simpan(c);
            try { fs.rmSync(path.join(dirThumb(c.a.id), `${it.id}.jpg`), { force: true }); } catch { /* */ }
            return {};
        }
        if (aksi === 'label') { labeli(c, it); return {}; }
        if (aksi === 'tautan') return berkas.tautan(it.path, !!b.unduh);
        throw new Error('Aksi tidak dikenal.');
    }));
    app.post('/api/kantor/sosmed/gambar-ai/batas', requireToken, r((req) => req.body?.otomatis ? { batasOtomatis: gambarAi.aturBatasOtomatis(Number(req.body?.usd)) } : { batasHari: gambarAi.aturBatas(Number(req.body?.usd)) }));
    app.post('/api/kantor/sosmed/konten/:id/hiasan', requireToken, r((req) => {
        const c = d.ctxReq(req), k = c.s.cari(String(req.params.id)), m = String(req.body?.mode);
        if (!['otomatis', 'sedikit', 'tanpa'].includes(m)) throw new Error('Pilihan elemen tidak dikenal.');
        k.hiasan = m as Konten['hiasan']; c.s.simpan(); return { konten: k };
    }));
    app.post('/api/kantor/sosmed/brand', requireToken, r((req) => {
        const c = d.ctxReq(req), b = req.body || {}, g = gudang(c), lama = g.brand;
        const warna = (Array.isArray(b.warna) ? b.warna : lama?.warna || []).map(String).filter((v: string) => /^#[0-9a-f]{6}$/i.test(v)).slice(0, 6);
        g.brand = { warna, fontJudul: DAFTAR_FONT.includes(b.fontJudul) ? b.fontJudul : lama?.fontJudul || 'Outfit', fontIsi: DAFTAR_FONT.includes(b.fontIsi) ? b.fontIsi : lama?.fontIsi || 'Outfit',
            gayaDesain: GAYA_DESAIN.some((x) => x.id === b.gayaDesain) ? b.gayaDesain : lama?.gayaDesain || GAYA_DESAIN[0].id, aksenMerek: b.aksenMerek != null ? !!b.aksenMerek : !!lama?.aksenMerek,
            logoId: b.logoId !== undefined ? (g.item.some((x) => x.id === b.logoId && !x.calon) ? String(b.logoId) : undefined) : lama?.logoId, at: Date.now(),
            sementara: Array.isArray(b.warna) || b.fontJudul || b.fontIsi ? undefined : lama?.sementara, palet: Array.isArray(b.warna) ? undefined : lama?.palet };
        simpan(c); return { brand: g.brand };
    }));
    app.post('/api/kantor/sosmed/brand/usul', requireToken, r((req) => {
        const c = d.ctxReq(req); if (gudang(c).kerja.some((x) => x.jenis === 'brand' && x.status === 'jalan')) throw new Error('Maya masih menyusun brand kit.');
        void usulBrand(c, String(req.body?.arahan || '').slice(0, 800), { paletSaja: !!req.body?.paletSaja && !!gudang(c).usulan }); return { jalan: true };
    }));
    app.post('/api/kantor/sosmed/brand/pratinjau-palet', requireToken, r(async (req) => pratinjauPalet(d.ctxReq(req))));
    app.post('/api/kantor/sosmed/brand/pilih-palet', requireToken, r((req) => {
        const c = d.ctxReq(req), g = gudang(c), i = Number(req.body?.i), p = g.usulan?.palet?.[i]; if (!p) throw new Error('Pilihan palet tidak ditemukan.');
        g.brand = { warna: p.warna, fontJudul: p.fontJudul, fontIsi: p.fontIsi, gayaDesain: p.gayaDesain, aksenMerek: true, logoId: g.brand?.logoId, at: Date.now(), palet: i };
        pratinjauPaletCache.delete(c.a.id); simpan(c); return { brand: g.brand };
    }));
    app.post('/api/kantor/sosmed/brand/terapkan', requireToken, r((req) => {
        const c = d.ctxReq(req), g = gudang(c), u = g.usulan; if (!u) throw new Error('Belum ada usulan.');
        g.brand = { warna: u.warna, fontJudul: u.fontJudul, fontIsi: u.fontIsi, gayaDesain: u.gayaDesain, aksenMerek: true, logoId: g.brand?.logoId, at: Date.now() }; simpan(c); return { brand: g.brand };
    }));
    app.post('/api/kantor/sosmed/brand/kit', requireToken, r(async (req) => ({ n: await buatKit(d.ctxReq(req), req.body?.jenis === 'profil' ? 'profil' : 'highlight') })));
    app.post('/api/kantor/sosmed/desain/pratinjau', requireToken, r(async (req) => ({ gambar: await pratinjau(d.ctxReq(req)) })));
    app.post('/api/kantor/sosmed/konten/:id/desain', requireToken, r((req) => {
        const c = d.ctxReq(req), k = c.s.cari(String(req.params.id)), oleh = req.body?.oleh === 'claude' ? 'claude' : 'templat';
        if (c.s.sibuk) throw new Error('Tim sosmed masih mengerjakan permintaan lain untuk akun ini.');
        if (oleh === 'claude' && !d.claude?.boleh()) throw new Error('Otak Claude sedang tidak tersedia (jatah hari ini habis / belum login). Pakai desain templat dulu.');
        c.s.sibuk = 'desain';
        const x = kerjaBaru(c, { jenis: 'desain', judul: `Desain ${oleh === 'claude' ? 'oleh Claude' : 'templat'}: ${k.judul}`, konten: k.id });
        desainKonten(c, k, oleh, req.body?.gaya ? String(req.body.gaya) : undefined).then(() => kerjaSelesai(c, x)).catch((e) => { kerjaSelesai(c, x, String(e?.message || e)); k.galat = String(e?.message || e).slice(0, 200); c.s.simpan(); })
            .finally(() => { if (c.s.sibuk === 'desain') c.s.sibuk = ''; });
        return { sibuk: 'desain' };
    }));
    app.post('/api/kantor/sosmed/konten/:id/saran', requireToken, r((req) => {
        const c = d.ctxReq(req), k = c.s.cari(String(req.params.id)), sr = k.saranAset?.find((x) => x.id === String(req.body?.saran));
        if (!sr) throw new Error('Saran tidak ditemukan.');
        const aksi = String(req.body?.aksi);
        if (aksi === 'pakai') { if (!sr.pengganti) throw new Error('Tidak ada aset pengganti untuk saran ini.'); sr.status = 'pakai'; k.pakaiAset = [...new Set([...(k.pakaiAset || []), sr.pengganti])]; }
        else if (aksi === 'lewati') sr.status = 'lewati';
        else if (aksi === 'kembali') sr.status = 'saran';
        else throw new Error('Aksi tidak dikenal.');
        c.s.simpan(); return { konten: k };
    }));
    /** Pratinjau berkas gambar konten (slide hasil desain / unggahan) — tautan 10 menit. */
    app.get('/api/kantor/sosmed/konten/:id/pratinjau', requireToken, r((req) => {
        const c = d.ctxReq(req), k = c.s.cari(String(req.params.id));
        const daftar = [k.aset, ...(k.asetLain || [])].filter((a): a is NonNullable<typeof a> => !!a && GAMBAR.test(a.path || ''));
        return { gambar: daftar.map((a) => { try { return { url: berkas.tautan(a.path, false).url, nama: path.basename(a.path) }; } catch { return null; } }).filter(Boolean), at: k.desain?.at || k.diubah };
    }));
    app.get('/api/kantor/sosmed/konten/:id/claude', requireToken, r((req) => {
        const c = d.ctxReq(req), k = c.s.cari(String(req.params.id));
        return { teks: teksClaude(c, k), aset: asetKonten(c, k).map((a, i) => ({ id: a.id, nama: namaFile(a, i), jenis: a.jenis })) };
    }));
    app.post('/api/kantor/sosmed/konten/:id/paket', requireToken, r((req) => {
        const c = d.ctxReq(req), k = c.s.cari(String(req.params.id)); const p = paketClaude(c, k);
        return { ...berkas.tautan(p.rel, true), n: p.n, path: p.rel };
    }));

    return {
        /** Sambungkan gudang ke prompt tim (dipanggil saat akun dimuat). */
        sambung(c: Ctx) { c.s.gudangTeks = () => teksGudang(c); c.s.gudangId = () => tersedia(c).map((x) => x.id); },
        /** Setelah prompt produksi carousel/feed jadi: desain otomatis (Claude 1×/hari bila ada jatah, selain itu templat). */
        async desainOtomatis(c: Ctx, k: Konten) {
            if (FORMAT_VIDEO(k.format) || k.aset || process.env.KANTOR_DESAIN_OTOMATIS === '0' || !desainSiap().siap) return;
            const x = kerjaBaru(c, { jenis: 'desain', judul: `Desain otomatis: ${k.judul}`, konten: k.id });
            await desainKonten(c, k, 'otomatis').then(() => kerjaSelesai(c, x)).catch((e) => kerjaSelesai(c, x, String(e?.message || e)));
        },
        gambarAi,
        /** Untuk Studio Video lokal: aset konten (logo, maskot, foto, dll.) & brand akun. */
        asetKonten: (c: Ctx, k: Konten) => asetKonten(c, k).map((x) => ({ id: x.id, jenis: NAMA_JENIS[x.jenis] || x.jenis, nama: x.nama, ket: x.ket, path: x.path })),
        brand: (c: Ctx) => { const b = gudang(c).brand; return b ? { warna: b.warna, fontJudul: b.fontJudul, fontIsi: b.fontIsi } : null; },
        /** Langkah setup awal: brand kit (palet sementara dipasang otomatis). */
        brandSetup: (c: Ctx) => usulBrand(c, '', { lempar: true })
    };
}
