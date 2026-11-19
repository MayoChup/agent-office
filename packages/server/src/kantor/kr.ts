/**
 * Knowledge Reels: feed carousel teks (rasio 4:5) pengganti scroll reels — berita lokal & dunia, politik, finance & korporasi
 * (dengan dampak ke saham), edukasi saham, fun fact, intisari buku, tips & trik, dan brain games interaktif.
 * Dikerjakan gotong royong: Kirana (kurator) memimpin; Nina, Raka, Sari, Tara, Dodi, Lala, Dea, Sasa, Vino, Putri, Eca, Maya ikut menyumbang.
 * Tidak mengulang: sumber yang sudah dipakai dicatat, judul mirip ditolak, postingan "sudah baca" tidak muncul lagi di feed.
 */
import fs from 'fs';
import path from 'path';

export type Kat = 'lokal' | 'global' | 'politik' | 'bisnis' | 'saham' | 'funfact' | 'buku' | 'tips' | 'game';
export const TEMA: Record<Kat, { nama: string; ikon: string; ket: string; segmen: string }> = {
    lokal: { nama: 'Berita Indonesia', ikon: '🇮🇩', ket: 'Kabar penting dalam negeri, diringkas jadi poin.', segmen: 'berita' },
    global: { nama: 'Berita Dunia', ikon: '🌍', ket: 'Peristiwa dunia: iklim, konflik, teknologi, sains.', segmen: 'berita' },
    politik: { nama: 'Politik & Kebijakan', ikon: '🏛️', ket: 'Kebijakan & politik, lengkap dengan dampaknya ke saham.', segmen: 'berita' },
    bisnis: { nama: 'Finance & Korporasi', ikon: '💼', ket: 'Ekonomi, pasar, dan aksi perusahaan, plus kode saham terdampak.', segmen: 'berita' },
    saham: { nama: 'Edukasi Saham', ikon: '📈', ket: '"Tahukah kamu?" tentang saham di watchlist & konsep investasi.', segmen: 'saham' },
    funfact: { nama: 'Fun Fact', ikon: '💡', ket: 'Fakta unik yang berguna buat bahan obrolan.', segmen: 'funfact' },
    buku: { nama: 'Intisari Buku', ikon: '📚', ket: 'Poin penting dari buku-buku terkenal.', segmen: 'buku' },
    tips: { nama: 'Tips & Trik', ikon: '✨', ket: 'Cara berpakaian, ngobrol, produktif, keuangan pribadi, dan lainnya.', segmen: 'tips' },
    game: { nama: 'Brain Games', ikon: '🧠', ket: 'Latihan ingatan, hitungan, logika, dan imajinasi.', segmen: 'game' }
};
export const SEGMEN: Array<[string, string]> = [['semua', 'All'], ['berita', 'Berita'], ['saham', 'Saham'], ['funfact', 'Fun fact'], ['buku', 'Buku'], ['tips', 'Tips'], ['game', 'Brain games']];
export const TEMPLATE = ['kertas', 'bentuk', 'majalah', 'catatan', 'polaroid', 'gradasi', 'grid', 'stiker', 'koran', 'malam'] as const;
export const PALET = ['sage', 'persik', 'lavender', 'langit', 'mentega', 'tanah', 'mint', 'mawar', 'batu', 'laut'] as const;

export interface Sumber { judul: string; url?: string; penerbit?: string; tgl?: string }
export interface Dampak { kode: string; bursa: 'US' | 'IDX'; arah: 'naik' | 'turun' | 'campur'; alasan: string }
export interface Slide { judul?: string; poin?: string[]; teks?: string }
export type JenisGame = 'hitung' | 'ingat' | 'pola' | 'logika' | 'imajinasi' | 'kata';
export interface Game { jenis: JenisGame; soal: string; pilihan?: string[]; jawaban?: number; penjelasan?: string; urutan?: string[]; tampilDetik?: number; acak?: string }
export interface Post {
    id: string; kat: Kat; judul: string; sub?: string; slide: Slide[]; penutup?: string; sumber: Sumber[]; dampak?: Dampak[]; game?: Game;
    desain: { t: string; p: string }; oleh: Array<{ id: string; nama: string; peran: string }>; dibuat: number; tgl: string; kunci: string;
}
/** Komentar di postingan. dari = 'rico' (Pak Rico) atau id AI redaksi yang membalas; induk = komentar yang dibalas. */
export interface CatatanKr { id: string; postId: string; teks: string; at: number; berkas?: string; dari?: string; nama?: string; induk?: string; status?: 'menunggu' | 'gagal'; suka?: boolean }
export interface Folder { id: string; nama: string; post: string[]; dibuat: number }
interface St {
    post: Post[]; dilihat: Record<string, number>; baca: Record<string, number>; catatan: CatatanKr[]; folder: Folder[];
    jawab: Record<string, { benar: boolean | null; at: number; isi?: string }>; dipakai: string[]; rencana: { minggu: string; topik: Partial<Record<Kat, string[]>> } | null;
    sesi: Record<string, string>; log: Array<{ at: number; teks: string }>;
}
export interface ItemBerita { id: string; judul: string; ringkas: string; url: string; penerbit: string; tgl: string; cuplikan?: string }

const gid = () => Math.random().toString(36).slice(2, 10);
export const hariWib = (t = Date.now()) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
export function ambilJson(raw: string): any { const a = (raw || '').indexOf('{'), b = (raw || '').lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return JSON.parse(raw.slice(a, b + 1)); } catch { return null; } }
const teks = (x: any, n: number) => String(x ?? '').replace(/\r/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const normal = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Kemiripan judul (Jaccard kata ≥4 huruf). */
export function mirip(a: string, b: string) {
    const ka = new Set(normal(a).split(' ').filter((w) => w.length >= 4)), kb = new Set(normal(b).split(' ').filter((w) => w.length >= 4));
    if (!ka.size || !kb.size) return 0; let sama = 0; for (const w of ka) if (kb.has(w)) sama++;
    return sama / Math.min(ka.size, kb.size);
}

/* ── Sumber berita (RSS). Media langsung dulu (ada ringkasan & tautan asli), Google News sebagai cadangan. ── */
const GN = (q: string, id = true) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:1d&hl=${id ? 'id&gl=ID&ceid=ID:id' : 'en-US&gl=US&ceid=US:en'}`;
export const RSS: Record<'lokal' | 'global' | 'politik' | 'bisnis', string[]> = {
    lokal: ['https://www.antaranews.com/rss/terkini.xml', 'https://www.cnnindonesia.com/nasional/rss', 'https://rss.tempo.co/nasional', 'https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id'],
    global: ['https://feeds.bbci.co.uk/news/world/rss.xml', 'https://www.aljazeera.com/xml/rss/all.xml', 'https://www.theguardian.com/world/rss', 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en'],
    politik: ['https://www.antaranews.com/rss/politik.xml', 'https://rss.tempo.co/politik', GN('kebijakan pemerintah OR DPR OR presiden OR menteri')],
    bisnis: ['https://www.cnbcindonesia.com/market/rss', 'https://www.antaranews.com/rss/ekonomi.xml', 'https://feeds.bbci.co.uk/news/business/rss.xml', GN('ekonomi OR saham OR rupiah OR korporasi OR emiten'), GN('earnings OR merger OR acquisition OR "Federal Reserve"', false)]
};
const UA = 'Mozilla/5.0 (KantorVirtual; +knowledge-reels)';
const bersih = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
export function parseRss(xml: string, sumberUrl: string): Omit<ItemBerita, 'id'>[] {
    const out: Omit<ItemBerita, 'id'>[] = [];
    const host = (() => { try { return new URL(sumberUrl).hostname.replace(/^www\.|^feeds\.|^rss\./, ''); } catch { return ''; } })();
    for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
        const it = m[1], g = (tag: string) => bersih(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(it)?.[1] || '');
        let judul = g('title'); const penerbit = g('source') || host;
        if (penerbit && judul.endsWith(` - ${penerbit}`)) judul = judul.slice(0, -(penerbit.length + 3));
        const url = g('link') || (/<link[^>]*href="([^"]+)"/.exec(it)?.[1] || '');
        const t = Date.parse(g('pubDate') || g('dc:date') || g('published'));
        if (!judul || judul.length < 20 || !/^https?:\/\//.test(url)) continue;
        out.push({ judul: judul.slice(0, 220), ringkas: g('description').slice(0, 500), url, penerbit: penerbit.slice(0, 60), tgl: Number.isFinite(t) ? new Date(t).toISOString() : '' });
    }
    return out;
}
async function ambil(url: string, ms = 15_000) { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }
/** Ambil kandidat berita satu kategori: segar (≤36 jam), belum pernah dipakai, tidak kembar. */
export async function ambilBerita(kat: keyof typeof RSS, dipakai: Set<string>, maks = 14): Promise<ItemBerita[]> {
    const semua: Omit<ItemBerita, 'id'>[] = [];
    for (const u of RSS[kat]) {
        try { semua.push(...parseRss(await ambil(u), u)); } catch (e: any) { console.warn(`[KR] RSS ${kat} ${u.slice(0, 60)}: ${e?.message || e}`); }
        if (semua.length >= maks * 3) break;
    }
    const out: ItemBerita[] = [];
    for (const it of semua.sort((a, b) => (b.tgl || '').localeCompare(a.tgl || ''))) {
        if (it.tgl && Date.now() - Date.parse(it.tgl) > 36 * 3600_000) continue;
        if (dipakai.has(it.url) || dipakai.has(normal(it.judul).slice(0, 80))) continue;
        if (out.some((o) => mirip(o.judul, it.judul) >= 0.6)) continue;
        out.push({ ...it, id: `S${out.length + 1}` });
        if (out.length >= maks) break;
    }
    return out;
}
/** Cuplikan isi artikel (meta deskripsi + beberapa paragraf awal) supaya AI tidak hanya membaca judul. */
export async function cuplikan(it: ItemBerita) {
    if (/news\.google\.com/.test(it.url)) return;
    try {
        const html = (await ambil(it.url, 12_000)).slice(0, 400_000);
        const meta = /<meta[^>]+(?:property|name)="(?:og:description|description)"[^>]+content="([^"]+)"/i.exec(html)?.[1] || '';
        const par = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => bersih(m[1])).filter((p) => p.length > 60).slice(0, 5).join(' ');
        it.cuplikan = bersih(`${meta} ${par}`).slice(0, 1400);
    } catch { /* cukup judul & ringkasan */ }
}

/* ── Brain games buatan lokal (tanpa AI, tak terbatas) ── */
const acakDari = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const KATA = ['MELATI', 'JENDELA', 'PELANGI', 'SEPATU', 'KOMPAS', 'GITAR', 'BINTANG', 'KELAPA', 'PERAHU', 'SELIMUT', 'KERETA', 'MERPATI', 'TELESKOP', 'JERAPAH', 'NANAS', 'PAYUNG', 'KAMERA', 'HARIMAU', 'CERMIN', 'DURIAN'];
function acakPilihan(benar: number, salah: number[]): { pilihan: string[]; jawaban: number } {
    const set = [...new Set([benar, ...salah])].slice(0, 4); while (set.length < 4) set.push(benar + set.length * 3 + 1);
    const p = set.sort(() => Math.random() - 0.5); return { pilihan: p.map(String), jawaban: p.indexOf(benar) };
}
export function gameLokal(jenis: JenisGame): { judul: string; game: Game } {
    if (jenis === 'hitung') {
        const a = 12 + Math.floor(Math.random() * 60), b = 6 + Math.floor(Math.random() * 30), c = 2 + Math.floor(Math.random() * 8);
        const benar = a + b * c, { pilihan, jawaban } = acakPilihan(benar, [(a + b) * c, benar + c, benar - b]);
        return { judul: 'Hitung cepat tanpa kalkulator', game: { jenis, soal: `${a} + ${b} × ${c} = ?`, pilihan, jawaban, penjelasan: `Perkalian dulu: ${b} × ${c} = ${b * c}, lalu ${a} + ${b * c} = ${benar}.` } };
    }
    if (jenis === 'pola') {
        const tipe = Math.floor(Math.random() * 3), a = 2 + Math.floor(Math.random() * 6), d = 2 + Math.floor(Math.random() * 5);
        const der = tipe === 0 ? Array.from({ length: 5 }, (_, i) => a + i * d) : tipe === 1 ? Array.from({ length: 5 }, (_, i) => a * 2 ** i) : Array.from({ length: 5 }, (_, i) => a + (i * (i + 1) / 2) * d);
        const benar = tipe === 0 ? a + 5 * d : tipe === 1 ? a * 32 : a + 15 * d;
        const { pilihan, jawaban } = acakPilihan(benar, [benar + d, benar - d, der[4] * 2]);
        return { judul: 'Tebak angka berikutnya', game: { jenis, soal: `${der.join(', ')}, …?`, pilihan, jawaban, penjelasan: tipe === 0 ? `Selalu bertambah ${d}.` : tipe === 1 ? 'Tiap angka dikali 2.' : `Selisihnya bertambah ${d} tiap langkah (${d}, ${2 * d}, ${3 * d}, …).` } };
    }
    if (jenis === 'ingat') {
        const simbol = ['🍎', '🚲', '🌙', '🎈', '🐢', '⚽', '🔑', '🌵', '🎧', '🍩', '🚀', '🦋'].sort(() => Math.random() - 0.5);
        const n = 5 + Math.floor(Math.random() * 2);
        return { judul: 'Uji ingatan: hafalkan urutannya', game: { jenis, soal: 'Hafalkan urutan simbol ini, lalu ketuk sesuai urutan.', urutan: simbol.slice(0, n), tampilDetik: 4, acak: simbol.slice(0, n + 3).sort(() => Math.random() - 0.5).join(''), penjelasan: 'Trik: buat cerita singkat yang menghubungkan tiap simbol (metode asosiasi).' } };
    }
    const kata = acakDari(KATA), huruf = kata.split('').sort(() => Math.random() - 0.5).join(' ');
    const salah = KATA.filter((k) => k !== kata && k.length === kata.length).slice(0, 3);
    const opsi = [kata, ...(salah.length >= 3 ? salah : KATA.filter((k) => k !== kata).slice(0, 3))].sort(() => Math.random() - 0.5);
    return { judul: 'Susun ulang hurufnya', game: { jenis: 'kata', soal: `Huruf acak: ${huruf}`, pilihan: opsi, jawaban: opsi.indexOf(kata), penjelasan: `Jawabannya ${kata}.` } };
}

export class KnowledgeReels {
    private file: string;
    st: St = { post: [], dilihat: {}, baca: {}, catatan: [], folder: [], jawab: {}, dipakai: [], rencana: null, sesi: {}, log: [] };
    sibuk = '';
    constructor(dataDir: string) {
        this.file = path.join(dataDir, 'knowledge-reels.json');
        try { this.st = { ...this.st, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { /* baru */ }
        if (!this.st.folder.length) this.st.folder = [{ id: 'umum', nama: 'Tersimpan', post: [], dibuat: Date.now() }];
    }
    simpan() {
        // Rapikan: postingan > 120 hari dihapus kecuali disimpan / dicatat. Jejak sumber dipakai dibatasi.
        const jaga = new Set([...this.st.folder.flatMap((f) => f.post), ...this.st.catatan.map((c) => c.postId)]);
        const batas = Date.now() - 120 * 86400_000;
        this.st.post = this.st.post.filter((p) => p.dibuat >= batas || jaga.has(p.id)).slice(-2500);
        this.st.dipakai = this.st.dipakai.slice(-6000); this.st.log = this.st.log.slice(-200);
        fs.writeFileSync(this.file, JSON.stringify(this.st));
    }
    catatLog(t: string) { this.st.log.push({ at: Date.now(), teks: t.slice(0, 300) }); }
    judulLama(kat: Kat, n = 60) { return this.st.post.filter((p) => p.kat === kat).slice(-n).map((p) => p.judul); }
    sudahAda(kat: Kat, judul: string) { return this.st.post.some((p) => (p.kat === kat || TEMA[p.kat].segmen === TEMA[kat].segmen) && mirip(p.judul, judul) >= 0.7); }

    /** Desain bawaan berputar supaya beda-beda (Putri boleh menimpa). */
    private desainBerikut(i: number) { const n = this.st.post.length + i; return { t: TEMPLATE[(n * 7) % TEMPLATE.length], p: PALET[(n * 3 + Math.floor(n / TEMPLATE.length)) % PALET.length] }; }
    /** Ubah keluaran AI → postingan valid. Sumber hanya dari daftar yang diberikan (id) atau yang memang ada di jawaban & berbentuk tautan nyata. */
    terima(kat: Kat, raw: string, oleh: Post['oleh'], sumberBoleh: ItemBerita[] = [], sumberTetap?: (x: any) => Sumber[], kodeUS?: Set<string>): Post[] {
        const j = ambilJson(raw); const arr = Array.isArray(j?.post) ? j.post : [];
        const out: Post[] = [];
        for (const x of arr.slice(0, 8)) {
            const judul = teks(x?.judul, 90); if (!judul || this.sudahAda(kat, judul) || out.some((o) => mirip(o.judul, judul) >= 0.7)) continue;
            const slide: Slide[] = (Array.isArray(x?.slide) ? x.slide : []).slice(0, 6).map((s: any) => ({ judul: teks(s?.judul, 70) || undefined, poin: (Array.isArray(s?.poin) ? s.poin : []).slice(0, 4).map((p: any) => teks(p, 160)).filter(Boolean), teks: teks(s?.teks, 260) || undefined }))
                .filter((s: Slide) => s.poin?.length || s.teks);
            if (slide.length < 2) continue;
            let sumber: Sumber[] = [];
            if (sumberBoleh.length) {
                const ids: string[] = (Array.isArray(x?.sumber) ? x.sumber : []).map((s: any) => String(typeof s === 'object' ? s?.id : s));
                sumber = sumberBoleh.filter((it) => ids.includes(it.id)).slice(0, 4).map((it) => ({ judul: it.judul, url: it.url, penerbit: it.penerbit, tgl: it.tgl }));
                if (!sumber.length) continue; // berita wajib bersumber nyata
            } else if (sumberTetap) sumber = sumberTetap(x);
            const dampak: Dampak[] = (Array.isArray(x?.dampak) ? x.dampak : []).slice(0, 6).map((d: any) => {
                const kode = String(d?.kode || '').toUpperCase().replace(/[^A-Z.]/g, '').slice(0, 6); const bursa: Dampak['bursa'] = String(d?.bursa || '').toUpperCase() === 'IDX' ? 'IDX' : 'US';
                return { kode, bursa, arah: (['naik', 'turun', 'campur'].includes(d?.arah) ? d.arah : 'campur') as Dampak['arah'], alasan: teks(d?.alasan, 160) };
            }).filter((d: Dampak) => d.kode && d.alasan && (d.bursa === 'IDX' ? /^[A-Z]{4}$/.test(d.kode) : !kodeUS || kodeUS.has(d.kode)));
            out.push({ id: gid(), kat, judul, sub: teks(x?.sub, 120) || undefined, slide, penutup: teks(x?.penutup, 220) || undefined, sumber, dampak: dampak.length ? dampak : undefined,
                desain: this.desainBerikut(out.length), oleh, dibuat: Date.now(), tgl: hariWib(), kunci: normal(judul).slice(0, 80) });
        }
        return out;
    }
    terimaGame(raw: string, oleh: Post['oleh'], jenis: 'logika' | 'imajinasi'): Post[] {
        const j = ambilJson(raw); const arr = Array.isArray(j?.game) ? j.game : [];
        const out: Post[] = [];
        for (const g of arr.slice(0, 4)) {
            const judul = teks(g?.judul, 80), soal = teks(g?.soal, 600); if (!judul || !soal || this.sudahAda('game', judul)) continue;
            const pilihan = (Array.isArray(g?.pilihan) ? g.pilihan : []).slice(0, 4).map((p: any) => teks(p, 120)).filter(Boolean);
            const jawaban = Math.round(+g?.jawaban);
            if (jenis === 'logika' && (pilihan.length < 2 || !(jawaban >= 0 && jawaban < pilihan.length))) continue;
            out.push(this.postGame(judul, { jenis, soal, pilihan: jenis === 'logika' ? pilihan : undefined, jawaban: jenis === 'logika' ? jawaban : undefined, penjelasan: teks(g?.penjelasan, 400) }, oleh, out.length));
        }
        return out;
    }
    postGame(judul: string, game: Game, oleh: Post['oleh'], i = 0): Post {
        return { id: gid(), kat: 'game', judul, slide: [{ judul, teks: game.soal }], sumber: [], game, desain: this.desainBerikut(i), oleh, dibuat: Date.now(), tgl: hariWib(), kunci: normal(judul + game.soal).slice(0, 80) };
    }
    tambah(posts: Post[], sumberDipakai: string[] = []) {
        this.st.post.push(...posts);
        for (const p of posts) for (const s of p.sumber) if (s.url) this.st.dipakai.push(s.url);
        this.st.dipakai.push(...sumberDipakai, ...posts.map((p) => p.kunci));
        this.simpan();
    }

    /** Feed: yang sudah ditandai "sudah baca" tidak pernah muncul; yang belum pernah terlihat didahulukan; kategori diselang-seling. */
    feed(segmen = 'semua', batas = 30, lewati: string[] = []) {
        const cocok = (p: Post) => segmen === 'semua' || TEMA[p.kat].segmen === segmen || p.kat === segmen;
        const calon = this.st.post.filter((p) => cocok(p) && !this.st.baca[p.id] && !lewati.includes(p.id) && !(p.kat === 'game' && this.st.jawab[p.id]));
        const baru = calon.filter((p) => !this.st.dilihat[p.id]).sort((a, b) => b.dibuat - a.dibuat);
        const lamaUrut = calon.filter((p) => this.st.dilihat[p.id]).sort((a, b) => this.st.dilihat[a.id] - this.st.dilihat[b.id]);
        // Selang-seling kategori untuk "All": ambil bergiliran dari tiap kategori.
        const selang = (arr: Post[]) => {
            if (segmen !== 'semua') return arr;
            const per = new Map<Kat, Post[]>(); for (const p of arr) per.set(p.kat, [...(per.get(p.kat) || []), p]);
            const urutKat: Kat[] = ['lokal', 'funfact', 'bisnis', 'game', 'global', 'tips', 'saham', 'politik', 'buku'];
            const out: Post[] = []; let ada = true;
            while (ada) { ada = false; for (const k of urutKat) { const q = per.get(k); if (q?.length) { out.push(q.shift()!); ada = true; } } }
            return out;
        };
        const hasil = [...selang(baru), ...selang(lamaUrut)].slice(0, batas);
        return { post: hasil, sisaBaru: Math.max(0, baru.length - hasil.filter((p) => !this.st.dilihat[p.id]).length), totalBaru: baru.length };
    }
    tema(kat: Kat) { return this.st.post.filter((p) => p.kat === kat).sort((a, b) => b.dibuat - a.dibuat); }
    cari(id: string) { const p = this.st.post.find((x) => x.id === id); if (!p) throw new Error('Postingan tidak ditemukan.'); return p; }
    tandaiDilihat(ids: string[]) { const t = Date.now(); for (const id of ids.slice(0, 50)) if (this.st.post.some((p) => p.id === id) && !this.st.dilihat[id]) this.st.dilihat[id] = t; this.simpan(); }
    setBaca(id: string, ya: boolean) { this.cari(id); if (ya) this.st.baca[id] = Date.now(); else delete this.st.baca[id]; this.simpan(); }
    jawabGame(id: string, pilihan: number | null, isi?: string) {
        const p = this.cari(id); if (!p.game) throw new Error('Bukan brain game.');
        const benar = p.game.urutan ? (isi || '') === p.game.urutan.join(',') : p.game.jawaban == null ? null : pilihan === p.game.jawaban;
        this.st.jawab[id] = { benar, at: Date.now(), isi: isi?.slice(0, 1000) }; this.simpan();
        return { benar, jawaban: p.game.jawaban, penjelasan: p.game.penjelasan };
    }
    skorGame() { const v = Object.values(this.st.jawab).filter((x) => x.benar !== null); return { main: v.length, benar: v.filter((x) => x.benar).length }; }
    tambahCatatan(postId: string, isi: string, opsi: { dari?: string; nama?: string; induk?: string; status?: CatatanKr['status'] } = {}) {
        this.cari(postId);
        const induk = opsi.induk && this.st.catatan.some((x) => x.id === opsi.induk && x.postId === postId) ? opsi.induk : undefined;
        const c: CatatanKr = { id: gid(), postId, teks: isi.trim().slice(0, 4000), at: Date.now(), dari: opsi.dari || 'rico', nama: opsi.nama, induk, status: opsi.status };
        if (!c.teks && !c.status) throw new Error('Komentar kosong.'); this.st.catatan.push(c); this.simpan(); return c;
    }
    ubahCatatan(id: string, teks: string, status?: CatatanKr['status']) { const c = this.st.catatan.find((x) => x.id === id); if (!c) return; c.teks = teks.trim().slice(0, 4000); c.status = status; c.at = Date.now(); this.simpan(); return c; }
    /** Hati (suka) di komentar, seperti Instagram. Komentar AI yang disukai jadi sinyal selera untuk redaksi. */
    sukaCatatan(id: string, ya: boolean) { const c = this.st.catatan.find((x) => x.id === id); if (!c) throw new Error('Komentar tidak ditemukan.'); c.suka = ya || undefined; this.simpan(); return c; }
    /** Hapus komentar beserta balasan-balasannya. */
    hapusCatatan(id: string) {
        const c = this.st.catatan.find((x) => x.id === id); if (!c) return;
        const buang = new Set([id]); let tambah = true;
        while (tambah) { tambah = false; for (const x of this.st.catatan) if (x.induk && buang.has(x.induk) && !buang.has(x.id)) { buang.add(x.id); tambah = true; } }
        this.st.catatan = this.st.catatan.filter((x) => !buang.has(x.id)); this.simpan(); return c;
    }
    buatFolder(nama: string) { const n = nama.trim().slice(0, 40); if (!n) throw new Error('Nama folder kosong.'); if (this.st.folder.length >= 50) throw new Error('Maksimal 50 folder.'); const f: Folder = { id: gid(), nama: n, post: [], dibuat: Date.now() }; this.st.folder.push(f); this.simpan(); return f; }
    ubahFolder(id: string, nama: string) { const f = this.st.folder.find((x) => x.id === id); if (!f) throw new Error('Folder tidak ditemukan.'); f.nama = nama.trim().slice(0, 40) || f.nama; this.simpan(); return f; }
    hapusFolder(id: string) { if (id === 'umum') throw new Error('Folder utama tidak bisa dihapus.'); this.st.folder = this.st.folder.filter((x) => x.id !== id); this.simpan(); }
    simpanKe(postId: string, folderId: string, ya: boolean) {
        this.cari(postId); const f = this.st.folder.find((x) => x.id === folderId); if (!f) throw new Error('Folder tidak ditemukan.');
        f.post = ya ? [postId, ...f.post.filter((x) => x !== postId)] : f.post.filter((x) => x !== postId); this.simpan(); return f;
    }
    folderDari(postId: string) { return this.st.folder.filter((f) => f.post.includes(postId)).map((f) => f.id); }
    /** Ringkasan untuk tampilan: jumlah per tema, folder, catatan per post. */
    ringkas() {
        const per: Record<string, { total: number; baru: number }> = {};
        for (const k of Object.keys(TEMA)) per[k] = { total: 0, baru: 0 };
        for (const p of this.st.post) { per[p.kat].total++; if (!this.st.baca[p.id] && !this.st.dilihat[p.id]) per[p.kat].baru++; }
        const hari = hariWib();
        return { per, folder: this.st.folder.map((f) => ({ id: f.id, nama: f.nama, n: f.post.length, sampul: f.post[0] || null })), hariIni: this.st.post.filter((p) => p.tgl === hari).length, dibaca: Object.keys(this.st.baca).length, skor: this.skorGame() };
    }
    /** Tempelkan info pengguna (sudah baca, folder, catatan, jawaban) ke postingan untuk dikirim ke tampilan. */
    hias(p: Post) { return { ...p, baca: !!this.st.baca[p.id], folder: this.folderDari(p.id), catatan: this.st.catatan.filter((c) => c.postId === p.id), jawab: this.st.jawab[p.id] || null, game: p.game ? { ...p.game, jawaban: this.st.jawab[p.id] ? p.game.jawaban : undefined, penjelasan: this.st.jawab[p.id] ? p.game.penjelasan : undefined } : undefined }; }
}
