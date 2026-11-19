/**
 * Pekerjaan rutin tambahan supaya tiap AI punya jobdesk berulang (gotong royong), plus pengatur model hemat token.
 *  - Senin 08.00 WIB  Keuangan mingguan: Bima (cek anggaran) → Prita (proyeksi akhir bulan) → Uang (merangkum ke Pak Rico).
 *                     Yang dikirim ke AI hanya TOTAL per kategori — tanpa nama pihak, keterangan, atau nomor rekening.
 *  - Senin 10.00 WIB  Hana (HR) menata ulang model AI tiap anggota berdasarkan beban kerja (hanya opsi gratis).
 *  - Tiap jam         AI baru otomatis dibagi ke opsi model gratis supaya kuota tersebar.
 *  - Jumat 16.00      Sekar menulis "Ringkasan minggu ini" ke Catatan (kerja tim, catatan Bapak, agenda minggu depan).
 *  - Sabtu 09.00      Trading mingguan: Raka (fundamental watchlist) + Sari (smart money) → Dito (rencana) → Dodi (laporan di Catatan).
 *  - Minggu 10.00     Eca: laporan penyimpanan Berkas (hanya angka; nama berkas tidak dikirim ke AI).
 *  - Minggu 19.00     Nina: ide konten dari berita minggu ini untuk tiap akun sosmed → masuk ke bahan ide tim Konten.
 *  - Tanggal 1        Sasa: rekap pengeluaran bulan lalu vs bulan sebelumnya.
 * Peta "siapa menyumbang apa" di tiap fitur: GOTONG (ditampilkan di Papan kerja → Gotong royong).
 */
import { execFile } from 'child_process';
import ATUR_OTAK_FREELLM from './skrip/atur-otak-freellm.sh';
import ATUR_PAGAR from './skrip/atur-pagar.sh';
import fs from 'fs';
import path from 'path';
import type { RequestHandler, Express } from 'express';
import { ModelRouter } from './model';
import { FreeLlmApi } from './freeLlmApi';
import type { Papan } from './papan';
import type { Percakapan } from './percakapan';

export interface DepsRutin {
    app: Express; requireToken: RequestHandler; dataDir: string; hermesHome: string;
    roster: () => Array<{ id: string; nama: string; peran: string }>; papan: Papan; percakapan: Percakapan;
    llm: () => { complete: (sys: string, user: string, max: number, coba: number) => Promise<string | null | undefined> } | null | undefined;
    transaksi: () => Promise<Array<{ d: string; jenis: string; n: number; kat: string; status?: string }>>;
    batas: () => Record<string, number>;
    kabari: (t: string) => Promise<any>; idHr: string;
    catatan: { tulis: (rel: string, isi: string) => Promise<any> };
    saham: () => { watchlist: string[]; detail: (s: string) => any };
    agenda: (hari: number) => Promise<Array<{ judul: string; mulai: string; seharian: boolean; tempat: string }>>;
    berkas: { root: string; kuota: number };
    kr: () => { post: Array<{ kat: string; judul: string; sub?: string; dibuat: number }>; catatan: Array<{ postId: string; teks: string; at: number }>; judulPost: (id: string) => string };
    sosmed: () => Array<{ id: string; nama: string; platform: string; niche: string }>;
    sosmedIde: (teks: string) => void;
    berat: () => { model: string; perHari: number; terpakai: number };
}

const NAMA_CADANG: Record<string, string> = { default: 'Joni', hr: 'Hana', kurator: 'Kirana', keuangan: 'Uang', 'keuangan-budget': 'Bima', 'keuangan-proyeksi': 'Prita', 'keuangan-penasihat': 'Laras', eca: 'Eca', 'eca-sheets': 'Sasa', 'eca-docs': 'Dodi', 'eca-slides': 'Putri', sekretaris: 'Sekar', trading: 'Dito', 'trading-berita': 'Nina', 'trading-fundamental': 'Raka', 'trading-smartmoney': 'Sari', sosmed: 'Maya', 'sosmed-riset': 'Tara', 'sosmed-penulis': 'Lala', 'sosmed-produksi': 'Vino', 'sosmed-komunitas': 'Dea' };
/** Peta gotong royong: tiap fitur dikerjakan bersama beberapa AI. kunci = potongan judul di Papan kerja (kosong = pekerjaan apa pun dari AI itu). */
export const GOTONG: Array<{ fitur: string; ikon: string; ai: string; tugas: string; jadwal: string; kunci: string }> = [
    { fitur: 'Keuangan', ikon: '💰', ai: 'keuangan', tugas: 'Merapikan kategori transaksi "Lainnya" dari nama tenant (QRIS)', jadwal: 'Tiap 3 jam + tiap transaksi baru', kunci: 'Merapikan kategori transaksi' },
    { fitur: 'Keuangan', ikon: '💰', ai: 'keuangan', tugas: 'Membaca struk belanja jadi draf transaksi', jadwal: 'Saat Bapak memotret struk', kunci: 'Membaca struk belanja' },
    { fitur: 'Chat', ikon: '💬', ai: 'default', tugas: 'Melihat gambar yang Bapak kirim (dikerjakan AI yang diajak bicara)', jadwal: 'Saat Bapak mengirim gambar', kunci: 'Melihat' },
    { fitur: 'Beranda', ikon: '🏠', ai: 'default', tugas: 'Ringkasan pagi dari berita hari ini (Telegram)', jadwal: 'Tiap hari 07.15', kunci: 'Ringkasan pagi' },
    { fitur: 'Kantor', ikon: '🏢', ai: 'default', tugas: 'Usulan tugas untuk anggota yang menganggur', jadwal: 'Senin', kunci: 'usulan tugas' },
    { fitur: 'Kantor', ikon: '🏢', ai: 'hr', tugas: 'Review kinerja tim', jadwal: 'Tiap 2 minggu', kunci: 'Review kinerja' },
    { fitur: 'Kantor', ikon: '🏢', ai: 'hr', tugas: 'Menata model AI (hemat token)', jadwal: 'Senin 10.00', kunci: 'Menata model' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'kurator', tugas: 'Berita Indonesia & dunia', jadwal: '05.00, 12.00, 18.00', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'trading-berita', tugas: 'Politik, finance & dampak saham', jadwal: '05.00, 12.00, 18.00', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'trading-fundamental', tugas: '"Tahukah kamu" saham watchlist', jadwal: 'Tiap hari 05.00', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'trading-smartmoney', tugas: 'Edukasi smart money', jadwal: 'Rabu', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'sosmed-riset', tugas: 'Fun fact', jadwal: 'Tiap hari', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'eca-docs', tugas: 'Intisari buku', jadwal: 'Tiap hari', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'sosmed-penulis', tugas: 'Tips & trik', jadwal: 'Hari ganjil', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'sosmed-komunitas', tugas: 'Tips & trik', jadwal: 'Hari genap', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'keuangan-penasihat', tugas: 'Tips keuangan pribadi', jadwal: 'Senin', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'eca-sheets', tugas: 'Brain game logika', jadwal: 'Tiap hari', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'sosmed-produksi', tugas: 'Brain game imajinasi', jadwal: 'Tiap hari', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'eca-slides', tugas: 'Menata desain carousel', jadwal: 'Tiap hari', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'eca', tugas: 'Memeriksa mutu', jadwal: 'Tiap edisi', kunci: 'Knowledge Reels' },
    { fitur: 'Knowledge Reels', ikon: '🧠', ai: 'sosmed', tugas: 'Rencana topik mingguan', jadwal: 'Senin', kunci: 'Knowledge Reels' },
    { fitur: 'Keuangan', ikon: '💰', ai: 'keuangan', tugas: 'Merangkum laporan mingguan untuk Bapak', jadwal: 'Senin 08.00', kunci: 'laporan keuangan mingguan' },
    { fitur: 'Keuangan', ikon: '💰', ai: 'keuangan-budget', tugas: 'Cek anggaran per kategori', jadwal: 'Senin 08.00', kunci: 'Cek anggaran' },
    { fitur: 'Keuangan', ikon: '💰', ai: 'keuangan-proyeksi', tugas: 'Proyeksi akhir bulan', jadwal: 'Senin 08.00', kunci: 'Proyeksi akhir bulan' },
    { fitur: 'Keuangan', ikon: '💰', ai: 'keuangan-penasihat', tugas: '3 saran keuangan konkret', jadwal: 'Senin 08.00', kunci: 'Saran keuangan' },
    { fitur: 'Keuangan', ikon: '💰', ai: 'eca-sheets', tugas: 'Rekap bulan lalu vs sebelumnya', jadwal: 'Tanggal 1', kunci: 'Rekap pengeluaran' },
    { fitur: 'Trading', ikon: '📈', ai: 'trading', tugas: 'Mengarsipkan sinyal harian (untuk simulasi)', jadwal: 'Tiap sesi bursa', kunci: 'Mengarsipkan sinyal' },
    { fitur: 'Trading', ikon: '📈', ai: 'trading', tugas: 'Memeriksa hasil sinyal (History: target/stop/berjalan)', jadwal: 'Tiap sesi bursa', kunci: 'Memeriksa hasil sinyal' },
    { fitur: 'Trading', ikon: '📈', ai: 'keuangan-budget', tugas: 'Mengatur alokasi modal simulasi trading', jadwal: 'Saat simulasi dijalankan', kunci: 'Simulasi trading' },
    { fitur: 'Trading', ikon: '📈', ai: 'trading', tugas: 'Rencana trading minggu depan', jadwal: 'Sabtu 09.00', kunci: 'Rencana trading' },
    { fitur: 'Trading', ikon: '📈', ai: 'trading-berita', tugas: 'Memetakan berita dunia ke saham', jadwal: 'Tiap hari', kunci: 'berita terkait' },
    { fitur: 'Trading', ikon: '📈', ai: 'trading-fundamental', tugas: 'Tinjauan fundamental watchlist', jadwal: 'Sabtu 09.00', kunci: 'Tinjauan fundamental' },
    { fitur: 'Trading', ikon: '📈', ai: 'trading-smartmoney', tugas: 'Tinjauan smart money watchlist', jadwal: 'Sabtu 09.00', kunci: 'Tinjauan smart money' },
    { fitur: 'Trading', ikon: '📈', ai: 'eca-docs', tugas: 'Laporan trading mingguan di Catatan', jadwal: 'Sabtu 09.00', kunci: 'Laporan trading' },
    { fitur: 'Konten', ikon: '🎬', ai: 'sosmed', tugas: 'Strategi, kalender & evaluasi', jadwal: 'Tiap hari', kunci: '' },
    { fitur: 'Konten', ikon: '🎬', ai: 'sosmed-riset', tugas: 'Analisa niche & tren', jadwal: 'Tiap 2 minggu', kunci: 'Analisa' },
    { fitur: 'Konten', ikon: '🎬', ai: 'sosmed-penulis', tugas: 'Sketsa & naskah', jadwal: 'Tiap hari', kunci: '' },
    { fitur: 'Konten', ikon: '🎬', ai: 'sosmed-produksi', tugas: 'Prompt video & suara', jadwal: 'Tiap hari', kunci: '' },
    { fitur: 'Konten', ikon: '🎬', ai: 'sosmed-komunitas', tugas: 'Draf balasan komentar', jadwal: 'Tiap hari', kunci: '' },
    { fitur: 'Konten', ikon: '🎬', ai: 'trading-berita', tugas: 'Ide konten dari berita minggu ini', jadwal: 'Minggu 19.00', kunci: 'Ide konten dari berita' },
    { fitur: 'Catatan', ikon: '📓', ai: 'sekretaris', tugas: 'Ringkasan minggu ini', jadwal: 'Jumat 16.00', kunci: 'Ringkasan minggu' },
    { fitur: 'Catatan', ikon: '📓', ai: 'eca-docs', tugas: 'Laporan trading mingguan', jadwal: 'Sabtu 09.00', kunci: 'Laporan trading' },
    { fitur: 'Jadwal', ikon: '📅', ai: 'sekretaris', tugas: 'Agenda pagi & janji temu', jadwal: 'Tiap hari', kunci: '' },
    { fitur: 'Berkas', ikon: '☁️', ai: 'eca', tugas: 'Laporan penyimpanan & saran merapikan', jadwal: 'Minggu 10.00', kunci: 'Laporan penyimpanan' }
];
const hariWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

export function pasangRutin(d: DepsRutin) {
    const { app, requireToken, papan, percakapan } = d;
    // Kunci Gemini/Groq/xAI boleh ada di environment kantor ATAU di .env Hermes (yang diisi Pak Rico). Hanya nama kunci ini yang dibaca; nilainya tidak pernah ditampilkan.
    const BOLEH = /^(GEMINI_API_KEY|GEMINI_MODEL|GEMINI_VISION_MODEL|GROQ_API_KEY|GROQ_MODEL|GROQ_VISION_MODEL|XAI_API_KEY|XAI_MODEL|OPENROUTER_API_KEY|CEREBRAS_API_KEY|MISTRAL_API_KEY|NVIDIA_API_KEY|NVIDIA_VISION_MODEL|OPENROUTER_VISION_MODEL|XAI_VISION_MODEL|COHERE_API_KEY|HF_TOKEN|ZHIPU_API_KEY|FREELLM_PORT|FREELLM_MODEL|KANTOR_FREELLM_PRIVAT|KANTOR_FREELLM_ANONIM)$/;
    const envHermes: Record<string, string> = {};
    try {
        for (const baris of fs.readFileSync(path.join(d.hermesHome, '.env'), 'utf8').split('\n')) {
            const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)\s*$/.exec(baris); if (m && BOLEH.test(m[1])) envHermes[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
        }
    } catch { /* tidak ada .env */ }
    const router = new ModelRouter(d.dataDir, d.hermesHome, { ...envHermes, ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v && (BOLEH.test(k) || k.startsWith('KANTOR_')))) });
    percakapan.router = router;
    // FreeLLMAPI: router AI gratis di VPS (hanya localhost). Dipasang otomatis oleh kantor-update.sh.
    const freellm = new FreeLlmApi(path.dirname(process.argv[1] || '.'), d.dataDir, { ...envHermes, ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v && BOLEH.test(k))) });
    router.freellm = freellm;
    freellm.start();
    process.on('exit', () => freellm.stop());
    /* ── Kunci gratis tambahan: diisi Pak Rico di aplikasi, ditulis ke .env Hermes (izin 600). Nilainya TIDAK PERNAH dikirim balik. ── */
    const KUNCI_TAMBAH: Array<{ nama: string; label: string; daftar: string; visi: boolean; pola: RegExp }> = [
        { nama: 'ZHIPU_API_KEY', label: 'Zhipu (GLM-4V-Flash)', daftar: 'https://open.bigmodel.cn/usercenter/apikeys', visi: true, pola: /^[A-Za-z0-9._-]{20,200}$/ },
        { nama: 'NVIDIA_API_KEY', label: 'NVIDIA NIM', daftar: 'https://build.nvidia.com/settings/api-keys', visi: true, pola: /^nvapi-[A-Za-z0-9_-]{20,200}$/ },
        { nama: 'GROQ_API_KEY', label: 'Groq', daftar: 'https://console.groq.com/keys', visi: true, pola: /^gsk_[A-Za-z0-9]{20,200}$/ },
        { nama: 'GEMINI_API_KEY', label: 'Google Gemini', daftar: 'https://aistudio.google.com/apikey', visi: true, pola: /^AIza[A-Za-z0-9_-]{20,200}$/ },
        { nama: 'CEREBRAS_API_KEY', label: 'Cerebras', daftar: 'https://cloud.cerebras.ai/platform', visi: false, pola: /^csk-[A-Za-z0-9]{20,200}$/ },
        { nama: 'MISTRAL_API_KEY', label: 'Mistral', daftar: 'https://console.mistral.ai/api-keys', visi: false, pola: /^[A-Za-z0-9]{20,200}$/ }
    ];
    const envAktif: Record<string, string | undefined> = { ...envHermes, ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v && BOLEH.test(k))) };
    app.get('/api/kantor/kunci', requireToken, (_req, res) => { res.json({ ok: true, kunci: KUNCI_TAMBAH.map(({ nama, label, daftar, visi }) => ({ nama, label, daftar, visi, ada: !!envAktif[nama] })) }); });
    app.post('/api/kantor/kunci', requireToken, (req, res) => {
        const k = KUNCI_TAMBAH.find((x) => x.nama === String(req.body?.nama || ''));
        const nilai = String(req.body?.nilai || '').trim().replace(/^['"]|['"]$/g, '');
        if (!k) { res.status(400).json({ ok: false, error: 'Jenis kunci tidak dikenal.' }); return; }
        if (!k.pola.test(nilai)) { res.status(400).json({ ok: false, error: `Bentuk kunci ${k.label} tidak cocok. Salin ulang dari halaman ${k.label}, tanpa spasi.` }); return; }
        const f = path.join(d.hermesHome, '.env');
        try {
            const lama = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
            const baris = lama.split('\n').filter((b) => !new RegExp(`^\\s*(export\\s+)?${k.nama}\\s*=`).test(b));
            while (baris.length && !baris[baris.length - 1].trim()) baris.pop();
            fs.writeFileSync(f, [...baris, `${k.nama}=${nilai}`, ''].join('\n'), { mode: 0o600 }); fs.chmodSync(f, 0o600);
        } catch (e: any) { res.status(500).json({ ok: false, error: `Gagal menyimpan: ${String(e?.message || e).slice(0, 120)}` }); return; }
        envAktif[k.nama] = nilai; router.setEnv(k.nama, nilai); freellm.muatUlang({ ...envAktif });
        d.papan.catat({ ai: d.idHr, nama: '', judul: `Memasang kunci ${k.label} untuk FreeLLM${k.visi ? ' (bisa membaca gambar)' : ''}`, sumber: 'sistem', status: 'selesai' });
        res.json({ ok: true });
    });

    // Otak chat Hermes lewat FreeLLM (tombol di Tugas → Model AI). Model lama tetap jadi cadangan pertama; bisa dimatikan kapan saja.
    const otakFile = path.join(d.dataDir, 'otak-freellm.json');
    const otak = (): { nyala: boolean; at: number; hasil: string } => { try { return JSON.parse(fs.readFileSync(otakFile, 'utf8')); } catch { return { nyala: false, at: 0, hasil: '' }; } };
    let otakSibuk = false;
    app.get('/api/kantor/freellm/otak', requireToken, async (_req, res) => { if (!freellm.siap()) await freellm.cek().catch(() => undefined); res.json({ ok: true, ...otak(), sibuk: otakSibuk, siap: freellm.siap() }); });
    app.post('/api/kantor/freellm/otak', requireToken, (req, res) => {
        const nyala = !!req.body?.nyala;
        if (otakSibuk) { res.status(409).json({ ok: false, error: 'Sedang mengatur, tunggu sebentar.' }); return; }
        if (nyala && !freellm.siap()) { res.status(400).json({ ok: false, error: `FreeLLM belum siap: ${freellm.status.pesan}` }); return; }
        const f = path.join(d.dataDir, 'atur-otak-freellm.sh');
        try { fs.writeFileSync(f, ATUR_OTAK_FREELLM); } catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }); return; }
        otakSibuk = true;
        execFile('bash', [f, nyala ? 'nyala' : 'mati'], { timeout: 120_000, env: { ...process.env, HERMES_HOME: d.hermesHome, FREELLM_KUNCI_FILE: freellm.fileKunci(), FREELLM_PORT: String(freellm.port) } }, (err, stdout, stderr) => {
            otakSibuk = false;
            const hasil = String(stdout || '').trim();
            if (err) { res.status(400).json({ ok: false, error: String(stdout || stderr || err.message).trim().split('\n').slice(-2).join(' ').slice(0, 300) }); return; }
            const st = { nyala, at: Date.now(), hasil: hasil.slice(-1500) };
            try { fs.writeFileSync(otakFile, JSON.stringify(st)); } catch { /* */ }
            const n = /JUMLAH (\d+)/.exec(hasil)?.[1] || '0';
            d.papan.catat({ ai: d.idHr, nama: '', judul: nyala ? `Memindahkan otak chat ${n} AI ke FreeLLM (model lama jadi cadangan)` : `Mengembalikan otak chat ${n} AI ke pengaturan semula`, sumber: 'sistem', status: 'selesai' });
            res.json({ ok: true, ...st });
        });
    });
    // Pagar sistem: aturan di SOUL.md tiap AI + gerbang tulis Hermes untuk berkas penting (sekali per versi skrip).
    setTimeout(() => {
        const tanda = path.join(d.dataDir, 'pagar-versi.txt'), versi = String(ATUR_PAGAR.length);
        try { if (fs.readFileSync(tanda, 'utf8').trim() === versi) return; } catch { /* belum */ }
        const f = path.join(d.dataDir, 'atur-pagar.sh');
        try { fs.writeFileSync(f, ATUR_PAGAR); } catch { return; }
        execFile('bash', [f], { timeout: 60_000, env: { ...process.env, HERMES_HOME: d.hermesHome } }, (err, stdout) => {
            if (err) { console.warn('[Pagar] gagal:', String(stdout || err.message).slice(-200)); return; }
            try { fs.writeFileSync(tanda, versi); } catch { /* */ }
            const n = /JUMLAH (\d+)/.exec(String(stdout))?.[1] || '0';
            d.papan.catat({ ai: d.idHr, nama: '', judul: `Memasang aturan server di ${n} AI: tidak boleh mengubah berkas & layanan kantor`, sumber: 'sistem', status: 'selesai' });
        });
    }, 30_000);

    // Pak Rico minta (19 Nov 2026, "lakukan yang terbaik"): otak chat dipindah ke FreeLLM SEKALI otomatis begitu FreeLLM siap.
    // Kalau Bapak menekan "Kembalikan", berkas status tercatat dan ini tidak diulang.
    const otomatis = setInterval(() => {
        if (fs.existsSync(otakFile)) { clearInterval(otomatis); return; }
        if (!freellm.siap() || otakSibuk) return;
        clearInterval(otomatis); otakSibuk = true;
        const f = path.join(d.dataDir, 'atur-otak-freellm.sh');
        try { fs.writeFileSync(f, ATUR_OTAK_FREELLM); } catch { otakSibuk = false; return; }
        execFile('bash', [f, 'nyala'], { timeout: 120_000, env: { ...process.env, HERMES_HOME: d.hermesHome, FREELLM_KUNCI_FILE: freellm.fileKunci(), FREELLM_PORT: String(freellm.port) } }, (err, stdout) => {
            otakSibuk = false;
            if (err) { console.warn('[FreeLLM] otak otomatis gagal:', String(stdout || err.message).slice(-200)); return; }
            const hasil = String(stdout || '').trim();
            try { fs.writeFileSync(otakFile, JSON.stringify({ nyala: true, at: Date.now(), hasil: hasil.slice(-1500), otomatis: true })); } catch { /* */ }
            const n = /JUMLAH (\d+)/.exec(hasil)?.[1] || '0';
            d.papan.catat({ ai: d.idHr, nama: '', judul: `Memindahkan otak chat ${n} AI ke FreeLLM (model lama jadi cadangan)`, sumber: 'sistem', status: 'selesai' });
            void d.kabari(`🧠 Hana: otak chat ${n} AI sekarang lewat FreeLLM supaya kunci API Bapak tidak terkuras. Model lama tetap jadi cadangan. Bisa dikembalikan di Tugas → Model AI.`).catch(() => undefined);
        });
    }, 60_000);
    app.get('/api/kantor/freellm', requireToken, async (_req, res) => { res.json({ ok: true, terpasang: freellm.terpasang(), port: freellm.port, ...(await freellm.cek().catch(() => freellm.status)) }); });
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
            const laras = nama('keuangan-penasihat', 'Laras');
            const saran = await kerja('keuangan-penasihat', laras, 'Saran keuangan mingguan', `Kamu ${laras}, penasihat keuangan. Dari DATA dan catatan rekanmu di bawah, beri 3 saran konkret & terukur untuk minggu ini (mis. "kurangi Makan & Minum Rp300 rb"), urut dari dampak terbesar. Bukan nasihat investasi. Maksimal 6 baris.\n\n${dasar}\n\nCatatan ${bima}:\n${cek.slice(0, 1200)}\n\nCatatan ${prita}:\n${proy.slice(0, 1200)}`).catch(() => '');
            const teks = [`💰 **Laporan keuangan mingguan** (${sebab})`, `Pengeluaran bulan ini ${rp(total)} · pemasukan ${rp(masukBln)} · hari ke-${tgl}/${jmlHari}.`, '', `**${bima} — cek anggaran**`, cek.trim() || '(tidak ada jawaban)', '', `**${prita} — proyeksi akhir bulan**`, proy.trim() || '(tidak ada jawaban)', '', `**${laras} — saran minggu ini**`, saran.trim() || '(tidak ada jawaban)'].join('\n');
            percakapan.pesan('keuangan', 'keuangan', uang, teks);
            papan.catat({ ai: 'keuangan', nama: uang, judul: 'Merangkum laporan keuangan mingguan untuk Pak Rico', sumber: 'tugas', status: 'selesai' });
            d.kabari(`💰 ${uang}: laporan keuangan mingguan siap — pengeluaran bulan ini ${rp(total)}. Buka Chat ${uang}.`).catch(() => undefined);
            return { ok: true };
        } finally { sibukUang = false; }
    }

    /* ── Rekap bulanan (Sasa) ── */
    async function rekapBulanan() {
        const tx = (await d.transaksi()).filter((t) => t.status !== 'Dihapus' && t.jenis === 'Keluar');
        const bulanKe = (n: number) => { const t = new Date(Date.now() + 7 * 3600_000); t.setUTCDate(1); t.setUTCMonth(t.getUTCMonth() - n); return t.toISOString().slice(0, 7); };
        const b1 = bulanKe(1), b2 = bulanKe(2);
        const jml = (b: string) => { const m: Record<string, number> = {}; for (const t of tx) if (t.d.startsWith(b)) m[t.kat || 'Lainnya'] = (m[t.kat || 'Lainnya'] || 0) + Math.abs(t.n); return m; };
        const x1 = jml(b1), x2 = jml(b2); const kat = [...new Set([...Object.keys(x1), ...Object.keys(x2)])].sort((a, b) => (x1[b] || 0) - (x1[a] || 0));
        if (!kat.length) return;
        const tabel = ['| Kategori | ' + b2 + ' | ' + b1 + ' | Selisih |', '|---|---:|---:|---:|', ...kat.map((k) => `| ${k} | ${rp(x2[k] || 0)} | ${rp(x1[k] || 0)} | ${(x1[k] || 0) >= (x2[k] || 0) ? '+' : '−'}${rp(Math.abs((x1[k] || 0) - (x2[k] || 0)))} |`)].join('\n');
        const sasa = nama('eca-sheets', 'Sasa');
        const ulas = await kerja('eca-sheets', sasa, `Rekap pengeluaran ${b1}`, `Kamu ${sasa}. Dari TABEL total pengeluaran per kategori ini, tulis 3 temuan singkat (kategori yang naik/turun paling besar, dan polanya). Angka HANYA dari tabel. Maksimal 5 baris.\n\n${tabel}`).catch(() => '');
        percakapan.pesan('keuangan', 'eca-sheets', sasa, `📊 **Rekap pengeluaran ${b1} vs ${b2}**\n\n${tabel}\n\n${ulas.trim()}`);
    }

    /* ── Trading mingguan (Raka, Sari → Dito → Dodi) ── */
    async function tradingMingguan(sebab: string) {
        const s = d.saham(); const wl = s.watchlist.slice(0, 15);
        if (!wl.length) return { lewati: 'watchlist kosong' };
        const baris = wl.map((sym) => { const det = s.detail(sym); const b = det?.baris; if (!b) return ''; const f = b.f || {};
            return `${sym} (${b.nama || '-'}, ${b.sektor || '-'}): harga ${b.harga}, 1b ${b.chg1m}%, 3b ${b.chg3m}%, 1t ${b.chg1y}%, RSI ${b.rsi ?? '-'}, PER ${f.per ?? '-'}, PBV ${f.pbv ?? '-'}, ROE ${f.roe ?? '-'}%, DER ${f.der ?? '-'}, tumbuh pendapatan ${f.revGrowth ?? '-'}%`; }).filter(Boolean).join('\n');
        const orang = wl.map((sym) => { const o = s.detail(sym)?.orang; return o ? `${sym}: ${JSON.stringify(o).slice(0, 300)}` : ''; }).filter(Boolean).join('\n');
        const raka = nama('trading-fundamental', 'Raka'), sari = nama('trading-smartmoney', 'Sari'), dito = nama('trading', 'Dito'), dodi = nama('eca-docs', 'Dodi');
        const fund = await kerja('trading-fundamental', raka, 'Tinjauan fundamental watchlist', `Kamu ${raka}, analis fundamental. Dari DATA watchlist berikut, kelompokkan saham: fundamental kuat / biasa / perlu waspada, masing-masing dengan alasan satu kalimat berdasar angka. Angka HANYA dari DATA. Jangan menyuruh beli/jual. Maksimal 12 baris.\n\nDATA:\n${baris}`).catch(() => '');
        const sm = await kerja('trading-smartmoney', sari, 'Tinjauan smart money watchlist', `Kamu ${sari}, analis smart money. Dari DATA transaksi orang dalam (Form 4) berikut, sebut saham yang orang dalamnya banyak membeli/menjual dan artinya. Kalau DATA kosong, katakan "tidak ada transaksi orang dalam yang tercatat minggu ini". Jangan mengarang. Maksimal 8 baris.\n\nDATA:\n${orang || '(kosong)'}`).catch(() => '');
        const rencana = await kerja('trading', dito, 'Rencana trading minggu depan', `Kamu ${dito}, kepala trading. Dari tinjauan ${raka} dan ${sari} di bawah, tulis rencana pemantauan minggu depan: 3–5 saham yang perlu diperhatikan, apa pemicunya, dan risiko utamanya. Kantor tidak terhubung ke broker. Akhiri dengan "Bukan saran keuangan." Maksimal 10 baris.\n\n${raka}:\n${fund.slice(0, 2500)}\n\n${sari}:\n${sm.slice(0, 1500)}`).catch(() => '');
        const tgl = hariWib();
        const isi = await kerja('eca-docs', dodi, 'Laporan trading mingguan', `Kamu ${dodi}. Susun laporan Markdown rapi berjudul "# Laporan trading mingguan ${tgl}" dari tiga bagian di bawah (pertahankan isi & angka, rapikan bahasa, beri subjudul ## per bagian, poin-poin). Keluarkan Markdown saja.\n\n[Fundamental — ${raka}]\n${fund}\n\n[Smart money — ${sari}]\n${sm}\n\n[Rencana — ${dito}]\n${rencana}`).catch(() => '');
        const md = (isi.trim().startsWith('#') ? isi.trim() : `# Laporan trading mingguan ${tgl}\n\n## Fundamental (${raka})\n${fund}\n\n## Smart money (${sari})\n${sm}\n\n## Rencana (${dito})\n${rencana}`) + '\n\n_Bukan saran keuangan._\n';
        const rel = `Laporan/Trading mingguan ${tgl}.md`;
        await d.catatan.tulis(rel, md).catch((e) => console.warn('[Rutin] tulis laporan trading:', e?.message || e));
        percakapan.pesan('trading', 'trading', dito, `📈 **Rencana minggu depan** (${sebab})\n${rencana.trim() || '(tidak ada jawaban)'}\n\nLaporan lengkap dari ${dodi}: Catatan › ${rel}`);
        return { ok: true };
    }

    /* ── Ringkasan minggu (Sekar) ── */
    async function ringkasanMinggu() {
        const seminggu = Date.now() - 7 * 86400_000;
        const kerjaMinggu = papan.daftar().filter((k) => k.status === 'selesai' && (k.selesai || k.dibuat) >= seminggu);
        const per = new Map<string, { nama: string; n: number; contoh: string[] }>();
        for (const k of kerjaMinggu) { const e = per.get(k.ai) || { nama: k.nama.replace(/ · .*/, ''), n: 0, contoh: [] }; e.n++; if (e.contoh.length < 2) e.contoh.push(k.judul.slice(0, 80)); per.set(k.ai, e); }
        const kr = d.kr(); const cat = kr.catatan.filter((c) => c.at >= seminggu);
        const agenda = await d.agenda(7).catch(() => []);
        const bahan = [`KERJA TIM (7 hari, ${kerjaMinggu.length} selesai):`, ...[...per.values()].sort((a, b) => b.n - a.n).map((e) => `- ${e.nama}: ${e.n} (mis. ${e.contoh.join('; ')})`),
            '', `CATATAN BAPAK DI KNOWLEDGE REELS (${cat.length}):`, ...cat.slice(-10).map((c) => `- [${kr.judulPost(c.postId)}] ${c.teks.slice(0, 200)}`),
            '', 'AGENDA 7 HARI KE DEPAN:', ...(agenda.length ? agenda.slice(0, 15).map((a) => `- ${a.mulai.slice(0, 16).replace('T', ' ')} ${a.judul}${a.tempat ? ` @ ${a.tempat}` : ''}`) : ['- (kosong)'])].join('\n');
        const sekar = nama('sekretaris', 'Sekar'), tgl = hariWib();
        const isi = await kerja('sekretaris', sekar, 'Ringkasan minggu ini', `Kamu ${sekar}, sekretaris Pak Rico. Tulis catatan Markdown "# Ringkasan minggu ${tgl}" dari BAHAN: ## Yang dikerjakan tim (poin), ## Catatan Bapak minggu ini (rangkum, jangan diubah maknanya), ## Agenda minggu depan, ## Yang perlu Bapak putuskan (kalau ada). Hanya dari BAHAN. Keluarkan Markdown saja.\n\nBAHAN:\n${bahan}`).catch(() => '');
        const md = isi.trim().startsWith('#') ? isi.trim() : `# Ringkasan minggu ${tgl}\n\n${bahan}`;
        const rel = `Laporan/Ringkasan minggu ${tgl}.md`;
        await d.catatan.tulis(rel, md + '\n');
        d.kabari(`📓 ${sekar}: ringkasan minggu ini sudah ada di Catatan › ${rel}`).catch(() => undefined);
    }

    /* ── Ide konten dari berita (Nina → tim Konten) ── */
    async function ideKonten() {
        const akun = d.sosmed().filter((a) => a.niche); if (!akun.length) return;
        const seminggu = Date.now() - 7 * 86400_000;
        const berita = d.kr().post.filter((p) => ['lokal', 'global', 'politik', 'bisnis'].includes(p.kat) && p.dibuat >= seminggu).slice(-40);
        if (berita.length < 3) return;
        const nina = nama('trading-berita', 'Nina');
        const out = await kerja('trading-berita', nina, 'Ide konten dari berita minggu ini', `Kamu ${nina}, pembaca berita kantor. Dari JUDUL BERITA minggu ini, pilih yang bisa dijadikan konten untuk tiap akun sosmed sesuai nichenya (2–3 ide per akun, satu kalimat: sudut pandang + kenapa relevan untuk penonton). Lewati akun yang tidak cocok dengan berita mana pun. Jangan mengarang fakta di luar judul.\n\nAKUN:\n${akun.map((a) => `- ${a.nama} (${a.platform}): ${a.niche}`).join('\n')}\n\nJUDUL BERITA:\n${berita.map((b) => `- ${b.judul}${b.sub ? ` — ${b.sub}` : ''}`).join('\n')}`).catch(() => '');
        if (!out.trim()) return;
        d.sosmedIde(out.trim().slice(0, 2500));
        percakapan.pesan('sosmed', 'trading-berita', nina, `📰 **Ide konten dari berita minggu ini**\n${out.trim()}`);
    }

    /* ── Laporan penyimpanan Berkas (Eca) — nama berkas tidak dikirim ke AI ── */
    async function laporanBerkas() {
        const semua: Array<{ rel: string; size: number; mtime: number; ext: string }> = [];
        const jalan = (dir: string) => { let es: fs.Dirent[] = []; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const e of es) { if (e.name.startsWith('.')) continue; const p = path.join(dir, e.name); if (e.isDirectory()) jalan(p); else { try { const st = fs.statSync(p); semua.push({ rel: path.relative(d.berkas.root, p), size: st.size, mtime: st.mtimeMs, ext: (path.extname(e.name).slice(1) || 'lain').toLowerCase() }); } catch { /* */ } } } };
        jalan(d.berkas.root);
        const total = semua.reduce((s, f) => s + f.size, 0), gb = (n: number) => `${(n / 1e9).toFixed(2)} GB`, mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;
        const perJenis = new Map<string, { n: number; size: number }>(); for (const f of semua) { const e = perJenis.get(f.ext) || { n: 0, size: 0 }; e.n++; e.size += f.size; perJenis.set(f.ext, e); }
        const lama = semua.filter((f) => Date.now() - f.mtime > 180 * 86400_000);
        const kembar = new Map<string, number>(); for (const f of semua) { const k = `${path.basename(f.rel)}|${f.size}`; kembar.set(k, (kembar.get(k) || 0) + 1); }
        const nKembar = [...kembar.values()].filter((n) => n > 1).reduce((s, n) => s + n - 1, 0);
        const statistik = [`Terpakai ${gb(total)} dari ${gb(d.berkas.kuota)} (${Math.round((total / d.berkas.kuota) * 100)}%), ${semua.length} berkas.`, `Per jenis: ${[...perJenis.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 8).map(([k, v]) => `${k} ${v.n} berkas ${mb(v.size)}`).join(', ')}.`, `Tidak dibuka > 6 bulan: ${lama.length} berkas (${mb(lama.reduce((s, f) => s + f.size, 0))}).`, `Kemungkinan duplikat: ${nKembar} berkas.`].join('\n');
        const eca = nama('eca', 'Eca');
        const saran = await kerja('eca', eca, 'Laporan penyimpanan Berkas', `Kamu ${eca}. Dari STATISTIK penyimpanan cloud pribadi Pak Rico ini, beri 3 saran singkat untuk merapikan/menghemat ruang. Jangan menyuruh menghapus apa pun tanpa dicek Pak Rico. Maksimal 5 baris.\n\nSTATISTIK:\n${statistik}`).catch(() => '');
        const besar = semua.sort((a, b) => b.size - a.size).slice(0, 5).map((f) => `- ${f.rel} (${mb(f.size)})`).join('\n');
        percakapan.pesan('eca', 'eca', eca, `☁️ **Laporan penyimpanan Berkas**\n${statistik}\n\nBerkas terbesar:\n${besar || '- (kosong)'}\n\n${saran.trim()}\n\n_Tidak ada berkas yang dihapus otomatis._`);
    }

    const fileTanda = path.join(d.dataDir, 'rutin.json');
    let tandai: Record<string, string> = {}; try { tandai = JSON.parse(fs.readFileSync(fileTanda, 'utf8')); } catch { /* baru */ }
    const tandaiSimpan = (t: Record<string, string>) => { tandai = t; try { fs.writeFileSync(fileTanda, JSON.stringify(t)); } catch { /* */ } };
    setInterval(() => {
        const w = new Date(Date.now() + 7 * 3600_000), jam = w.getUTCHours(), hari = hariWib();
        const sekali = (kunci: string, fn: () => Promise<any>) => { if (tandai[kunci] === hari) return; tandaiSimpan({ ...tandai, [kunci]: hari }); fn().catch((e) => console.warn(`[Rutin] ${kunci}:`, e?.message || e)); };
        const dow = w.getUTCDay(), mnt = jam * 60 + w.getUTCMinutes();
        if (w.getUTCDate() === 1 && jam >= 9) sekali('rekapBulan', rekapBulanan);
        if (dow === 1 && jam >= 8) sekali('uang', () => keuanganMingguan('Senin'));
        if (dow === 1 && jam >= 10) sekali('model', () => reviewModel('Senin'));
        if (dow === 5 && mnt >= 16 * 60) sekali('ringkasMinggu', ringkasanMinggu);
        if (dow === 6 && jam >= 9) sekali('trading', () => tradingMingguan('Sabtu'));
        if (dow === 0 && jam >= 10) sekali('berkas', laporanBerkas);
        if (dow === 0 && jam >= 19) sekali('ideKonten', ideKonten);
    }, 900_000);

    const r = (fn: (req: any) => any): any => async (req: any, res: any) => { try { res.json({ ok: true, ...(await fn(req)) }); } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); } };
    app.get('/api/kantor/model', requireToken, r(() => ({ ...router.tampil(tim()), sibuk: sibukModel, berat: d.berat() })));
    app.post('/api/kantor/model/atur', requireToken, r((req) => {
        const ai = String(req.body?.ai || ''); if (!tim().some((a) => a.id === ai)) throw new Error('AI tidak ditemukan.');
        if (req.body?.lepas) { router.lepasKunci(ai); return {}; }
        return { atur: router.setAtur(ai, String(req.body?.opsi || ''), 'rico', 'Dipilih Pak Rico', req.body?.kunci !== false) };
    }));
    app.post('/api/kantor/model/review', requireToken, r(() => { if (sibukModel) throw new Error('Review model sedang berjalan.'); reviewModel('diminta Pak Rico').catch((e) => console.warn('[Rutin] model:', e?.message || e)); return { sibuk: true }; }));
    app.get('/api/kantor/gotong', requireToken, r(() => {
        const bulanIni = papan.bulanIni(); const lalu = new Date(Date.now() + 7 * 3600_000 - 31 * 86400_000).toISOString().slice(0, 7);
        const items = [...papan.daftar(bulanIni), ...(lalu !== bulanIni ? papan.daftar(lalu) : [])];
        const ada = new Set(d.roster().map((a) => a.id));
        const baris = GOTONG.map((g) => {
            const k = g.kunci.toLowerCase();
            const hit = items.filter((x) => x.ai === g.ai && (!k || x.judul.toLowerCase().includes(k))).sort((a, b) => (b.selesai || b.dibuat) - (a.selesai || a.dibuat))[0];
            return { ...g, nama: nama(g.ai, NAMA_CADANG[g.ai] || g.ai), profil: ada.has(g.ai), terakhir: hit ? { at: hit.selesai || hit.dibuat, status: hit.status, judul: hit.judul } : null };
        });
        const tanpa = d.roster().filter((a) => !GOTONG.some((g) => g.ai === a.id)).map((a) => a.nama);
        return { baris, tanpaRutin: tanpa };
    }));
    const JALAN: Record<string, () => Promise<any>> = { trading: () => tradingMingguan('diminta Pak Rico'), ringkasMinggu: ringkasanMinggu, berkas: laporanBerkas, ideKonten, rekapBulan: rekapBulanan };
    app.post('/api/kantor/rutin/jalankan', requireToken, r((req) => { const f = JALAN[String(req.body?.jenis || '')]; if (!f) throw new Error('Jenis tidak dikenal.'); f().catch((e) => console.warn('[Rutin]', e?.message || e)); return { sibuk: true }; }));
    app.post('/api/kantor/keuangan/mingguan', requireToken, r(() => { keuanganMingguan('diminta Pak Rico').catch((e) => console.warn('[Rutin] keuangan:', e?.message || e)); return { sibuk: true }; }));
    return router;
}
