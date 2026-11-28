/**
 * Simulasi sinyal (backdate): "kalau dulu saya menjalankan sinyal AI ini, hasilnya berapa?"
 * Setiap hari bursa di periode yang dipilih, skor teknikal dihitung HANYA dari data sampai hari itu (tanpa mengintip masa depan).
 * Saham dibeli saat labelnya masuk pilihan (mis. Beli kuat) dan — kalau guru dipilih — lolos ≥ 75% kriteria guru itu.
 * Posisi ditutup setelah masa pegang gaya posisi (H hari bursa), atau lebih cepat kalau label berubah jadi Jual/Jual kuat (opsional).
 * Dibandingkan dengan membeli & menahan SPY (S&P 500) dengan modal yang sama. Tidak ada order sungguhan.
 */
import { analisis } from './screener';
import { ekstra, proyeksi, skorTeknikal, label as labelSkor, type Label } from './skor';
import { hitungInd, PRESET, evaluasi } from './preset';
import { hargaPanjang, type Bar } from './harga';

export interface OpsiSim {
    H: number; guru: string | null; sinyal: Label[]; bulan: number; modal: number; porsi: number; maksPosisi: number; keluarJual: boolean; biaya: number; semesta: string[];
}
export interface Transaksi { s: string; masuk: string; hMasuk: number; keluar: string; hKeluar: number; pct: number; untung: number; label: string; skor: number; sebab: 'masa pegang' | 'sinyal jual' | 'akhir periode' }
export interface HasilSim {
    opsi: Omit<OpsiSim, 'semesta'> & { saham: number }; dari: string; sampai: string;
    akhir: number; pct: number; spyPct: number; maxDD: number; trade: number; menang: number; rataTrade: number; terbaik: Transaksi | null; terburuk: Transaksi | null;
    kurva: Array<{ t: string; nilai: number; spy: number }>; transaksi: Transaksi[]; gagal: string[]; catatan: string[];
}

export async function simulasiSinyal(o: OpsiSim, progres: (t: string) => void, ambil: (s: string, tahun: number) => Promise<Bar[]> = hargaPanjang): Promise<HasilSim> {
    const tahun = Math.max(2, o.bulan / 12 + 1.4); // ±1,1 tahun data pemanasan supaya MA200 dll. terisi
    progres('mengambil SPY…');
    const spy = await ambil('SPY', tahun);
    if (spy.length < 300) throw new Error('Riwayat SPY tidak cukup.');
    const awal = spy[Math.max(260, spy.length - Math.round((o.bulan * 252) / 12))].t;
    const hari = spy.filter((b) => b.t >= awal).map((b) => b.t);
    const preset = o.guru ? PRESET.find((p) => p.id === o.guru && p.jenis === 'teknikal') : null;
    const spyC = spy.map((b) => b.c), spyIdx = new Map(spy.map((b, i) => [b.t, i]));

    // 1) Sinyal harian per saham (hanya data lampau).
    type Sig = { label: Label; skor: number; lolos: boolean };
    const data = new Map<string, { idx: Map<string, number>; bar: Bar[]; sig: Map<string, Sig> }>();
    const gagal: string[] = [];
    for (let i = 0; i < o.semesta.length; i++) {
        const s = o.semesta[i];
        progres(`${i + 1}/${o.semesta.length} menghitung sinyal ${s}`);
        let d: Bar[];
        try { d = await ambil(s, tahun); } catch { gagal.push(s); continue; }
        if (d.length < 300) { gagal.push(s); continue; }
        await new Promise((r) => setTimeout(r, 80));
        const op = d.map((x) => x.o), h = d.map((x) => x.h), l = d.map((x) => x.l), c = d.map((x) => x.c), v = d.map((x) => x.v);
        const sig = new Map<string, Sig>();
        for (let t = 260; t < d.length; t++) {
            if (d[t].t < awal) continue;
            const cs = c.slice(0, t + 1), vs = v.slice(0, t + 1), hs = h.slice(0, t + 1), ls = l.slice(0, t + 1), os = op.slice(0, t + 1);
            const a = analisis(cs, vs);
            const x = ekstra(os, hs, ls, cs, vs, a.ma50, a.ma200, true);
            const b = { sinyal: a.sinyal, rsi: a.rsi, ma200: a.ma200, chg1m: a.chg1m, chg1d: a.chg1d, volX: a.volX, x };
            const f = skorTeknikal(b, o.H, o.H === 20 ? x.proyeksi : proyeksi(hs, ls, cs, x.atr, o.H, true));
            let lolos = true;
            if (preset) {
                const js = spyIdx.get(d[t].t);
                const spyS = js == null ? null : spyC.slice(0, js + 1);
                const sm50 = spyS ? spyS.slice(-50).reduce((p, q) => p + q, 0) / 50 : 0;
                const ind = hitungInd({ h: hs, l: ls, c: cs, v: vs }, spyS ? { c: spyS } : null, spyS ? spyS[spyS.length - 1] > sm50 : null);
                const e = evaluasi(preset, ind); lolos = (e.persen ?? 0) >= 75;
            }
            sig.set(d[t].t, { label: labelSkor(f.skor), skor: f.skor, lolos });
        }
        data.set(s, { idx: new Map(d.map((b, k) => [b.t, k])), bar: d, sig });
        if (i % 5 === 4) await new Promise((r) => setImmediate(r));
    }
    if (!data.size) throw new Error('Tidak ada riwayat harga saham yang bisa diambil.');

    // 2) Jalankan portofolio hari demi hari.
    progres('menjalankan portofolio…');
    let kas = o.modal;
    const buka = new Map<string, { s: string; masuk: string; hMasuk: number; lembar: number; hariKe: number; label: string; skor: number }>();
    const trx: Transaksi[] = [];
    const kurva: HasilSim['kurva'] = [];
    const spy0 = spy[spyIdx.get(hari[0])!].c;
    const harga = (s: string, t: string) => { const z = data.get(s)!; const k = z.idx.get(t); return k == null ? null : z.bar[k].c; };
    const tutup = (s: string, t: string, sebab: Transaksi['sebab']) => {
        const p = buka.get(s)!; const hk = harga(s, t) ?? p.hMasuk;
        const bersih = p.lembar * hk * (1 - o.biaya);
        kas += bersih; buka.delete(s);
        const modalPos = p.lembar * p.hMasuk * (1 + o.biaya);
        trx.push({ s, masuk: p.masuk, hMasuk: +p.hMasuk.toFixed(2), keluar: t, hKeluar: +hk.toFixed(2), pct: +((bersih / modalPos - 1) * 100).toFixed(2), untung: +(bersih - modalPos).toFixed(2), label: p.label, skor: p.skor, sebab });
    };
    for (let di = 0; di < hari.length; di++) {
        const t = hari[di];
        // Tutup posisi: masa pegang habis, atau sinyal berubah jadi jual.
        for (const p of [...buka.values()]) {
            p.hariKe++;
            const sg = data.get(p.s)!.sig.get(t);
            if (harga(p.s, t) == null) continue;
            if (p.hariKe >= o.H) tutup(p.s, t, 'masa pegang');
            else if (o.keluarJual && sg && (sg.label === 'Jual' || sg.label === 'Jual kuat')) tutup(p.s, t, 'sinyal jual');
        }
        // Buka posisi baru: kandidat dengan skor tertinggi dulu.
        if (di < hari.length - 1) {
            const calon = [...data.entries()].map(([s, z]) => ({ s, g: z.sig.get(t) })).filter((x) => x.g && !buka.has(x.s) && o.sinyal.includes(x.g.label) && x.g.lolos).sort((a, b) => b.g!.skor - a.g!.skor);
            for (const c of calon) {
                if (buka.size >= o.maksPosisi) break;
                const nilaiTotal = kas + [...buka.values()].reduce((sum, p) => sum + p.lembar * (harga(p.s, t) ?? p.hMasuk), 0);
                const dana = Math.min(kas, nilaiTotal * o.porsi);
                const hm = harga(c.s, t); if (!hm || dana < 50) continue;
                const lembar = dana / (hm * (1 + o.biaya));
                kas -= dana; buka.set(c.s, { s: c.s, masuk: t, hMasuk: hm, lembar, hariKe: 0, label: c.g!.label, skor: c.g!.skor });
            }
        }
        const nilai = kas + [...buka.values()].reduce((sum, p) => sum + p.lembar * (harga(p.s, t) ?? p.hMasuk), 0);
        const js = spyIdx.get(t)!;
        kurva.push({ t, nilai: +nilai.toFixed(2), spy: +(o.modal * (spy[js].c / spy0)).toFixed(2) });
    }
    const akhirT = hari[hari.length - 1];
    for (const p of [...buka.values()]) tutup(p.s, akhirT, 'akhir periode');
    const akhir = kas;
    let puncak = -Infinity, maxDD = 0; for (const k of kurva) { puncak = Math.max(puncak, k.nilai); maxDD = Math.min(maxDD, k.nilai / puncak - 1); }
    const urut = [...trx].sort((a, b) => b.pct - a.pct);
    return {
        opsi: { H: o.H, guru: o.guru, sinyal: o.sinyal, bulan: o.bulan, modal: o.modal, porsi: o.porsi, maksPosisi: o.maksPosisi, keluarJual: o.keluarJual, biaya: o.biaya, saham: data.size },
        dari: hari[0], sampai: akhirT, akhir: +akhir.toFixed(2), pct: +((akhir / o.modal - 1) * 100).toFixed(2), spyPct: +((kurva[kurva.length - 1].spy / o.modal - 1) * 100).toFixed(2),
        maxDD: +(maxDD * 100).toFixed(2), trade: trx.length, menang: trx.length ? +((trx.filter((x) => x.pct > 0).length / trx.length) * 100).toFixed(1) : 0,
        rataTrade: trx.length ? +(trx.reduce((s, x) => s + x.pct, 0) / trx.length).toFixed(2) : 0, terbaik: urut[0] || null, terburuk: urut[urut.length - 1] || null,
        kurva: kurva.filter((_, i) => i % Math.max(1, Math.floor(kurva.length / 180)) === 0 || i === kurva.length - 1), transaksi: trx.sort((a, b) => a.masuk.localeCompare(b.masuk)), gagal,
        catatan: [
            'Sinyal dihitung ulang dari harga sampai hari itu saja — tidak mengintip masa depan.',
            'Memakai rumus skor teknikal dasar (sama dengan uji mundur); bobot hasil belajar & faktor berita/fundamental historis tidak ikut karena datanya tidak tersedia untuk masa lalu.',
            `Harga beli/jual = harga penutupan hari sinyal; biaya transaksi ${(o.biaya * 100).toFixed(2)}% per sisi. Slippage dan pajak belum dihitung.`,
            'Daftar saham = pilihan hari ini; saham yang dulu ada tapi sekarang sudah tidak dipantau tidak ikut (hasil bisa sedikit terlalu bagus).',
            'Hasil masa lalu tidak menjamin hasil masa depan. Bukan saran keuangan.'
        ]
    };
}
