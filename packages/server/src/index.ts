import zlib from 'zlib';
import { MemoriTim } from './kantor/memoriTim';
import { mulaiRiwayatNotif, daftarNotif, tandaiNotifDibaca } from './kantor/riwayatNotif';
import fs from 'fs';
import path from 'path';
import { cekHargaCli } from './kantor/harga';
import express from 'express';
import { Server, matchMaker } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';
import { loadConfig } from './kantor/config';
import { KantorAuth } from './kantor/auth';
import { KategoriAi } from './kantor/kategoriAi';
import { Rem } from './kantor/rem';
import { Pencatat, telegramNotifier, ringkasanKeuangan, telegramSebagai, sambilMengetik, kategoriOf } from './kantor/pencatat';
import { TradingDesk, tradingCli, fetchPrice, marketOpen } from './kantor/trading';
import { Kalender } from './kantor/kalender';
import { Percakapan, Anggota, KuotaBerat, hermesSekali, jalankan as jalankanHermes } from './kantor/percakapan';
import { Investigasi } from './kantor/investigasi';
import { Screener, ambilCandle } from './kantor/screener';
import { WatchFolder } from './kantor/watchfolder';
import { Catatan } from './kantor/catatan';
import { Berkas } from './kantor/berkas';
import { AnggaranStore, bacaTransaksi } from './kantor/anggaran';
import { bacaPdf, urai, cocokkan } from './kantor/mutasi';
import { presetInfo, REKOMENDASI } from './kantor/preset';
import { profil as nasdaqProfil, fundamentalNasdaq } from './kantor/nasdaq';
import { simulasi, langkahDari, ringkasJalur } from './kantor/simulasi';
import { simulasiSinyal, type HasilSim } from './kantor/simSinyal';
import { ArsipSinyal, type HasilArsip } from './kantor/arsipSinyal';
import { Notifikasi } from './kantor/push';
import type { Lampiran } from './kantor/percakapan';
import { konteksTrading } from './kantor/konteksTrading';
import * as porto from './kantor/portofolio';
import { PERAN_AI } from './kantor/papan';
import { Papan, Kerja, bulanWib } from './kantor/papan';
import { Kronos, BarK, hariBursaBerikut } from './kantor/kronos';
import { BeritaTerkait } from './kantor/beritaTerkait';
import ATUR_HR from './kantor/skrip/atur-hr.sh';
import ATUR_SOSMED from './kantor/skrip/atur-sosmed.sh';
import { pasangSosmed } from './kantor/sosmedRute';
import { pasangKr } from './kantor/krRute';
import { pasangRutin } from './kantor/rutin';
import { gantiNamaPenasihat } from './kantor/migrasi';
import ATUR_KURATOR from './kantor/skrip/atur-kurator.sh';
import { execFile as jalankanBerkas } from 'child_process';
import { Hr, statistik, kunciMinggu, ambilUsulanJson, ID_HR, ID_JONI, StatAi } from './kantor/hr';
import { ujiMundur, rekomendasiUji, fileUji, statusPreset, StatusUji, saranDariUji, fileSaran, namaH } from './kantor/ujimundur';
import { cnbcChart, hargaHarian } from './kantor/harga';
import { HistorySinyal, type StatusH, type Profil } from './kantor/historySinyal';
import { telegramKirim } from './kantor/telegram';
import { HermesBridge } from './kantor/hermes';
import { slidesCli } from './kantor/slides';
import { WaJanji, WaReader, waLoginCli, waLogoutCli, waLinked } from './kantor/wa';
import { FreeLlm } from './kantor/freeLlm';
import { spawn } from 'child_process';
import os from 'os';

const config = loadConfig();
mulaiRiwayatNotif(config.dataDir);
// Dua AI bernama Hana → penasihat keuangan jadi Laras (HR tetap Hana).
gantiNamaPenasihat(config.hermesHome, process.env.KANTOR_CONFIG || path.join(process.env.KANTOR_ROOT || process.cwd(), 'kantor.config.json'), config.agents as any);

// Daftar AI (nama & peran) dari profil Hermes + nama tampilan di kantor.config.json.
const hermesProfiles = new HermesBridge(config.hermesHome, config.kanbanDbPath, config.hermesBin);
let rosterCache: { at: number; list: Anggota[] } = { at: 0, list: [] };
const roster = (): Anggota[] => {
    if (Date.now() - rosterCache.at < 15_000) return rosterCache.list;
    const list = hermesProfiles.listProfiles().map((p) => {
        const o = config.agents[p.id] || {};
        return { id: p.id, nama: o.name || p.displayName || p.id, peran: o.title || PERAN_AI[p.id] || p.title || '', deskripsi: o.role || p.description || '' };
    });
    rosterCache = { at: Date.now(), list };
    return list;
};
const kuotaBerat = new KuotaBerat(config.dataDir, config.berat.model, config.berat.perHari);

// Mode uji: `node kantor-server.js --uji-pencatat` → tampilkan transaksi yang AKAN dicatat, tanpa menulis apa pun.
const tradingDeskDir = process.env.TRADER_DESK || path.join(os.homedir(), 'trader-desk');
const tradingArg = process.argv.indexOf('--trading');
if (process.argv.includes('--cek-fundamental')) {
    // Diagnosa: node kantor-server.js --cek-fundamental AAPL
    const sy = (process.argv[process.argv.indexOf('--cek-fundamental') + 1] || 'AAPL').toUpperCase();
    (async () => {
        try { const { _cek, ...f } = await fundamentalNasdaq(sy, null); console.log(`✅ Fundamental ${sy} (Nasdaq):`, JSON.stringify(f)); console.log('   baris terbaca:', JSON.stringify(_cek)); } catch (e: any) { console.log(`❌ Fundamental ${sy}: ${e?.message || e}`); }
        try { const p = await nasdaqProfil(sy); console.log(`✅ Profil: ${p.nama} · ${p.situs} · ${p.deskripsi.slice(0, 120)}…`); } catch (e: any) { console.log(`❌ Profil: ${e?.message || e}`); }
        process.exit(0);
    })();
} else if (process.argv.includes('--cek-harga')) {
    const i = process.argv.indexOf('--cek-harga');
    cekHargaCli((process.argv[i + 1] || 'AAPL').toUpperCase()).then(() => process.exit(0));
} else if (tradingArg >= 0) {
    // Dipanggil oleh Hermes (AI) atau pemilik: node kantor-server.js --trading <perintah> ...
    const desk = new TradingDesk(config.dataDir, telegramNotifier(config.hermesHome), tradingDeskDir);
    tradingCli(desk, process.argv.slice(tradingArg + 1))
        .then((out) => { console.log(out); process.exit(0); })
        .catch((e) => { console.error('GAGAL:', e?.message || e); process.exit(1); });
} else if (process.argv.includes('--tanya')) {
    // Dipakai Joni (Telegram): anggota menjawab sebagai PESAN TERPISAH di Telegram, berlabel nama tebal.
    //   node kantor-server.js --tanya <profil|nama> [--berat] [--file <path>]... [--tanpa-kirim] "<pesan lengkap>"
    (async () => {
        const a = process.argv.slice(process.argv.indexOf('--tanya') + 1);
        const siapa = String(a.shift() || '');
        let berat = false; let kirim = true; const files: string[] = []; const teks: string[] = [];
        while (a.length) {
            const x = a.shift()!;
            if (x === '--berat') berat = true;
            else if (x === '--tanpa-kirim') kirim = false;
            else if (x === '--file' && a.length) files.push(a.shift()!);
            else teks.push(x);
        }
        const r = roster();
        const ai = r.find((x) => x.id === siapa || x.nama.toLowerCase() === siapa.toLowerCase());
        if (!ai || !teks.join(' ').trim()) {
            console.error(`Pakai: --tanya <profil|nama> [--berat] [--file path] "pesan". Anggota: ${r.map((x) => `${x.id}(${x.nama})`).join(', ')}`);
            process.exit(1);
        }
        let catatan = '';
        if (berat && !kuotaBerat.ambil()) { berat = false; catatan = `\n\n(kuota model berbayar hari ini habis: ${kuotaBerat.perHari}×, dikerjakan dengan model gratis)`; }
        const ada = files.filter((f) => fs.existsSync(f));
        const prompt = [
            `[Pesan dari ${config.ownerName} lewat Telegram, diteruskan oleh Joni (kepala kantor). Telegram dipakai seperti grup kantor.]`,
            teks.join(' '),
            ada.length ? `\nFile terlampir (bisa kamu baca di komputer ini):\n${ada.map((f) => `- ${path.resolve(f)}`).join('\n')}` : '',
            `\nBalas sebagai ${ai.nama} (${ai.peran}) dalam Bahasa Indonesia, singkat & jelas. Kalau diminta mengerjakan sesuatu, kerjakan dengan alat/skill-mu lalu laporkan hasilnya.`
        ].join('\n');
        const label = `${ai.nama} · ${ai.peran}${berat ? ' ⚡' : ''}`;
        let out: string; let ok = true;
        try {
            out = await sambilMengetik(config.hermesHome, () => hermesSekali(jalankanHermes, config.hermesBin, ai.id, prompt, berat ? config.berat.model : undefined));
            out = (out || '(tidak ada jawaban)') + catatan;
        } catch (e: any) { out = `⚠️ Gagal menjawab: ${String(e?.message || e).slice(0, 300)}`; ok = false; }
        const terkirim = kirim && await telegramSebagai(config.hermesHome, label, out);
        if (terkirim) console.log(`[SUDAH TERKIRIM ke ${config.ownerName} sebagai pesan ${ai.nama}. JANGAN diulang di balasanmu.]\nIsi jawaban ${ai.nama} (untuk konteks / diteruskan ke anggota lain):\n${out}`);
        else console.log(`**${label}**\n${out}`);
        process.exit(ok ? 0 : 1);
    })();
} else if (process.argv.includes('--catat')) {
    // Dipakai Uang: node kantor-server.js --catat --jenis Keluar --nominal 20000 --akun BCA --kategori "Makan & Minum" --pihak "Nasi goreng" [--ket ..] [--tanggal YYYY-MM-DD]
    const a = process.argv.slice(process.argv.indexOf('--catat') + 1);
    const opt = (k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
    new Pencatat(config.pencatat, config.hermesHome, config.dataDir, async () => undefined)
        .tambahManual({ jenis: opt('jenis') || 'Keluar', nominal: Number(opt('nominal')), akun: opt('akun') || 'Cash', kategori: opt('kategori'), pihak: opt('pihak'), keterangan: opt('ket'), tanggal: opt('tanggal'), jam: opt('jam') })
        .then((t) => { console.log(`✅ Tercatat: ${t.jenis} Rp${t.n.toLocaleString('id-ID')} · ${t.bank} · ${t.kat}${t.pihak ? ` · ${t.pihak}` : ''} (${t.d} ${t.t})`); process.exit(0); })
        .catch((e) => { console.error('GAGAL:', e?.message || e); process.exit(1); });
} else if (process.argv.includes('--wa-login')) {
    // Tautkan WhatsApp (hanya-baca) dengan kode: node kantor-server.js --wa-login 628xxxx
    waLoginCli(config.dataDir, process.argv[process.argv.indexOf('--wa-login') + 1])
        .then((out) => { console.log(out); process.exit(0); })
        .catch((e) => { console.error('GAGAL:', e?.message || e); process.exit(1); });
} else if (process.argv.includes('--wa-reader')) {
    // Proses terpisah untuk WhatsApp: kalau modul WhatsApp crash, kantor tetap jalan.
    const notify = telegramNotifier(config.hermesHome);
    const llm = new FreeLlm({
        apiKey: config.openRouterApiKey, baseUrl: config.openRouterBaseUrl, model: config.model,
        dailyLimit: 60, perMinuteLimit: 4, dataDir: path.join(config.dataDir, 'wa'), backups: config.llmBackups
    });
    fs.mkdirSync(path.join(config.dataDir, 'wa'), { recursive: true });
    const kal = new Kalender(config.hermesHome, config.dataDir, notify);
    const janji = new WaJanji(config.dataDir, () => (llm.enabled || config.llmBackups.length ? llm : null), kal, notify, { abaikan: config.whatsapp.abaikan.map((n) => n.replace(/^0/, '62')) });
    new WaReader(config.dataDir, janji, notify, { grup: config.whatsapp.grup }).start();
} else if (process.argv.includes('--wa-logout')) {
    console.log(waLogoutCli(config.dataDir));
    process.exit(0);
} else if (process.argv.includes('--slides')) {
    // Dipakai Putri (Editor · Presentasi): node kantor-server.js --slides buat kerangka.md
    slidesCli(config.hermesHome, process.argv.slice(process.argv.indexOf('--slides') + 1))
        .then((out) => { console.log(out); process.exit(0); })
        .catch((e) => { console.error('GAGAL:', e?.message || e); process.exit(1); });
} else if (process.argv.includes('--keuangan')) {
    // Dipakai agen Keuangan: node kantor-server.js --keuangan ringkasan [YYYY-MM]
    (async () => {
        const i = process.argv.indexOf('--keuangan');
        const ym = /^\d{4}-\d{2}$/.test(process.argv[i + 2] || '') ? process.argv[i + 2] : new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
        try {
            const p = new Pencatat({ ...config.pencatat, enabled: true }, config.hermesHome, config.dataDir, async () => undefined);
            const r = await p.report(true);
            console.log(ringkasanKeuangan(r.transaksi, ym));
            process.exit(0);
        } catch (e: any) { console.error('GAGAL:', e?.message || e); process.exit(1); }
    })();
} else if (process.argv.includes('--uji-pencatat')) {
    (async () => {
        const p = new Pencatat({ ...config.pencatat, enabled: true }, config.hermesHome, config.dataDir, async () => undefined);
        if (!config.pencatat.spreadsheetId) { console.log('pencatat.spreadsheetId belum diisi di kantor.config.json'); process.exit(1); }
        try {
            const { rows, skipped } = await p.collect(true);
            console.log(`\nAkan dicatat: ${rows.length} transaksi (diabaikan: ${skipped} email bukan transaksi/sudah tercatat)\n`);
            for (const r of rows) console.log(`${r.tanggal} ${r.jam.padEnd(5)} ${r.bank.padEnd(7)} ${r.jenis.padEnd(14)} ${String(r.nominal ?? '?').padStart(10)}  ${r.pihak.slice(0, 28).padEnd(28)} ${r.kategori.padEnd(20)} ${r.status}`);
            process.exit(0);
        } catch (e: any) { console.error('GAGAL:', e?.message || e); process.exit(1); }
    })();
} else {
    startServer();
}

/** Jalankan pembaca WhatsApp sebagai proses anak; hidupkan ulang kalau mati (jeda makin lama). */
function startWaChild() {
    let fails = 0;
    let current: ReturnType<typeof spawn> | null = null;
    process.once('exit', () => current?.kill());
    const run = () => {
        if (!waLinked(config.dataDir)) { console.log('[WA] Belum ditautkan (jalankan --wa-login). Pembaca WhatsApp mati.'); return; }
        const started = Date.now();
        const child = spawn(process.execPath, [process.argv[1], '--wa-reader'], { stdio: 'inherit', env: process.env });
        current = child;
        child.on('exit', (code, signal) => {
            if (Date.now() - started > 10 * 60_000) fails = 0;
            fails++;
            const wait = Math.min(30 * 60_000, 15_000 * 2 ** Math.min(fails, 7));
            console.warn(`[WA] Proses WhatsApp berhenti (${signal || code}). Dicoba lagi dalam ${Math.round(wait / 60_000) || 1} menit.`);
            setTimeout(run, wait);
        });
    };
    run();
}

function startServer() {
const auth = new KantorAuth(config.dataDir, config.password);
OfficeRoom.config = config;
OfficeRoom.auth = auth;

if (auth.generated) {
    console.warn(`[Kantor] KANTOR_PASSWORD belum diisi. Kata sandi dibuat otomatis, lihat: ${path.join(config.dataDir, 'kantor-password.txt')}`);
}

const app = express();
app.set('trust proxy', true);
// Catatan & berkas butuh batas lebih besar; route lain tetap 32 KB.
app.use(['/api/kantor/catatan', '/api/kantor/berkas'], express.json({ limit: '12mb' }));
app.use('/api/kantor/keuangan/mutasi/terapkan', express.json({ limit: '2mb' }));
app.use(express.json({ limit: '32kb' }));
// Kompres jawaban JSON besar (mis. data 500 saham ±1 MB → ±150 KB): jauh lebih cepat di jaringan HP.
app.use('/api', (req, res, next) => {
    if (!/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return next();
    const asli = res.json.bind(res);
    res.json = ((body: any) => {
        const teks = JSON.stringify(body);
        if (teks.length < 4096) return asli(body);
        const z = zlib.gzipSync(teks, { level: 5 });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        return res.end(z);
    }) as any;
    next();
});

// CORS: supaya tampilan di Vercel boleh memanggil server ini.
app.use('/api/kantor', (req, res, next) => {
    const origin = String(req.headers.origin || '');
    const allowAll = config.allowedOrigins.includes('*');
    if (origin && (allowAll || config.allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Pdf-Sandi');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
});

// Penanda bahwa ini server Kantor Virtual (tanpa data apa pun).
app.get('/api/kantor/ping', (_req, res) => {
    res.json({ ok: true, kantor: true, office: config.officeName });
});

app.post('/api/kantor/login', (req, res) => {
    const ip = String(req.ip || req.socket.remoteAddress || 'unknown');
    const result = auth.login(req.body?.password, ip);
    if (!result.ok) {
        setTimeout(() => res.status(401).json(result), 800);
        return;
    }
    res.json({ ok: true, token: result.token, office: config.officeName, owner: config.ownerName });
});

const requireToken: express.RequestHandler = (req, res, next) => {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!auth.verify(token)) { res.status(401).json({ ok: false, error: 'Perlu login.' }); return; }
    next();
};

app.get('/api/kantor/status', requireToken, (_req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'Kantor belum siap.' });
        return;
    }
    res.json({ ok: true, ...room.statusPayload() });
});

// Laporan keuangan & trading untuk tampilan kantor (wajib login).
const pencatat = new Pencatat(config.pencatat, config.hermesHome, config.dataDir, telegramNotifier(config.hermesHome));
const tradingDesk = new TradingDesk(config.dataDir, telegramNotifier(config.hermesHome), tradingDeskDir);
app.get('/api/kantor/keuangan', requireToken, async (req, res) => {
    try {
        if (req.query.sync === '1') await pencatat.runOnce();
        res.json({ ok: true, ...(await pencatat.report(req.query.sync === '1')) });
    } catch (e: any) {
        res.status(502).json({ ok: false, error: String(e?.message || e) });
    }
});
// ── Catatan (Otak Kantor / Obsidian) ─────────────────────────────────
const catatan = new Catatan(path.resolve(process.env.OBSIDIAN_VAULT_PATH || path.join(os.homedir(), 'otak-kantor')));
const cat = (fn: (req: express.Request) => any): express.RequestHandler => async (req, res) => {
    if (!catatan.ada()) { res.status(404).json({ ok: false, error: 'Otak Kantor belum tersambung di VPS (jalankan atur-otak.sh).' }); return; }
    try { res.json({ ok: true, ...(await fn(req)) }); }
    catch (e: any) { res.status(e?.konflik ? 409 : 400).json({ ok: false, error: String(e?.message || e), konflik: Boolean(e?.konflik) }); }
};
app.get('/api/kantor/catatan/pohon', requireToken, cat(() => ({ pohon: catatan.pohon(), sinkron: catatan.status })));
app.get('/api/kantor/catatan/baca', requireToken, cat((req) => catatan.baca(String(req.query.p || ''))));
app.get('/api/kantor/catatan/cari', requireToken, cat((req) => ({ hasil: catatan.cari(String(req.query.q || '')) })));
app.get('/api/kantor/catatan/berkas', requireToken, (req, res) => {
    try {
        const { abs } = catatan.berkas(String(req.query.p || ''));
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'"); // SVG tidak boleh menjalankan skrip
        res.sendFile(abs);
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.post('/api/kantor/catatan/tulis', requireToken, cat((req) => catatan.tulis(String(req.body?.p || ''), String(req.body?.isi ?? ''), Number(req.body?.mtime) || undefined)));
app.post('/api/kantor/catatan/unggah', requireToken, cat((req) => catatan.unggah(String(req.body?.folder || ''), String(req.body?.nama || ''), String(req.body?.base64 || ''))));
app.post('/api/kantor/catatan/folder', requireToken, cat((req) => catatan.buatFolder(String(req.body?.p || ''))));
app.post('/api/kantor/catatan/pindah', requireToken, cat((req) => catatan.pindah(String(req.body?.dari || ''), String(req.body?.ke || ''))));
app.post('/api/kantor/catatan/buang', requireToken, cat((req) => catatan.buang(String(req.body?.p || ''))));

// ── Berkas: cloud pribadi di VPS (bawaan 5 GB) ─────────────────────────
const berkasDir = path.resolve(process.env.KANTOR_BERKAS_DIR || path.join(os.homedir(), 'berkas-kantor'));
fs.mkdirSync(berkasDir, { recursive: true });
const berkas = new Berkas(berkasDir, Math.max(0.5, Number(process.env.KANTOR_BERKAS_GB || (config as any).berkasKuotaGB || 5)) * 1e9);
const brk = (fn: (req: express.Request) => any): express.RequestHandler => (req, res) => {
    try { res.json({ ok: true, ...fn(req) }); } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
};
app.get('/api/kantor/berkas/daftar', requireToken, brk((req) => berkas.daftar(String(req.query.p || ''))));
app.get('/api/kantor/berkas/cari', requireToken, brk((req) => ({ items: berkas.cari(String(req.query.q || '')) })));
app.post('/api/kantor/berkas/folder', requireToken, brk((req) => berkas.buatFolder(String(req.body?.p || ''), String(req.body?.nama || ''))));
app.post('/api/kantor/berkas/pindah', requireToken, brk((req) => berkas.pindah(String(req.body?.dari || ''), String(req.body?.ke ?? ''), req.body?.nama ? String(req.body.nama) : undefined)));
app.post('/api/kantor/berkas/hapus', requireToken, brk((req) => berkas.hapus(String(req.body?.p || ''))));
app.post('/api/kantor/berkas/tautan', requireToken, brk((req) => berkas.tautan(String(req.body?.p || ''), Boolean(req.body?.unduh))));
app.post('/api/kantor/berkas/unggah', requireToken, (req, res) => { berkas.unggah(req, res); });
app.get('/api/kantor/berkas/f/:t/:nama', (req, res) => berkas.kirim(String(req.params.t), res)); // tautan sekali pakai, tanpa login

const anggaran = new AnggaranStore(config.dataDir);
app.get('/api/kantor/keuangan/anggaran', requireToken, (_req, res) => { res.json({ ok: true, ...anggaran.get(), kategori: Object.keys(config.pencatat.kategori).concat(['Lainnya']) }); });
app.post('/api/kantor/keuangan/anggaran', requireToken, (req, res) => { res.json({ ok: true, ...anggaran.set(req.body), kategori: Object.keys(config.pencatat.kategori).concat(['Lainnya']) }); });
app.post('/api/kantor/keuangan/tambah', requireToken, async (req, res) => {
    try { res.json({ ok: true, tx: await pencatat.tambahManual(req.body || {}) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
const keuErr = (res: express.Response, e: any) => res.status(400).json({ ok: false, error: String(e?.message || e), butuhSandi: Boolean(e?.butuhSandi) });
app.post('/api/kantor/keuangan/ubah', requireToken, async (req, res) => {
    try {
        if (req.body?.kategori && req.body?.pihak && req.body?.jenis !== 'Masuk') kategoriAi.koreksi(String(req.body.pihak), String(req.body.kategori));
        res.json({ ok: true, ...(await pencatat.ubah(String(req.body?.id || ''), req.body || {})) });
    } catch (e) { keuErr(res, e); }
});
app.post('/api/kantor/keuangan/hapus', requireToken, async (req, res) => {
    try {
        const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [req.body?.id]).map(String).filter(Boolean).slice(0, 500);
        res.json({ ok: true, ...(await pencatat.hapus(ids, path.join(config.dataDir, 'keuangan-terhapus.json'))) });
    } catch (e) { keuErr(res, e); }
});
// Impor PDF mutasi rekening: dibaca di VPS (tidak dikirim ke AI), dicocokkan dengan yang sudah tercatat, lalu ditinjau Pak Rico.
app.post('/api/kantor/keuangan/mutasi', requireToken, express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
    try {
        const buf = req.body as Buffer;
        if (!Buffer.isBuffer(buf) || buf.length < 100 || buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Berkas bukan PDF.');
        const akun = String(req.query.akun || '').trim().slice(0, 30);
        if (!akun) throw new Error('Pilih rekening/akunnya dulu.');
        const sandi = String(req.headers['x-pdf-sandi'] || '');
        const { halaman } = await bacaPdf(buf, sandi);
        const hasil = urai(halaman, akun);
        let ada: any[] = [];
        try { ada = (await pencatat.report(true)).transaksi; } catch (e: any) { hasil.peringatan.push(`Belum bisa mengecek transaksi yang sudah tercatat (${e?.message || e}) — semua ditandai baru.`); }
        const c = cocokkan(akun, hasil.transaksi, ada, hasil.periode);
        const rules = config.pencatat.kategori;
        res.json({
            ok: true, ...hasil,
            transaksi: await pencatat.lengkapiKategori(c.hasil.map((t) => ({ ...t, kategori: t.jenis === 'Masuk' ? 'Pendapatan' : kategoriOf(`${t.pihak} ${t.ket}`, rules) }))),
            lebih: c.lebih,
            saldoTercatat: anggaran.get().saldo?.[akun] || null
        });
    } catch (e) { keuErr(res, e); }
});
app.post('/api/kantor/keuangan/mutasi/terapkan', requireToken, async (req, res) => {
    try {
        const akun = String(req.body?.akun || '').trim().slice(0, 30);
        if (!akun) throw new Error('Akun kosong');
        const tambah = (Array.isArray(req.body?.tambah) ? req.body.tambah : []).slice(0, 2000).map((x: any) => ({
            id: String(x.id || ''), tanggal: x.tanggal, jam: '00:00', akun, jenis: x.jenis === 'Masuk' ? 'Masuk' : x.jenis === 'Antar Rekening' ? 'Antar Rekening' : 'Keluar',
            nominal: x.nominal, pihak: x.pihak, kategori: x.kategori, keterangan: x.keterangan
        })).filter((x: any) => /^mutasi-[0-9a-f]{14}$/.test(x.id));
        const out: any = { ditambah: 0, dihapus: 0 };
        if (tambah.length) Object.assign(out, await pencatat.tambahBanyak(tambah, 'Mutasi'));
        const hapus = (Array.isArray(req.body?.hapus) ? req.body.hapus : []).map(String).filter(Boolean).slice(0, 500);
        if (hapus.length) Object.assign(out, await pencatat.hapus(hapus, path.join(config.dataDir, 'keuangan-terhapus.json')));
        const sd = req.body?.saldo;
        if (sd && Number.isFinite(Number(sd.nilai)) && /^\d{4}-\d{2}-\d{2}$/.test(String(sd.tanggal || ''))) { anggaran.setSaldo(akun, Number(sd.nilai), String(sd.tanggal)); out.saldo = true; }
        res.json({ ok: true, ...out });
    } catch (e) { keuErr(res, e); }
});
app.post('/api/kantor/keuangan/baca', requireToken, async (req, res) => {
    try {
        const a = anggaran.get();
        const r = await bacaTransaksi(OfficeRoom.sharedLlm(), String(req.body?.teks || ''), a.akun, Object.keys(config.pencatat.kategori).concat(['Lainnya']));
        res.json({ ok: true, draf: r });
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
const kalender = new Kalender(config.hermesHome, config.dataDir, telegramNotifier(config.hermesHome));
const priceCache = new Map<string, { at: number; p: number }>();
app.get('/api/kantor/trading', requireToken, async (_req, res) => {
    const st = tradingDesk.load();
    // Harga terkini posisi terbuka (cache 2 menit, gagal = dilewati)
    const positions = await Promise.all(st.positions.map(async (p) => {
        let price: number | null = null;
        const c = priceCache.get(p.symbol);
        if (c && Date.now() - c.at < 120_000) price = c.p;
        else { try { price = await fetchPrice(p.symbol); priceCache.set(p.symbol, { at: Date.now(), p: price }); } catch { /* */ } }
        return { ...p, price, pnl: price && p.shares ? Math.round((price - p.entry) * p.shares * 100) / 100 : null };
    }));
    // Laporan tim hari ini (Nina, Raka, Sari)
    const laporanDir = path.join(tradingDeskDir, 'laporan');
    let laporan: Array<{ nama: string; tanggal: string; isi: string }> = [];
    try {
        const files = fs.readdirSync(laporanDir).filter((f) => f.endsWith('.md')).sort().reverse();
        const latest = files[0]?.slice(0, 10);
        laporan = files.filter((f) => f.startsWith(latest)).map((f) => ({
            nama: f.slice(11, -3), tanggal: latest, isi: fs.readFileSync(path.join(laporanDir, f), 'utf8').slice(0, 4000)
        }));
    } catch { /* belum ada */ }
    res.json({ ok: true, capital: st.capital, riskPct: st.riskPct, positions, plans: st.plans, history: st.history.slice(-30), watchlist: st.watchlist, laporan });
});
// ── Chat ala WhatsApp dengan AI Hermes (pribadi & grup) ─────────────
const papan = new Papan(config.dataDir);
papan.namaAi = (id) => roster().find((a) => a.id === id)?.nama;
const percakapan = new Percakapan(config.dataDir, config.hermesBin, config.ownerName, roster, () => OfficeRoom.sharedLlm(), kuotaBerat);
const memoriTim = new MemoriTim(config.hermesHome, () => roster().map((a) => ({ id: a.id, nama: a.nama })), () => percakapan.router?.lindungi() ?? false);
percakapan.ingatanRekan = (ai, teks) => memoriTim.rekan(ai, teks);
percakapan.papan = papan;
app.get('/api/kantor/chat', requireToken, (_req, res) => { res.json({ ok: true, thread: percakapan.daftar() }); });
app.get('/api/kantor/chat/:id', requireToken, (req, res) => { res.json({ ok: true, ...percakapan.thread(String(req.params.id)) }); });
percakapan.berkasRoot = berkas.root;
// ── Rem otonomi per AI (pemutus sirkuit + anggaran token) ──
const rem = new Rem(config.dataDir, { jam5: Number(process.env.KANTOR_REM_5JAM) || 200_000, hari: Number(process.env.KANTOR_REM_HARI) || 600_000, minggu: Number(process.env.KANTOR_REM_MINGGU) || 3_000_000 });
percakapan.rem = rem;
rem.onUbah = (ai, lama, baru, sebab) => {
    const nama = roster().find((a) => a.id === ai)?.nama || ai;
    papan.catat({ ai, nama, judul: `Rem otonomi: ${lama} → ${baru}`, detail: sebab, sumber: 'tugas', status: baru === 'henti' ? 'gagal' : 'selesai' });
    if (baru === 'henti' || (baru === 'batasi' && lama !== 'henti')) kabariTelegram(`🛑 Rem otonomi: ${nama} ${baru === 'henti' ? 'DIHENTIKAN sementara' : 'dibatasi'} (${sebab}). Buka Kantor → Tim AI untuk melanjutkan.`).catch(() => undefined);
};
/** R4 · Kartu status AI satu baris (ATM Munder Difflin): sedang apa, model, rem/kuota, galat terakhir, bertanya ke Bapak. */
app.get('/api/kantor/tim-status', requireToken, (_req, res) => {
    const kerja = papan.daftar();
    const keputusan = new Set(hr.st.usulan.filter((u) => u.status === 'menunggu').map(() => ID_JONI));
    res.json({ ok: true, ai: roster().map((a) => {
        const milik = kerja.filter((k) => k.ai === a.id);
        const jalan = milik.filter((k) => k.status === 'proses').sort((x, y) => (y.mulai || y.dibuat) - (x.mulai || x.dibuat))[0];
        const antre = milik.filter((k) => k.status === 'todo').length;
        const akhir = milik.filter((k) => k.status === 'selesai' || k.status === 'gagal').sort((x, y) => (y.selesai || 0) - (x.selesai || 0))[0];
        const r = rem.ringkas(a.id);
        return {
            id: a.id, nama: a.nama, peran: a.peran,
            sedang: jalan ? { judul: jalan.judul, sejak: jalan.mulai || jalan.dibuat } : null, antre,
            terakhir: akhir ? { judul: akhir.judul, status: akhir.status, at: akhir.selesai || akhir.dibuat, galat: akhir.status === 'gagal' ? String(akhir.hasil || '').slice(0, 140) : undefined } : null,
            model: percakapan.router?.opsiAi(a.id) || null, rem: { status: r.status, sebab: r.sebab, hari: r.persen.hari },
            bertanya: keputusan.has(a.id)
        };
    }) });
});
/** R5 · Ingatan tim yang bisa dicari: memories/*.md + SOUL.md semua profil Hermes (hanya dibaca). */
app.get('/api/kantor/memori/cari', requireToken, (req, res) => { res.json({ ok: true, hasil: memoriTim.cari(String(req.query.q || '')) }); });
app.get('/api/kantor/serah', requireToken, (req, res) => { const sejak = Number(req.query.sejak) || 0; res.json({ ok: true, serah: percakapan.serah.filter((x) => x.id > sejak), akhir: percakapan.serah[percakapan.serah.length - 1]?.id || 0 }); });
app.get('/api/kantor/rem', requireToken, (_req, res) => { res.json({ ok: true, ai: roster().map((a) => ({ id: a.id, nama: a.nama, peran: a.peran, ...rem.ringkas(a.id) })) }); });
app.post('/api/kantor/rem/:ai/lanjutkan', requireToken, (req, res) => { rem.lanjutkan(String(req.params.ai)); res.json({ ok: true }); });
app.post('/api/kantor/rem/:ai/anggaran', requireToken, (req, res) => { res.json({ ok: true, anggaran: rem.setAnggaran(String(req.params.ai), req.body || {}) }); });

// ── Keuangan × AI (gotong royong: dikerjakan Uang, Kepala Keuangan) ──
const AI_KEU = () => (roster().some((a) => a.id === 'keuangan') ? 'keuangan' : 'default');
const namaAiKeu = () => roster().find((a) => a.id === AI_KEU())?.nama || 'Uang';
const daftarKategori = () => Object.keys(config.pencatat.kategori).concat(['Lainnya']);
/** Kategori dari nama tenant (QRIS dll.). Yang dikirim ke AI hanya nama tenant. */
const kategoriAi = new KategoriAi(config.dataDir, (prompt, judul, detail) => percakapan.tugas(AI_KEU(), judul, prompt, detail));
pencatat.ingatan = (p) => kategoriAi.dariIngatan(p);
pencatat.tebakKategori = (ps) => kategoriAi.tebak(ps, daftarKategori());
let rapikanJalan = false;
async function rapikanKategori() {
    if (rapikanJalan || !config.pencatat.spreadsheetId) return null;
    rapikanJalan = true;
    try {
        return await papan.jalankan({ ai: AI_KEU(), nama: namaAiKeu(), judul: 'Merapikan kategori transaksi "Lainnya"', detail: 'Menebak kategori dari nama tenant (QRIS/transfer) dan mengingat koreksi Pak Rico.', sumber: 'tugas' },
            () => pencatat.rapikanKategori(), (r) => `${r.diubah} dari ${r.dicek} transaksi dipindah dari "Lainnya".`);
    } catch (e: any) { console.warn('[Kategori AI]', e?.message || e); return null; } finally { rapikanJalan = false; }
}
setTimeout(() => void rapikanKategori(), 6 * 60_000); setInterval(() => void rapikanKategori(), 3 * 3600_000);
app.post('/api/kantor/keuangan/rapikan-kategori', requireToken, async (_req, res) => {
    const r = await rapikanKategori(); res.json({ ok: true, hasil: r, ingatan: kategoriAi.jumlah() });
});
/** Baca struk: foto → draf transaksi (Uang memakai model visi). Foto disimpan di Berkas/Keuangan/Struk/. */
app.post('/api/kantor/keuangan/struk', requireToken, express.raw({ type: () => true, limit: '10mb' }), async (req, res) => {
    try {
        const buf = req.body as Buffer;
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
        if (!Buffer.isBuffer(buf) || buf.length < 500 || !/^image\/(jpeg|png|webp)$/.test(mime)) throw new Error('Kirim foto struk (JPG/PNG/WebP).');
        if (!percakapan.router?.visiAda()) throw new Error('Belum ada model yang bisa membaca gambar. Isi GEMINI_API_KEY atau GROQ_API_KEY di server.');
        const a = anggaran.get();
        const bulan = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
        const dir = path.join(berkas.root, 'Keuangan', 'Struk', bulan); fs.mkdirSync(dir, { recursive: true });
        const nama = `struk-${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${mime.split('/')[1].replace('jpeg', 'jpg')}`;
        fs.writeFileSync(path.join(dir, nama), buf);
        const ai = AI_KEU(), aiNama = namaAiKeu();
        const hasil = await papan.jalankan({ ai, nama: aiNama, judul: 'Membaca struk belanja', detail: nama, sumber: 'tugas' }, async () => {
            const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
            const r = await percakapan.router!.lihat(ai, aiNama, [
                'Ini foto struk/nota belanja. Baca dan jawab HANYA JSON:',
                `{"struk":true/false,"pihak":"nama toko/tenant","tanggal":"YYYY-MM-DD","jam":"HH:MM","total":angka rupiah yang dibayar,"metode":"tunai/QRIS/debit/kartu kredit/e-wallet/tidak tahu","item":[{"nama":"...","jumlah":1,"harga":angka}],"kategori":"salah satu: ${daftarKategori().join(', ')}"}`,
                `Total = jumlah akhir yang dibayar (setelah diskon & pajak). Angka tanpa titik/koma. Tanggal tidak terbaca → ${hariIni}. Bukan struk → {"struk":false}.`
            ].join('\n'), [{ mime, data: buf }], 1200);
            const m = r.teks.match(/\{[\s\S]*\}/); if (!m) throw new Error('Struk tidak terbaca. Coba foto lebih terang dan lurus.');
            const j = JSON.parse(m[0]);
            if (j.struk === false) throw new Error('Foto ini sepertinya bukan struk.');
            const total = Math.round(Number(String(j.total ?? '').replace(/[^\d.]/g, '')) || 0);
            if (!(total > 0)) throw new Error('Total belanja tidak terbaca. Isi nominalnya manual.');
            const pihak = String(j.pihak || '').slice(0, 80);
            let kategori = daftarKategori().find((k) => k.toLowerCase() === String(j.kategori || '').toLowerCase()) || 'Lainnya';
            const ing = kategoriAi.dariIngatan(pihak); if (ing) kategori = ing;
            const metode = String(j.metode || '');
            const akun = /qris|debit|e-?wallet|kartu/i.test(metode) ? (a.akun.find((x: string) => x !== 'Cash') || 'Cash') : 'Cash';
            const item = (Array.isArray(j.item) ? j.item : []).slice(0, 30).map((x: any) => ({ nama: String(x?.nama || '').slice(0, 60), jumlah: Number(x?.jumlah) || 1, harga: Math.round(Number(x?.harga) || 0) }));
            return {
                jenis: 'Keluar', nominal: total, pihak, kategori, akun,
                tanggal: /^\d{4}-\d{2}-\d{2}$/.test(String(j.tanggal || '')) ? j.tanggal : hariIni, jam: /^\d{2}:\d{2}$/.test(String(j.jam || '')) ? j.jam : '',
                keterangan: [metode && metode !== 'tidak tahu' ? metode : '', item.length ? item.slice(0, 4).map((x: any) => x.nama).join(', ') : ''].filter(Boolean).join(' · ').slice(0, 200),
                item, berkas: `Keuangan/Struk/${bulan}/${nama}`, model: r.model
            };
        }, (d: any) => `${d.pihak || 'Struk'} · Rp${d.nominal.toLocaleString('id-ID')} · ${d.kategori}`);
        res.json({ ok: true, draf: hasil, oleh: aiNama });
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
/** Lampiran yang dikirim harus benar-benar berkas di Berkas (cloud pribadi). */
const lampiranValid = (x: any): Lampiran[] => (Array.isArray(x) ? x : []).slice(0, 10).map((l: any) => {
    try { const abs = berkas.lokasi(String(l?.rel || '')); const st = fs.statSync(abs); return { rel: path.relative(berkas.root, abs).split(path.sep).join('/'), nama: path.basename(abs), ukuran: st.size, jenis: /\.(png|jpe?g|gif|webp)$/i.test(abs) ? 'gambar' : 'berkas' } as Lampiran; } catch { return null; }
}).filter(Boolean) as Lampiran[];
app.post('/api/kantor/chat/:id', requireToken, (req, res) => {
    try { res.json({ ok: true, pesan: percakapan.kirim(String(req.params.id), String(req.body?.teks || ''), lampiranValid(req.body?.lampiran)) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
// Unggah lampiran chat → disimpan di Berkas: "Chat/<nama chat>/".
app.post('/api/kantor/chat/:id/unggah', requireToken, (req, res) => {
    try {
        const nama = percakapan.infoThread(String(req.params.id)).nama.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Chat';
        fs.mkdirSync(path.join(berkas.root, 'Chat', nama), { recursive: true });
        (req.query as any).p = `Chat/${nama}`;
        berkas.unggah(req, res);
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
// Grup buatan sendiri.
app.post('/api/kantor/chat-grup', requireToken, (req, res) => {
    try { res.json({ ok: true, grup: percakapan.grupSimpanSatu({ id: req.body?.id ? String(req.body.id) : undefined, nama: String(req.body?.nama || ''), ikon: String(req.body?.ikon || '👥'), anggota: Array.isArray(req.body?.anggota) ? req.body.anggota : [] }) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.post('/api/kantor/chat-grup/:id/hapus', requireToken, (req, res) => { percakapan.grupHapus(String(req.params.id)); res.json({ ok: true }); });

// ── Notifikasi HP ala WhatsApp (Web Push) ──
const notif = (() => { try { return new Notifikasi(config.dataDir); } catch (e: any) { console.warn('[Push] mati:', e?.message || e); return null; } })();
percakapan.onPesan = (thread, p) => {
    if (!notif || !notif.jumlah()) return;
    const info = percakapan.infoThread(thread);
    const pribadi = roster().find((a) => a.id === thread);
    if (!info.grup && !pribadi) return; // thread kerja/konsultasi tidak dinotifikasi
    const peran = roster().find((a) => a.id === p.dari)?.peran;
    const isi = `${p.teks || ''}${p.lampiran?.length ? `${p.teks ? ' ' : ''}📎 ${p.lampiran.map((l) => l.nama).join(', ')}` : ''}`.replace(/\s+/g, ' ').trim().slice(0, 180) || 'Pesan baru';
    const judul = info.grup ? `${info.ikon} ${info.nama}` : `${p.nama}${peran ? ` - ${peran}` : ''}`;
    notif.kirim(thread, judul, info.grup ? `${p.nama}: ${isi}` : isi).catch((e) => console.warn('[Push]', e?.message || e));
};
app.get('/api/kantor/notifikasi', requireToken, (req, res) => { res.json({ ok: true, ...daftarNotif(Math.min(400, Number(req.query.n) || 100), String(req.query.jenis || '')) }); });
app.post('/api/kantor/notifikasi/baca', requireToken, (_req, res) => { tandaiNotifDibaca(); res.json({ ok: true }); });
app.get('/api/kantor/push/kunci', requireToken, (_req, res) => { res.json({ ok: !!notif, kunci: notif?.kunciPublik() || null, langganan: notif?.jumlah() || 0 }); });
app.post('/api/kantor/push/langgan', requireToken, (req, res) => {
    try { if (!notif) throw new Error('Notifikasi belum tersedia di server.'); notif.langgan(req.body?.langganan, String(req.headers['user-agent'] || '')); res.json({ ok: true }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.post('/api/kantor/push/berhenti', requireToken, (req, res) => { notif?.berhenti(String(req.body?.endpoint || '')); res.json({ ok: true }); });
app.post('/api/kantor/push/lihat', requireToken, (req, res) => { notif?.lihat(req.body?.thread ? String(req.body.thread) : null); res.json({ ok: true, belum: notif?.totalBelum() || 0 }); });
app.post('/api/kantor/push/uji', requireToken, (_req, res) => { notif?.uji().catch(() => undefined); res.json({ ok: !!notif }); });

// ── Penyaring saham (fundamental SEC + teknikal) ─────────────────────
const screener = new Screener(config.dataDir, () => { const st = tradingDesk.load(); return Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist])); }, tradingDeskDir);
const qH = (req: express.Request) => [Math.max(1, Math.min(120, Number(req.query.h) || 20)), String(req.query.m || ''), String(req.query.pt || ''), String(req.query.pf || '')] as const;
app.get('/api/kantor/screener', requireToken, (req, res) => { res.json({ ok: true, ...screener.data(...qH(req)) }); });
app.get('/api/kantor/candle/:s', requireToken, async (req, res) => {
    try { res.json({ ok: true, ...(await ambilCandle(String(req.params.s), String(req.query.r || '6B'))) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.get('/api/kantor/saham/:s', requireToken, async (req, res) => {
    try { const b = await screener.satu(String(req.params.s)); res.json({ ok: true, baris: b, skor: screener.skor(b) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
const watchFolder = new WatchFolder(config.dataDir);
app.get('/api/kantor/watchlist-folder', requireToken, (_req, res) => { res.json({ ok: true, folders: watchFolder.list(), utama: tradingDesk.load().watchlist }); });
app.post('/api/kantor/watchlist-folder', requireToken, (req, res) => {
    try { res.json({ ok: true, folders: watchFolder.aksi(req.body), utama: tradingDesk.load().watchlist }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.get('/api/kantor/peta-berita', requireToken, (_req, res) => {
    const st = tradingDesk.load(); const pantau = Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist]));
    res.json({ ok: true, ...screener.petaBerita(), related: beritaTerkait.atur.aktif ? screener.petaRelated(pantau) : null, pantau });
});
app.get('/api/kantor/saham-detail/:s', requireToken, (req, res) => {
    const d = screener.detail(String(req.params.s).toUpperCase(), ...qH(req));
    if (!d) { res.status(404).json({ ok: false, error: 'Belum ada di data penyaring' }); return; }
    res.json({ ok: true, ...d });
});
app.get('/api/kantor/preset', requireToken, (_req, res) => { res.json({ ok: true, preset: presetInfo(), rekomendasi: REKOMENDASI, rekomendasiUji: rekomendasiUji(fileUji(config.dataDir)), statusUji: statusPreset(fileUji(config.dataDir)) }); });
// Uji mundur (backtest) — berjalan di latar belakang ±20–40 menit untuk ±500 saham.
const statusUji: StatusUji = { jalan: false, progres: '', mulai: 0, selesai: 0, galat: '' };
const UJI_HARI = 30; // uji mundur otomatis tiap ±30 hari
function umurUji() { try { return JSON.parse(fs.readFileSync(fileUji(config.dataDir), 'utf8')).at as number; } catch { return 0; } }
function bacaSaran() { try { return JSON.parse(fs.readFileSync(fileSaran(config.dataDir), 'utf8')); } catch { return null; } }
/** Setelah uji selesai: rekomendasi per horison (dihitung dari angka) + penjelasan bahasa awam oleh AI gratis. */
async function buatSaran() {
    const s = saranDariUji(config.dataDir); if (!s) return;
    const fakta = Object.values(s.H).map((x) => `${namaH(x.H)}: ${x.teknikalKet} Preset terbukti: ${x.preset.length ? x.preset.map((p) => `${p.guru} ${p.nama} (${p.rataEx}% vs S&P 500, disesuaikan risiko)`).join(', ') : 'tidak ada'}. Saran: ${x.saran}`).join('\n');
    let teks: string | null | undefined = null;
    try {
        teks = await OfficeRoom.sharedLlm()?.complete(
            'Kamu analis di kantor Pak Rico. Tulis ringkasan hasil uji mundur (backtest) saham AS berikut dalam bahasa Indonesia sederhana untuk orang awam, 4–6 kalimat: apa yang terbukti, apa yang tidak, dan cara memakainya per rencana pegang posisi. HANYA pakai angka yang ada di data, jangan menambah angka atau saham. Jangan menjanjikan untung. Akhiri dengan: "Bukan saran keuangan." Tanpa judul, tanpa poin-poin.',
            fakta, 450, 2);
    } catch { /* AI tidak tersedia */ }
    fs.writeFileSync(fileSaran(config.dataDir), JSON.stringify({ ...s, teks: teks?.trim() || null, dibuat: Date.now() }));
}
function jalankanUji(sebab: string) {
    if (statusUji.jalan) return false;
    const daftar = screener.daftarSimbol();
    if (!daftar.length) throw new Error('Ambil data pasar dulu (↻ di Trading).');
    console.log(`[Uji mundur] mulai (${sebab}), ${daftar.length} saham`);
    papan.jalankan({ ai: 'trading', judul: `Uji mundur ${daftar.length} saham (${sebab})`, detail: 'Menguji skor teknikal & preset di data ±5 tahun, lalu memperbarui bobot dan rekomendasi.', sumber: 'trading' },
        () => ujiMundur(daftar, fileUji(config.dataDir), statusUji).then(() => buatSaran()), () => 'Bobot & rekomendasi di halaman Trading diperbarui.').catch((e) => console.warn('[Uji mundur]', e?.message || e));
    return true;
}
// Otomatis: dicek tiap jam; jalan saat hasil terakhir ≥30 hari (atau belum ada) dan di akhir pekan WIB (bursa AS tutup).
setInterval(() => {
    try {
        const hari = new Date(Date.now() + 7 * 3600_000).getUTCDay();
        if ((hari === 6 || hari === 0) && Date.now() - umurUji() > UJI_HARI * 86400_000 && screener.daftarSimbol().length) jalankanUji('otomatis bulanan');
        else if (umurUji() && (!bacaSaran() || (!bacaSaran().teks && Date.now() - (bacaSaran().dibuat || 0) > 6 * 3600_000))) buatSaran().catch(() => {}); // AI gagal → coba lagi tiap 6 jam
    } catch { /* coba lagi jam berikutnya */ }
}, 3600_000);
setTimeout(() => { if (umurUji() && !bacaSaran()) buatSaran().catch(() => {}); }, 60_000);
app.get('/api/kantor/ujimundur', requireToken, (_req, res) => {
    let hasil = null; try { hasil = JSON.parse(fs.readFileSync(fileUji(config.dataDir), 'utf8')); } catch { /* belum ada */ }
    const at = hasil?.at || 0;
    res.json({ ok: true, status: statusUji, hasil, saran: bacaSaran(), berikutnya: at ? at + UJI_HARI * 86400_000 : 0 });
});
app.get('/api/kantor/ujimundur/saran', requireToken, (_req, res) => {
    const at = umurUji();
    // Bagian angka selalu dihitung segar dari hasil uji; penjelasan AI diambil dari simpanan.
    const segar = saranDariUji(config.dataDir), simpan = bacaSaran();
    res.json({ ok: true, saran: segar ? { ...segar, teks: simpan?.teks || null, dibuat: simpan?.dibuat || 0 } : null, berikutnya: at ? at + UJI_HARI * 86400_000 : 0, jalan: statusUji.jalan, progres: statusUji.progres });
});
// ── Arsip sinyal harian (tidak pernah dibuang) + simulasi dari sinyal tercatat — alokasi modal diatur Bima (Pengawas Anggaran) ──
const arsipSinyal = new ArsipSinyal(config.dataDir);
function arsipkanSinyal() {
    const sesi = screener.sesi();
    if (!sesi || arsipSinyal.ada(sesi) || !screener.daftarSimbol().length) return;
    papan.jalankan({ ai: 'trading', judul: `Mengarsipkan sinyal sesi ${sesi}`, detail: 'Sinyal lengkap (teknikal, fundamental, berita, whales) disimpan untuk simulasi.', sumber: 'trading' },
        async () => arsipSinyal.simpan(screener.potretSinyal()), () => `${arsipSinyal.info().hari} hari bursa tercatat.`).catch((e) => console.warn('[Arsip sinyal]', e?.message || e));
}
setTimeout(arsipkanSinyal, 5 * 60_000); setInterval(arsipkanSinyal, 30 * 60_000);
// ── History sinyal (tab Trading → History): Dito memeriksa hasil tiap strategi beli (kena target / stop / berjalan / lewat durasi) ──
const historyS = new HistorySinyal(config.dataDir);
let historyJalan = false, historyCekSesi = '';
const hargaKiniH = (s: string) => screener.hargaTerakhir(s)?.harga ?? null;
async function periksaHistory(paksa = false) {
    const sesi = screener.sesi();
    if (historyJalan || !arsipSinyal.daftar().length || (!paksa && sesi === historyCekSesi)) return;
    historyJalan = true;
    const simbol = historyS.simbolArsip(arsipSinyal), dari = arsipSinyal.daftar()[0];
    await papan.jalankan({ ai: 'trading', judul: 'Memeriksa hasil sinyal (History)', detail: `Mengambil harga tertinggi/terendah harian ${simbol.length} saham untuk mengecek target & stop tiap strategi.`, sumber: 'trading' }, async () => {
        let ok = 0;
        for (const s of simbol) {
            const ada = historyS.ohlc[s];
            if (ada && Date.now() - ada.at < 6 * 3600_000) { ok++; continue; }
            try { const d = await hargaHarian(s); historyS.simpanOhlc(s, d.rows.map((b) => ({ t: b.t, h: b.h, l: b.l, c: b.c })), dari); ok++; } catch { /* pakai harga penutupan arsip */ }
            await new Promise((r) => setTimeout(r, 250));
        }
        historyS.tulisOhlc();
        const h = historyS.hitung(arsipSinyal, hargaKiniH);
        historyCekSesi = sesi;
        return { ok, n: h.item.length };
    }, (r) => `${r.n} strategi dinilai (harga tertinggi/terendah ${r.ok}/${simbol.length} saham).`).catch((e) => console.warn('[History sinyal]', e?.message || e)).finally(() => { historyJalan = false; });
}
setTimeout(() => periksaHistory(), 8 * 60_000); setInterval(() => periksaHistory(), 60 * 60_000);
app.get('/api/kantor/history-sinyal', requireToken, (req, res) => {
    if (Date.now() - historyS.data.at > 10 * 60_000 && arsipSinyal.daftar().length) { try { historyS.hitung(arsipSinyal, hargaKiniH); } catch (e: any) { console.warn('[History sinyal]', e?.message || e); } }
    const q = req.query as Record<string, string>;
    const tgl = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
    const H = [1, 5, 20, 60].includes(+q.H) ? +q.H : null;
    const status = (['target', 'stop', 'berjalan', 'durasi'] as StatusH[]).find((x) => x === q.status) || null;
    const urut = q.urut === 'cuan' || q.urut === 'rugi' ? q.urut : 'terbaru';
    res.json({ ok: true, jalan: historyJalan, arsip: arsipSinyal.info(), ...historyS.daftar({ hal: +q.hal || 1, n: +q.n || 20, H, profil: (['K', 'M', 'A'] as Profil[]).find((x) => x === q.profil) || 'M', dari: tgl(q.dari), sampai: tgl(q.sampai), status, urut, q: String(q.q || '').replace(/[^A-Za-z0-9.-]/g, '').slice(0, 10) }) });
});
app.post('/api/kantor/history-sinyal/periksa', requireToken, (_req, res) => { void periksaHistory(true); res.json({ ok: true, jalan: true }); });
const fileSimArsip = path.join(config.dataDir, 'simulasi-arsip.json');
const simA: { jalan: boolean; galat: string; hasil: (HasilArsip & { komentar?: string; oleh?: string; atur?: string; at: number }) | null } =
    (() => { try { return { jalan: false, galat: '', ...JSON.parse(fs.readFileSync(fileSimArsip, 'utf8')) }; } catch { return { jalan: false, galat: '', hasil: null }; } })();
simA.jalan = false;
app.get('/api/kantor/simulasi-arsip', requireToken, (_req, res) => { res.json({ ok: true, ...simA, arsip: arsipSinyal.info() }); });
app.post('/api/kantor/simulasi-arsip', requireToken, (req, res) => {
    if (simA.jalan) { res.status(400).json({ ok: false, error: 'Simulasi sedang berjalan.' }); return; }
    const b = req.body || {};
    const H = [1, 5, 20, 60].includes(+b.H) ? +b.H : 20;
    const sinyal = (Array.isArray(b.sinyal) ? b.sinyal : ['Beli kuat']).filter((x: any) => ['Beli kuat', 'Beli'].includes(x));
    if (!sinyal.length) { res.status(400).json({ ok: false, error: 'Pilih minimal satu sinyal.' }); return; }
    const guru = typeof b.guru === 'string' && presetInfo().some((p) => p.id === b.guru) ? b.guru : null;
    const modal = Math.max(100, Math.min(10_000_000, +b.modal || 10_000));
    const dari = typeof b.dari === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dari) ? b.dari : null;
    const keluar = { target: b.keluarTarget !== false, stop: b.keluarStop !== false, jual: b.keluarJual !== false };
    simA.jalan = true; simA.galat = '';
    const bima = roster().find((a) => a.id === 'keuangan-budget');
    const namaBima = bima?.nama || 'Bima';
    papan.jalankan({ ai: 'keuangan-budget', judul: `Simulasi trading dari sinyal tercatat (${namaH(H)}, modal $${modal.toLocaleString('en-US')})`, detail: 'Mengatur alokasi modal & memutar ulang sinyal yang dikirim kantor.', sumber: 'trading' }, async () => {
        // 1) Alokasi: Bima yang menentukan (kalau diminta), dibatasi pagar aman; kalau tidak, pakai angka Pak Rico.
        let beliPerHari = Math.max(1, Math.min(10, Math.round(+b.beliPerHari || 3))), porsi = Math.max(0.02, Math.min(0.5, (+b.porsi || 10) / 100)), maksPosisi = Math.max(1, Math.min(25, Math.round(+b.maksPosisi || 10)));
        let atur = 'Diatur Pak Rico.';
        const tanya = async (prompt: string) => {
            if (bima) { try { return await percakapan.tugas('keuangan-budget', 'Mengatur alokasi modal simulasi trading', prompt, `Gaya ${namaH(H)}`, 'trading'); } catch { /* cadangan */ } }
            return String(await OfficeRoom.sharedLlm()?.complete(`Kamu ${namaBima}, pengawas anggaran. Jawab sesuai format.`, prompt, 400, 2) || '');
        };
        if (b.olehBima !== false) {
            const info = arsipSinyal.info();
            const raw = await tanya(`Kamu ${namaBima}, pengawas anggaran kantor. Atur alokasi modal untuk simulasi trading saham AS dari sinyal AI.\nGaya posisi: ${namaH(H)} (pegang ±${H} hari bursa). Modal: $${modal}. Sinyal yang dieksekusi: ${sinyal.join(' + ')}${guru ? ` dan harus lolos kriteria guru ${guru}` : ''}. Arsip: ${info.hari} hari bursa.\nTentukan: berapa saham maksimal dibeli per hari, berapa % nilai portofolio per posisi, dan maksimal posisi terbuka bersamaan. Prinsip: jangan taruh semua modal di satu saham, sisakan kas, makin pendek gayanya makin kecil porsinya. Untung diputar lagi (bola salju).\nJawab HANYA JSON: {"beliPerHari":3,"porsiPersen":10,"maksPosisi":8,"alasan":"1-2 kalimat"}`);
            const j = (() => { const a = raw.indexOf('{'), z = raw.lastIndexOf('}'); try { return JSON.parse(raw.slice(a, z + 1)); } catch { return null; } })();
            if (j) {
                beliPerHari = Math.max(1, Math.min(10, Math.round(+j.beliPerHari || beliPerHari)));
                porsi = Math.max(0.02, Math.min(0.35, (+j.porsiPersen || porsi * 100) / 100));
                maksPosisi = Math.max(1, Math.min(25, Math.round(+j.maksPosisi || maksPosisi)));
                if (porsi * maksPosisi > 1) maksPosisi = Math.max(1, Math.floor(1 / porsi));
                atur = `${namaBima}: maks ${beliPerHari} saham/hari, ${Math.round(porsi * 100)}% per posisi, maks ${maksPosisi} posisi. ${String(j.alasan || '').slice(0, 240)}`;
            } else atur = `${namaBima} tidak menjawab — pakai bawaan: maks ${beliPerHari} saham/hari, ${Math.round(porsi * 100)}% per posisi, maks ${maksPosisi} posisi.`;
        }
        const h = arsipSinyal.simulasi({ H, guru, sinyal, dari, modal, porsi, beliPerHari, maksPosisi, keluar, biaya: 0.001 });
        // 2) Penjelasan singkat dari Bima.
        const komentar = await tanya(`Jelaskan hasil simulasi trading dari sinyal tercatat ini untuk Pak Rico, 3–5 kalimat bahasa awam: hasil vs S&P 500, risiko (turun terdalam), dan apakah alokasinya perlu diubah. HANYA angka yang ada. Akhiri "Bukan saran keuangan."\n${atur}\nPeriode ${h.dari}–${h.sampai} (${h.hari} hari bursa). Modal $${modal} → $${h.akhir} (${h.pct}%). SPY ${h.spyPct ?? '–'}%. Turun terdalam ${h.maxDD}%. ${h.trade} transaksi selesai, ${h.menang}% untung, total untung terealisasi $${h.untungTotal}. Posisi masih terbuka: ${h.terbuka.length}.`).catch(() => '');
        simA.hasil = { ...h, komentar: komentar.trim(), oleh: namaBima, atur, at: Date.now() };
        fs.writeFileSync(fileSimArsip, JSON.stringify({ hasil: simA.hasil }));
        return h;
    }, (h) => `Modal $${modal} → $${h.akhir} (${h.pct}%).`).catch((e) => { simA.galat = String(e?.message || e); }).finally(() => { simA.jalan = false; });
    res.json({ ok: true, jalan: true });
});
// ── Simulasi sinyal (backdate) di Portofolio: dikerjakan Dito (Kepala Trading), lalu dijelaskan Dito dengan bahasa awam ──
const fileSimSinyal = path.join(config.dataDir, 'simulasi-sinyal.json');
const simSt: { jalan: boolean; progres: string; galat: string; hasil: (HasilSim & { komentar?: string; oleh?: string; at: number }) | null; riwayat: Array<{ at: number; ringkas: string; pct: number; spyPct: number; trade: number }> } =
    (() => { try { return { jalan: false, progres: '', galat: '', ...JSON.parse(fs.readFileSync(fileSimSinyal, 'utf8')) }; } catch { return { jalan: false, progres: '', galat: '', hasil: null, riwayat: [] }; } })();
simSt.jalan = false;
const LABEL_OK = ['Beli kuat', 'Beli', 'Tahan', 'Jual', 'Jual kuat'];
app.get('/api/kantor/simulasi-sinyal', requireToken, (_req, res) => {
    const st = tradingDesk.load();
    res.json({ ok: true, ...simSt, guru: presetInfo().filter((p) => p.jenis === 'teknikal').map((p) => ({ id: p.id, guru: p.guru, nama: p.nama, ringkas: p.ringkas })), watchlist: Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist])).length, semesta: screener.daftarSimbol().length });
});
app.post('/api/kantor/simulasi-sinyal', requireToken, (req, res) => {
    if (simSt.jalan) { res.status(400).json({ ok: false, error: 'Simulasi lain sedang berjalan.' }); return; }
    const b = req.body || {};
    const H = [1, 5, 20, 60].includes(+b.H) ? +b.H : 20;
    const sinyal = (Array.isArray(b.sinyal) ? b.sinyal : ['Beli kuat']).filter((x: any) => LABEL_OK.includes(x));
    if (!sinyal.length) { res.status(400).json({ ok: false, error: 'Pilih minimal satu sinyal.' }); return; }
    const bulan = Math.max(1, Math.min(24, Math.round(+b.bulan || 3)));
    const st = tradingDesk.load();
    let semesta = Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist]));
    if (b.semesta === 'besar' || !semesta.length) semesta = screener.daftarSimbol().map((x) => screener.hargaTerakhir(x)).filter(Boolean).sort((x: any, y: any) => (y.mcap || 0) - (x.mcap || 0)).slice(0, 50).map((x: any) => x.s);
    semesta = semesta.slice(0, 60);
    if (!semesta.length) { res.status(400).json({ ok: false, error: 'Watchlist kosong dan data pasar belum ada.' }); return; }
    const guru = typeof b.guru === 'string' && presetInfo().some((p) => p.id === b.guru && p.jenis === 'teknikal') ? b.guru : null;
    const opsi = { H, guru, sinyal, bulan, modal: Math.max(100, Math.min(10_000_000, +b.modal || 10_000)), porsi: Math.max(0.02, Math.min(1, +b.porsi || 0.1)), maksPosisi: Math.max(1, Math.min(20, Math.round(+b.maksPosisi || 8))), keluarJual: b.keluarJual !== false, biaya: Math.max(0, Math.min(0.01, +b.biaya || 0.001)), semesta };
    const guruNama = guru ? presetInfo().find((p) => p.id === guru)?.guru : 'tanpa guru';
    const ringkasOpsi = `${namaH(H)} · ${guruNama} · ${sinyal.join(' + ')} · ${bulan} bulan · ${semesta.length} saham`;
    simSt.jalan = true; simSt.galat = ''; simSt.progres = 'mulai…';
    const dito = roster().find((a) => a.id === 'trading');
    papan.jalankan({ ai: 'trading', judul: `Simulasi sinyal backdate: ${ringkasOpsi}`, detail: 'Menjalankan ulang sinyal AI di masa lalu untuk Portofolio.', sumber: 'trading' }, async () => {
        const h = await simulasiSinyal(opsi, (t) => { simSt.progres = t; });
        simSt.progres = 'Dito menulis penjelasan…';
        const fakta = [`Pengaturan: ${ringkasOpsi}; modal $${opsi.modal}; ${Math.round(opsi.porsi * 100)}% per posisi; maks ${opsi.maksPosisi} posisi; keluar saat sinyal jual: ${opsi.keluarJual ? 'ya' : 'tidak'}.`,
            `Periode ${h.dari} s.d. ${h.sampai}. Hasil: ${h.pct}% (SPY ${h.spyPct}%), drawdown terdalam ${h.maxDD}%, ${h.trade} transaksi, ${h.menang}% untung, rata-rata ${h.rataTrade}% per transaksi.`,
            h.terbaik ? `Terbaik: ${h.terbaik.s} ${h.terbaik.pct}% (${h.terbaik.masuk}→${h.terbaik.keluar}). Terburuk: ${h.terburuk!.s} ${h.terburuk!.pct}%.` : 'Tidak ada transaksi.'].join('\n');
        const prompt = `Jelaskan hasil simulasi backdate sinyal AI berikut untuk Pak Rico dengan bahasa awam, 4–6 kalimat: apakah strategi ini mengalahkan S&P 500, seberapa berisiko (drawdown), apa yang bisa dicoba diubah (gaya, guru, jenis sinyal). HANYA pakai angka yang ada. Jangan menjanjikan untung. Akhiri dengan "Bukan saran keuangan." Tanpa judul.\n\n${fakta}`;
        let komentar = '', oleh = dito?.nama || 'Dito';
        try {
            if (dito) komentar = await percakapan.tugas('trading', 'Menjelaskan hasil simulasi sinyal', prompt, ringkasOpsi, 'trading');
            else komentar = String(await OfficeRoom.sharedLlm()?.complete('Kamu Dito, kepala trading. Jujur dan hati-hati.', prompt, 500, 2) || '');
        } catch { oleh = `${oleh} (otak cadangan)`; komentar = String(await OfficeRoom.sharedLlm()?.complete('Kamu Dito, kepala trading. Jujur dan hati-hati.', prompt, 500, 2).catch(() => '') || ''); }
        simSt.hasil = { ...h, komentar: komentar.trim(), oleh, at: Date.now() };
        simSt.riwayat = [{ at: Date.now(), ringkas: ringkasOpsi, pct: h.pct, spyPct: h.spyPct, trade: h.trade }, ...simSt.riwayat].slice(0, 10);
        fs.writeFileSync(fileSimSinyal, JSON.stringify({ hasil: simSt.hasil, riwayat: simSt.riwayat }));
        return h;
    }, (h) => `Hasil ${h.pct}% vs SPY ${h.spyPct}% (${h.trade} transaksi).`)
        .catch((e) => { simSt.galat = String(e?.message || e); })
        .finally(() => { simSt.jalan = false; simSt.progres = ''; });
    res.json({ ok: true, jalan: true });
});
app.post('/api/kantor/ujimundur/jalankan', requireToken, (_req, res) => {
    try { jalankanUji('manual'); res.json({ ok: true, status: statusUji }); } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
// ── Berita terkait (global / tidak langsung): dipetakan Nina, dipisah dari berita langsung ──
const beritaTerkait = new BeritaTerkait(config.dataDir);
screener.terkait = beritaTerkait;
const ID_NINA = 'trading-berita';
async function perbaruiBeritaTerkait(sebab: string) {
    if (beritaTerkait.sibuk) return;
    const { sektor, industri } = screener.kelompok();
    if (!sektor.length) throw new Error('Ambil data pasar dulu (↻ di Trading).');
    const st = tradingDesk.load();
    const pantau = Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist])).slice(0, 40);
    const nina = roster().find((a) => a.id === ID_NINA);
    await beritaTerkait.perbarui(sektor, industri, pantau, async (prompt) => {
        // Utama: Nina (profil Hermes pembaca berita). Cadangan: otak AI gratis kantor, tetap dicatat sebagai kerja tim berita.
        if (nina) {
            try { return { teks: await percakapan.tugas(ID_NINA, 'Memetakan berita dunia ke saham (berita terkait)', prompt, `Mencari efek domino dari berita global (${sebab}).`, 'trading'), oleh: nina.nama }; }
            catch (e: any) { console.warn('[Berita terkait] Nina gagal, pakai cadangan:', e?.message || e); }
        }
        const teks = await papan.jalankan({ ai: ID_NINA, nama: `${nina?.nama || 'Nina'} · otak cadangan`, judul: 'Memetakan berita dunia ke saham (berita terkait)', detail: `Mencari efek domino dari berita global (${sebab}).`, sumber: 'trading' },
            async () => { const o = await OfficeRoom.sharedLlm()?.complete('Kamu analis berita pasar saham. Jawab hanya JSON valid.', prompt, 1800, 3); if (!o) throw new Error('AI gratis tidak menjawab.'); return o; });
        return { teks, oleh: `${nina?.nama || 'Nina'} (otak cadangan)` };
    });
    screener.bersihkanCache();
}
// Tiap jam: kalau peta berita terkait sudah basi (>30 jam) dan fitur aktif → perbarui.
setInterval(() => { if (beritaTerkait.atur.aktif && !beritaTerkait.segar && screener.daftarSimbol().length) perbaruiBeritaTerkait('otomatis harian').catch((e) => console.warn('[Berita terkait]', e?.message || e)); }, 3600_000);
setTimeout(() => { if (beritaTerkait.atur.aktif && !beritaTerkait.segar && screener.daftarSimbol().length) perbaruiBeritaTerkait('otomatis').catch((e) => console.warn('[Berita terkait]', e?.message || e)); }, 120_000);
app.get('/api/kantor/berita-terkait', requireToken, (_req, res) => { res.json({ ok: true, data: beritaTerkait.data, atur: beritaTerkait.atur, sibuk: beritaTerkait.sibuk }); });
app.get('/api/kantor/berita-terkait/daftar', requireToken, (req, res) => {
    const q = req.query as Record<string, string>;
    const tgl = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined);
    res.json({ ok: true, ...beritaTerkait.daftar({ hal: +q.hal || 1, n: +q.n || 10, dari: tgl(q.dari), sampai: tgl(q.sampai), topik: q.topik || undefined, industri: q.industri || undefined, q: (q.q || '').slice(0, 80) || undefined }) });
});
app.post('/api/kantor/berita-terkait/atur', requireToken, (req, res) => { beritaTerkait.setAtur(req.body || {}); screener.bersihkanCache(); res.json({ ok: true, atur: beritaTerkait.atur }); });
app.post('/api/kantor/berita-terkait/perbarui', requireToken, (_req, res) => {
    perbaruiBeritaTerkait('diminta Pak Rico').catch((e) => console.warn('[Berita terkait]', e?.message || e));
    res.json({ ok: true, sibuk: true });
});

// ── Papan kerja AI (To do / Proses / Selesai), dibersihkan tiap ganti bulan ──
for (const [m, judul, ai] of [['perbaruiTeknikal', 'Memperbarui harga & sinyal teknikal ±500 saham', 'trading'], ['perbaruiFundamental', 'Memperbarui data fundamental (laporan keuangan)', 'trading-fundamental'], ['perbaruiBerita', 'Membaca & menilai berita saham', 'trading-berita']] as const) {
    const asli = (screener as any)[m].bind(screener);
    (screener as any)[m] = (...a: any[]) => papan.jalankanLama({ ai, judul, sumber: 'trading' }, () => asli(...a));
}
/** Semua pekerjaan AI satu bulan: catatan kantor + tugas papan Kanban Hermes (hanya-baca). */
async function semuaKerja(bulan?: string): Promise<{ bulan: string; kini: string; items: Kerja[] }> {
    const kini = papan.bulanIni();
    const bln = bulan && /^\d{4}-\d{2}$/.test(bulan) ? bulan : kini;
    const nama = new Map(roster().map((a) => [a.id, a.nama]));
    const sendiri: Kerja[] = papan.daftar(bln);
    const kanban = await hermesProfiles.recentTasks(70 * 86400, 600).catch(() => []);
    const dariKanban: Kerja[] = kanban.map((t) => {
        const status = t.status === 'done' ? 'selesai' : ['running', 'review'].includes(t.status) ? 'proses' : 'todo';
        const ai = t.assignee || 'default';
        return { id: `h${t.id}`, ai, nama: nama.get(ai) || ai, judul: t.title, detail: t.status === 'blocked' ? 'Terhenti — menunggu sesuatu.' : t.status === 'review' ? 'Menunggu diperiksa.' : undefined, hasil: t.result ? String(t.result).replace(/\s+/g, ' ').slice(0, 300) : undefined,
            sumber: 'tugas' as const, status: status as Kerja['status'], dibuat: t.createdAt * 1000, mulai: t.startedAt ? t.startedAt * 1000 : undefined, selesai: t.completedAt ? t.completedAt * 1000 : undefined };
    }).filter((k) => (bln === kini && k.status !== 'selesai') || bulanWib(k.selesai || k.mulai || k.dibuat) === bln);
    const items = [...sendiri, ...dariKanban].sort((x, y) => (y.selesai || y.mulai || y.dibuat) - (x.selesai || x.mulai || x.dibuat));
    return { bulan: bln, kini, items };
}
app.get('/api/kantor/papan', requireToken, async (req, res) => {
    try {
        const r = await semuaKerja(String(req.query.bulan || ''));
        res.json({ ok: true, bulan: r.bulan, bulanIni: r.kini, daftarBulan: papan.daftarBulan(), items: r.items, anggota: [...roster().map((a) => ({ id: a.id, nama: a.nama }))], menunggu: hr.menunggu.length });
    } catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

// ── HR: review kinerja berkala, tidak boleh ada AI menganggur, delegasi lewat persetujuan Pak Rico ──
const hr = new Hr(config.dataDir);
if (!hr.st.reviewAt) { hr.st.reviewAt = Date.now() - (hr.hariReview - 7) * 86400_000; hr.simpan(); } // review pertama ±seminggu setelah dipasang (butuh data dulu)
const kabariTelegram = telegramNotifier(config.hermesHome);
const namaJoni = () => roster().find((a) => a.id === ID_JONI)?.nama || 'Joni';
/** Statistik N hari: gabungan bulan ini + bulan lalu (supaya awal bulan tidak terlihat kosong). */
async function statHr(hari: number): Promise<StatAi[]> {
    const kini = papan.bulanIni();
    const lalu = bulanWib(Date.now() - 31 * 86400_000);
    const a = (await semuaKerja(kini)).items, b = lalu !== kini ? papan.daftar(lalu) : [];
    return statistik([...a, ...b], roster().filter((x) => x.id !== ID_HR).map((x) => ({ id: x.id, nama: x.nama, peran: x.peran })), hari);
}
const TERLARANG = /\b(beli|membeli|jual|menjual|transfer|kirim(kan)?\s+(email|pesan|uang)|posting|unggah|hapus|menghapus|bayar|membayar)\b/i;
/** Joni menyusun usulan tugas untuk AI yang menganggur lalu MEMINTA PERSETUJUAN Pak Rico lewat chat pribadi. */
async function usulkanTugas(ngg: StatAi[], pembuka: string, tanyaPerintah: boolean) {
    const desk = new Map(roster().map((a) => [a.id, a.deskripsi]));
    let dariAi = new Map<string, { judul: string; isi: string }>();
    if (ngg.length) {
        try { dariAi = ambilUsulanJson(await percakapan.tugas(ID_JONI, 'Menyusun usulan tugas untuk anggota yang menganggur', hr.promptUsulan(ngg, desk), `${ngg.length} anggota belum punya pekerjaan minggu ini: ${ngg.map((s) => s.nama).join(', ')}`), new Set(ngg.map((s) => s.id))); }
        catch (e: any) { console.warn('[HR] Joni gagal menyusun usulan, pakai cadangan:', e?.message || e); }
    }
    const baru = hr.tambahUsulan(ngg.map((s) => {
        const u = dariAi.get(s.id); const aman = u && !TERLARANG.test(`${u.judul} ${u.isi}`) ? u : hr.usulanPolos(s);
        return { s, judul: aman.judul, isi: aman.isi, alasan: `Tidak ada pekerjaan selesai maupun berjalan dalam 7 hari terakhir.` };
    }));
    const baris: string[] = [pembuka];
    if (baru.length) {
        baris.push('', 'Saya usul mendelegasikan tugas berikut — mohon persetujuan Bapak:');
        baru.forEach((u, i) => baris.push(`${i + 1}. **${u.nama}** — ${u.judul}\n   ${u.isi}`));
        baris.push('', 'Setujui / tolak / ubah di **Kantor → Papan kerja → Persetujuan**. Tugas baru saya kirim setelah Bapak setuju.');
    }
    if (tanyaPerintah) baris.push('', 'Minggu ini Bapak belum memberi perintah apa pun ke tim. Ada yang ingin dikerjakan? Tulis saja di sini, nanti saya bagi ke orang yang tepat.');
    if (baris.length > 1) {
        percakapan.pesan(ID_JONI, ID_JONI, namaJoni(), baris.join('\n'));
        kabariTelegram(`🧑‍💼 ${namaJoni()}: ${baru.length ? `${baru.length} usulan tugas menunggu persetujuan Bapak` : 'minggu ini belum ada perintah dari Bapak'} — buka Chat ${namaJoni()} / Kantor → Papan kerja.`).catch(() => undefined);
    }
    return baru;
}
/** Cek mingguan (Senin): siapa menganggur → usulan tugas; belum ada perintah → Joni bertanya. */
async function cekMingguan(sebab: string) {
    if (hr.sibuk) return; hr.sibuk = 'cek';
    try {
        const stat = await statHr(7);
        const ngg = stat.filter((s) => s.menganggur && s.id !== ID_JONI && !hr.menunggu.some((u) => u.ai === s.id)); // Joni kepala tim: tidak mengusulkan tugas untuk dirinya sendiri
        const diam = Date.now() - percakapan.terakhirOwner() > 7 * 86400_000;
        await usulkanTugas(ngg, ngg.length ? `Pak Rico, hasil cek mingguan (${sebab}): ${ngg.map((s) => s.nama).join(', ')} belum punya pekerjaan dalam 7 hari terakhir.` : `Pak Rico, cek mingguan (${sebab}): semua anggota tim punya pekerjaan minggu ini.`, diam);
        hr.st.mingguKe = kunciMinggu(); hr.simpan();
    } finally { hr.sibuk = ''; }
}
/** Review HR berkala: bandingkan kinerja semua AI, laporkan ke Grup Kantor, teruskan yang menganggur ke Joni. */
async function reviewHr(sebab: string) {
    if (hr.sibuk) return; hr.sibuk = 'review';
    try {
        const stat = await statHr(hr.hariReview);
        const adaHr = roster().find((a) => a.id === ID_HR);
        let teks = '', oleh = adaHr?.nama || 'HR Officer';
        try {
            if (adaHr) teks = await percakapan.tugas(ID_HR, `Review kinerja tim AI (${hr.hariReview} hari)`, hr.promptReview(stat), `Membandingkan ${stat.length} anggota (${sebab}).`);
            else { teks = (await papan.jalankan({ ai: ID_HR, nama: 'HR Officer', judul: `Review kinerja tim AI (${hr.hariReview} hari)`, detail: `Membandingkan ${stat.length} anggota (${sebab}).`, sumber: 'tugas' }, async () => (await OfficeRoom.sharedLlm()?.complete('Kamu HR Officer yang adil dan lugas.', hr.promptReview(stat), 500, 2)) || '')) || ''; }
        } catch (e: any) { console.warn('[HR] review AI gagal:', e?.message || e); }
        if (!teks.trim()) { teks = hr.reviewPolos(stat); oleh = `${oleh} (ringkasan otomatis)`; }
        hr.st.review.push({ at: Date.now(), oleh, hari: hr.hariReview, teks: teks.trim().slice(0, 2500), stat }); hr.st.reviewAt = Date.now(); hr.simpan();
        const papanTeks = stat.map((s) => `${s.peringkat}. ${s.nama}: ${s.selesai} selesai, ${s.gagal} gagal${s.menganggur ? ' ⚠️ menganggur' : ''}`).join('\n');
        percakapan.pesan('grup', ID_HR, oleh, `📋 **Review kinerja ${hr.hariReview} hari**\n${teks.trim()}\n\n${papanTeks}`);
        const ngg = stat.filter((s) => s.menganggur && s.id !== ID_JONI && !hr.menunggu.some((u) => u.ai === s.id)); // Joni kepala tim: tidak mengusulkan tugas untuk dirinya sendiri
        if (ngg.length) await usulkanTugas(ngg, `Pak Rico, ${oleh} melaporkan ke saya: ${ngg.map((s) => s.nama).join(', ')} menganggur.`, false);
    } finally { hr.sibuk = ''; }
}
setInterval(() => {
    const w = new Date(Date.now() + 7 * 3600_000), jam = w.getUTCHours();
    if (jam < 9 || jam > 20 || !roster().length) return;
    if (Date.now() >= hr.reviewBerikut()) reviewHr('terjadwal').catch((e) => console.warn('[HR]', e?.message || e));
    else if (w.getUTCDay() === 1 && hr.st.mingguKe !== kunciMinggu()) cekMingguan('Senin').catch((e) => console.warn('[HR]', e?.message || e));
}, 3600_000);
app.get('/api/kantor/hr', requireToken, async (_req, res) => {
    try { res.json({ ok: true, hari: hr.hariReview, stat: await statHr(hr.hariReview), review: hr.st.review.slice(-3).reverse(), usulan: hr.st.usulan.slice(-30).reverse(), reviewBerikut: hr.reviewBerikut(), sibuk: hr.sibuk, adaHr: roster().some((a) => a.id === ID_HR) }); }
    catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});
/** Buat profil Hermes "HR Officer" (Hana) di VPS — sekali saja, lewat tombol di Papan kerja. */
app.post('/api/kantor/hr/pasang', requireToken, (_req, res) => {
    const f = path.join(config.dataDir, 'atur-hr.sh');
    try { fs.writeFileSync(f, ATUR_HR); } catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }); return; }
    jalankanBerkas('bash', [f], { timeout: 60_000, env: { ...process.env, HERMES_HOME: config.hermesHome } }, (err, stdout, stderr) => {
        rosterCache.at = 0;
        if (err) { res.status(400).json({ ok: false, error: String(stdout || stderr || err.message).trim().split('\n').slice(-2).join(' ').slice(0, 300) }); return; }
        papan.catat({ ai: 'default', nama: '', judul: 'Merekrut AI baru: Hana (HR Officer)', sumber: 'sistem', status: 'selesai' });
        res.json({ ok: true, pesan: String(stdout).trim().split('\n').slice(-2).join(' ') });
    });
});
app.post('/api/kantor/hr/jalankan', requireToken, (req, res) => {
    const p = req.body?.jenis === 'cek' ? cekMingguan('diminta Pak Rico') : reviewHr('diminta Pak Rico');
    p.catch((e) => console.warn('[HR]', e?.message || e));
    res.json({ ok: true });
});
app.post('/api/kantor/hr/usulan/:id', requireToken, async (req, res) => {
    try {
        const u = hr.st.usulan.find((x) => x.id === String(req.params.id));
        if (!u || u.status !== 'menunggu') throw new Error('Usulan tidak ditemukan atau sudah diputus.');
        if (req.body?.aksi === 'tolak') {
            u.status = 'ditolak'; u.diputus = Date.now(); hr.simpan();
            percakapan.pesan(ID_JONI, ID_JONI, namaJoni(), `Baik Pak, usulan tugas untuk ${u.nama} ("${u.judul}") saya batalkan.`);
        } else {
            const judul = String(req.body?.judul || u.judul).trim().slice(0, 120), isi = String(req.body?.isi || u.isi).trim().slice(0, 600);
            if (!judul) throw new Error('Judul tugas kosong.');
            const r = await hermesProfiles.createTask({ title: judul, assignee: u.ai, body: `${isi}\n\n(Didelegasikan ${namaJoni()} setelah disetujui ${config.ownerName}. Hanya riset/laporan — jangan membeli/menjual, mengirim pesan keluar, memposting, atau menghapus data.)`, createdBy: 'kantor:joni', idempotencyKey: `usulan-${u.id}` });
            if (!r.ok) throw new Error(`Tugas gagal dikirim ke ${u.nama}: ${r.error || 'Hermes tidak menjawab'}`);
            u.status = 'disetujui'; u.diputus = Date.now(); u.judul = judul; u.isi = isi; u.tugasId = r.id; hr.simpan();
            percakapan.pesan(ID_JONI, ID_JONI, namaJoni(), `✅ Disetujui. Tugas "${judul}" sudah saya delegasikan ke ${u.nama}. Perkembangannya bisa dilihat di Papan kerja.`);
        }
        res.json({ ok: true, usulan: u });
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

// ── Divisi Social Media (banyak akun & platform): lihat kantor/sosmedRute.ts ──
const sosmedTim = pasangSosmed({
    app, requireToken, dataDir: config.dataDir, hermesHome: config.hermesHome, skillDir: path.join(__dirname, 'hermes-skills'),
    roster, resetRoster: () => { rosterCache.at = 0; }, papan, percakapan, llm: () => OfficeRoom.sharedLlm() as any,
    berkas, kabari: kabariTelegram, idJoni: ID_JONI, namaJoni, aturSosmed: ATUR_SOSMED, jalankanBerkas
});

// ── Kotak "Perlu keputusan Bapak" (ATM Munder Difflin: satu antrean persetujuan, tiap item bertiket) ──
const fileKode = path.join(config.dataDir, 'keputusan-kode.json');
let kodeSt: { n: Record<string, number>; peta: Record<string, string> } = { n: {}, peta: {} };
try { kodeSt = { ...kodeSt, ...JSON.parse(fs.readFileSync(fileKode, 'utf8')) }; } catch { /* baru */ }
const kodeUntuk = (awalan: string, kunci: string) => {
    const k = `${awalan}:${kunci}`;
    if (!kodeSt.peta[k]) { kodeSt.n[awalan] = (kodeSt.n[awalan] || 0) + 1; kodeSt.peta[k] = `${awalan}-${kodeSt.n[awalan]}`; try { fs.writeFileSync(fileKode, JSON.stringify(kodeSt)); } catch { /* */ } }
    return kodeSt.peta[k];
};
interface Keputusan { kode: string; jenis: 'tugas' | 'posting' | 'balasan' | 'rem'; judul: string; detail: string; dari: string; at: number; buka?: { halaman: string }; setuju?: { url: string; body?: any; label: string }; tolak?: { url: string; body?: any; label: string } }
app.get('/api/kantor/keputusan', requireToken, (_req, res) => {
    const out: Keputusan[] = [];
    const nm = (id: string) => roster().find((a) => a.id === id)?.nama || id;
    for (const u of hr.st.usulan.filter((x) => x.status === 'menunggu')) out.push({ kode: kodeUntuk('TGS', u.id), jenis: 'tugas', judul: `Tugas untuk ${u.nama}: ${u.judul}`, detail: [u.isi, u.alasan && `Alasan: ${u.alasan}`].filter(Boolean).join('\n'), dari: namaJoni(), at: (u as any).dibuat || Date.now(), setuju: { url: `/api/kantor/hr/usulan/${u.id}`, body: { aksi: 'setuju' }, label: 'Setujui & kirim' }, tolak: { url: `/api/kantor/hr/usulan/${u.id}`, body: { aksi: 'tolak' }, label: 'Tolak' } });
    for (const c of sosmedTim.semua()) {
        const ap = sosmedTim.autopilot(c.a.id), akun = encodeURIComponent(c.a.id);
        if (!ap.aktif) for (const k of c.s.st.konten.filter((x) => x.status === 'aset' && !x.disetujui)) out.push({ kode: kodeUntuk('KON', `${c.a.id}/${k.id}`), jenis: 'posting', judul: `Unggah "${k.judul}"`, detail: `${c.a.nama} · ${k.format} · jadwal ${k.tgl} ${k.jam || ''}`.trim(), dari: 'Vino', at: k.diubah || Date.now(), buka: { halaman: 'sosmed' }, setuju: { url: `/api/kantor/sosmed/konten/${k.id}/setujui?akun=${akun}`, label: 'Setujui unggah' } });
        if (!ap.aktif || !ap.balas) for (const m of c.s.st.komentar.filter((x) => x.status === 'draf' && x.draf).slice(0, 30)) out.push({ kode: kodeUntuk('KOM', `${c.a.id}/${m.id}`), jenis: 'balasan', judul: `Balas @${m.user}`, detail: `Komentar: ${m.teks}\nDraf: ${m.draf}`, dari: 'Dea', at: m.at, setuju: { url: `/api/kantor/sosmed/komentar/${m.id}/kirim?akun=${akun}`, body: {}, label: 'Kirim balasan' }, tolak: { url: `/api/kantor/sosmed/komentar/${m.id}/abaikan?akun=${akun}`, body: {}, label: 'Abaikan' } });
    }
    for (const a of roster()) { const r = rem.ringkas(a.id); if (r.status === 'henti') out.push({ kode: kodeUntuk('REM', `${a.id}/${r.sejak}`), jenis: 'rem', judul: `${a.nama} dihentikan rem otonomi`, detail: r.sebab, dari: 'Rem otonomi', at: r.sejak, setuju: { url: `/api/kantor/rem/${a.id}/lanjutkan`, body: {}, label: 'Lanjutkan' } }); }
    void nm;
    res.json({ ok: true, item: out.sort((a, b) => b.at - a.at) });
});

// ── Knowledge Reels (Kirana + tim, gotong royong): lihat kantor/krRute.ts ──
const knowledgeReels = pasangKr({
    app, requireToken, dataDir: config.dataDir, hermesHome: config.hermesHome, roster, resetRoster: () => { rosterCache.at = 0; }, papan, percakapan,
    llm: () => OfficeRoom.sharedLlm() as any, catatan: { tulis: (rel, isi) => catatan.tulis(rel, isi) },
    saham: () => { const st = tradingDesk.load(); return { simbol: screener.daftarSimbol(), watchlist: Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist])), detail: (s) => screener.detail(s) }; },
    kabari: kabariTelegram, aturKurator: ATUR_KURATOR, jalankanBerkas
});

// ── Rutin tambahan (keuangan mingguan) + pengatur model hemat token yang ditata HR: lihat kantor/rutin.ts ──
pasangRutin({
    app, requireToken, dataDir: config.dataDir, hermesHome: config.hermesHome, roster, papan, percakapan, llm: () => OfficeRoom.sharedLlm() as any,
    transaksi: async () => (await pencatat.report()).transaksi, batas: () => anggaran.get().batas || {}, kabari: kabariTelegram, idHr: ID_HR,
    catatan: { tulis: (rel, isi) => catatan.tulis(rel, isi) },
    saham: () => { const st = tradingDesk.load(); return { watchlist: Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist])), detail: (s) => screener.detail(s) }; },
    agenda: (h) => kalender.agenda(h), berkas: { root: berkas.root, kuota: berkas.kuota },
    kr: () => ({ post: knowledgeReels.st.post, catatan: knowledgeReels.st.catatan, judulPost: (id) => knowledgeReels.st.post.find((p) => p.id === id)?.judul || '' }),
    sosmed: () => sosmedTim.semua().map((c) => ({ id: c.a.id, nama: c.a.nama, platform: c.a.platform, niche: c.s.st.strategi?.niche || c.s.st.profil.topik || '' })),
    sosmedIde: (t) => sosmedTim.setIdeBerita(t),
    berat: () => ({ model: config.berat.model, perHari: config.berat.perHari, terpakai: kuotaBerat.terpakai() })
});

// ── Chat konsultasi Trading: AI menjawab HANYA dari data halaman Trading ──
const RE_TRADING = /trad|saham|invest|analis|pasar|market|stock|portofolio|bursa/i;
const anggotaTrading = () => { const r = roster(); const c = r.filter((a) => RE_TRADING.test(`${a.id} ${a.peran} ${a.deskripsi}`)); return (c.length ? c : r).map((a) => ({ id: a.id, nama: a.nama, peran: a.peran })); };
const ATURAN_TRADING = [
    `[Konsultasi di halaman Trading aplikasi Kantor Virtual dengan ${config.ownerName}.]`,
    'ATURAN KETAT:',
    '1. Jawab HANYA dari blok DATA di bawah (skor, alasan, fundamental, berita, uji mundur, preset, watchlist/posisi). Jangan memakai ingatan, pengetahuan umum tentang perusahaan, internet, alat, atau skill apa pun.',
    '2. Kalau jawabannya tidak ada di DATA, katakan terus terang "datanya tidak ada di halaman Trading" dan sebutkan data apa yang ada. Jangan menebak atau mengarang angka.',
    '3. Sebut angka & sumber bagiannya (mis. "skor teknikal NVDA Beli (0,32)", "uji mundur 60 hari: Momentum +0,77%"). Kalau skor teknikal horison ini belum terbukti, ingatkan.',
    '4. Jangan menyuruh membeli/menjual dengan pasti; jelaskan apa kata data & risikonya. Kantor tidak terhubung ke broker. Akhiri saran keputusan dengan "Bukan saran keuangan."'
].join('\n');
app.get('/api/kantor/trading-chat/anggota', requireToken, (_req, res) => { res.json({ ok: true, anggota: anggotaTrading() }); });
app.get('/api/kantor/trading-chat/:ai', requireToken, (req, res) => { res.json({ ok: true, ...percakapan.thread(`trading-${String(req.params.ai)}`) }); });
app.post('/api/kantor/trading-chat/:ai', requireToken, (req, res) => {
    try {
        const ai = String(req.params.ai), teks = String(req.body?.teks || '');
        if (!anggotaTrading().some((a) => a.id === ai)) throw new Error('AI ini bukan anggota tim trading.');
        const [H, mode, pt, pf] = qH(req);
        const st = tradingDesk.load();
        const data = konteksTrading({ screener, dataDir: config.dataDir, H, mode, pt, pf, saham: String(req.query.s || '').toUpperCase() || undefined, teks, watch: st.watchlist, posisi: st.positions });
        res.json({ ok: true, pesan: percakapan.kirimDenganData(`trading-${ai}`, ai, teks, data, ATURAN_TRADING) });
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
// Profil perusahaan (Nasdaq) + ringkasan singkat berbahasa Indonesia (AI gratis), disimpan 30 hari.
const profilDir = path.join(config.dataDir, 'profil'); fs.mkdirSync(profilDir, { recursive: true });
app.get('/api/kantor/profil/:s', requireToken, async (req, res) => {
    const s = String(req.params.s).toUpperCase().replace(/[^A-Z0-9.\-^]/g, '').slice(0, 12);
    const file = path.join(profilDir, `${s.replace(/\^/g, '_')}.json`);
    try {
        try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (Date.now() - c.at < 30 * 86400_000) { res.json({ ok: true, ...c }); return; } } catch { /* belum ada */ }
        const p = await nasdaqProfil(s);
        let ringkas = '';
        const llm = OfficeRoom.sharedLlm();
        if (llm && p.deskripsi) {
            const out = await llm.complete('Ringkas profil perusahaan berikut dalam 2–3 kalimat bahasa Indonesia yang mudah dipahami awam: apa bisnisnya, produk/sumber pendapatan utamanya, dan posisinya di pasar. Tanpa pembuka, tanpa poin-poin.', p.deskripsi.slice(0, 3000), 300, 2).catch(() => null);
            ringkas = String(out || '').trim().slice(0, 700);
        }
        if (!ringkas) ringkas = p.deskripsi.split(/(?<=\.)\s+/).slice(0, 2).join(' ').slice(0, 500);
        const out = { ...p, ringkas, at: Date.now() };
        fs.writeFileSync(file, JSON.stringify(out));
        res.json({ ok: true, ...out });
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
// Simulasi 10.000 jalur (bootstrap dari pergerakan historis saham itu sendiri).
const simCache = new Map<string, { at: number; v: any }>();
// ── Prediksi harga: Kronos (model dasar candlestick) — cadangan: simulasi acak dari riwayat ──
const kronos = new Kronos(config.dataDir);
const JALUR_KRONOS = Math.max(8, Math.min(48, Number(process.env.KRONOS_JALUR) || 24));
app.get('/api/kantor/kronos/status', requireToken, (_req, res) => { res.json({ ok: true, ...kronos.status(), jalur: JALUR_KRONOS }); });
app.post('/api/kantor/kronos/pasang', requireToken, (_req, res) => {
    if (kronos.pasang()) papan.catat({ ai: 'trading', nama: '', judul: 'Memasang Kronos (model prediksi candlestick) di VPS', sumber: 'trading', status: 'selesai' });
    res.json({ ok: true, ...kronos.status() });
});
/** Jalur prediksi Kronos → ringkasan profil target/stop + pita sebaran untuk grafik. */
async function prediksiKronos(s: string, H: number, harga: number, batang: BarK[], yT: string[], satuan: 'hari' | 'batang') {
    const P = yT.length;
    const n = Math.max(8, Math.min(JALUR_KRONOS, Math.round((JALUR_KRONOS * 40) / Math.max(40, P)))); // horison panjang → jalur lebih sedikit supaya CPU VPS kuat
    const r = await papan.jalankanLama({ ai: 'trading', judul: `Prediksi Kronos ${s} (${P} ${satuan === 'hari' ? 'hari bursa' : 'batang'} ke depan)`, sumber: 'trading' }, () => kronos.prediksi(batang.slice(-Math.min(kronos.maksKonteks - P, P <= 20 ? 400 : 256)), yT, n)); // horison panjang → konteks lebih pendek supaya CPU kuat
    const jalur = new Float64Array(n * P * 3);
    const tutup: number[][] = [];
    r.paths.forEach((p, i) => {
        const cs: number[] = [];
        p.forEach(([o, h, l, c], t) => {
            const hi = Math.max(o, h, l, c), lo = Math.max(0.0001, Math.min(o, h, l, c)), k = (i * P + t) * 3;
            jalur[k] = hi; jalur[k + 1] = lo; jalur[k + 2] = Math.max(0.0001, c); cs.push(Math.max(0.0001, c));
        });
        tutup.push(cs);
    });
    const kuantil = (a: number[], q: number) => { const x = [...a].sort((u, v) => u - v); return x[Math.min(x.length - 1, Math.max(0, Math.round(q * (x.length - 1))))]; };
    const pita = Array.from({ length: P }, (_, t) => { const a = tutup.map((c) => c[t]); return { p10: +kuantil(a, 0.1).toFixed(2), p50: +kuantil(a, 0.5).toFixed(2), p90: +kuantil(a, 0.9).toFixed(2) }; });
    const akhir = tutup.map((c) => c[P - 1]);
    return {
        ...ringkasJalur(harga, jalur, n, P, { profil: ['konservatif', 'moderat', 'agresif'], jalur: n, satuan }),
        mesin: 'kronos', model: kronos.status().model, simulasi: n, pita, waktu: yT,
        riwayat: batang.slice(-90).map((b) => ({ t: b.t, c: b.c })),
        pNaik: Math.round((akhir.filter((x) => x > harga).length / n) * 100), medianAkhir: +kuantil(akhir, 0.5).toFixed(2), medianPct: +((kuantil(akhir, 0.5) / harga - 1) * 100).toFixed(2), detik: r.detik
    };
}
app.get('/api/kantor/simulasi/:s', requireToken, async (req, res) => {
    const s = String(req.params.s).toUpperCase().slice(0, 12);
    const [H, mode] = qH(req);
    const kunci = `${s}|${H}|${mode}|${kronos.terpasang ? 'k' : 's'}`;
    const c = simCache.get(kunci);
    if (c && Date.now() - c.at < (c.v.mesin === 'kronos' && H > 1 ? 6 * 3600_000 : 20 * 60_000)) { res.json({ ok: true, ...c.v }); return; }
    try {
        const b = screener.hargaTerakhir(s);
        let out: any, catatan = '';
        if (H === 1) {
            // Scalping / day trading: batang menit (CNBC 5 hari).
            const r = await cnbcChart(s, '5D');
            const q0 = r.indicators.quote[0];
            const ts: number[] = r.timestamp;
            const step = ts.length > 2 ? Math.round(Math.min(...ts.slice(1).map((t, i) => t - ts[i]).filter((x) => x > 0)) / 60) : 5;
            const hari = new Map<string, number>(); for (const t of ts) { const k = new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10); hari.set(k, (hari.get(k) || 0) + 1); }
            const perSesi = Math.max(...hari.values());
            const harga = Number(q0.close[q0.close.length - 1]) || b?.harga || 0;
            if (kronos.terpasang) {
                try {
                    const batang: BarK[] = ts.map((t, i) => ({ t: new Date(t * 1000).toISOString(), o: +q0.open[i], h: +q0.high[i], l: +q0.low[i], c: +q0.close[i], v: +(q0.volume?.[i] || 0) })).filter((x) => x.c > 0 && x.h >= x.l && x.o > 0);
                    const P = Math.min(perSesi, 48);
                    const t0 = ts[ts.length - 1];
                    out = { ...(await prediksiKronos(s, H, harga, batang, Array.from({ length: P }, (_, i) => new Date((t0 + (i + 1) * step * 60) * 1000).toISOString()), 'batang')), menitPerBatang: step, sumber: `CNBC (batang ${step} menit)` };
                } catch (e: any) { catatan = String(e?.message || e); }
            }
            if (!out) {
                const langkah = langkahDari(q0.high, q0.low, q0.close).filter((x) => Math.abs(x.c - 1) < 0.08);
                out = { ...simulasi(harga, langkah, Math.min(perSesi, 400), { profil: ['konservatif', 'moderat', 'agresif'], satuan: 'batang' }), mesin: 'acak', menitPerBatang: step, sumber: 'CNBC (menit)' };
            }
        } else {
            const seri = screener.seriHarian(s);
            if (!seri || !b) throw new Error('Data harga harian belum ada. Tekan ↻ di Trading dulu.');
            if (kronos.terpasang) {
                try {
                    const rows = await porto.harian(path.join(config.dataDir, 'portofolio-harga'), s);
                    if (rows.length < 60) throw new Error('Riwayat harga bertanggal kurang dari 60 hari.');
                    const batang: BarK[] = rows.filter((x) => x.c > 0 && x.h >= x.l).map((x) => ({ t: x.t, o: x.o || x.c, h: x.h, l: x.l, c: x.c, v: x.v }));
                    const P = Math.min(H, 120);
                    out = { ...(await prediksiKronos(s, H, batang[batang.length - 1].c, batang, hariBursaBerikut(batang[batang.length - 1].t, P), 'hari')), sumber: `harga harian ${batang.length} hari` };
                } catch (e: any) { catatan = String(e?.message || e); }
            }
            if (!out) out = { ...simulasi(b.harga, langkahDari(seri.h, seri.l, seri.c), H, { profil: ['konservatif', 'moderat', 'agresif'], satuan: 'hari' }), mesin: 'acak', sumber: 'harga harian 1 tahun' };
        }
        out.horizon = H; out.mode = mode; out.kronos = { terpasang: kronos.terpasang, memasang: kronos.status().memasang, catatan };
        if (!catatan) simCache.set(kunci, { at: Date.now(), v: out });
        if (simCache.size > 100) simCache.delete(simCache.keys().next().value as string);
        res.json({ ok: true, ...out });
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.get('/api/kantor/screener/:s', requireToken, (req, res) => { res.json({ ok: true, spark: screener.spark(String(req.params.s).toUpperCase()) }); });
app.post('/api/kantor/screener/perbarui', requireToken, (req, res) => {
    if (screener.sibuk) { res.json({ ok: true, sibuk: screener.sibuk }); return; }
    const p = req.body?.jenis === 'fundamental' ? screener.perbaruiFundamental() : req.body?.jenis === 'berita' ? screener.perbaruiBerita() : screener.perbaruiTeknikal(true);
    p.catch((e) => console.warn('[Screener]', e?.message || e));
    res.json({ ok: true, mulai: true });
});
// ── Portofolio (pencatatan; eksekusi tetap di broker Pak Rico) ──
async function hargaKiniPorto(sym: string): Promise<number | null> {
    const c = priceCache.get(sym);
    if (c && Date.now() - c.at < 120_000) return c.p;
    try { const p = await fetchPrice(sym); priceCache.set(sym, { at: Date.now(), p }); return p; } catch { return screener.hargaTerakhir(sym)?.harga ?? null; }
}
app.get('/api/kantor/portofolio', requireToken, async (req, res) => {
    try {
        const r = String(req.query.res || 'harian');
        res.json({ ok: true, ...(await porto.laporan(tradingDesk, config.dataDir, hargaKiniPorto, (['harian', 'mingguan', 'bulanan'].includes(r) ? r : 'harian') as porto.Resolusi)) });
    } catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});
app.post('/api/kantor/portofolio/:aksi', requireToken, (req, res) => {
    try {
        const b = req.body || {}, a = String(req.params.aksi);
        let hasil: any = null;
        if (a === 'buka') hasil = porto.buka(tradingDesk, b);
        else if (a === 'ubah') hasil = porto.ubah(tradingDesk, String(b.symbol || ''), b);
        else if (a === 'tutup') hasil = porto.tutup(tradingDesk, String(b.symbol || ''), +b.harga, b.shares ? +b.shares : undefined, b.tgl);
        else if (a === 'hapus') porto.hapus(tradingDesk, b.jenis === 'riwayat' ? 'riwayat' : 'posisi', String(b.symbol || ''), String(b.openedAt || ''), b.closedAt);
        else if (a === 'dana') porto.aturDana(tradingDesk, b);
        else throw new Error('Aksi tidak dikenal.');
        res.json({ ok: true, hasil });
    } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.post('/api/kantor/trading/watchlist', requireToken, (req, res) => {
    const simbol = String(req.body?.simbol || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
    if (!simbol) { res.status(400).json({ ok: false, error: 'Simbol tidak valid' }); return; }
    tradingDesk.watchlist(req.body?.aksi === 'hapus' ? 'hapus' : 'tambah', [simbol]);
    res.json({ ok: true, watchlist: tradingDesk.load().watchlist });
});

// ── Investigasi pergerakan saham ─────────────────────────────────────
const investigasi = new Investigasi(config.dataDir, () => OfficeRoom.sharedLlm(), telegramNotifier(config.hermesHome), () => {
    const st = tradingDesk.load();
    return Array.from(new Set([...st.positions.map((p) => p.symbol), ...st.watchlist]));
});
investigasi.papan = papan;
const jalankan = (fn: () => Promise<any>): express.RequestHandler => async (_req, res) => {
    try { res.json({ ok: true, ...(await fn()) }); } catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
};
app.get('/api/kantor/investigasi', requireToken, (_req, res) => { res.json({ ok: true, ...investigasi.data() }); });
app.post('/api/kantor/investigasi/selidiki', requireToken, (req, res, next) => jalankan(async () => ({ kasus: await investigasi.selidiki(String(req.body?.simbol || ''), 'manual') }))(req, res, next));
app.post('/api/kantor/investigasi/:id/putuskan', requireToken, (req, res, next) => jalankan(async () => ({ kasus: investigasi.putuskan(String(req.params.id), req.body?.status === 'diterima' ? 'diterima' : 'ditolak', String(req.body?.alasan || '')) }))(req, res, next));
app.post('/api/kantor/investigasi/:id/tanya', requireToken, (req, res, next) => jalankan(() => investigasi.tanya(String(req.params.id), String(req.body?.pertanyaan || ''), Array.isArray(req.body?.riwayat) ? req.body.riwayat : []))(req, res, next));
app.post('/api/kantor/investigasi/catatan', requireToken, (req, res, next) => jalankan(async () => {
    if (typeof req.body?.hapus === 'number') { investigasi.hapusCatatan(String(req.body?.simbol || ''), req.body.hapus); return { catatan: investigasi.data().catatan }; }
    investigasi.setCatatan(String(req.body?.simbol || ''), String(req.body?.teks || ''));
    return { catatan: investigasi.data().catatan };
})(req, res, next));

app.get('/api/kantor/jadwal', requireToken, async (req, res) => {
    try {
        const days = Math.min(60, Math.max(1, Number(req.query.hari) || 14));
        res.json({ ok: true, acara: await kalender.agenda(days, req.query.sync === '1') });
    } catch (e: any) {
        res.status(502).json({ ok: false, error: String(e?.message || e) });
    }
});

// Tampilan kantor (hasil build UI) disajikan dari server yang sama.
const uiCandidates = [config.uiDistDir, path.join(__dirname, 'ui'), path.resolve(__dirname, '../../ui/dist')];
const uiDir = uiCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
if (uiDir) {
    app.use(express.static(uiDir));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/matchmake')) return next();
        res.sendFile(path.join(uiDir, 'index.html'));
    });
    console.log(`[Kantor] Tampilan disajikan dari ${uiDir}`);
} else {
    console.warn('[Kantor] Folder tampilan (ui) tidak ditemukan. Hanya server yang berjalan.');
}

const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });
gameServer.define('office', OfficeRoom);

gameServer.listen(config.port, config.host).then(async () => {
    // Kantor langsung dibuka, walau belum ada yang menonton, supaya agen tetap "hidup".
    await matchMaker.createRoom('office', {});
    pencatat.start();
    tradingDesk.start();
    kalender.start();
    investigasi.start(() => !marketOpen());
    screener.start(() => !marketOpen());
    if (config.whatsapp.enabled) startWaChild();
    console.log(`[Kantor] Buka http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    if (config.host !== '127.0.0.1' && config.host !== 'localhost') {
        console.warn('[Kantor] PERINGATAN: server tidak hanya mendengarkan localhost. Pastikan port ini TIDAK terbuka ke internet.');
    }
});

const shutdown = async () => {
    console.log('[Kantor] Mematikan...');
    try { await gameServer.gracefullyShutdown(false); } catch { /* */ }
    process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
}
