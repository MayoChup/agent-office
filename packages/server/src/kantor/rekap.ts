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
    /** nama berkas: YYYY-MM-DD (pagi) atau YYYY-MM-DD_kHHMM (kilat) */ id: string; jenis: 'pagi' | 'kilat'; topik?: string;
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

const SISTEM_BARIS = [
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
];
/** Artikel ditulis dalam 3 bagian kecil (lebih cepat & lebih tahan untuk AI gratis maupun cadangan). */
const KEPALA = SISTEM_BARIS.slice(0, SISTEM_BARIS.findIndex((x) => x.startsWith('Balas PERSIS')));
const barisLabel = (l: string) => SISTEM_BARIS.find((x) => x.startsWith(`${l}:`))!;
const BAGIAN_TULIS: Array<{ nama: string; label: string[]; inti: string[]; kunci: string[]; token: number }> = [
    { nama: 'pembuka & pasar', label: ['JUDUL', 'SUBJUDUL', 'TLDR', 'KUTIPAN', 'PEMBUKA', 'PASAR'], inti: ['PEMBUKA'], kunci: ['tanggalSesi', 'pasarKemarin', 'beritaDunia', 'top'], token: 1600 },
    { nama: 'berita', label: ['BERITA'], inti: ['BERITA'], kunci: ['tanggalSesi', 'beritaDunia', 'petaDampakDariTimBerita', 'pasarKemarin'], token: 2000 },
    { nama: 'orang, analis & agenda', label: ['ORANG', 'ANALIS', 'AGENDA'], inti: ['ORANG', 'ANALIS', 'AGENDA'], kunci: ['tanggalSesi', 'beritaOrangKorporasi', 'orangDalamMembeli_SEC', 'analis', 'agenda'], token: 1800 },
    { nama: 'top 5 & penutup', label: ['TOP5', 'PENUTUP'], inti: ['TOP5'], kunci: ['tanggalSesi', 'pasarKemarin', 'top', 'catatanTop', 'agenda'], token: 1800 }
];
const sistemBagian = (labels: string[]) => [...KEPALA, 'Ini SATU BAGIAN dari artikel. Balas PERSIS dengan bagian berlabel berikut (huruf besar, diikuti titik dua), tanpa teks lain:', ...labels.map(barisLabel)].join('\n');

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
    const dataObj: Record<string, any> = ({
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
    const potong = (kunci: string[]) => JSON.stringify(Object.fromEntries(kunci.map((k) => [k, dataObj[k]])));
    let oleh = 'AI kantor';
    const ada = (t: string, l: string) => new RegExp(`(?:^|\\n)[*#\\s-]*${l}(?![A-Z_0-9])\\**\\s*:`, 'i').test(t);
    const catatan: string[] = []; // diagnosa per bagian, ikut di pesan galat
    // Semua bagian dicoba di AI gratis bersamaan; bagian yang gagal dicoba satu per satu di AI tim trading.
    const hasil = await Promise.all(BAGIAN_TULIS.map(async (bg) => {
        const sis = sistemBagian(bg.label), cek = (t: string) => bg.inti.some((l) => ada(t, l));
        if (!o.llm) { catatan.push(`${bg.nama}: AI gratis tidak tersedia`); return ''; }
        try {
            const t = String((await (o.llm as any).complete(sis, `DATA:\n${potong(bg.kunci)}`, bg.token, 2, false, cek)) || '');
            if (cek(t)) return t;
            const lg = String((o.llm as any).snapshot?.()?.lastError || '').slice(0, 120);
            catatan.push(`${bg.nama}: AI gratis ${t ? 'menjawab tanpa format' : 'tidak menjawab'}${lg ? ` (${lg})` : ''}`);
        } catch (e: any) { catatan.push(`${bg.nama}: AI gratis galat (${String(e?.message || e).slice(0, 100)})`); }
        return '';
    }));
    for (let i = 0; i < hasil.length; i++) {
        if (hasil[i] || !o.cadangan) continue;
        try {
            const t = await o.cadangan(`${sistemBagian(BAGIAN_TULIS[i].label)}\n\nDATA:\n${potong(BAGIAN_TULIS[i].kunci)}`);
            if (BAGIAN_TULIS[i].inti.some((l) => ada(t, l))) { hasil[i] = t; oleh = 'AI tim trading'; } else catatan.push(`${BAGIAN_TULIS[i].nama}: AI tim trading menjawab tanpa format`);
        } catch (e: any) { catatan.push(`${BAGIAN_TULIS[i].nama}: AI tim trading galat (${String(e?.message || e).slice(0, 100)})`); }
    }
    const teks = hasil.join('\n');
    if (catatan.length) console.warn('[Daily Recap]', catatan.join(' | '));
    if (!bagian(teks, 'PEMBUKA')) throw new Error(`AI gagal menulis bagian utama. ${catatan.join(' · ').slice(0, 600)}`);
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
        id: o.tgl, jenis: 'pagi', tgl: o.tgl, dibuat: Date.now(), oleh,
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
const ID_OK = /^\d{4}-\d{2}-\d{2}(_k\d{4})?$/;
export function simpanEdisi(dataDir: string, e: Edisi) { fs.mkdirSync(dir(dataDir), { recursive: true }); fs.writeFileSync(path.join(dir(dataDir), `${e.id || e.tgl}.json`), JSON.stringify(e)); }
export function daftarEdisi(dataDir: string): Array<{ id: string; tgl: string; judul: string; jenis: 'pagi' | 'kilat'; dibuat: number }> {
    try {
        return fs.readdirSync(dir(dataDir)).filter((f) => ID_OK.test(f.replace(/\.json$/, ''))).map((f) => {
            try { const e = JSON.parse(fs.readFileSync(path.join(dir(dataDir), f), 'utf8')); return { id: e.id || e.tgl, tgl: e.tgl, judul: e.judul, jenis: e.jenis || 'pagi', dibuat: e.dibuat || 0 }; } catch { return null; }
        }).filter(Boolean).sort((a: any, b: any) => b.dibuat - a.dibuat).slice(0, 200) as any;
    } catch { return []; }
}
export function bacaEdisi(dataDir: string, id: string): Edisi | null {
    if (!ID_OK.test(id)) return null;
    try { const e = JSON.parse(fs.readFileSync(path.join(dir(dataDir), `${id}.json`), 'utf8')); return { ...e, id: e.id || e.tgl, jenis: e.jenis || 'pagi' }; } catch { return null; }
}

/* ── Edisi kilat: terbit dalam hari yang sama untuk peristiwa terjadwal (FOMC/CPI/NFP) atau berita mendadak yang urgen ── */
const KATA_URGEN = /\b(fed|federal reserve|powell|rate (cut|hike)|interest rates?|inflation|cpi|jobs report|payrolls|tariffs?|trade war|sanctions?|war|invasion|attack|missile|strike[sd]?|ceasefire|default|bankrupt(cy)?|collapse|crash|plunge|halt(ed)?|emergency|recession|ceo (resigns|steps down|ousted|fired)|scandal|fraud|indicted|probe|antitrust|ban(s|ned)?|export controls?|opec|earthquake|hurricane|shutdown)\b/i;
const BUANG = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'as', 'at', 'by', 'with', 'is', 'are', 'its', 'after', 'over', 'from', 'says', 'say', 'new', 'us', 'u.s.', 'amid', 'will', 'could', 'may', 'more', 'than', 'what', 'how', 'why', 'be', 'that', 'this', 'it', 'up', 'down']);
const kata = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !BUANG.has(w)).map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)));
/** Kelompok judul yang membahas peristiwa sama dalam 3 jam terakhir, diliput ≥3 media berbeda & bertopik besar. */
export function deteksiUrgen(judul: JudulDunia[], kunciLama: Set<string>): Array<{ kunci: string; judul: JudulDunia[] }> {
    const baru = judul.filter((j) => j.at && Date.now() - j.at < 3 * 3600_000);
    const kelompok: Array<{ k: Set<string>; xs: JudulDunia[] }> = [];
    for (const j of baru) {
        const w = kata(j.t);
        const g = kelompok.find((x) => { let sama = 0; for (const a of w) if (x.k.has(a)) sama++; return sama >= 3 || sama / Math.max(1, Math.min(w.size, x.k.size)) >= 0.5; });
        if (g) { g.xs.push(j); for (const a of w) g.k.add(a); } else kelompok.push({ k: w, xs: [j] });
    }
    return kelompok
        .filter((g) => new Set(g.xs.map((x) => x.sumber.toLowerCase())).size >= 3 && g.xs.some((x) => KATA_URGEN.test(x.t)))
        .map((g) => ({ kunci: [...kata(g.xs[0].t)].sort().slice(0, 6).join(' '), judul: g.xs }))
        .filter((g) => ![...kunciLama].some((k) => { const a = new Set(k.split(' ')); let sama = 0; for (const w of g.kunci.split(' ')) if (a.has(w)) sama++; return sama >= 3; }));
}
const SISTEM_KILAT = [
    'Kamu penulis "Daily Recap · Kilat" di kantor Pak Rico: kabar kilat pasar saham AS berbahasa Indonesia untuk pembaca awam. Gaya santai, kalimat pendek, istilah dijelaskan singkat dalam kurung, **tebal** untuk poin penting. Ceritakan apa yang terjadi → kenapa penting → ke mana efeknya (sektor/saham). Setiap menyebut saham tulis $KODE (hanya kode di DATA). Setiap klaim dari berita beri penanda [Bxx].',
    'KEJUJURAN: pakai HANYA fakta dari DATA. Jangan mengarang angka, nama, atau tanggal. Kalau angka resmi (mis. hasil CPI) tidak ada di judul berita, katakan angkanya belum tersedia di sumber kantor. Bukan saran keuangan.',
    'Kalau setelah membaca DATA peristiwa ini ternyata TIDAK cukup penting untuk pasar saham AS (gosip kecil, berita lokal, berita lama), balas hanya: TIDAK_URGEN',
    'Selain itu balas PERSIS dengan bagian berlabel: JUDUL: (maks 12 kata) / SUBJUDUL: (1 kalimat) / TLDR: (tepat 3 butir "- ") / ISI: (2–4 paragraf, boleh sub-bagian "### judul") / DAMPAK: (butir "- " sektor/saham yang kena, arah naik/turun, alasan) / PANTAU: (2–3 kalimat yang perlu dipantau berikutnya)'
].join('\n');
export async function tulisKilat(o: { id: string; tgl: string; topik: string; dataDir: string; llm: Llm; cadangan?: (prompt: string) => Promise<string>; berita: JudulDunia[]; kodeSah: Record<string, string>; konteks: Record<string, any>; wajib: boolean }): Promise<Edisi | null> {
    const semua = o.berita.slice(0, 25).map((b, i) => ({ ...b, id: `B${i + 1}` }));
    const data = JSON.stringify({ peristiwa: o.topik, waktuWib: new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' '), berita: semua.map((b) => `[${b.id}] ${b.tgl} · ${b.sumber}: ${b.t}`), konteks: o.konteks });
    let teks = '', oleh = 'AI kantor';
    try { teks = String((o.llm ? await o.llm.complete(SISTEM_KILAT, `DATA:\n${data}`, 3000, 2) : '') || ''); } catch { /* cadangan */ }
    if (!/ISI\s*:/i.test(teks) && !/TIDAK_URGEN/.test(teks) && o.cadangan) { try { teks = await o.cadangan(`${SISTEM_KILAT}\n\nDATA:\n${data}`); oleh = 'AI tim trading'; } catch { /* gagal */ } }
    if (/TIDAK_URGEN/.test(teks) && !o.wajib) return null;
    const b = (l: string) => { const m = teks.match(new RegExp(`(?:^|\\n)[*#\\s-]*${l}\\**\\s*:\\s*\\**\\s*([\\s\\S]*?)(?=\\n[*#\\s-]*(?:JUDUL|SUBJUDUL|TLDR|ISI|DAMPAK|PANTAU)\\**\\s*:|$)`, 'i')); return (m?.[1] || '').trim(); };
    if (!b('ISI')) throw new Error('AI tidak memberi jawaban yang bisa dibaca untuk edisi kilat.');
    const butir = (t: string) => t.split('\n').map((x) => x.replace(/^[\s*•\-–]+/, '').trim()).filter(Boolean);
    const dipakai = new Set((teks.match(/\[B\d+\]/g) || []).map((x) => x.slice(1, -1)));
    const kodeDi = [...new Set((teks.match(/\$([A-Z][A-Z0-9.-]{0,6})\b/g) || []).map((x) => x.slice(1)))].filter((k) => o.kodeSah[k]);
    const e: Edisi = {
        id: o.id, jenis: 'kilat', topik: o.topik, tgl: o.tgl, dibuat: Date.now(), oleh,
        judul: b('JUDUL').replace(/\*\*/g, '').slice(0, 160), subjudul: b('SUBJUDUL').replace(/\*\*/g, '').slice(0, 300), tldr: butir(b('TLDR')).slice(0, 3), kutipan: '',
        badan: [{ id: 'pembuka', judul: '', md: b('ISI') }, { id: 'dampak', judul: 'Ke mana efeknya', md: b('DAMPAK') }, { id: 'pantau', judul: 'Yang perlu dipantau', md: b('PANTAU') }].filter((x) => x.md).map((x) => ({ ...x, md: rapikanKode(x.md, o.kodeSah) })),
        alasanTop: {}, top: [], catatanTop: '', pasar: null as any,
        sumber: semua.filter((x) => dipakai.has(x.id)).map((x) => ({ id: x.id, t: x.t, sumber: x.sumber, url: x.url })),
        kode: Object.fromEntries(kodeDi.map((k) => [k, o.kodeSah[k]]))
    };
    simpanEdisi(o.dataDir, e);
    return e;
}
