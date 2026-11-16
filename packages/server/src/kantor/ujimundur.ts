import fs from 'fs';
import path from 'path';
import { analisis } from './screener';
import { ekstra, proyeksi, skorTeknikal, label } from './skor';
import { hitungInd, PRESET, evaluasi } from './preset';
import { hargaPanjang, Bar } from './harga';

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
const ringkas = (a: Akum) => ({ n: a.n, rataEx: a.n ? +((a.ex / a.n) * 100).toFixed(3) : null, menang: a.n ? +((a.menang / a.n) * 100).toFixed(1) : null, galatStd: a.n > 1 ? +((Math.sqrt(Math.max(0, a.ex2 / a.n - (a.ex / a.n) ** 2)) / Math.sqrt(a.n)) * 100).toFixed(3) : null });
const kunciAlasan = (s: string) => `${s[0]} ${s.slice(1).replace(/\(.*$/, '').replace(/[\d][\d.,]*\s*[%×]?/g, '#').replace(/\s+/g, ' ').trim()}`;

export interface StatusUji { jalan: boolean; progres: string; mulai: number; selesai: number; galat: string }

export async function ujiMundur(semesta: string[], file: string, st: StatusUji, opsi = { tahun: 5, langkah: 5 }, ambil: (s: string, tahun: number) => Promise<Bar[]> = hargaPanjang) {
    st.jalan = true; st.mulai = Date.now(); st.galat = ''; st.progres = 'mengambil SPY…';
    try {
        const spy = await ambil('SPY', opsi.tahun);
        const spyIdx = new Map(spy.map((b, i) => [b.t, i]));
        const label5 = ['Beli kuat', 'Beli', 'Tahan', 'Jual', 'Jual kuat'];
        const R: Record<number, { semua: Akum; label: Record<string, Akum>; komp: Map<string, Akum>; preset: Record<string, Record<string, Akum>>; kuintil: Akum[] }> = {};
        for (const H of HS) R[H] = { semua: akum(), label: Object.fromEntries(label5.map((l) => [l, akum()])), komp: new Map(), preset: Object.fromEntries(PRESET.filter((p) => p.jenis === 'teknikal').map((p) => [p.id, { lolos75: akum(), lolos50: akum(), kurang: akum() }])), kuintil: Array.from({ length: 5 }, akum) };
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
                const evs = PRESET.filter((p) => p.jenis === 'teknikal').map((p) => ({ id: p.id, e: evaluasi(p, ind) }));
                for (const H of HS) {
                    if (t + H >= d.length || js + H >= spy.length) continue;
                    // Hasil: tutup t → tutup t+H, dikurangi hasil SPY periode yang sama (selisih vs pasar).
                    const ex = c[t + H] / c[t] - (spy[js + H].c / spy[js].c);
                    const pr = H === 20 ? x.proyeksi : proyeksi(hs, ls, cs, x.atr, H);
                    const f = skorTeknikal(b, H, pr);
                    const r = R[H];
                    tambah(r.semua, ex); tambah(r.label[label(f.skor)], ex);
                    for (const al of f.alasan) { const k = kunciAlasan(al); if (!r.komp.has(k)) r.komp.set(k, akum()); tambah(r.komp.get(k)!, ex); }
                    for (const pe of evs) { if (pe.e.persen == null) continue; tambah(r.preset[pe.id][pe.e.persen >= 75 ? 'lolos75' : pe.e.persen >= 50 ? 'lolos50' : 'kurang'], ex); }
                    (skorPerH[H] ||= []).push({ sk: f.skor, ex });
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
                'Selisih vs S&P 500 = hasil saham dikurangi hasil SPY pada periode yang sama. Positif = mengalahkan pasar.',
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
