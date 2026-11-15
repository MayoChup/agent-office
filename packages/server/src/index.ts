import fs from 'fs';
import path from 'path';
import express from 'express';
import { Server, matchMaker } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';
import { loadConfig } from './kantor/config';
import { KantorAuth } from './kantor/auth';
import { Pencatat, telegramNotifier, ringkasanKeuangan, telegramSebagai, sambilMengetik } from './kantor/pencatat';
import { TradingDesk, tradingCli, fetchPrice, marketOpen } from './kantor/trading';
import { Kalender } from './kantor/kalender';
import { Percakapan, Anggota, KuotaBerat, hermesSekali, jalankan as jalankanHermes } from './kantor/percakapan';
import { Investigasi } from './kantor/investigasi';
import { Screener, ambilCandle } from './kantor/screener';
import { telegramKirim } from './kantor/telegram';
import { HermesBridge } from './kantor/hermes';
import { slidesCli } from './kantor/slides';
import { WaJanji, WaReader, waLoginCli, waLogoutCli, waLinked } from './kantor/wa';
import { FreeLlm } from './kantor/freeLlm';
import { spawn } from 'child_process';
import os from 'os';

const config = loadConfig();

// Daftar AI (nama & peran) dari profil Hermes + nama tampilan di kantor.config.json.
const hermesProfiles = new HermesBridge(config.hermesHome, config.kanbanDbPath, config.hermesBin);
let rosterCache: { at: number; list: Anggota[] } = { at: 0, list: [] };
const roster = (): Anggota[] => {
    if (Date.now() - rosterCache.at < 60_000) return rosterCache.list;
    const list = hermesProfiles.listProfiles().map((p) => {
        const o = config.agents[p.id] || {};
        return { id: p.id, nama: o.name || p.displayName || p.id, peran: o.title || p.title || (p.id === 'default' ? 'Kepala' : ''), deskripsi: o.role || p.description || '' };
    });
    rosterCache = { at: Date.now(), list };
    return list;
};
const kuotaBerat = new KuotaBerat(config.dataDir, config.berat.model, config.berat.perHari);

// Mode uji: `node kantor-server.js --uji-pencatat` → tampilkan transaksi yang AKAN dicatat, tanpa menulis apa pun.
const tradingDeskDir = process.env.TRADER_DESK || path.join(os.homedir(), 'trader-desk');
const tradingArg = process.argv.indexOf('--trading');
if (tradingArg >= 0) {
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
app.use(express.json({ limit: '32kb' }));

// CORS: supaya tampilan di Vercel boleh memanggil server ini.
app.use('/api/kantor', (req, res, next) => {
    const origin = String(req.headers.origin || '');
    const allowAll = config.allowedOrigins.includes('*');
    if (origin && (allowAll || config.allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
const percakapan = new Percakapan(config.dataDir, config.hermesBin, config.ownerName, roster, () => OfficeRoom.sharedLlm(), kuotaBerat);
app.get('/api/kantor/chat', requireToken, (_req, res) => { res.json({ ok: true, thread: percakapan.daftar() }); });
app.get('/api/kantor/chat/:id', requireToken, (req, res) => { res.json({ ok: true, ...percakapan.thread(String(req.params.id)) }); });
app.post('/api/kantor/chat/:id', requireToken, (req, res) => {
    try { res.json({ ok: true, pesan: percakapan.kirim(String(req.params.id), String(req.body?.teks || '')) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});

// ── Penyaring saham (fundamental SEC + teknikal) ─────────────────────
const screener = new Screener(config.dataDir, () => tradingDesk.load().watchlist);
app.get('/api/kantor/screener', requireToken, (_req, res) => { res.json({ ok: true, ...screener.data() }); });
app.get('/api/kantor/candle/:s', requireToken, async (req, res) => {
    try { res.json({ ok: true, ...(await ambilCandle(String(req.params.s), String(req.query.r || '6B'))) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.get('/api/kantor/saham/:s', requireToken, async (req, res) => {
    try { res.json({ ok: true, baris: await screener.satu(String(req.params.s)) }); }
    catch (e: any) { res.status(400).json({ ok: false, error: String(e?.message || e) }); }
});
app.get('/api/kantor/screener/:s', requireToken, (req, res) => { res.json({ ok: true, spark: screener.spark(String(req.params.s).toUpperCase()) }); });
app.post('/api/kantor/screener/perbarui', requireToken, (req, res) => {
    if (screener.sibuk) { res.json({ ok: true, sibuk: screener.sibuk }); return; }
    const p = req.body?.jenis === 'fundamental' ? screener.perbaruiFundamental() : screener.perbaruiTeknikal(true);
    p.catch((e) => console.warn('[Screener]', e?.message || e));
    res.json({ ok: true, mulai: true });
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
