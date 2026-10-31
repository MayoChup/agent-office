import fs from 'fs';
import path from 'path';
import express from 'express';
import { Server, matchMaker } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';
import { loadConfig } from './kantor/config';

const config = loadConfig();
OfficeRoom.config = config;

const app = express();
app.use(express.json());

// Status ringkas (dipakai juga untuk mengecek server hidup).
app.get('/api/kantor/status', (_req, res) => {
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
