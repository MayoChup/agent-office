/**
 * Skor fundamental RELATIF: valuasi & kualitas dibanding median saham sejenis (industri; cadangan sektor bila < 8 saham),
 * ditambah aturan tetap untuk hal yang jelek di industri mana pun (rugi, margin negatif, pendapatan turun) dan pengaman
 * gelembung (PER > 80×, PBV > 30×, DER > 5× tetap dikurangi).
 *
 * Skor ini baru dipakai di aplikasi kalau uji mundur membuktikan lebih baik dari skor lama (berkas fund-relatif.json).
 */
import fs from 'fs';
import path from 'path';
import { skorFundamental, label, type Faktor } from './skor';

export interface RasioR { per: number | null; pbv: number | null; roe: number | null; der: number | null; npm: number | null; revGrowth: number | null }
export interface Median { per: number | null; pbv: number | null; roe: number | null; npm: number | null; der: number | null; n: number; kelompok: string }
export interface Kelompok { i: string; s: string }

const MIN_INDUSTRI = 8;
const tengah = (xs: number[]) => { if (xs.length < 3) return null; const a = [...xs].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
const ok = (x: number | null | undefined): x is number => typeof x === 'number' && Number.isFinite(x);

/** Median rasio per industri & sektor dari sekumpulan saham. PER/PBV hanya dari yang positif (perusahaan rugi tidak punya PER bermakna). */
export function petaMedian(rows: Array<{ s: string; f: RasioR | null; k?: Kelompok }>) {
    const grup = new Map<string, RasioR[]>();
    for (const r of rows) {
        if (!r.f || !r.k) continue;
        for (const kunci of [`i:${r.k.i}`, `s:${r.k.s}`]) if (kunci.length > 2) grup.set(kunci, [...(grup.get(kunci) || []), r.f]);
    }
    const hasil = new Map<string, Median>();
    for (const [kunci, fs2] of grup) {
        hasil.set(kunci, {
            per: tengah(fs2.map((f) => f.per).filter((x): x is number => ok(x) && x > 0)),
            pbv: tengah(fs2.map((f) => f.pbv).filter((x): x is number => ok(x) && x > 0)),
            roe: tengah(fs2.map((f) => f.roe).filter(ok)), npm: tengah(fs2.map((f) => f.npm).filter(ok)),
            der: tengah(fs2.map((f) => f.der).filter((x): x is number => ok(x) && x >= 0)),
            n: fs2.length, kelompok: kunci.startsWith('i:') ? `industri ${kunci.slice(2)}` : `sektor ${kunci.slice(2)}`
        });
    }
    return (k?: Kelompok): Median | null => {
        if (!k) return null;
        const i = hasil.get(`i:${k.i}`); if (i && i.n >= MIN_INDUSTRI) return i;
        const s = hasil.get(`s:${k.s}`); return s && s.n >= MIN_INDUSTRI ? s : null;
    };
}

const fmt = (x: number, d = 1) => x.toLocaleString('id-ID', { maximumFractionDigits: d });
/** Skor fundamental relatif. Tanpa median (pembanding < 8 saham) → kembali ke skor lama. */
export function skorFundamentalRelatif(b: { f: RasioR | null; sektor?: string }, m: Median | null): Faktor | null {
    const f = b.f; if (!f) return null;
    if (!m) return skorFundamental(b);
    const a: string[] = []; let x = 0;
    const add = (v: number, why: string) => { x += v; a.push(`${v > 0 ? '+' : '−'} ${why}`); };
    const bank = /keuangan|financ/i.test(b.sektor || m.kelompok);
    const vs = (nama: string, v: number, med: number, sat: string) => `${nama} ${fmt(v)}${sat} (median ${m.kelompok}: ${fmt(med)}${sat})`;
    // Hal yang jelek di industri mana pun
    if (ok(f.roe) && f.roe < 0) add(-0.3, 'rugi (ROE negatif)');
    if (ok(f.npm) && f.npm < 0) add(-0.2, 'margin laba negatif');
    if (ok(f.revGrowth)) { if (f.revGrowth >= 15) add(0.2, `pendapatan tumbuh ${fmt(f.revGrowth)}%`); else if (f.revGrowth < 0) add(-0.15, `pendapatan turun ${fmt(Math.abs(f.revGrowth))}%`); }
    // ROE dibanding industri
    if (ok(f.roe) && f.roe > 0 && ok(m.roe) && m.roe > 0) { if (f.roe >= m.roe * 1.5) add(0.3, `${vs('ROE', f.roe, m.roe, '%')} jauh di atas rata-rata`); else if (f.roe > m.roe) add(0.12, `${vs('ROE', f.roe, m.roe, '%')} di atas rata-rata`); }
    // PER
    if (ok(f.per) && f.per > 0) {
        if (f.per > 80) add(-0.15, `PER ${fmt(f.per)}× sangat mahal (di atas 80×)`);
        else if (ok(m.per)) { if (f.per <= m.per * 0.7) add(0.2, `${vs('PER', f.per, m.per, '×')} lebih murah dari industrinya`); else if (f.per >= m.per * 1.5) add(-0.15, `${vs('PER', f.per, m.per, '×')} lebih mahal dari industrinya`); }
    } else if (ok(f.roe) && f.roe < 0) add(-0.1, 'tidak ada PER (rugi)');
    // PBV (tinggi dimaafkan kalau ROE juga lebih tinggi dari median / di atas 30%)
    if (ok(f.pbv) && f.pbv > 0) {
        const roeTinggi = (ok(f.roe) && f.roe >= 30) || (ok(f.roe) && ok(m.roe) && f.roe > m.roe);
        if (f.pbv > 30 && !(ok(f.roe) && f.roe >= 30)) add(-0.12, `PBV ${fmt(f.pbv)}× sangat tinggi (di atas 30×)`);
        else if (ok(m.pbv)) { if (f.pbv <= m.pbv * 0.7) add(0.15, `${vs('PBV', f.pbv, m.pbv, '×')} lebih murah dari industrinya`); else if (f.pbv >= m.pbv * 2 && !roeTinggi) add(-0.12, `${vs('PBV', f.pbv, m.pbv, '×')} mahal tanpa ROE yang lebih tinggi`); }
    }
    // Margin
    if (ok(f.npm) && f.npm >= 0 && ok(m.npm) && m.npm > 0) { if (f.npm >= m.npm * 1.5) add(0.15, `${vs('margin laba', f.npm, m.npm, '%')} di atas rata-rata`); else if (f.npm <= m.npm * 0.5) add(-0.1, `${vs('margin laba', f.npm, m.npm, '%')} tipis dibanding industrinya`); }
    // Utang (tidak untuk bank)
    if (ok(f.der) && !bank) {
        if (f.der > 5) add(-0.15, `utang sangat besar (DER ${fmt(f.der, 2)}×)`);
        else if (ok(m.der) && m.der > 0) { if (f.der <= m.der * 0.5) add(0.12, `${vs('DER', f.der, m.der, '×')} utang lebih ringan dari industrinya`); else if (f.der >= m.der * 2) add(-0.15, `${vs('DER', f.der, m.der, '×')} utang lebih berat dari industrinya`); }
    }
    if (!a.length) a.push(`rasio sejalan dengan median ${m.kelompok}`);
    const sk = Math.max(-1, Math.min(1, x));
    return { skor: +sk.toFixed(2), label: label(sk), alasan: a };
}

/* ── Pembanding di uji mundur ── */
export interface SampelF { ym: string; s: string; H: number; f: RasioR; ex: number }
interface Hasil { n: number; beli: number | null; beliKuat: number | null; jual: number | null; semua: number | null; selisihKuintil: number | null; nBeli: number; nJual: number }
const rata = (xs: number[]) => (xs.length ? (xs.reduce((p, q) => p + q, 0) / xs.length) * 100 : null);
function nilai(skor: number[], ex: number[], ym: string[]): Hasil {
    const ix = skor.map((_, i) => i);
    const beli = ix.filter((i) => skor[i] >= 0.15), bk = ix.filter((i) => skor[i] >= 0.45), jual = ix.filter((i) => skor[i] <= -0.15);
    // Selisih kuintil per bulan: rata-rata hasil 20% skor teratas − 20% terbawah, lalu dirata-rata antar bulan.
    const perBulan = new Map<string, number[]>(); ix.forEach((i) => perBulan.set(ym[i], [...(perBulan.get(ym[i]) || []), i]));
    const sel: number[] = [];
    for (const xs of perBulan.values()) {
        if (xs.length < 25) continue;
        const u = [...xs].sort((p, q) => skor[q] - skor[p]); const k = Math.floor(u.length / 5);
        const atas = u.slice(0, k).map((i) => ex[i]), bawah = u.slice(-k).map((i) => ex[i]);
        sel.push((atas.reduce((p, q) => p + q, 0) / k - bawah.reduce((p, q) => p + q, 0) / k) * 100);
    }
    const f3 = (v: number | null) => (v == null ? null : +v.toFixed(3));
    return { n: skor.length, semua: f3(rata(ex)), beli: f3(rata(beli.map((i) => ex[i]))), beliKuat: f3(rata(bk.map((i) => ex[i]))), jual: f3(rata(jual.map((i) => ex[i]))), selisihKuintil: f3(sel.length ? sel.reduce((p, q) => p + q, 0) / sel.length : null), nBeli: beli.length, nJual: jual.length };
}
export interface BandingFund { at: number; H: Record<number, { lama: Hasil; baru: Hasil }>; menang: boolean; alasan: string }
/** Skor lama vs relatif pada sampel uji mundur yang sama (selisih hasil vs pasar, disesuaikan risiko). */
export function bandingFund(sampel: SampelF[], kelompok: Record<string, Kelompok>): BandingFund {
    // Median per bulan × kelompok, dari rasio semua saham di bulan itu (hanya laporan yang sudah terbit saat itu).
    const perBulan = new Map<string, Map<string, RasioR>>();
    for (const x of sampel) { const m = perBulan.get(x.ym) || new Map(); m.set(x.s, x.f); perBulan.set(x.ym, m); }
    const petaBulan = new Map<string, ReturnType<typeof petaMedian>>();
    for (const [ym, m] of perBulan) petaBulan.set(ym, petaMedian([...m.entries()].map(([s, f]) => ({ s, f, k: kelompok[s] }))));
    const H: BandingFund['H'] = {};
    for (const h of [20, 60]) {
        const xs = sampel.filter((x) => x.H === h);
        const lama = xs.map((x) => skorFundamental({ f: x.f, sektor: kelompok[x.s]?.s || '' })?.skor ?? 0);
        const baru = xs.map((x) => skorFundamentalRelatif({ f: x.f, sektor: kelompok[x.s]?.s || '' }, petaBulan.get(x.ym)!(kelompok[x.s]))?.skor ?? 0);
        H[h] = { lama: nilai(lama, xs.map((x) => x.ex), xs.map((x) => x.ym)), baru: nilai(baru, xs.map((x) => x.ex), xs.map((x) => x.ym)) };
    }
    // Menang hanya bila: cukup sampel, selisih kuintil lebih besar di KEDUA horison, dan "Beli" tidak lebih buruk.
    const cek = [20, 60].map((h) => { const { lama, baru } = H[h]; return lama.n >= 2000 && baru.selisihKuintil != null && lama.selisihKuintil != null && baru.selisihKuintil > lama.selisihKuintil && (baru.beli ?? -99) >= (lama.beli ?? -99) - 0.05; });
    const menang = cek.every(Boolean);
    const alasan = H[20].lama.n < 2000 ? 'Sampel fundamental lampau belum cukup untuk membandingkan.' : menang ? 'Skor relatif lebih baik memisahkan saham yang kemudian unggul dan tertinggal di kedua horison.' : 'Skor relatif tidak terbukti lebih baik dari skor lama, jadi skor lama tetap dipakai.';
    return { at: Date.now(), H, menang, alasan };
}

/* ── Status aktif di aplikasi ── */
const berkas = (dataDir: string) => path.join(dataDir, 'fund-relatif.json');
export function simpanBanding(dataDir: string, b: BandingFund) { fs.writeFileSync(berkas(dataDir), JSON.stringify(b)); aktifCache = null; }
export function bacaBanding(dataDir: string): BandingFund | null { try { return JSON.parse(fs.readFileSync(berkas(dataDir), 'utf8')); } catch { return null; } }
/** Skor relatif dipakai hanya kalau uji mundur terakhir memenangkannya. */
let aktifCache: { at: number; v: boolean } | null = null;
export function relatifAktif(dataDir: string) {
    if (!aktifCache || Date.now() - aktifCache.at > 60_000) aktifCache = { at: Date.now(), v: !!bacaBanding(dataDir)?.menang };
    return aktifCache.v;
}
