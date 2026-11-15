import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

/**
 * Catatan ala OneNote di atas Otak Kantor (vault Obsidian di ~/otak-kantor).
 * Buku = folder, bagian = sub-folder, halaman = file .md, gambar = .svg/.png/.jpg.
 * Setiap simpan langsung di-commit ke git (atas nama Pak Rico), lalu dikirim ke GitHub → muncul di Obsidian HP.
 * Folder tersembunyi (.git, .obsidian, .trash) dan "Pribadi" tidak pernah disentuh.
 */

const FILE_OK = /\.(md|svg|png|jpe?g|webp)$/i;
const MAX_TEKS = 2 * 1024 * 1024;
const MAX_GAMBAR = 8 * 1024 * 1024;

export interface Simpul { nama: string; path: string; folder: boolean; mtime: number; size?: number; anak?: Simpul[] }

function git(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => execFile('git', args, { cwd, timeout: 60_000 }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim().split('\n').pop())) : resolve(String(out)))));
}

export class Catatan {
    private pushTimer: NodeJS.Timeout | null = null;
    private kunci: Promise<unknown> = Promise.resolve();
    status = { pushAt: 0, error: '' };

    constructor(public root: string) {}
    ada() { return fs.existsSync(this.root) && fs.statSync(this.root).isDirectory(); }

    /** Path relatif → absolut yang aman (tidak bisa keluar dari vault / masuk folder terlarang). */
    private aman(rel: string, harusFile = false): string {
        const bersih = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const parts = bersih.split('/').filter(Boolean);
        if (parts.some((p) => p.startsWith('.') || p === '..')) throw new Error('Path tidak diizinkan');
        if (parts[0] && parts[0].toLowerCase() === 'pribadi') throw new Error('Folder Pribadi tidak bisa dibuka dari web');
        const abs = path.resolve(this.root, ...parts);
        if (abs !== this.root && !abs.startsWith(this.root + path.sep)) throw new Error('Path tidak diizinkan');
        if (harusFile && !FILE_OK.test(abs)) throw new Error('Jenis file tidak didukung');
        return abs;
    }
    private rel(abs: string) { return path.relative(this.root, abs).split(path.sep).join('/'); }

    pohon(): Simpul {
        const jalan = (abs: string, depth: number): Simpul => {
            const st = fs.statSync(abs);
            const node: Simpul = { nama: path.basename(abs), path: this.rel(abs), folder: true, mtime: st.mtimeMs, anak: [] };
            if (depth > 6) return node;
            for (const n of fs.readdirSync(abs)) {
                if (n.startsWith('.') || (depth === 0 && n.toLowerCase() === 'pribadi')) continue;
                const p = path.join(abs, n);
                let s: fs.Stats;
                try { s = fs.statSync(p); } catch { continue; }
                if (s.isDirectory()) node.anak!.push(jalan(p, depth + 1));
                else if (FILE_OK.test(n)) node.anak!.push({ nama: n, path: this.rel(p), folder: false, mtime: s.mtimeMs, size: s.size });
            }
            node.anak!.sort((a, b) => (a.folder === b.folder ? a.nama.localeCompare(b.nama, 'id') : a.folder ? -1 : 1));
            return node;
        };
        return jalan(this.root, 0);
    }

    baca(rel: string): { isi: string; mtime: number } {
        const abs = this.aman(rel, true);
        const st = fs.statSync(abs);
        if (st.size > MAX_TEKS && /\.(md|svg)$/i.test(abs)) throw new Error('File terlalu besar');
        return { isi: fs.readFileSync(abs, 'utf8'), mtime: st.mtimeMs };
    }
    berkas(rel: string): { abs: string } { return { abs: this.aman(rel, true) }; }

    cari(q: string) {
        const kata = q.trim().toLowerCase();
        if (kata.length < 2) return [];
        const out: Array<{ path: string; cuplikan: string }> = [];
        const jalan = (s: Simpul) => {
            for (const a of s.anak || []) {
                if (out.length >= 40) return;
                if (a.folder) { jalan(a); continue; }
                if (!a.nama.endsWith('.md')) continue;
                const isi = fs.readFileSync(this.aman(a.path), 'utf8');
                const i = isi.toLowerCase().indexOf(kata);
                if (i >= 0 || a.nama.toLowerCase().includes(kata)) out.push({ path: a.path, cuplikan: i >= 0 ? isi.slice(Math.max(0, i - 50), i + 90).replace(/\s+/g, ' ') : '' });
            }
        };
        jalan(this.pohon());
        return out;
    }

    /** Simpan + commit (berurutan supaya git tidak bentrok). */
    private antre<T>(fn: () => Promise<T>): Promise<T> {
        const p = this.kunci.then(fn, fn);
        this.kunci = p.catch(() => undefined);
        return p;
    }
    private async commit(pesan: string, paths: string[]) {
        try {
            await git(this.root, ['add', '-A', '--', ...paths]);
            await git(this.root, ['-c', 'user.name=Pak Rico (web)', '-c', 'user.email=kantor@localhost', 'commit', '-q', '-m', pesan]).catch(() => undefined);
        } catch (e: any) { this.status.error = e.message; }
        if (this.pushTimer) clearTimeout(this.pushTimer);
        this.pushTimer = setTimeout(() => {
            this.antre(async () => {
                try {
                    await git(this.root, ['pull', '-q', '--rebase', '--autostash']).catch(async (e) => { await git(this.root, ['rebase', '--abort']).catch(() => undefined); throw e; });
                    await git(this.root, ['push', '-q']);
                    this.status = { pushAt: Date.now(), error: '' };
                } catch (e: any) { this.status.error = `Sinkron GitHub gagal: ${e.message}`; }
            });
        }, 8000);
    }

    tulis(rel: string, isi: string, mtimeLama?: number) {
        return this.antre(async () => {
            const abs = this.aman(rel, true);
            if (!/\.(md|svg)$/i.test(abs)) throw new Error('Hanya .md atau .svg');
            if (Buffer.byteLength(isi) > MAX_TEKS) throw new Error('Isi terlalu besar (maks 2 MB)');
            // Cegah menimpa versi yang lebih baru (mis. diubah dari Obsidian HP di sela-sela).
            if (mtimeLama && fs.existsSync(abs) && fs.statSync(abs).mtimeMs > mtimeLama + 1000) {
                const err: any = new Error('Catatan ini baru saja diubah di tempat lain. Muat ulang dulu supaya tidak tertimpa.');
                err.konflik = true; throw err;
            }
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, isi);
            await this.commit(`Catatan: ${rel}`, [rel]);
            return { path: rel, mtime: fs.statSync(abs).mtimeMs };
        });
    }

    unggah(relFolder: string, nama: string, base64: string) {
        return this.antre(async () => {
            const buf = Buffer.from(base64, 'base64');
            if (buf.length > MAX_GAMBAR) throw new Error('Gambar terlalu besar (maks 8 MB)');
            const aman = nama.replace(/[^\w.\- ]+/g, '').slice(-60) || `gambar-${Date.now()}.png`;
            const rel = [relFolder, aman].filter(Boolean).join('/');
            const abs = this.aman(rel, true);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, buf);
            await this.commit(`Gambar: ${rel}`, [rel]);
            return { path: rel };
        });
    }

    buatFolder(rel: string) {
        return this.antre(async () => {
            const abs = this.aman(rel);
            fs.mkdirSync(abs, { recursive: true });
            const keep = path.join(abs, '.gitkeep');
            if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
            await this.commit(`Folder: ${rel}`, [this.rel(keep)]);
            return { path: rel };
        });
    }

    pindah(dari: string, ke: string) {
        return this.antre(async () => {
            const a = this.aman(dari), b = this.aman(ke);
            if (!fs.existsSync(a)) throw new Error('Tidak ditemukan');
            if (fs.existsSync(b)) throw new Error('Nama tujuan sudah ada');
            if (!fs.statSync(a).isDirectory() && !FILE_OK.test(b)) throw new Error('Jenis file tidak didukung');
            fs.mkdirSync(path.dirname(b), { recursive: true });
            fs.renameSync(a, b);
            await this.commit(`Pindah: ${dari} → ${ke}`, [dari, ke]);
            return { path: this.rel(b) };
        });
    }

    /** "Hapus" = pindah ke folder Sampah (bisa dikembalikan dari Obsidian). */
    buang(rel: string) {
        const nama = path.basename(rel);
        const tujuan = `Sampah/${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)} ${nama}`;
        return this.pindah(rel, tujuan);
    }
}
