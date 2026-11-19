import crypto from 'crypto';

/**
 * Impor PDF mutasi / e-statement rekening (BCA, Mandiri, BRI, BNI, Jago, dll.).
 * Dibaca di VPS dengan pdf.js — PDF/isinya TIDAK dikirim ke AI mana pun (data rekening pribadi).
 * Pengecualian yang disetujui Pak Rico (19 Nov 2026): hanya NAMA TENANT pengeluaran berkategori "Lainnya" yang ditanyakan ke Uang untuk ditebak kategorinya.
 * Cara membaca dibuat umum: tiap baris yang diawali tanggal = satu transaksi; nominal & saldo diambil dari angka uang di baris itu;
 * arah (masuk/keluar) dari penanda DB/CR, posisi kolom Debet/Kredit, atau selisih saldo berjalan.
 */

const nativeImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

export interface Tok { x: number; s: string }
export type Baris = Tok[];
export interface MutasiTx { idx: number; tanggal: string; jenis: 'Masuk' | 'Keluar'; nominal: number; saldo: number | null; ket: string; pihak: string; yakin: boolean }
export interface HasilMutasi { bank: string; periode: { dari: string; sampai: string }; saldoAwal: number | null; saldoAkhir: number | null; transaksi: MutasiTx[]; halaman: number; peringatan: string[] }

/* ── 1. PDF → baris teks (dengan posisi x) ── */
export async function bacaPdf(buf: Buffer, password?: string): Promise<{ halaman: Baris[][] }> {
    let pdfjs: any;
    try { pdfjs = await nativeImport('pdfjs-dist/legacy/build/pdf.mjs'); } catch { throw new Error('Pembaca PDF belum terpasang di server (tunggu pembaruan otomatis berikutnya).'); }
    let doc: any;
    try {
        doc = await pdfjs.getDocument({ data: new Uint8Array(buf), password: password || undefined, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    } catch (e: any) {
        if (e?.name === 'PasswordException') { const err: any = new Error(e.code === 2 ? 'Kata sandi PDF salah.' : 'PDF ini dikunci kata sandi. Masukkan kata sandinya (biasanya tanggal lahir / kode dari bank).'); err.butuhSandi = true; throw err; }
        throw new Error(`PDF tidak bisa dibaca: ${e?.message || e}`);
    }
    const halaman: Baris[][] = [];
    for (let p = 1; p <= Math.min(doc.numPages, 60); p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const items = (tc.items as any[]).filter((it) => typeof it.str === 'string' && it.str.trim()).map((it) => ({ x: it.transform[4], y: it.transform[5], s: String(it.str), w: it.width || 0 }));
        // Kelompokkan per baris (y sama ± 2.5pt), urut dari atas.
        items.sort((a, b) => b.y - a.y || a.x - b.x);
        const lines: Array<{ y: number; t: Array<{ x: number; s: string; w: number }> }> = [];
        for (const it of items) {
            const l = lines.find((q) => Math.abs(q.y - it.y) <= 2.5);
            if (l) l.t.push(it); else lines.push({ y: it.y, t: [it] });
        }
        halaman.push(lines.sort((a, b) => b.y - a.y).map((l) => {
            const t = l.t.sort((a, b) => a.x - b.x);
            // Gabungkan potongan yang berdempetan (pdf.js sering memecah satu kata/angka).
            const out: Tok[] = [];
            let prevEnd = -1e9;
            for (const k of t) {
                const last = out[out.length - 1];
                if (last && k.x - prevEnd < 1.2) last.s += k.s; else out.push({ x: k.x, s: k.s });
                prevEnd = k.x + k.w;
            }
            return out.map((o) => ({ x: o.x, s: o.s.trim() })).filter((o) => o.s);
        }));
        page.cleanup?.();
    }
    await doc.destroy?.();
    return { halaman };
}

/* ── 2. Angka & tanggal ── */
const UANG = /^[-+]?(?:Rp\.?\s?)?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?(?:\s?(?:CR|DB|Cr|Db|D|K))?$/;
export function angkaUang(raw: string): { n: number; tanda: 'DB' | 'CR' | null; negatif: boolean } | null {
    let s = raw.trim();
    let tanda: 'DB' | 'CR' | null = null;
    const m = /\s?(CR|DB|Cr|Db|D|K)$/.exec(s);
    if (m && /\d/.test(s.slice(0, m.index))) { tanda = /^(CR|K)$/i.test(m[1]) ? 'CR' : 'DB'; s = s.slice(0, m.index); }
    const negatif = /^-/.test(s) || /^\(.*\)$/.test(s);
    s = s.replace(/^[-+(]|\)$/g, '').replace(/^Rp\.?\s?/i, '');
    if (!/\d/.test(s)) return null;
    let n: number;
    if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s) || /^\d+\.\d{2}$/.test(s)) n = Number(s.replace(/,/g, ''));
    else if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+,\d{2}$/.test(s)) n = Number(s.replace(/\./g, '').replace(',', '.'));
    else if (/^\d+$/.test(s)) n = Number(s);
    else return null;
    return Number.isFinite(n) ? { n, tanda, negatif } : null;
}
/** Token yang "terlihat seperti uang": punya pemisah ribuan atau 2 desimal (supaya nomor referensi tidak ikut terbaca). */
const tampakUang = (s: string) => UANG.test(s) && (/\d[.,]\d{3}/.test(s) || /[.,]\d{2}(\s?(CR|DB|D|K))?$/i.test(s));

const BLN: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
function tanggalDi(s: string, tahun: number): { iso: string; panjang: number } | null {
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, panjang: m[0].length };
    m = /^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?(?!\d)/.exec(s);
    if (m) {
        const d = +m[1], b = +m[2]; let y = m[3] ? +m[3] : tahun; if (y < 100) y += 2000;
        if (d >= 1 && d <= 31 && b >= 1 && b <= 12) return { iso: `${y}-${String(b).padStart(2, '0')}-${String(d).padStart(2, '0')}`, panjang: m[0].length };
    }
    m = /^(\d{1,2})[\s\-]+([A-Za-z]{3})[a-z]*[\s\-,]*(\d{2,4})?/.exec(s);
    if (m && BLN[m[2].toLowerCase()]) {
        let y = m[3] ? +m[3] : tahun; if (y < 100) y += 2000;
        return { iso: `${y}-${String(BLN[m[2].toLowerCase()]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`, panjang: m[0].length };
    }
    return null;
}

/* ── 3. Baris → transaksi ── */
const BUKAN_TX = /saldo\s*awal|saldo\s*akhir|opening\s*balance|closing\s*balance|beginning\s*balance|ending\s*balance|mutasi\s*(cr|db|debet|kredit)|total\s*(mutasi|debet|kredit|debit|credit)|^total\b|bersambung|halaman|page\s*\d/i;
const DEBET_H = /^(debet|debit|db|mutasi\s*debet|keluar|withdrawal|penarikan)$/i;
const KREDIT_H = /^(kredit|credit|cr|mutasi\s*kredit|masuk|deposit|setoran)$/i;

export function urai(halaman: Baris[][], bank = ''): HasilMutasi {
    const semua = halaman.flat();
    const teks = semua.map((l) => l.map((t) => t.s).join(' ')).join('\n');
    const peringatan: string[] = [];
    // Tahun: dari "PERIODE ... 2026" atau tahun yang paling sering muncul.
    const thn = (() => {
        const p = /periode[^\n]{0,60}?(20\d{2})/i.exec(teks); if (p) return +p[1];
        const c = new Map<number, number>(); for (const m of teks.matchAll(/\b(20\d{2})\b/g)) c.set(+m[1], (c.get(+m[1]) || 0) + 1);
        return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || new Date().getFullYear();
    })();
    // Posisi kolom Debet/Kredit dari baris judul (kalau ada).
    let xDebet: number | null = null, xKredit: number | null = null;
    for (const l of semua) {
        const d = l.find((t) => DEBET_H.test(t.s)), k = l.find((t) => KREDIT_H.test(t.s));
        if (d && k) { xDebet = d.x; xKredit = k.x; break; }
    }
    let saldoAwal: number | null = null, saldoAkhir: number | null = null;
    for (const l of semua) {
        const s = l.map((t) => t.s).join(' ');
        if (/saldo\s*awal|opening\s*balance|beginning\s*balance/i.test(s)) { const u = l.filter((t) => tampakUang(t.s)).map((t) => angkaUang(t.s)).filter(Boolean); if (u.length && saldoAwal == null) saldoAwal = u[u.length - 1]!.n; }
        if (/saldo\s*akhir|closing\s*balance|ending\s*balance/i.test(s)) { const u = l.filter((t) => tampakUang(t.s)).map((t) => angkaUang(t.s)).filter(Boolean); if (u.length) saldoAkhir = u[u.length - 1]!.n; }
    }

    // Blok transaksi: baris diawali tanggal + baris lanjutan tanpa tanggal.
    type Blok = { tgl: string; baris: Baris[] };
    const blok: Blok[] = [];
    let cur: Blok | null = null;
    let bulanTerakhir = 0, tahunJalan = thn;
    for (const l of semua) {
        if (!l.length) continue;
        const s = l.map((t) => t.s).join(' ');
        const tg = tanggalDi(l[0].s.length >= 4 ? l[0].s : s, tahunJalan) || tanggalDi(s, tahunJalan);
        const adaUang = l.some((t) => tampakUang(t.s));
        if (tg && adaUang && !BUKAN_TX.test(s)) {
            // Tahun berganti di tengah (Des → Jan) untuk format tanpa tahun.
            const b = +tg.iso.slice(5, 7);
            if (bulanTerakhir === 12 && b === 1 && !/\d{4}/.test(s.slice(0, tg.panjang))) { tahunJalan++; tg.iso = `${tahunJalan}${tg.iso.slice(4)}`; }
            bulanTerakhir = b;
            cur = { tgl: tg.iso, baris: [l] };
            blok.push(cur);
        } else if (cur && !BUKAN_TX.test(s) && cur.baris.length < 6 && !tg) {
            // Lanjutan keterangan, hanya kalau tidak berisi angka uang (baris ringkasan/halaman baru diabaikan).
            if (!adaUang) cur.baris.push(l); else cur = null;
        } else if (tg || BUKAN_TX.test(s)) cur = null;
    }

    const out: MutasiTx[] = [];
    let saldoPrev = saldoAwal;
    blok.forEach((bk, idx) => {
        const l0 = bk.baris[0];
        const uangTok = l0.map((t, i) => ({ t, i, u: tampakUang(t.s) ? angkaUang(t.s) : null })).filter((x) => x.u && x.i > 0);
        // Penanda DB/CR terpisah di token berikutnya.
        for (const x of uangTok) { const nx = l0[x.i + 1]; if (nx && /^(DB|CR|D|K)$/i.test(nx.s) && !x.u!.tanda) x.u!.tanda = /^(CR|K)$/i.test(nx.s) ? 'CR' : 'DB'; }
        const nz = uangTok.filter((x) => x.u!.n !== 0);
        if (!nz.length) return;
        let nominalTok = nz[0], saldo: number | null = null;
        if (nz.length >= 2) { nominalTok = nz[nz.length - 2]; saldo = nz[nz.length - 1].u!.n; }
        const nominal = nominalTok.u!.n;
        let jenis: 'Masuk' | 'Keluar' | null = null, yakin = true;
        if (nominalTok.u!.tanda) jenis = nominalTok.u!.tanda === 'CR' ? 'Masuk' : 'Keluar';
        else if (nominalTok.u!.negatif) jenis = 'Keluar';
        else if (saldoPrev != null && saldo != null && Math.abs(Math.abs(saldo - saldoPrev) - nominal) < 1) jenis = saldo > saldoPrev ? 'Masuk' : 'Keluar';
        else if (xDebet != null && xKredit != null) jenis = Math.abs(nominalTok.t.x - xKredit) < Math.abs(nominalTok.t.x - xDebet) ? 'Masuk' : 'Keluar';
        const ketMentah = [...l0.filter((_, i) => i > 0 && !uangTok.some((x) => x.i === i) && !/^(DB|CR|D|K)$/i.test(l0[i].s)), ...bk.baris.slice(1).flat()].map((t) => t.s).join(' ').replace(/\s+/g, ' ').trim();
        const ket = ketMentah.replace(/^\d{1,2}[/\-.]\d{1,2}([/\-.]\d{2,4})?\s*/, '').slice(0, 200);
        if (!jenis) {
            jenis = /\b(CR|KREDIT|SETORAN|BUNGA|TERIMA|DARI|INCOMING|REFUND)\b/i.test(ket) ? 'Masuk' : 'Keluar';
            yakin = false;
        }
        if (saldo != null) saldoPrev = saldo;
        else if (saldoPrev != null) saldoPrev = saldoPrev + (jenis === 'Masuk' ? nominal : -nominal);
        out.push({ idx, tanggal: bk.tgl, jenis, nominal: Math.round(nominal), saldo: saldo != null ? Math.round(saldo) : null, ket, pihak: pihakDari(ket), yakin });
    });
    if (saldoAkhir == null) saldoAkhir = [...out].reverse().find((t) => t.saldo != null)?.saldo ?? null;
    if (saldoAwal != null && saldoAkhir != null) {
        const hitung = saldoAwal + out.reduce((a, t) => a + (t.jenis === 'Masuk' ? t.nominal : -t.nominal), 0);
        if (Math.abs(hitung - saldoAkhir) > 1) peringatan.push(`Saldo awal + mutasi = ${Math.round(hitung).toLocaleString('id-ID')}, tapi saldo akhir di PDF ${Math.round(saldoAkhir).toLocaleString('id-ID')}. Ada transaksi yang mungkin terlewat/salah arah — cek daftar di bawah.`);
    }
    if (!out.length) peringatan.push('Tidak ada transaksi yang terbaca. Pastikan ini PDF mutasi asli dari bank (bukan foto/scan).');
    const tgl = out.map((t) => t.tanggal).sort();
    return { bank, periode: { dari: tgl[0] || '', sampai: tgl[tgl.length - 1] || '' }, saldoAwal: saldoAwal != null ? Math.round(saldoAwal) : null, saldoAkhir: saldoAkhir != null ? Math.round(saldoAkhir) : null, transaksi: out, halaman: halaman.length, peringatan };
}

/** Nama pihak dari keterangan bank: buang kode transaksi, nomor referensi, dan kata teknis. */
export function pihakDari(ket: string): string {
    const s = ket
        .replace(/\b(TRSF|TRANSFER|TRF|E-?BANKING|M-?BANKING|MB|IB|BI-?FAST|FAST|SKN|RTGS|KR|DB|CR|OTOMATIS|DEBIT|KREDIT|BIAYA ADM|QRIS|QR|PEMBAYARAN|PEMBELIAN|PAYMENT|PURCHASE|SWITCHING|FLAZZ|KARTU|TARIKAN ATM|TARIK TUNAI|SETORAN|KE|DARI|TO|FROM|VA|VIRTUAL ACCOUNT|BCA|MANDIRI|BRI|BNI)\b/gi, ' ')
        .replace(/\b[\dA-Z]*\d[\dA-Z/\-.:]*\b/g, ' ') // kode/nomor referensi
        .replace(/[^A-Za-z&' .]+/g, ' ').replace(/\s+/g, ' ').trim();
    const p = s.split(' ').slice(0, 5).join(' ').slice(0, 60);
    return p.length >= 3 ? p : ket.replace(/\s+/g, ' ').trim().slice(0, 40);
}

/* ── 4. Cocokkan dengan transaksi yang sudah tercatat ── */
export interface TxAda { id: string; d: string; bank: string; jenis: string; n: number; pihak: string; ket: string }
export function cocokkan(akun: string, mut: MutasiTx[], ada: TxAda[], periode: { dari: string; sampai: string }) {
    const samaAkun = (b: string) => b.toLowerCase().replace(/\s/g, '') === akun.toLowerCase().replace(/\s/g, '');
    const kandidat = ada.filter((t) => samaAkun(t.bank));
    const dipakai = new Set<string>();
    const hari = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000;
    const hasil = mut.map((m) => {
        const arahCocok = (t: TxAda) => t.jenis === m.jenis || t.jenis === 'Antar Rekening';
        const c = kandidat.filter((t) => !dipakai.has(t.id) && Math.abs(t.n - m.nominal) <= 1 && arahCocok(t) && hari(t.d, m.tanggal) <= 3)
            .sort((a, b) => hari(a.d, m.tanggal) - hari(b.d, m.tanggal))[0];
        if (c) dipakai.add(c.id);
        return { ...m, status: c ? 'cocok' as const : 'baru' as const, cocok: c ? { id: c.id, d: c.d, pihak: c.pihak, ket: c.ket } : null, id: idMutasi(akun, m) };
    });
    // Tercatat di kantor untuk akun & periode ini, tapi tidak ada di mutasi bank → mungkin dobel / salah akun.
    const lebih = periode.dari ? kandidat.filter((t) => !dipakai.has(t.id) && t.d >= periode.dari && t.d <= periode.sampai) : [];
    return { hasil, lebih };
}
export function idMutasi(akun: string, m: { tanggal: string; nominal: number; jenis: string; ket: string; idx: number }) {
    return `mutasi-${crypto.createHash('sha1').update(`${akun}|${m.tanggal}|${m.nominal}|${m.jenis}|${m.ket}|${m.idx}`).digest('hex').slice(0, 14)}`;
}
