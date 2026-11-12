import fs from 'fs';
import path from 'path';
import express from 'express';
import { Server, matchMaker } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';
import { loadConfig } from './kantor/config';
import { KantorAuth } from './kantor/auth';
import { Pencatat, telegramNotifier } from './kantor/pencatat';

const config = loadConfig();

// Mode uji: `node kantor-server.js --uji-pencatat` → tampilkan transaksi yang AKAN dicatat, tanpa menulis apa pun.
if (process.argv.includes('--uji-pencatat')) {
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
    new Pencatat(config.pencatat, config.hermesHome, config.dataDir, telegramNotifier(config.hermesHome)).start();
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
