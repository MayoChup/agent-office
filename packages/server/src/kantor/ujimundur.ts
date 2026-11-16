import fs from 'fs';
import path from 'path';
import { analisis } from './screener';
import { ekstra, proyeksi, skorTeknikal, label } from './skor';
import { hitungInd, PRESET, evaluasi } from './preset';
import { hargaPanjang, Bar } from './harga';
import { fitur, ridge, nilaiMask, keSkor, FITUR, Model } from './bobot';

/**
 * Uji mundur (backtest) skor teknikal & preset guru:
 * di setiap tanggal lampau (tiap 5 hari bursa), hitung skor HANYA dari data sampai tanggal itu,
 * lalu bandingkan dengan hasil H hari bursa sesudahnya — dibandingkan dengan S&P 500 (SPY) pada periode sama.
 * Catatan jujur: daftar saham = S&P 500 HARI INI (saham yang sudah keluar indeks tidak ikut) → hasil cenderung terlalu bagus.
 */
export const HS = [1, 5, 20, 60];
type Akum = { n: number; ex: number; ex2: number; menang: number };
const akum = (): Akum => ({ n: 0, ex: 0, ex2: 0, menang: 0 });
const tambah = (a: Akum, ex: number) => { a.n++; a.ex += ex; a.ex2 += ex * ex; if (ex > 0) a.menang++; };
/** Beta saham terhadap SPY dari ±252 hari bursa sampai t (hanya data lampau), dibatasi 0,2–3. */
function betaDi(d: Bar[], t: number, spy: Bar[], spyIdx: Map<string, number>) {
    const xs: number[] = [], ys: number[] = [];
    for (let i = Math.max(1, t - 251); i <= t; i++) {
        const a = spyIdx.get(d[i].t), b = spyIdx.get(d[i - 1].t);
        if (a == null || b == null || a !== b + 1) continue;
        xs.push(spy[a].c / spy[b].c - 1); ys.push(d[i].c / d[i - 1].c - 1);
    }
    if (xs.length < 120) return 1;
    const mx = xs.reduce((p, q) => p + q, 0) / xs.length, my = ys.reduce((p, q) => p + q, 0) / ys.length;
    let cov = 0, v = 0; for (let k = 0; k < xs.length; k++) { cov += (xs[k] - mx) * (ys[k] - my); v += (xs[k] - mx) ** 2; }
    return v > 0 ? Math.max(0.2, Math.min(3, cov / v)) : 1;
}
const ringkas = (a: Akum) => ({ n: a.n, rataEx: a.n ? +((a.ex / a.n) * 100).toFixed(3) : null, menang: a.n ? +((a.menang / a.n) * 100).toFixed(1) : null, galatStd: a.n > 1 ? +((Math.sqrt(Math.max(0, a.ex2 / a.n - (a.ex / a.n) ** 2)) / Math.sqrt(a.n)) * 100).toFixed(3) : null });
const kunciAlasan = (s: string) => `${s[0]} ${s.slice(1).replace(/\(.*$/, '').replace(/(^|\s)[\d][\d.,]*\s*([%×]\s*)?/g, '$1# ').replace(/\s+/g, ' ').trim()}`;

export interface StatusUji { jalan: boolean; progres: string; mulai: number; selesai: number; galat: string }

export async function ujiMundur(semesta: string[], file: string, st: StatusUji, opsi = { tahun: 6.5, langkah: 5 }, ambil: (s: string, tahun: number) => Promise<Bar[]> = hargaPanjang) {
    st.jalan = true; st.mulai = Date.now(); st.galat = ''; st.progres = 'mengambil SPY…';
    try {
        const spy = await ambil('SPY', opsi.tahun);
        const spyIdx = new Map(spy.map((b, i) => [b.t, i]));
        const label5 = ['Beli kuat', 'Beli', 'Tahan', 'Jual', 'Jual kuat'];
        const R: Record<number, { semua: Akum; label: Record<string, Akum>; komp: Map<string, Akum>; preset: Record<string, Record<string, Akum>>; kuintil: Akum[] }> = {};
        for (const H of HS) R[H] = { semua: akum(), label: Object.fromEntries(label5.map((l) => [l, akum()])), komp: new Map(), preset: Object.fromEntries(PRESET.filter((p) => p.jenis === 'teknikal').map((p) => [p.id, { lolos75: akum(), lolos50: akum(), kurang: akum() }])), kuintil: Array.from({ length: 5 }, akum) };
        // Sampel mentah untuk mencari bobot dari data: tanggal, selisih vs pasar, ciri teknikal (bitmask), skor lama.
        const S: Record<number, { tgl: string[]; ex: number[]; mask: number[]; lama: number[] }> = {};
        for (const H of HS) S[H] = { tgl: [], ex: [], mask: [], lama: [] };
        let ok = 0, gagal = 0, sampel = 0, dari = '', sampai = '';
        for (let si = 0; si < semesta.length; si++) {
            const s = semesta[si];
            st.progres = `${si + 1}/${semesta.length} saham (${s})`;
            let d: Bar[];
            try { d = await ambil(s, opsi.tahun); } catch { gagal++; continue; }
            await new Promise((r) => setTimeout(r, 120));
            const o = d.map((x) => x.o), h = d.map((x) => x.h), l = d.map((x) => x.l), c = d.map((x) => x.c), v = d.map((x) => x.v);
            const skorPerH: Record<number, Array<{ sk: number; ex: number }>> = {};
            for (let t = 260; t < d.length - 1; t += opsi.langkah) {
                const js = spyIdx.get(d[t].t); if (js == null) continue;
                const cs = c.slice(0, t + 1), vs = v.slice(0, t + 1), hs = h.slice(0, t + 1), ls = l.slice(0, t + 1), os = o.slice(0, t + 1);
                const a = analisis(cs, vs);
                const x = ekstra(os, hs, ls, cs, vs, a.ma50, a.ma200);
                const b = { sinyal: a.sinyal, rsi: a.rsi, ma200: a.ma200, chg1m: a.chg1m, chg1d: a.chg1d, volX: a.volX, x };
                const spyS = spy.slice(0, js + 1).map((z) => z.c);
                const sm50 = spyS.slice(-50).reduce((p, q) => p + q, 0) / 50;
                const ind = hitungInd({ h: hs, l: ls, c: cs, v: vs }, { c: spyS }, spyS[spyS.length - 1] > sm50);
                const mask = fitur({ ...b, harga: cs[cs.length - 1] }, ind);
                const beta = betaDi(d, t, spy, spyIdx);
                const evs = PRESET.filter((p) => p.jenis === 'teknikal').map((p) => ({ id: p.id, e: evaluasi(p, ind) }));
                for (const H of HS) {
                    if (t + H >= d.length || js + H >= spy.length) continue;
                    // Hasil: tutup t → tutup t+H, dikurangi hasil SPY periode yang sama (selisih vs pasar).
                    // Disesuaikan risiko: saham yang biasanya bergerak 1,5× pasar dibandingkan dengan 1,5× hasil SPY.
                    const ex = (c[t + H] / c[t] - 1) - beta * (spy[js + H].c / spy[js].c - 1);
                    const pr = H === 20 ? x.proyeksi : proyeksi(hs, ls, cs, x.atr, H);
                    const f = skorTeknikal(b, H, pr);
                    const r = R[H];
                    tambah(r.semua, ex); tambah(r.label[label(f.skor)], ex);
                    for (const al of f.alasan) { const k = kunciAlasan(al); if (!r.komp.has(k)) r.komp.set(k, akum()); tambah(r.komp.get(k)!, ex); }
                    for (const pe of evs) { if (pe.e.persen == null) continue; tambah(r.preset[pe.id][pe.e.persen >= 75 ? 'lolos75' : pe.e.persen >= 50 ? 'lolos50' : 'kurang'], ex); }
                    (skorPerH[H] ||= []).push({ sk: f.skor, ex });
                    const z = S[H]; z.tgl.push(d[t].t); z.ex.push(ex); z.mask.push(mask); z.lama.push(f.skor);
                    sampel++;
                }
                if (!dari || d[t].t < dari) dari = d[t].t;
                if (!sampai || d[t].t > sampai) sampai = d[t].t;
            }
            // Rentang skor (5 kelompok selebar 0,4 dari −1 sampai +1).
            for (const H of HS) for (const q of skorPerH[H] || []) tambah(R[H].kuintil[Math.min(4, Math.max(0, Math.floor((q.sk + 1) / 0.4)))], q.ex);
            ok++;
            if (si % 10 === 9) await new Promise((r) => setImmediate(r));
        }
        if (!ok) throw new Error('Tidak ada riwayat harga yang bisa diambil.');
        const hasil = {
            at: Date.now(), saham: ok, gagal, sampel, periode: { dari, sampai }, langkah: opsi.langkah,
            catatan: [
                'Daftar saham = anggota S&P 500 hari ini; saham yang sudah keluar indeks (biasanya yang jatuh) tidak ikut, jadi hasil cenderung sedikit terlalu bagus.',
                'Hasil dihitung dari harga penutupan ke penutupan, belum dipotong biaya transaksi/selisih harga.',
                'Selisih vs S&P 500 sudah DISESUAIKAN RISIKO (beta): saham yang biasanya bergerak 1,5× pasar dibandingkan dengan 1,5× hasil SPY. Jadi saham liar tidak terlihat hebat hanya karena pasar sedang naik. Positif = mengalahkan pasar.',
                'Beta tiap saham dihitung dari 1 tahun harga SEBELUM tanggal itu saja (tidak mengintip masa depan).',
                'Day trading/scalping diuji dengan tutup → tutup besok (data menit tidak tersedia untuk 5 tahun).'
            ],
            H: Object.fromEntries(HS.map((H) => {
                const r = R[H]; const dasar = ringkas(r.semua);
                return [H, {
                    semua: dasar,
                    label: Object.fromEntries(Object.entries(r.label).map(([k, a]) => [k, ringkas(a)])),
                    kuintil: r.kuintil.map(ringkas),
                    komponen: [...r.komp.entries()].map(([k, a]) => ({ nama: k, ...ringkas(a) })).filter((x) => x.n >= 50).sort((a, b) => (b.rataEx ?? 0) - (a.rataEx ?? 0)),
                    preset: Object.entries(r.preset).map(([id, g]) => { const p = PRESET.find((z) => z.id === id)!; return { id, guru: p.guru, nama: p.nama, lolos75: ringkas(g.lolos75), lolos50: ringkas(g.lolos50), kurang: ringkas(g.kurang) }; })
                }];
            }))
        };
        st.progres = 'mencari bobot dari data latih & mengujinya…';
        await new Promise((r) => setImmediate(r));
        const model: Record<number, Model> = {};
        const bobotH: Record<number, any> = {};
        for (const H of HS) { const m = latihUji(S[H], H, opsi.langkah); if (m) { model[H] = m; bobotH[H] = ringkasModel(m); } }
        (hasil as any).bobot = { batas: BATAS, H: bobotH };
        fs.writeFileSync(fileBobot(path.dirname(file)), JSON.stringify(model));
        fs.writeFileSync(file, JSON.stringify(hasil));
        st.selesai = Date.now(); st.progres = `selesai: ${ok} saham, ${sampel.toLocaleString('id-ID')} sampel`;
        return hasil;
    } catch (e: any) { st.galat = String(e?.message || e); throw e; }
    finally { st.jalan = false; }
}

/** Rekomendasi preset dari hasil uji: preset teknikal terbaik per horison (min. 300 sampel & mengalahkan rata-rata semua saham). */
export function rekomendasiUji(file: string): Record<number, { id: string; rataEx: number; menang: number; n: number } | null> | null {
    try {
        const h = JSON.parse(fs.readFileSync(file, 'utf8'));
        const out: Record<number, any> = {};
        for (const H of HS) {
            const r = h.H[H]; if (!r) continue;
            // Harus mengalahkan pasar (>0) DAN rata-rata semua saham, dengan selisih > 2× galat standar (bukan kebetulan).
            const c = r.preset.filter((p: any) => p.lolos75.n >= 300 && p.lolos75.rataEx != null && p.lolos75.rataEx > Math.max(0, r.semua.rataEx ?? 0) + 2 * (p.lolos75.galatStd ?? 0))
                .sort((a: any, b: any) => b.lolos75.rataEx - a.lolos75.rataEx)[0];
            out[H] = c ? { id: c.id, rataEx: c.lolos75.rataEx, menang: c.lolos75.menang, n: c.lolos75.n } : null;
        }
        return out;
    } catch { return null; }
}
export const fileUji = (dataDir: string) => path.join(dataDir, 'ujimundur.json');
export const fileBobot = (dataDir: string) => path.join(dataDir, 'bobot-teknikal.json');

/* ── Bobot dari data: latih sebelum BATAS, uji sesudahnya ── */
export const BATAS = '2025-01-01';
const rata = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
/** Kurangi rata-rata per tanggal: model belajar MEMILIH saham yang lebih baik dari saham lain di hari yang sama, bukan menebak pasar. */
function demean(tgl: string[], ex: number[]) {
    const m = new Map<string, { s: number; n: number }>();
    tgl.forEach((t, i) => { const e = m.get(t) || { s: 0, n: 0 }; e.s += ex[i]; e.n++; m.set(t, e); });
    return ex.map((x, i) => { const e = m.get(tgl[i])!; return x - e.s / e.n; });
}
/** Korelasi peringkat rata-rata per tanggal (IC) antara skor dan hasil. */
function icRata(tgl: string[], raw: number[], ex: number[]) {
    const g = new Map<string, number[]>(); tgl.forEach((t, i) => { (g.get(t) || g.set(t, []).get(t)!).push(i); });
    const ics: number[] = [];
    const rank = (v: number[]) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); o.forEach(([, i], k) => (r[i] = k)); return r; };
    for (const idx of g.values()) {
        if (idx.length < 20) continue;
        const a = rank(idx.map((i) => raw[i])), b = rank(idx.map((i) => ex[i]));
        const ma = rata(a), mb = rata(b); let sab = 0, saa = 0, sbb = 0;
        for (let k = 0; k < a.length; k++) { sab += (a[k] - ma) * (b[k] - mb); saa += (a[k] - ma) ** 2; sbb += (b[k] - mb) ** 2; }
        if (saa && sbb) ics.push(sab / Math.sqrt(saa * sbb));
    }
    return ics.length ? rata(ics) : 0;
}
const LBL = ['Beli kuat', 'Beli', 'Tahan', 'Jual', 'Jual kuat'];
const lbl = (sk: number) => (sk >= 0.45 ? 0 : sk >= 0.15 ? 1 : sk > -0.15 ? 2 : sk > -0.45 ? 3 : 4);
/** Tabel per label + uji selisih Beli kuat − Jual kuat per tanggal (galat diperbesar karena periode tumpang tindih). */
function nilaiUji(tgl: string[], ex: number[], sk: number[], H: number, langkah: number) {
    const a = LBL.map(akum), semua = akum();
    const per = new Map<string, { bk: number[]; jk: number[] }>();
    sk.forEach((s, i) => {
        const k = lbl(s); tambah(a[k], ex[i]); tambah(semua, ex[i]);
        if (k === 0 || k === 4) { const e = per.get(tgl[i]) || { bk: [], jk: [] }; (k === 0 ? e.bk : e.jk).push(ex[i]); per.set(tgl[i], e); }
    });
    const sel = [...per.values()].filter((e) => e.bk.length && e.jk.length).map((e) => rata(e.bk) - rata(e.jk));
    const m = rata(sel), sd = Math.sqrt(rata(sel.map((x) => (x - m) ** 2)));
    const se = sel.length > 3 ? (sd / Math.sqrt(sel.length)) * Math.sqrt(Math.max(1, H / langkah)) : NaN;
    return { label: Object.fromEntries(LBL.map((l, i) => [l, ringkas(a[i])])), semua: ringkas(semua), selisih: +(m * 100).toFixed(3), galat: +(se * 100).toFixed(3), t: +(m / se).toFixed(2), tanggal: sel.length };
}
export function latihUji(z: { tgl: string[]; ex: number[]; mask: number[]; lama: number[] }, H: number, langkah: number): Model | null {
    const L: number[] = [], U: number[] = [];
    z.tgl.forEach((t, i) => (t < BATAS ? L : U).push(i));
    if (L.length < 2000 || U.length < 1000) return null;
    const pick = (ix: number[], a: any[]) => ix.map((i) => a[i]);
    const tL = pick(L, z.tgl), eL = pick(L, z.ex), mL = pick(L, z.mask);
    const yL = demean(tL, eL);
    // Pilih kekuatan "rem" (lambda) dengan validasi di dalam data latih: tahun terakhir latih jadi ujian kecil.
    const tahunAkhir = String(+BATAS.slice(0, 4) - 1);
    const a1 = L.map((_, k) => k).filter((k) => tL[k] < tahunAkhir), a2 = L.map((_, k) => k).filter((k) => tL[k] >= tahunAkhir);
    let lam = 2000, best = -Infinity;
    if (a1.length > 1000 && a2.length > 500) {
        const y1 = demean(pick(a1, tL), pick(a1, eL));
        for (const cand of [100, 500, 2000, 10000, 50000]) {
            const r = ridge(pick(a1, mL), y1, cand);
            const ic = icRata(pick(a2, tL), pick(a2, mL).map((m) => nilaiMask(m, r.w)), pick(a2, eL));
            if (ic > best) { best = ic; lam = cand; }
        }
    }
    const { w, c } = ridge(mL, yL, lam);
    const rawL = mL.map((m) => nilaiMask(m, w)).sort((a, b) => a - b);
    const cut = Array.from({ length: 101 }, (_, k) => rawL[Math.min(rawL.length - 1, Math.floor((k / 100) * (rawL.length - 1)))]);
    // Uji pada data yang TIDAK dipakai saat mencari bobot.
    const tU = pick(U, z.tgl), eU = pick(U, z.ex), mU = pick(U, z.mask);
    const rawU = mU.map((m) => nilaiMask(m, w));
    const baru = nilaiUji(tU, eU, rawU.map((r) => keSkor(r, cut)), H, langkah);
    const lama = nilaiUji(tU, eU, pick(U, z.lama), H, langkah);
    const icU = icRata(tU, rawU, eU);
    const bk = baru.label['Beli kuat'].rataEx ?? -Infinity, rataU = baru.semua.rataEx ?? 0;
    const alasan: string[] = [];
    if (!(baru.t > 2)) alasan.push(`selisih "Beli kuat" − "Jual kuat" di data uji ${baru.selisih}% belum cukup jauh dari nol (perlu > 2× galat ${baru.galat}%)`);
    if (!(bk > rataU)) alasan.push(`"Beli kuat" (${bk}%) tidak lebih baik dari rata-rata semua saham (${rataU}%)`);
    if (!(icU > 0)) alasan.push('urutan skor tidak searah dengan hasil di data uji');
    const lulus = !alasan.length;
    const tglL = [...tL].sort(), tglU = [...tU].sort();
    return {
        H, w: w.map((x) => +x.toFixed(6)), c: +c.toFixed(6), cut: cut.map((x) => +x.toFixed(6)), lulus,
        latih: { dari: tglL[0], sampai: tglL[tglL.length - 1], n: L.length },
        uji: { dari: tglU[0], sampai: tglU[tglU.length - 1], n: U.length, lambda: lam, ic: +icU.toFixed(4), baru, lama, alasan },
        at: Date.now()
    };
}
function ringkasModel(m: Model) {
    const w = FITUR.map((f, i) => ({ k: f.k, t: f.t, w: +(m.w[i] * 100).toFixed(3) })).sort((a, b) => b.w - a.w);
    return { lulus: m.lulus, latih: m.latih, uji: m.uji, teratas: w.slice(0, 6), terbawah: w.slice(-6).reverse() };
}

/** Status tiap preset teknikal per horison: terbukti (lolos75 mengalahkan pasar & rata-rata dengan selisih > 2× galat) atau belum. */
export function statusPreset(file: string): Record<number, Record<string, { terbukti: boolean; rataEx: number | null; n: number }>> | null {
    try {
        const h = JSON.parse(fs.readFileSync(file, 'utf8')); const out: Record<number, any> = {};
        for (const H of HS) {
            const r = h.H?.[H]; if (!r) continue; out[H] = {};
            for (const p of r.preset) { const a = p.lolos75; out[H][p.id] = { terbukti: a.n >= 300 && a.rataEx != null && a.rataEx > Math.max(0, r.semua.rataEx ?? 0) + 2 * (a.galatStd ?? 0), rataEx: a.rataEx, n: a.n }; }
        }
        return out;
    } catch { return null; }
}
