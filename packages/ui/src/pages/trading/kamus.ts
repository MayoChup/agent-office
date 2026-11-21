/**
 * Kamus indikator untuk tombol ⓘ: apa indikatornya, cara membaca, dan arti angka saham ini sekarang.
 * Status singkat (1–2 kata) dipakai di kartu; penjelasan lengkap hanya muncul di pop-up.
 * Semua bersifat edukasi, bukan saran beli/jual.
 */
import type { Baris } from './types';

export type Nada = 'up' | 'down' | 'netral';
export interface Bacaan { judul: string; nilai: string; status: string; nada: Nada; apa: string; baca: string; kini: string }

const a = (v: number, d = 1) => v.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const ada = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const kosong = (judul: string, apa: string, baca: string): Bacaan => ({ judul, nilai: '–', status: 'Belum ada', nada: 'netral', apa, baca, kini: 'Datanya belum tersedia untuk saham ini.' });

/* ── Teknikal ─────────────────────────────────────────────── */
export function rsi(b: Baris): Bacaan {
    const judul = 'RSI 14', apa = 'RSI (Relative Strength Index) mengukur seberapa kencang harga naik dibanding turun selama 14 hari bursa terakhir, dalam skala 0–100.';
    const baca = 'Di bawah 30 = jenuh jual (sudah turun banyak, sering memantul). 30–70 = wajar. Di atas 70 = jenuh beli (sudah naik banyak, rawan koreksi). Saat tren kuat, RSI bisa bertahan lama di atas 70 atau di bawah 30.';
    const v = b.rsi; if (!ada(v)) return kosong(judul, apa, baca);
    const [status, nada, kini] = v < 30 ? ['Jenuh jual', 'up', 'sudah masuk zona jenuh jual. Tekanan jual mulai berlebihan, peluang memantul lebih besar, tapi tunggu tanda balik arah.']
        : v < 45 ? ['Lemah', 'down', 'masih di sisi lemah. Penjual sedikit lebih dominan.']
        : v <= 55 ? ['Netral', 'netral', 'netral. Pembeli dan penjual seimbang.']
        : v <= 70 ? ['Kuat', 'up', 'di sisi kuat. Pembeli lebih dominan, belum berlebihan.']
        : ['Jenuh beli', 'down', 'sudah masuk zona jenuh beli. Kenaikan mulai berlebihan, rawan ambil untung.'];
    return { judul, nilai: a(v, 0), status, nada: nada as Nada, apa, baca, kini: `${b.s} sekarang ${a(v)}: ${kini}` };
}

export function macd(b: Baris): Bacaan {
    const judul = 'MACD', apa = 'MACD membandingkan rata-rata harga jangka pendek (12 hari) dan menengah (26 hari), lalu dibandingkan lagi dengan garis sinyalnya (9 hari). Gunanya menangkap perubahan momentum.';
    const baca = 'MACD memotong ke atas garis sinyal = momentum berbalik naik. Memotong ke bawah = momentum berbalik turun. Potongan yang masih baru (beberapa hari) lebih bermakna daripada yang sudah lama.';
    const s = b.sinyal || ({} as Baris['sinyal']);
    let atas: boolean | null = s.macdAtas ?? null, hari: number | null = s.macdHari ?? null;
    if (atas == null) { if (s.macdBullish != null) { atas = true; hari = s.macdBullish; } else if (s.macdBearish != null) { atas = false; hari = s.macdBearish; } }
    if (atas == null) return kosong(judul, apa, baca);
    const kapan = hari == null ? '' : hari === 0 ? 'hari ini' : `${hari} hari lalu`;
    const baru = hari != null && hari <= 5;
    return {
        judul, nilai: atas ? 'Naik' : 'Turun', status: kapan ? (hari! > 60 ? 'sudah lama' : kapan) : atas ? 'momentum naik' : 'momentum turun', nada: atas ? 'up' : 'down', apa, baca,
        kini: `${b.s}: MACD ${atas ? 'di atas' : 'di bawah'} garis sinyal${kapan ? `, memotong ${kapan}` : ''}. ${atas ? (baru ? 'Momentum baru saja berbalik naik.' : 'Momentum naik masih berjalan.') : baru ? 'Momentum baru saja berbalik turun.' : 'Momentum turun masih berjalan.'}`
    };
}

export function ma(b: Baris, n: 50 | 200): Bacaan {
    const judul = `MA${n}`, v = n === 50 ? b.ma50 : b.ma200;
    const apa = `MA${n} adalah rata-rata harga penutupan ${n} hari bursa terakhir (${n === 50 ? '± 2,5 bulan' : '± 10 bulan'}). Dipakai untuk melihat arah tren ${n === 50 ? 'menengah' : 'jangka panjang'}.`;
    const baca = `Harga di atas MA${n} = tren ${n === 50 ? 'menengah' : 'panjang'} naik. Di bawahnya = tren turun. MA50 memotong MA200 ke atas disebut golden cross (tanda kuat naik), ke bawah disebut death cross.`;
    if (!ada(v)) return kosong(judul, apa, baca);
    const jarak = (b.harga / v - 1) * 100;
    return { judul, nilai: `$${a(v, 2)}`, status: `${jarak >= 0 ? '+' : '−'}${a(Math.abs(jarak))}%`, nada: jarak >= 0 ? 'up' : 'down', apa, baca, kini: `Harga ${b.s} ${a(Math.abs(jarak))}% ${jarak >= 0 ? 'di atas' : 'di bawah'} MA${n}: tren ${n === 50 ? 'menengah' : 'panjang'} sedang ${jarak >= 0 ? 'naik' : 'turun'}.${b.sinyal?.goldenCross != null && n === 200 ? ` Golden cross terjadi ${b.sinyal.goldenCross} hari lalu.` : ''}${b.sinyal?.deathCross != null && n === 200 ? ` Death cross terjadi ${b.sinyal.deathCross} hari lalu.` : ''}` };
}

export function volume(b: Baris): Bacaan {
    const judul = 'Volume', apa = 'Volume hari ini dibandingkan rata-rata 20 hari bursa terakhir. Menunjukkan seberapa ramai saham ini diperdagangkan.';
    const baca = 'Sekitar 1× = biasa. Di atas 1,5× = ramai, ada minat besar. Di atas 2× = sangat ramai (lonjakan). Gerak harga yang disertai volume besar lebih bisa dipercaya daripada gerak dengan volume sepi.';
    const v = b.volX; if (!ada(v)) return kosong(judul, apa, baca);
    const status = v >= 2 ? 'Lonjakan' : v >= 1.5 ? 'Ramai' : v >= 0.7 ? 'Biasa' : 'Sepi';
    return { judul, nilai: `${a(v)}×`, status, nada: 'netral', apa, baca, kini: `${b.s} hari ini diperdagangkan ${a(v)}× rata-rata: ${status.toLowerCase()}. Arah harga hari ini ${b.chg1d >= 0 ? 'naik' : 'turun'} ${a(Math.abs(b.chg1d))}%.` };
}

export function atr(b: Baris): Bacaan {
    const judul = 'ATR (gerak harian)', apa = 'ATR (Average True Range) adalah rata-rata jarak gerak harga per hari. Di sini ditulis sebagai persen dari harga.';
    const baca = 'Makin besar ATR, makin liar sahamnya. Berguna untuk menakar stop loss: stop yang lebih sempit dari 1× ATR mudah tersentuh oleh gerak harian biasa.';
    const v = b.x?.atr; if (!ada(v) || !b.harga) return kosong(judul, apa, baca);
    const p = (v / b.harga) * 100;
    return { judul, nilai: `±${a(p)}%`, status: p >= 3.5 ? 'Liar' : p >= 2 ? 'Sedang' : 'Tenang', nada: 'netral', apa, baca, kini: `${b.s} rata-rata bergerak ±$${a(v, 2)} (±${a(p)}%) per hari.` };
}

export function posisi52(b: Baris): Bacaan {
    const judul = 'Rentang 52 minggu', apa = 'Harga terendah dan tertinggi penutupan selama setahun terakhir, dan posisi harga sekarang di antaranya.';
    const baca = 'Dekat tertinggi = saham sedang kuat (bisa tembus naik, bisa juga tertahan). Dekat terendah = saham sedang lemah atau sedang diskon.';
    const hi = b.sinyal?.hi52, lo = b.sinyal?.lo52; if (!ada(hi) || !ada(lo) || hi <= lo) return kosong(judul, apa, baca);
    const pos = ((b.harga - lo) / (hi - lo)) * 100, dariHi = (1 - b.harga / hi) * 100;
    return { judul, nilai: `${a(Math.max(0, Math.min(100, pos)), 0)}%`, status: dariHi < 1 ? 'Di puncak' : `−${a(dariHi)}% dari puncak`, nada: pos >= 50 ? 'up' : 'down', apa, baca, kini: `Rentang setahun ${b.s}: $${a(lo, 2)} – $${a(hi, 2)}. Harga sekarang ${dariHi < 1 ? 'di sekitar puncak setahun' : `${a(dariHi)}% di bawah puncak`}.` };
}

export function momentum(b: Baris, k: 'chg1m' | 'chg3m' | 'chg1y'): Bacaan {
    const lbl = { chg1m: '1 bulan', chg3m: '3 bulan', chg1y: '1 tahun' }[k];
    const v = b[k];
    const apa = `Perubahan harga ${b.s} selama ${lbl} terakhir.`, baca = 'Dipakai untuk melihat momentum. Saham yang naik konsisten di 1 bulan, 3 bulan, dan 1 tahun biasanya sedang dalam tren kuat.';
    if (!ada(v)) return kosong(`Kinerja ${lbl}`, apa, baca);
    return { judul: `Kinerja ${lbl}`, nilai: `${v >= 0 ? '+' : '−'}${a(Math.abs(v))}%`, status: v >= 0 ? 'naik' : 'turun', nada: v >= 0 ? 'up' : 'down', apa, baca, kini: `${b.s} ${v >= 0 ? 'naik' : 'turun'} ${a(Math.abs(v))}% dalam ${lbl}.` };
}

/* ── Fundamental ──────────────────────────────────────────── */
type KF = 'roe' | 'roa' | 'per' | 'pbv' | 'der' | 'npm' | 'revGrowth' | 'ps' | 'cr' | 'epsCagr3' | 'fcf';
const F: Record<KF, { judul: string; satuan: '%' | '×' | '$'; apa: string; baca: string; nilai: (v: number) => [string, Nada, string] }> = {
    per: {
        judul: 'PER', satuan: '×', apa: 'PER (Price to Earnings Ratio) = harga saham dibagi laba per saham setahun. Artinya: berapa tahun laba yang Bapak "bayar" untuk satu lembar saham.',
        baca: 'Rata-rata S&P 500 sekitar 20–25×. Di bawah 15× = relatif murah. 15–25× = wajar. Di atas 30× = mahal, biasanya karena pasar berharap labanya tumbuh cepat. PER negatif = perusahaan sedang rugi. Bandingkan dengan saham sejenis di industri yang sama.',
        nilai: (v) => v < 0 ? ['Rugi', 'down', 'perusahaan sedang rugi, jadi PER tidak bisa dipakai untuk menilai murah/mahal.'] : v < 15 ? ['Murah', 'up', 'relatif murah dibanding rata-rata pasar.'] : v <= 25 ? ['Wajar', 'netral', 'di kisaran wajar rata-rata pasar.'] : v <= 40 ? ['Mahal', 'down', 'tergolong mahal; pasar berharap laba tumbuh cepat.'] : ['Sangat mahal', 'down', 'sangat mahal; harga sudah memperhitungkan pertumbuhan laba yang tinggi sekali.']
    },
    pbv: {
        judul: 'PBV', satuan: '×', apa: 'PBV (Price to Book Value) = harga saham dibagi nilai buku (aset dikurangi utang) per saham. Artinya: Bapak membayar berapa kali nilai bersih perusahaan di atas kertas.',
        baca: 'PBV 1× = harga sama dengan nilai bersihnya. Di bawah 1× = di bawah nilai buku (bisa murah, bisa juga karena bisnisnya bermasalah). Perusahaan teknologi dan merek kuat wajar punya PBV tinggi karena aset utamanya tidak tercatat (merek, software). Paling berguna untuk bank dan industri padat aset.',
        nilai: (v) => v < 0 ? ['Ekuitas negatif', 'down', 'nilai bukunya negatif (utang lebih besar dari aset), biasanya karena pembelian kembali saham besar-besaran atau rugi lama.'] : v < 1 ? ['Di bawah buku', 'up', 'harganya di bawah nilai bersih perusahaan.'] : v <= 3 ? ['Wajar', 'netral', 'di kisaran wajar.'] : v <= 8 ? ['Premium', 'netral', 'pasar menghargai perusahaan jauh di atas nilai bukunya, biasanya karena laba tinggi atau merek kuat.'] : ['Sangat premium', 'down', 'sangat tinggi; wajar hanya kalau ROE-nya juga sangat tinggi.']
    },
    roe: {
        judul: 'ROE', satuan: '%', apa: 'ROE (Return on Equity) = laba bersih setahun dibagi modal pemegang saham. Artinya: dari setiap $100 modal pemilik, perusahaan menghasilkan laba berapa.',
        baca: 'Di atas 15% = bagus. Di atas 20% = sangat bagus (ciri perusahaan berkualitas). Di bawah 10% = kurang efisien. Hati-hati kalau ROE tinggi karena utang besar: cek juga DER.',
        nilai: (v) => v < 0 ? ['Rugi', 'down', 'perusahaan sedang rugi.'] : v < 10 ? ['Rendah', 'down', 'kurang efisien memutar modal.'] : v < 15 ? ['Cukup', 'netral', 'cukup, belum istimewa.'] : v < 20 ? ['Bagus', 'up', 'bagus.'] : ['Sangat bagus', 'up', 'sangat bagus; modal pemilik diputar dengan efisien.']
    },
    roa: {
        judul: 'ROA', satuan: '%', apa: 'ROA (Return on Assets) = laba bersih dibagi total aset. Mengukur seberapa efisien semua aset (termasuk yang dibiayai utang) menghasilkan laba.',
        baca: 'Di atas 5% = bagus untuk kebanyakan industri. Di atas 10% = sangat bagus. Bank wajar punya ROA rendah (sekitar 1%) karena asetnya besar.',
        nilai: (v) => v < 0 ? ['Rugi', 'down', 'perusahaan sedang rugi.'] : v < 5 ? ['Rendah', 'netral', 'tergolong rendah (wajar untuk bank/industri padat aset).'] : v < 10 ? ['Bagus', 'up', 'bagus.'] : ['Sangat bagus', 'up', 'sangat bagus.']
    },
    der: {
        judul: 'DER', satuan: '×', apa: 'DER (Debt to Equity Ratio) = total utang dibagi modal pemilik. Mengukur seberapa besar perusahaan dibiayai utang.',
        baca: 'Di bawah 0,5× = utang ringan. 0,5–1,5× = wajar. Di atas 2× = utang berat, makin rentan saat bunga naik atau bisnis melemah. Bank dan utilitas wajar punya DER lebih tinggi.',
        nilai: (v) => v < 0 ? ['Ekuitas negatif', 'down', 'modalnya negatif, jadi DER tidak bermakna; cek arus kas dan laba.'] : v < 0.5 ? ['Ringan', 'up', 'utangnya ringan.'] : v <= 1.5 ? ['Wajar', 'netral', 'utangnya wajar.'] : v <= 2.5 ? ['Berat', 'down', 'utangnya cukup berat.'] : ['Sangat berat', 'down', 'utangnya sangat berat.']
    },
    npm: {
        judul: 'Margin laba bersih', satuan: '%', apa: 'Margin laba bersih = laba bersih dibagi pendapatan. Dari setiap $100 penjualan, berapa yang tersisa sebagai laba.',
        baca: 'Di atas 20% = sangat tinggi (bisnis punya daya tawar kuat). 10–20% = bagus. Di bawah 5% = tipis, rentan kalau biaya naik. Ritel dan distribusi wajar bermargin tipis.',
        nilai: (v) => v < 0 ? ['Rugi', 'down', 'perusahaan sedang rugi.'] : v < 5 ? ['Tipis', 'down', 'tipis.'] : v < 10 ? ['Cukup', 'netral', 'cukup.'] : v < 20 ? ['Bagus', 'up', 'bagus.'] : ['Sangat tinggi', 'up', 'sangat tinggi.']
    },
    revGrowth: {
        judul: 'Pertumbuhan pendapatan', satuan: '%', apa: 'Kenaikan pendapatan (penjualan) dibanding tahun sebelumnya.',
        baca: 'Di atas 10%/tahun = tumbuh baik. Di atas 20% = tumbuh cepat. Negatif = penjualan menyusut. Pertumbuhan inilah yang biasanya membenarkan PER tinggi.',
        nilai: (v) => v < 0 ? ['Menyusut', 'down', 'penjualannya menyusut.'] : v < 5 ? ['Lambat', 'netral', 'tumbuh lambat.'] : v < 20 ? ['Tumbuh', 'up', 'tumbuh dengan baik.'] : ['Tumbuh cepat', 'up', 'tumbuh cepat.']
    },
    ps: {
        judul: 'P/S', satuan: '×', apa: 'P/S (Price to Sales) = nilai pasar perusahaan dibagi pendapatan setahun. Berguna untuk perusahaan yang belum untung.',
        baca: 'Di bawah 2× = murah. 2–5× = wajar. Di atas 10× = mahal, hanya wajar untuk perusahaan yang tumbuh sangat cepat dan bermargin tinggi.',
        nilai: (v) => v < 2 ? ['Murah', 'up', 'relatif murah.'] : v <= 5 ? ['Wajar', 'netral', 'wajar.'] : v <= 10 ? ['Mahal', 'down', 'mahal.'] : ['Sangat mahal', 'down', 'sangat mahal.']
    },
    cr: {
        judul: 'Current ratio', satuan: '×', apa: 'Current ratio = aset lancar dibagi utang lancar (jatuh tempo < 1 tahun). Mengukur kemampuan membayar kewajiban jangka pendek.',
        baca: 'Di atas 1,5× = aman. 1–1,5× = cukup. Di bawah 1× = utang jangka pendek lebih besar dari aset lancar; perlu dicek arus kasnya. Perusahaan besar dengan arus kas kuat kadang sengaja di bawah 1×.',
        nilai: (v) => v < 1 ? ['Ketat', 'down', 'likuiditas jangka pendeknya ketat.'] : v < 1.5 ? ['Cukup', 'netral', 'cukup.'] : ['Aman', 'up', 'aman.']
    },
    epsCagr3: {
        judul: 'Laba tumbuh/tahun (3 th)', satuan: '%', apa: 'Rata-rata pertumbuhan laba per saham per tahun selama 3 tahun terakhir.',
        baca: 'Di atas 10%/tahun = konsisten tumbuh. Di atas 20% = tumbuh cepat. Negatif = laba menurun.',
        nilai: (v) => v < 0 ? ['Menurun', 'down', 'labanya menurun.'] : v < 10 ? ['Lambat', 'netral', 'tumbuh lambat.'] : v < 20 ? ['Tumbuh', 'up', 'tumbuh dengan baik.'] : ['Tumbuh cepat', 'up', 'tumbuh cepat.']
    },
    fcf: {
        judul: 'Arus kas bebas', satuan: '$', apa: 'Arus kas bebas (free cash flow) = uang tunai dari operasi dikurangi belanja modal. Ini uang yang benar-benar bisa dipakai untuk dividen, membeli kembali saham, atau membayar utang.',
        baca: 'Positif dan tumbuh = sehat. Negatif = perusahaan membakar uang; wajar untuk yang sedang ekspansi besar, tapi perlu sumber dana lain.',
        nilai: (v) => v < 0 ? ['Negatif', 'down', 'perusahaan sedang membakar uang tunai.'] : ['Positif', 'up', 'perusahaan menghasilkan uang tunai bersih.']
    }
};
export function fundamental(b: Baris, k: KF): Bacaan {
    const d = F[k]; const v = (b.f as any)?.[k];
    if (!ada(v)) return kosong(d.judul, d.apa, d.baca);
    const [status, nada, kini] = d.nilai(v);
    const nilai = d.satuan === '$' ? `${v < 0 ? '−' : ''}$${a(Math.abs(v) / 1000)} M` : `${a(v)}${d.satuan}`;
    return { judul: d.judul, nilai, status, nada, apa: d.apa, baca: d.baca, kini: `${b.s}: ${d.judul} ${nilai}, ${kini}` };
}

export function kapitalisasi(b: Baris, teks: string): Bacaan {
    return { judul: 'Kapitalisasi pasar', nilai: teks, status: '', nada: 'netral', apa: 'Nilai seluruh saham perusahaan di pasar (harga × jumlah saham beredar).', baca: 'Di atas $200 M = mega cap, di atas $10 M = large cap, $2–10 M = mid cap, di bawahnya small cap (M = miliar). Makin besar biasanya makin stabil, makin kecil biasanya makin liar.', kini: `${b.s} bernilai ${teks} di pasar.` };
}

/* ── Whales ───────────────────────────────────────────────── */
export function cmf(b: Baris): Bacaan {
    const judul = 'CMF 20', apa = 'CMF (Chaikin Money Flow) mengukur apakah uang mengalir masuk atau keluar selama 20 hari, dari posisi harga penutupan di rentang hariannya dan volumenya. Skala −1 sampai +1.';
    const baca = 'Di atas +0,1 = uang besar cenderung masuk (akumulasi). Di bawah −0,1 = uang cenderung keluar (distribusi). Di antaranya = netral.';
    const v = b.x?.cmf; if (!ada(v)) return kosong(judul, apa, baca);
    const [status, nada] = v > 0.1 ? ['Akumulasi', 'up'] : v < -0.1 ? ['Distribusi', 'down'] : ['Netral', 'netral'];
    return { judul, nilai: a(v, 2), status, nada: nada as Nada, apa, baca, kini: `${b.s}: CMF ${a(v, 2)}, ${status.toLowerCase()}.` };
}
export function obv(b: Baris): Bacaan {
    const judul = 'OBV 20 hari', apa = 'OBV (On-Balance Volume) menjumlah volume hari naik dikurangi volume hari turun selama 20 hari, dibagi total volumenya. Skala −1 sampai +1.';
    const baca = 'Di atas +0,2 = volume lebih banyak terjadi saat harga naik (pembeli dominan). Di bawah −0,2 = volume lebih banyak saat harga turun (penjual dominan).';
    const v = b.x?.obv; if (!ada(v)) return kosong(judul, apa, baca);
    const [status, nada] = v > 0.2 ? ['Pembeli dominan', 'up'] : v < -0.2 ? ['Penjual dominan', 'down'] : ['Seimbang', 'netral'];
    return { judul, nilai: a(v, 2), status, nada: nada as Nada, apa, baca, kini: `${b.s}: OBV ${a(v, 2)}, ${status.toLowerCase()}.` };
}
export const ORANG_DALAM = { apa: 'Transaksi direksi, komisaris, dan pemegang saham besar atas saham perusahaannya sendiri, dari laporan resmi Form 4 ke SEC (90 hari terakhir).', baca: 'Pembelian orang dalam dengan uang pribadi sering dianggap tanda yakin. Penjualan lebih sulit dibaca karena bisa untuk keperluan pribadi, pajak, atau jadwal rutin.' };

/* ── Kronos ───────────────────────────────────────────────── */
export const INFO_KRONOS: Record<'target' | 'stop' | 'rr' | 'harapan' | 'naik', string> = {
    target: 'Kenaikan dari harga masuk sampai target profil ini. Angka kecil di bawahnya = peluang harga menyentuh target LEBIH DULU sebelum stop, dari ratusan jalur harga yang dibuat Kronos.',
    stop: 'Penurunan dari harga masuk sampai batas rugi (stop loss) profil ini. Angka kecil di bawahnya = peluang harga menyentuh stop lebih dulu.',
    rr: 'Risiko : hasil. 1:1,5 artinya potensi untung 1,5× potensi rugi. Hijau ≥ 1,5 · kuning 1–1,5 · merah < 1. R:R saja belum cukup; lihat juga peluangnya (Harapan).',
    harapan: 'Rata-rata hasil per posisi kalau profil ini diambil berkali-kali: peluang kena target × untung + peluang kena stop × rugi + sisanya ditutup di akhir periode. Plus = secara statistik menguntungkan, minus = merugikan. Belum termasuk biaya broker.',
    naik: 'Porsi jalur Kronos yang harganya di akhir periode lebih tinggi dari harga sekarang, tanpa memperhitungkan target atau stop. Sama untuk ketiga profil.'
};
