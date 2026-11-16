import type { Screener } from './screener';
import { saranDariUji, namaH } from './ujimundur';
import { statusPreset, fileUji } from './ujimundur';
import { PRESET } from './preset';

/**
 * Ringkasan DATA halaman Trading (teks) untuk chat konsultasi:
 * AI hanya boleh menjawab dari blok ini — tidak dari ingatan, internet, atau alat lain.
 */
const r2 = (x: any) => (x == null || !Number.isFinite(+x) ? '–' : (+x).toFixed(2));
const sk = (f: any) => (f ? `${f.label} (${r2(f.skor)})` : '–');

export function konteksTrading(o: { screener: Screener; dataDir: string; H: number; mode: string; pt: string; pf: string; saham?: string; teks: string; watch: string[]; posisi: Array<{ symbol: string; entry: number; shares: number }> }): string {
    const d = o.screener.data(o.H, o.mode, o.pt, o.pf);
    const L: string[] = [];
    const nm = (id: string) => PRESET.find((p) => p.id === id)?.guru || id;
    L.push(`# Data halaman Trading (penutupan ${d.teknikalSesi || '?'}; fundamental ${d.fundamentalAt ? new Date(d.fundamentalAt).toISOString().slice(0, 10) : '?'}; berita ${d.beritaAt ? new Date(d.beritaAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '?'})`);
    L.push(`Rencana pegang posisi yang dipilih: ${o.mode || '-'} (±${d.horizon} hari bursa). Bobot skor gabungan: ${Object.entries(d.bobot).map(([k, v]) => `${k} ${Math.round((v as number) * 100)}%`).join(', ')}.`);
    const tb: any = d.teknikalBukti;
    L.push(`Status skor teknikal horison ini: ${tb.terbukti ? 'TERBUKTI di uji mundur' : tb.sumber === 'data-belum' ? 'belum terbukti, tapi bobot dari data lebih baik dari rumus lama' : tb.sumber === 'belum-diuji' ? 'belum diuji' : 'TIDAK terbukti di uji mundur'}.`);
    if (o.pt || o.pf) L.push(`Preset aktif: ${[o.pt && `teknikal ${nm(o.pt)}`, o.pf && `fundamental ${nm(o.pf)}`].filter(Boolean).join(', ')}.`);
    L.push(`Pasar hari itu: ${d.pasar.naik} naik, ${d.pasar.turun} turun. Sektor terkuat: ${d.pasar.sektor.slice(0, 3).map((s: any) => `${s.nama} ${s.chg}%`).join(', ')}; terlemah: ${d.pasar.sektor.slice(-3).map((s: any) => `${s.nama} ${s.chg}%`).join(', ')}.`);

    // Uji mundur
    const sr = saranDariUji(o.dataDir);
    if (sr) {
        L.push('', `# Hasil uji mundur (backtest, ${new Date(sr.at).toISOString().slice(0, 10)}, hasil disesuaikan risiko vs S&P 500)`);
        for (const x of Object.values(sr.H)) L.push(`- ${namaH(x.H)}: ${x.teknikalKet} Preset terbukti: ${x.preset.length ? x.preset.map((p) => `${p.guru} ${p.nama} (${r2(p.rataEx)}%)`).join(', ') : 'tidak ada'}. Saran sistem: ${x.saran}`);
        const st = statusPreset(fileUji(o.dataDir));
        const hk = o.H <= 1 ? 1 : o.H <= 5 ? 5 : o.H <= 20 ? 20 : 60;
        if (st?.[hk]) L.push(`Semua preset teknikal di ±${hk} hari: ${Object.entries(st[hk]).map(([id, v]) => `${nm(id)} ${r2(v.rataEx)}% (${v.terbukti ? 'terbukti' : 'belum'})`).join('; ')}. Preset fundamental belum bisa diuji mundur.`);
    } else L.push('', '# Uji mundur: belum pernah dijalankan.');

    // Daftar saham
    const baris = d.baris as any[];
    const satu = (b: any) => `${b.s} ${b.nama} | ${b.sektor || ''} | $${r2(b.harga)} | 1h ${r2(b.chg1d)}% 1b ${r2(b.chg1m)}% 3b ${r2(b.chg3m)}% | gabungan ${sk(b.skor?.semua)} · tek ${sk(b.skor?.teknikal)} · fund ${sk(b.skor?.fundamental)} · berita ${sk(b.skor?.berita)} · whales ${sk(b.skor?.whales)}${b.preset?.teknikal ? ` · preset tek ${b.preset.teknikal.persen}%` : ''}${b.preset?.fundamental ? ` · preset fund ${b.preset.fundamental.persen}%` : ''}`;
    const urut = [...baris].filter((b) => b.skor?.semua).sort((a, b) => b.skor.semua.skor - a.skor.semua.skor);
    L.push('', `# Skor gabungan teratas (dari ${baris.length} saham)`, ...urut.slice(0, 15).map(satu));
    L.push('', '# Skor gabungan terbawah', ...urut.slice(-8).reverse().map(satu));
    const pos = new Map(o.posisi.map((p) => [p.symbol, p]));
    const milik = baris.filter((b) => o.watch.includes(b.s) || pos.has(b.s));
    if (milik.length) L.push('', '# Watchlist & posisi Pak Rico', ...milik.map((b) => `${satu(b)}${pos.has(b.s) ? ` | POSISI: beli $${pos.get(b.s)!.entry} × ${pos.get(b.s)!.shares} lembar` : ' | watchlist'}`));

    // Detail saham yang sedang dibuka / disebut di pertanyaan
    const kode = new Set(baris.map((b) => b.s));
    const disebut = [o.saham, ...((o.teks.toUpperCase().match(/\b[A-Z]{1,5}(?:-[A-Z])?\b/g) || []).filter((k) => kode.has(k)))].filter(Boolean) as string[];
    for (const s of Array.from(new Set(disebut)).slice(0, 3)) {
        const det: any = o.screener.detail(s, o.H, o.mode, o.pt, o.pf);
        if (!det) continue;
        const b = det.baris, f = b.f || {}, pr = b.x?.proyeksi;
        L.push('', `# Detail ${s} — ${b.nama}${s === o.saham ? ' (sedang dibuka di layar)' : ''}`, satu({ ...b, skor: Object.fromEntries(Object.entries(det.skor).map(([k, v]: any) => [k, v && { skor: v.skor, label: v.label }])) }));
        L.push(`Teknikal: RSI ${r2(b.rsi)}, MA50 ${r2(b.ma50)}, MA200 ${r2(b.ma200)}, volume ${r2(b.volX)}× rata-rata, tren ${b.x?.trenLabel || '–'}.`);
        if (pr) L.push(`Proyeksi ±${o.H} hari: ${JSON.stringify(pr).slice(0, 400)}`);
        L.push(`Fundamental (${f.sumber || '?'}): ROE ${r2(f.roe)}%, PER ${r2(f.per)}, PBV ${r2(f.pbv)}, DER ${r2(f.der)}, margin laba ${r2(f.npm)}%, pertumbuhan pendapatan ${r2(f.revGrowth)}%, EPS CAGR 3th ${r2(f.epsCagr3)}%, kapitalisasi ${b.mcap ?? f.mcap ?? '–'} juta USD.`);
        for (const k of ['teknikal', 'fundamental', 'berita', 'whales', 'semua']) { const v = det.skor[k]; if (v) L.push(`Alasan ${k}: ${v.alasan.slice(0, 8).join(' | ')}`); }
        const br = det.berita; if (br?.judul?.length) L.push(`Berita 7 hari: ${br.judul.slice(0, 6).map((j: any) => `[${j.s > 0 ? '+' : j.s < 0 ? '−' : '·'}] ${j.t}`).join(' | ')}`);
        const ps = (det.preset as any[]).filter((p) => p.persen != null).map((p) => `${nm(p.id)} ${p.lolos}/${p.dinilai}`).join(', ');
        if (ps) L.push(`Kepatuhan preset: ${ps}`);
    }
    return L.join('\n').slice(0, 28_000);
}
