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

/** Kata Indonesia/awam → pola nama sektor/industri (data Nasdaq berbahasa Inggris). */
const KELOMPOK: Array<[RegExp, RegExp, string]> = [
    [/semikonduktor|semiconductor|\bchip|\bcip\b/i, /semiconductor/i, 'semikonduktor / chip'],
    [/\bai\b|kecerdasan buatan|artificial intelligence/i, /semiconductor|software|internet|computer|data processing|interactive media/i, 'terkait AI (chip, software, internet, komputer)'],
    [/\bbank|perbankan/i, /bank/i, 'bank'],
    [/asuransi|insurance/i, /insurance/i, 'asuransi'],
    [/energi|minyak|\bgas\b|\boil\b|batu ?bara/i, /energy|energi|oil|gas|coal|petroleum/i, 'energi'],
    [/farmasi|obat|pharma|biotek|biotech/i, /pharma|biotech|drug|biological/i, 'farmasi & bioteknologi'],
    [/kesehatan|health|rumah sakit|alat medis|medis/i, /health|kesehatan|medical|hospital|pharma/i, 'kesehatan'],
    [/ritel|retail|\btoko|supermarket/i, /retail|stores|department/i, 'ritel'],
    [/software|perangkat lunak|\bsaas\b|cloud|komputasi awan/i, /software|prepackaged|programming|data processing|computer/i, 'software & cloud'],
    [/teknologi|\btech\b/i, /technology|teknologi|software|semiconductor|computer|hardware/i, 'teknologi'],
    [/otomotif|\bmobil|kendaraan|\bev\b|listrik.*mobil/i, /auto|motor vehicle/i, 'otomotif'],
    [/properti|\breit|real estate/i, /real estate|reit|properti/i, 'properti'],
    [/utilitas|perusahaan listrik|\butility|\butilities/i, /utilit|electric|power generation/i, 'utilitas'],
    [/telekomunikasi|telko|telecom|operator seluler/i, /telecom|telephone|communication|komunikasi/i, 'telekomunikasi'],
    [/media|hiburan|streaming|game/i, /entertainment|media|broadcast|interactive|video/i, 'media & hiburan'],
    [/pertahanan|militer|defense|aerospace|dirgantara|pesawat/i, /aerospace|defense|aircraft/i, 'dirgantara & pertahanan'],
    [/maskapai|penerbangan|airline/i, /airline|air transport/i, 'maskapai'],
    [/makanan|minuman|consumer staples|\bf&b\b|barang konsumsi/i, /food|beverage|consumer staples|konsumen primer|konsumen pokok|household|tobacco/i, 'makanan, minuman & barang konsumsi'],
    [/manufaktur|industrial|mesin|alat berat/i, /industrial|industri\b|machinery|equipment/i, 'industri & mesin'],
    [/material|tambang|mining|kimia|baja|emas/i, /material|bahan baku|mining|chemical|metal|steel|gold/i, 'material & tambang'],
    [/keuangan|finansial|financial|investasi|broker|pembayaran|payment/i, /financ|keuangan|invest|broker|payment|capital market|bank/i, 'keuangan & pembayaran'],
    [/e-?commerce|belanja online|marketplace/i, /internet retail|catalog|e-commerce/i, 'e-commerce'],
    [/transportasi|logistik|kereta|truk|kapal/i, /transport|logistic|railroad|trucking|shipping|freight/i, 'transportasi & logistik'],
    [/konsumen|consumer discretionary|restoran|hotel|travel/i, /consumer discretionary|konsumen sekunder|restaurant|hotel|travel|leisure|apparel|autos/i, 'konsumen non-pokok']
];

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
    const satu = (b: any) => `${b.s} ${b.nama} | ${b.sektor || ''} | $${r2(b.harga)} | 1h ${r2(b.chg1d)}% 1b ${r2(b.chg1m)}% 3b ${r2(b.chg3m)}% | gabungan ${sk(b.skor?.semua)}${b.skor?.semua?.asli ? ` [DITAHAN dari ${b.skor.semua.asli}: data ${b.skor.semua.kurang.join(', ')} belum siap — jangan sebut sebagai sinyal]` : ''} · tek ${sk(b.skor?.teknikal)} · fund ${sk(b.skor?.fundamental)} · berita ${sk(b.skor?.berita)} · whales ${sk(b.skor?.whales)}${b.preset?.teknikal ? ` · preset tek ${b.preset.teknikal.persen}%` : ''}${b.preset?.fundamental ? ` · preset fund ${b.preset.fundamental.persen}%` : ''}`;
    const urut = [...baris].filter((b) => b.skor?.semua).sort((a, b) => b.skor.semua.skor - a.skor.semua.skor);
    L.push('', `# Skor gabungan teratas (dari ${baris.length} saham)`, ...urut.slice(0, 15).map(satu));
    L.push('', '# Skor gabungan terbawah', ...urut.slice(-8).reverse().map(satu));
    const pos = new Map(o.posisi.map((p) => [p.symbol, p]));
    const milik = baris.filter((b) => o.watch.includes(b.s) || pos.has(b.s));
    if (milik.length) L.push('', '# Watchlist & posisi Pak Rico', ...milik.map((b) => `${satu(b)}${pos.has(b.s) ? ` | POSISI: beli $${pos.get(b.s)!.entry} × ${pos.get(b.s)!.shares} lembar` : ' | watchlist'}`));

    // Kelompok industri/sektor yang disebut di pertanyaan → semua sahamnya (bukan cuma watchlist).
    const teksK = o.teks.toLowerCase();
    const kelompok = KELOMPOK.filter(([kata]) => kata.test(teksK));
    // Nama industri/sektor asli (Inggris) yang disebut langsung, mis. "semiconductors".
    const namaKel = Array.from(new Set(baris.flatMap((b) => [b.industri, b.sektor]).filter(Boolean) as string[]))
        .filter((n) => n.toLowerCase().split(/[^a-z]+/).some((w) => w.length >= 5 && new RegExp(`\\b${w}`).test(teksK)));
    const sudah = new Set<string>();
    for (const [, pola, label] of kelompok.slice(0, 3)) {
        const isi = urut.filter((b) => pola.test(`${b.sektor || ''} ${b.industri || ''}`)).slice(0, 35);
        if (!isi.length) continue; isi.forEach((b) => sudah.add(b.s));
        L.push('', `# Semua saham kelompok "${label}" di penyaring (${isi.length}, urut skor gabungan, tertinggi dulu)`, ...isi.map(satu));
    }
    for (const n of namaKel.slice(0, 2)) {
        const isi = urut.filter((b) => (b.industri === n || b.sektor === n) && !sudah.has(b.s)).slice(0, 30);
        if (isi.length) L.push('', `# Saham ${n} (${isi.length}, urut skor gabungan)`, ...isi.map(satu));
    }
    // Tanpa kelompok yang disebut: peta seluruh pasar per sektor (3 terkuat & 2 terlemah tiap sektor), supaya jawaban tidak terpaku watchlist.
    if (!kelompok.length && !namaKel.length) {
        const perSek = new Map<string, any[]>(); for (const b of urut) { const k = b.sektor || 'Lainnya'; (perSek.get(k) || perSek.set(k, []).get(k)!).push(b); }
        L.push('', '# Peta per sektor (3 skor tertinggi · 2 terendah)');
        for (const [k, xs] of perSek) L.push(`- ${k} (${xs.length}): ${xs.slice(0, 3).map((b) => `${b.s} ${sk(b.skor?.semua)}`).join(', ')}${xs.length > 4 ? ` … terendah ${xs.slice(-2).map((b) => `${b.s} ${sk(b.skor?.semua)}`).join(', ')}` : ''}`);
    }

    // Detail saham yang sedang dibuka / disebut di pertanyaan (kode ATAU nama perusahaan, mis. "Nvidia", "Coca-Cola")
    const kode = new Set(baris.map((b) => b.s));
    const lewatNama = baris.filter((b) => { const n = String(b.nama || '').toLowerCase().replace(/[.,]/g, '').split(/\s+/)[0]; return n && n.length >= 4 && !['first', 'american', 'united', 'general', 'national', 'international'].includes(n) && new RegExp(`\\b${n.replace(/[^a-z0-9-]/g, '')}\\b`).test(teksK); }).map((b) => b.s);
    const ALIAS: Record<string, string> = { tsmc: 'TSM', 'taiwan semi': 'TSM', alibaba: 'BABA', toyota: 'TM', novo: 'NVO', shopee: 'SE', garena: 'SE', temu: 'PDD', pinduoduo: 'PDD', google: 'GOOGL', alphabet: 'GOOGL', facebook: 'META', instagram: 'META', berkshire: 'BRK-B', 'coca cola': 'KO', 'coca-cola': 'KO', nubank: 'NU', mercadolibre: 'MELI', microstrategy: 'MSTR', grab: 'GRAB', unilever: 'UL', astrazeneca: 'AZN' };
    for (const [k, v] of Object.entries(ALIAS)) if (teksK.includes(k) && kode.has(v)) lewatNama.push(v);
    const disebut = [o.saham, ...((o.teks.toUpperCase().match(/\b[A-Z]{1,5}(?:-[A-Z])?\b/g) || []).filter((k) => kode.has(k))), ...lewatNama].filter(Boolean) as string[];
    for (const s of Array.from(new Set(disebut)).slice(0, 5)) {
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
