/**
 * Daily Recap: artikel harian (bahasa santai) tentang berita dunia & saham yang paling berdampak, kabar orang penting,
 * agenda, dan Top 5 sinyal terbaik dari SEMUA rencana pegang posisi (1/5/20/60 hari bursa).
 *
 * Angka (pasar, Top 5, target, R:R, harapan) dihitung di sini; AI hanya menulis narasinya dari data ini
 * dan dilarang mengarang peristiwa/nama/angka. Terbit sekali per sesi bursa AS (setelah ±06.30 WIB). Disimpan per tanggal.
 */
import fs from 'fs';
import path from 'path';
import type { JudulDunia } from './beritaTerkait';

export interface CalonTop { s: string; nama: string; sektor: string; H: number; gaya: string; jenis: 'momentum' | 'pantul' | 'swing'; harga: number; skor: number; label: string; nilai: number;
    target: { nama: string; harga: number; pct: number; peluang: number; rr: number | null; harapan: number | null }; stop: { harga: number; pct: number }; masuk: [number, number];
    bukti: boolean; tanda: string[]; faktor: Record<string, string | null> }
export interface Edisi {
    tgl: string; dibuat: number; oleh: string;
    judul: string; subjudul: string; tldr: string[]; kutipan: string; badan: Array<{ id: string; judul: string; md: string }>;
    alasanTop: Record<string, string>; top: CalonTop[]; catatanTop: string;
    pasar: { spy: number | null; naik: number; turun: number; sektorAtas: Array<{ nama: string; chg: number }>; sektorBawah: Array<{ nama: string; chg: number }>; naikTerbesar: Array<{ s: string; nama: string; chg: number }>; turunTerbesar: Array<{ s: string; nama: string; chg: number }> };
    sumber: Array<{ id: string; t: string; sumber: string; url: string }>;
    /** kode → nama, untuk tautan $KODE di artikel */ kode: Record<string, string>;
}

const GAYA: Array<[number, string]> = [[1, 'Kilat (±1 hari)'], [5, 'Swing pendek (±5 hari)'], [20, 'Swing (±20 hari)'], [60, 'Posisi (±60 hari)']];
const SEKTOR_MAKS = 2;

/** Top 5 lintas rencana posisi: tiap saham diambil rencana terbaiknya, lalu disaring & dibuat beragam. */
export function pilihTop(dataH: (H: number) => any, labaDalam: (s: string) => number | null): { top: CalonTop[]; catatan: string } {
    const terbaik = new Map<string, CalonTop>();
    for (const [H, gaya] of GAYA) {
        const d = dataH(H); const bukti = !!d?.teknikalBukti?.terbukti;
        for (const b of d?.baris || []) {
            const g = b.skor?.semua; const pr = b.x?.proyeksi;
            if (!g || g.asli || !pr?.target?.length || g.skor < 0.15) continue; // minimal "Beli", sinyal tidak ditahan
            const hl = labaDalam(b.s); if (hl != null && hl >= 0 && hl <= 5) continue; // laporan laba ≤5 hari: terlalu liar
            if ((b.mcap ?? b.f?.mcap ?? 0) < 2000 || (b.volX ?? 1) < 0.3) continue; // terlalu kecil/sepi
            const t = [...pr.target].sort((a: any, z: any) => (z.harapan ?? z.nilai) - (a.harapan ?? a.nilai))[0];
            const harapan = t.harapan ?? null; if (harapan == null || harapan <= 0) continue;
            const risk = Math.abs(pr.stop?.pct || 0) || 5;
            const eR = Math.min(1, harapan / risk);                    // harapan dalam satuan risiko
            const dk = b.diskon, wh = b.skor?.whales?.skor ?? 0, br = b.skor?.berita?.skor ?? 0;
            const tanda: string[] = [];
            let nilai = g.skor + eR * 1.5 + (t.peluang / 100) * 0.3 + (bukti ? 0.15 : -0.15);
            if (dk && dk.tahap === 'balik') { nilai += 0.15; tanda.push('pantul: mulai berbalik'); } else if (dk && dk.tahap === 'zona') { nilai += 0.08; tanda.push('pantul: zona beli'); }
            if (wh >= 0.15) { nilai += 0.1; tanda.push('dana besar masuk'); }
            if (br >= 0.15) { nilai += 0.05; tanda.push('berita positif'); }
            if (bukti) tanda.push(`teknikal ±${H} hari terbukti di uji mundur`);
            const jenis: CalonTop['jenis'] = dk && dk.tahap !== 'pantau' ? 'pantul' : b.x?.trenLabel === 'Momentum' ? 'momentum' : 'swing';
            const c: CalonTop = {
                s: b.s, nama: b.nama, sektor: b.sektor || 'Lainnya', H, gaya, jenis, harga: b.harga, skor: Math.round((g.skor + 1) * 50), label: g.label, nilai: +nilai.toFixed(3),
                target: { nama: t.nama, harga: t.harga, pct: t.pct, peluang: t.peluang, rr: t.rr ?? null, harapan },
                stop: { harga: pr.stop.harga, pct: pr.stop.pct }, masuk: [+(b.harga - (b.x?.atr || 0) * 0.5).toFixed(2), b.harga], bukti, tanda,
                faktor: Object.fromEntries(['teknikal', 'fundamental', 'berita', 'whales'].map((k) => [k, b.skor?.[k]?.label ?? null]))
            };
            const lama = terbaik.get(b.s); if (!lama || c.nilai > lama.nilai) terbaik.set(b.s, c);
        }
    }
    const urut = [...terbaik.values()].sort((a, b) => b.nilai - a.nilai);
    const top: CalonTop[] = []; const perSektor = new Map<string, number>();
    for (const c of urut) {
        if ((perSektor.get(c.sektor) || 0) >= SEKTOR_MAKS) continue;
        // Usahakan jenis beragam: jenis yang sudah 3× hanya boleh masuk kalau nilainya jauh di atas calon berikutnya.
        if (top.filter((x) => x.jenis === c.jenis).length >= 3 && urut.some((o) => !top.includes(o) && o !== c && o.jenis !== c.jenis && o.nilai > c.nilai - 0.25 && (perSektor.get(o.sektor) || 0) < SEKTOR_MAKS)) continue;
        top.push(c); perSektor.set(c.sektor, (perSektor.get(c.sektor) || 0) + 1);
        if (top.length >= 5) break;
    }
    const catatan = top.length === 0 ? 'Hari ini tidak ada sinyal yang lolos semua syarat (minimal Beli, harapan positif, tidak dekat laporan laba). Kadang tidak ikut main adalah keputusan terbaik.'
        : top.length < 5 ? `Hari ini hanya ${top.length} saham yang lolos semua syarat — sisanya tidak dipaksakan.` : '';
    return { top, catatan };
}

const SISTEM = [
    'Kamu penulis "Daily Recap" di kantor Pak Rico: newsletter pasar saham AS & dunia berbahasa Indonesia untuk pembaca awam yang sibuk.',
    '',
    'GAYA (wajib): santai seperti ngobrol dengan teman yang paham pasar — hidup, enak dibaca, menjaga perhatian. Kalimat pendek. Boleh sapaan ringan dan perumpamaan. Tiap istilah teknis dijelaskan singkat dalam kurung saat pertama muncul. Pakai **tebal** untuk poin penting dan *miring* untuk penekanan, secukupnya. Ceritakan SEBAB → AKIBAT: apa yang terjadi, kenapa, dan ke mana efeknya (sektor/saham mana naik atau turun).',
    'TAUTAN (wajib): setiap menyebut saham, tulis kodenya dengan format $KODE (mis. $NVDA, $AAPL) — hanya kode yang ada di DATA. Setiap klaim dari berita beri penanda sumber [Bxx] tepat setelah kalimatnya.',
    'KEJUJURAN (wajib): pakai HANYA fakta dari DATA. Jangan mengarang peristiwa, nama orang, tanggal, atau angka. Setiap klaim dari berita beri penanda sumber seperti [B12] (id dari daftar berita). Kalau data suatu bagian kosong/tipis, tulis singkat saja atau lewati — jangan mengisi dengan karangan. Angka harga pakai $, perubahan pakai %. Ini analisis, bukan saran keuangan; jangan menjanjikan untung.',
    '',
    'Balas PERSIS dengan bagian berlabel berikut (huruf besar, diikuti titik dua), tanpa teks lain:',
    'JUDUL: headline yang menggoda dibaca, maks 12 kata',
    'SUBJUDUL: satu kalimat penjelas di bawah judul',
    'TLDR: tepat 3 butir diawali "- ", masing-masing satu kalimat inti',
    'KUTIPAN: satu kalimat paling "nempel" dari artikel ini (untuk kutipan sorotan), tanpa tanda kutip',
    'PEMBUKA: 2–3 kalimat pembuka yang bikin penasaran',
    'PASAR: 1 paragraf: gerak pasar kemarin (S&P 500, naik/turun, sektor terkuat & terlemah, saham yang paling bergerak) dan kenapa',
    'BERITA: 3–5 sub-bagian, tiap sub-bagian diawali baris "### <judul menarik>" lalu 1–2 paragraf: apa yang terjadi [Bxx], kenapa penting, dan ke mana efeknya (sebut sektor/saham dari data)',
    'ORANG: kabar orang penting & aksi korporasi (CEO mundur/diangkat, skandal, akuisisi, orang dalam membeli besar) dengan dampaknya; butir diawali "- ". Kalau tidak ada di data, tulis satu kalimat bahwa hari ini sepi',
    'ANALIS: kata para analis/expert (bank & lembaga riset) dari data "analis": konsensus, target harga rata-rata vs harga sekarang, dan perubahan rating terbaru (sebut nama lembaganya & tanggal). 1 paragraf pendek + butir "- " per saham. Kalau data analis kosong, lewati dengan satu kalimat',
    'AGENDA: butir diawali "- " untuk jadwal penting hari ini & minggu ini dari data (laporan laba, data ekonomi FOMC/CPI/NFP), dengan tanggal & kenapa perlu diperhatikan',
    'TOP5: satu baris per saham di daftar top, berbentuk "KODE: 2–3 kalimat santai kenapa saham ini masuk (pakai tanda & faktor dari data) dan satu risiko utamanya". Jangan menambah saham di luar daftar',
    'PENUTUP: 1 paragraf sikap umum hari ini + pengingat bijak soal risiko'
].join('\n');

const LABEL = ['JUDUL', 'SUBJUDUL', 'TLDR', 'KUTIPAN', 'PEMBUKA', 'PASAR', 'BERITA', 'ORANG', 'ANALIS', 'AGENDA', 'TOP5', 'PENUTUP'];
function bagian(t: string, label: string) {
    const lain = LABEL.join('|');
    const m = t.match(new RegExp(`(?:^|\\n)[*#\\s-]*${label}(?![A-Z_0-9])\\**\\s*:\\s*\\**\\s*([\\s\\S]*?)(?=\\n[*#\\s-]*(?:${lain})(?![A-Z_0-9])\\**\\s*:|$)`, 'i'));
    return (m?.[1] || '').trim();
}

/** $KODE yang tidak ada di daftar saham kantor → teks biasa (supaya tidak jadi tautan ke halaman kosong). */
function rapikanKode(md: string, sah: Record<string, string>) { return md.replace(/\$([A-Z][A-Z0-9.-]{0,6})\b/g, (m, k) => (sah[k] ? `$${k}` : k)); }
type Llm = { complete(system: string, user: string, maxTokens?: number, attempts?: number): Promise<string | null> } | null | undefined;
export async function tulisEdisi(o: {
    tgl: string; dataDir: string; llm: Llm; cadangan?: (prompt: string) => Promise<string>;
    pasar: Edisi['pasar']; top: CalonTop[]; catatanTop: string; dunia: JudulDunia[]; orang: JudulDunia[]; tema: Array<{ judul: string; ringkas: string; dampak: Array<{ nama: string; arah: number; alasan: string }> }>;
    agenda: string[]; orangDalam: string[]; analis: Record<string, any>; kodeSah: Record<string, string>;
}): Promise<Edisi> {
    if (!o.llm && !o.cadangan) throw new Error('AI belum tersedia');
    const semuaBerita = [...o.dunia, ...o.orang].map((b, i) => ({ ...b, id: `B${i + 1}` }));
    const data = JSON.stringify({
        tanggalSesi: o.tgl, pasarKemarin: o.pasar,
        beritaDunia: semuaBerita.filter((b) => b.topik !== 'Orang & korporasi').map((b) => `[${b.id}] ${b.tgl} · ${b.topik} · ${b.sumber}: ${b.t}`),
        beritaOrangKorporasi: semuaBerita.filter((b) => b.topik === 'Orang & korporasi').map((b) => `[${b.id}] ${b.tgl} · ${b.sumber}: ${b.t}`),
        petaDampakDariTimBerita: o.tema.slice(0, 8).map((t) => ({ tema: t.judul, ringkas: t.ringkas, dampak: t.dampak.slice(0, 6).map((d) => `${d.nama} ${d.arah > 0 ? 'naik' : d.arah < 0 ? 'turun' : 'netral'}: ${d.alasan}`) })),
        orangDalamMembeli_SEC: o.orangDalam,
        analis: o.analis,
        agenda: o.agenda,
        top: o.top.map((c) => ({ kode: c.s, nama: c.nama, sektor: c.sektor, rencana: c.gaya, jenis: c.jenis, harga: c.harga, labelSinyal: c.label, skor: c.skor, target: `${c.target.nama} $${c.target.harga} (+${c.target.pct}%, peluang ${c.target.peluang}%)`, batasRugi: `$${c.stop.harga} (${c.stop.pct}%)`, rr: c.target.rr, harapan_persen: c.target.harapan, tanda: c.tanda, faktor: c.faktor })),
        catatanTop: o.catatanTop
    });
    let teks = '', oleh = 'AI kantor', galat = '';
    for (let coba = 0; coba < 2 && !bagian(teks, 'PEMBUKA'); coba++) {
        try {
            if (coba === 0 && o.llm) teks = String((await o.llm.complete(SISTEM, `DATA:\n${data}`, 6000, 2)) || '');
            else if (o.cadangan) { teks = await o.cadangan(`${SISTEM}\n\nDATA:\n${data}`); oleh = 'AI tim trading'; }
        } catch (e: any) { galat = String(e?.message || e).slice(0, 160); }
    }
    if (!bagian(teks, 'PEMBUKA')) throw new Error(galat ? `AI gagal menulis (${galat}). Coba lagi nanti.` : 'AI tidak memberi jawaban yang bisa dibaca. Coba lagi nanti.');
    const butir = (t: string) => t.split('\n').map((x) => x.replace(/^[\s*•\-–]+/, '').trim()).filter(Boolean);
    const alasanTop: Record<string, string> = {};
    for (const baris of bagian(teks, 'TOP5').split('\n')) { const m = baris.replace(/^[\s*•\-–#]+/, '').match(/^\**([A-Z][A-Z0-9.-]{0,6})\**\s*[:—–-]\s*(.+)$/); if (m && o.top.some((c) => c.s === m[1])) alasanTop[m[1]] = rapikanKode(m[2].trim(), o.kodeSah); }
    const badan = [
        { id: 'pembuka', judul: '', md: bagian(teks, 'PEMBUKA') },
        { id: 'pasar', judul: 'Pasar kemarin', md: bagian(teks, 'PASAR') },
        { id: 'berita', judul: 'Berita yang menggerakkan pasar', md: bagian(teks, 'BERITA') },
        { id: 'orang', judul: 'Kabar orang penting', md: bagian(teks, 'ORANG') },
        { id: 'analis', judul: 'Kata para analis', md: bagian(teks, 'ANALIS') },
        { id: 'agenda', judul: 'Yang ditunggu', md: bagian(teks, 'AGENDA') },
        { id: 'penutup', judul: 'Jadi, hari ini gimana?', md: bagian(teks, 'PENUTUP') }
    ].filter((x) => x.md).map((x) => ({ ...x, md: rapikanKode(x.md, o.kodeSah) }));
    const dipakai = new Set((teks.match(/\[B\d+\]/g) || []).map((x) => x.slice(1, -1)));
    const e: Edisi = {
        tgl: o.tgl, dibuat: Date.now(), oleh,
        judul: bagian(teks, 'JUDUL').replace(/\*\*/g, '').slice(0, 160), subjudul: bagian(teks, 'SUBJUDUL').replace(/\*\*/g, '').slice(0, 300),
        tldr: butir(bagian(teks, 'TLDR')).slice(0, 3), kutipan: bagian(teks, 'KUTIPAN').replace(/^["“]|["”]$/g, '').slice(0, 240), badan,
        alasanTop, top: o.top, catatanTop: o.catatanTop, pasar: o.pasar,
        sumber: semuaBerita.filter((b) => dipakai.has(b.id)).map((b) => ({ id: b.id, t: b.t, sumber: b.sumber, url: b.url })),
        kode: Object.fromEntries([...new Set([...(teks.match(/\$([A-Z][A-Z0-9.-]{0,6})\b/g) || []).map((x) => x.slice(1)), ...o.top.map((c) => c.s), ...o.pasar.naikTerbesar.map((x) => x.s), ...o.pasar.turunTerbesar.map((x) => x.s)])].filter((k) => o.kodeSah[k]).map((k) => [k, o.kodeSah[k]]))
    };
    simpanEdisi(o.dataDir, e);
    return e;
}

const dir = (dataDir: string) => path.join(dataDir, 'rekap');
export function simpanEdisi(dataDir: string, e: Edisi) { fs.mkdirSync(dir(dataDir), { recursive: true }); fs.writeFileSync(path.join(dir(dataDir), `${e.tgl}.json`), JSON.stringify(e)); }
export function daftarEdisi(dataDir: string): Array<{ tgl: string; judul: string }> {
    try {
        return fs.readdirSync(dir(dataDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse().slice(0, 120)
            .map((f) => { try { const e = JSON.parse(fs.readFileSync(path.join(dir(dataDir), f), 'utf8')); return { tgl: e.tgl, judul: e.judul }; } catch { return null; } }).filter(Boolean) as any;
    } catch { return []; }
}
export function bacaEdisi(dataDir: string, tgl: string): Edisi | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return null;
    try { return JSON.parse(fs.readFileSync(path.join(dir(dataDir), `${tgl}.json`), 'utf8')); } catch { return null; }
}
