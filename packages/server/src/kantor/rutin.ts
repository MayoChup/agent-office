/**
 * Pekerjaan rutin tambahan supaya tiap AI punya jobdesk berulang (gotong royong), plus pengatur model hemat token.
 *  - Senin 08.00 WIB  Keuangan mingguan: Bima (cek anggaran) → Prita (proyeksi akhir bulan) → Uang (merangkum ke Pak Rico).
 *                     Yang dikirim ke AI hanya TOTAL per kategori — tanpa nama pihak, keterangan, atau nomor rekening.
 *  - Senin 10.00 WIB  Hana (HR) menata ulang model AI tiap anggota berdasarkan beban kerja (hanya opsi gratis).
 *  - Tiap jam         AI baru otomatis dibagi ke opsi model gratis supaya kuota tersebar.
 */
import fs from 'fs';
import path from 'path';
import type { RequestHandler, Express } from 'express';
import { ModelRouter } from './model';
import type { Papan } from './papan';
import type { Percakapan } from './percakapan';

export interface DepsRutin {
    app: Express; requireToken: RequestHandler; dataDir: string; hermesHome: string;
    roster: () => Array<{ id: string; nama: string; peran: string }>; papan: Papan; percakapan: Percakapan;
    llm: () => { complete: (sys: string, user: string, max: number, coba: number) => Promise<string | null | undefined> } | null | undefined;
    transaksi: () => Promise<Array<{ d: string; jenis: string; n: number; kat: string; status?: string }>>;
    batas: () => Record<string, number>;
    kabari: (t: string) => Promise<any>; idHr: string;
}
const hariWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

export function pasangRutin(d: DepsRutin) {
    const { app, requireToken, papan, percakapan } = d;
    // Kunci Gemini/Groq/xAI boleh ada di environment kantor ATAU di .env Hermes (yang diisi Pak Rico). Hanya nama kunci ini yang dibaca; nilainya tidak pernah ditampilkan.
    const BOLEH = /^(GEMINI_API_KEY|GEMINI_MODEL|GROQ_API_KEY|GROQ_MODEL|XAI_API_KEY|XAI_MODEL)$/;
    const envHermes: Record<string, string> = {};
    try {
        for (const baris of fs.readFileSync(path.join(d.hermesHome, '.env'), 'utf8').split('\n')) {
            const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)\s*$/.exec(baris); if (m && BOLEH.test(m[1])) envHermes[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
    } catch { /* tidak ada .env */ }
    const router = new ModelRouter(d.dataDir, d.hermesHome, { ...envHermes, ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v && (BOLEH.test(k) || k.startsWith('KANTOR_')))) });
    percakapan.router = router;
    const tim = () => d.roster().filter((a) => a.id !== 'sistem');
    const bagi = () => { try { router.aturAwal(tim().map((a) => a.id)); } catch (e: any) { console.warn('[Model] bagi awal:', e?.message || e); } };
    setTimeout(bagi, 20_000); setInterval(bagi, 3600_000);

    async function kerja(aiId: string, nama: string, judul: string, prompt: string): Promise<string> {
        if (d.roster().some((a) => a.id === aiId)) { try { return await percakapan.tugas(aiId, judul, prompt); } catch (e: any) { console.warn(`[Rutin] ${aiId}:`, e?.message || e); } }
        return papan.jalankan({ ai: aiId, nama: `${nama} · otak cadangan`, judul, sumber: 'tugas' }, async () => {
            const o = await d.llm()?.complete('Kamu anggota tim AI kantor yang teliti dan jujur. Jangan mengarang angka.', prompt, 1500, 3);
            if (!o) throw new Error('AI gratis tidak menjawab.'); return o;
        });
    }
    const nama = (id: string, cadang: string) => d.roster().find((a) => a.id === id)?.nama || cadang;

    /* ── HR menata model ── */
    let sibukModel = false;
    async function reviewModel(sebab: string) {
        if (sibukModel) throw new Error('Review model sedang berjalan.');
        sibukModel = true;
        try {
            const anggota = tim(); const hr = nama(d.idHr, 'Hana');
            const raw = await kerja(d.idHr, hr, `Menata model AI tim (${sebab})`, router.promptReview(anggota));
            const r = router.terapkanReview(raw, new Set(anggota.map((a) => a.id)));
            const nm = (id: string) => anggota.find((a) => a.id === id)?.nama || id;
            const teks = [`⚙️ **Penataan model AI (${sebab})**`, r.teks || 'Pembagian model sudah seimbang.', ...r.ubah.map((u) => `- ${nm(u.ai)}: ${u.dari} → ${u.ke} (${u.alasan})`)].join('\n');
            percakapan.pesan('grup', d.idHr, hr, teks);
            return r;
        } finally { sibukModel = false; }
    }

    /* ── Keuangan mingguan (Bima, Prita, Uang) ── */
    let sibukUang = false;
    async function keuanganMingguan(sebab: string) {
        if (sibukUang) throw new Error('Laporan keuangan mingguan sedang dibuat.');
        sibukUang = true;
        try {
            const tx = (await d.transaksi()).filter((t) => t.status !== 'Dihapus');
            const hari = hariWib(), bulan = hari.slice(0, 7), tgl = Number(hari.slice(8)), jmlHari = new Date(Date.UTC(Number(bulan.slice(0, 4)), Number(bulan.slice(5)), 0)).getUTCDate();
            const seminggu = new Date(Date.now() + 7 * 3600_000 - 7 * 86400_000).toISOString().slice(0, 10);
            const keluar = tx.filter((t) => t.jenis === 'Keluar');
            const jumlah = (arr: typeof tx) => { const m: Record<string, number> = {}; for (const t of arr) m[t.kat || 'Lainnya'] = (m[t.kat || 'Lainnya'] || 0) + Math.abs(t.n); return m; };
            const bln = jumlah(keluar.filter((t) => t.d.startsWith(bulan))), mg = jumlah(keluar.filter((t) => t.d >= seminggu)), batas = d.batas();
            const masukBln = tx.filter((t) => t.jenis === 'Masuk' && t.d.startsWith(bulan)).reduce((s, t) => s + Math.abs(t.n), 0);
            const kat = [...new Set([...Object.keys(bln), ...Object.keys(batas)])];
            if (!kat.length) return { lewati: 'belum ada transaksi' };
            const tabel = kat.map((k) => `- ${k}: bulan ini ${rp(bln[k] || 0)}${batas[k] ? ` dari anggaran ${rp(batas[k])} (${Math.round(((bln[k] || 0) / batas[k]) * 100)}%)` : ' (tanpa anggaran)'}, 7 hari terakhir ${rp(mg[k] || 0)}`).join('\n');
            const dasar = `DATA (total per kategori saja; hari ke-${tgl} dari ${jmlHari}; pemasukan bulan ini ${rp(masukBln)}):\n${tabel}`;
            const bima = nama('keuangan-budget', 'Bima'), prita = nama('keuangan-proyeksi', 'Prita'), uang = nama('keuangan', 'Uang');
            const cek = await kerja('keuangan-budget', bima, 'Cek anggaran mingguan', `Kamu ${bima}, pengawas anggaran. Dari DATA, sebut kategori yang sudah/hampir melewati anggaran (≥ 80%) dan yang aman, lalu beri 3 saran hemat yang konkret untuk minggu ini. Angka HANYA dari DATA. Maksimal 8 baris, Bahasa Indonesia.\n\n${dasar}`).catch(() => '');
            const proy = await kerja('keuangan-proyeksi', prita, 'Proyeksi akhir bulan', `Kamu ${prita}, analis proyeksi. Dari DATA, perkirakan total pengeluaran tiap kategori di akhir bulan dengan laju harian sejauh ini (total ÷ ${tgl} × ${jmlHari}); tandai yang diproyeksikan melewati anggaran. Tunjukkan hitungannya singkat. Maksimal 8 baris.\n\n${dasar}`).catch(() => '');
            const total = Object.values(bln).reduce((s, v) => s + v, 0);
            const teks = [`💰 **Laporan keuangan mingguan** (${sebab})`, `Pengeluaran bulan ini ${rp(total)} · pemasukan ${rp(masukBln)} · hari ke-${tgl}/${jmlHari}.`, '', `**${bima} — cek anggaran**`, cek.trim() || '(tidak ada jawaban)', '', `**${prita} — proyeksi akhir bulan**`, proy.trim() || '(tidak ada jawaban)'].join('\n');
            percakapan.pesan('keuangan', 'keuangan', uang, teks);
            papan.catat({ ai: 'keuangan', nama: uang, judul: 'Merangkum laporan keuangan mingguan untuk Pak Rico', sumber: 'tugas', status: 'selesai' });
            d.kabari(`💰 ${uang}: laporan keuangan mingguan siap — pengeluaran bulan ini ${rp(total)}. Buka Chat ${uang}.`).catch(() => undefined);
            return { ok: true };
        } finally { sibukUang = false; }
    }

    const fileTanda = path.join(d.dataDir, 'rutin.json');
    let tandai: Record<string, string> = {}; try { tandai = JSON.parse(fs.readFileSync(fileTanda, 'utf8')); } catch { /* baru */ }
    const tandaiSimpan = (t: Record<string, string>) => { tandai = t; try { fs.writeFileSync(fileTanda, JSON.stringify(t)); } catch { /* */ } };
    setInterval(() => {
        const w = new Date(Date.now() + 7 * 3600_000), jam = w.getUTCHours(), hari = hariWib();
        if (w.getUTCDay() !== 1) return;
        if (jam >= 8 && tandai.uang !== hari) { tandaiSimpan({ ...tandai, uang: hari }); keuanganMingguan('Senin').catch((e) => console.warn('[Rutin] keuangan:', e?.message || e)); }
        if (jam >= 10 && tandai.model !== hari) { tandaiSimpan({ ...tandai, model: hari }); reviewModel('Senin').catch((e) => console.warn('[Rutin] model:', e?.message || e)); }
    }, 900_000);

    const r = (fn: (req: any) => any): any => async (req: any, res: any) => { try { res.json({ ok: true, ...(await fn(req)) }); } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); } };
    app.get('/api/kantor/model', requireToken, r(() => ({ ...router.tampil(tim()), sibuk: sibukModel })));
    app.post('/api/kantor/model/atur', requireToken, r((req) => {
        const ai = String(req.body?.ai || ''); if (!tim().some((a) => a.id === ai)) throw new Error('AI tidak ditemukan.');
        if (req.body?.lepas) { router.lepasKunci(ai); return {}; }
        return { atur: router.setAtur(ai, String(req.body?.opsi || ''), 'rico', 'Dipilih Pak Rico', req.body?.kunci !== false) };
    }));
    app.post('/api/kantor/model/review', requireToken, r(() => { if (sibukModel) throw new Error('Review model sedang berjalan.'); reviewModel('diminta Pak Rico').catch((e) => console.warn('[Rutin] model:', e?.message || e)); return { sibuk: true }; }));
    app.post('/api/kantor/keuangan/mingguan', requireToken, r(() => { keuanganMingguan('diminta Pak Rico').catch((e) => console.warn('[Rutin] keuangan:', e?.message || e)); return { sibuk: true }; }));
    return router;
}
