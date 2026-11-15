import fs from 'fs';
import path from 'path';

/** Watchlist berfolder (mis. "Dividen", "AI", "Pantau minggu ini"). Folder "Utama" = watchlist Dito (dipantau & dibuatkan strategi). */
export interface Folder { id: string; nama: string; ikon: string; simbol: string[] }

export class WatchFolder {
    private file: string;
    private st: { folders: Folder[] };
    constructor(dataDir: string) {
        this.file = path.join(dataDir, 'watchlist-folder.json');
        try { this.st = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.st = { folders: [] }; }
    }
    private simpan() { fs.writeFileSync(this.file, JSON.stringify(this.st, null, 1)); }
    list() { return this.st.folders; }
    private bersih(s: string) { return String(s || '').toUpperCase().replace(/[^A-Z0-9.^-]/g, '').slice(0, 12); }

    aksi(b: any): Folder[] {
        const id = String(b?.id || '');
        const f = this.st.folders.find((x) => x.id === id);
        switch (b?.aksi) {
            case 'buat': {
                const nama = String(b?.nama || '').trim().slice(0, 40);
                if (!nama) throw new Error('Nama folder wajib diisi');
                if (this.st.folders.length >= 30) throw new Error('Maksimal 30 folder');
                this.st.folders.push({ id: Date.now().toString(36), nama, ikon: String(b?.ikon || '📁').slice(0, 4), simbol: [] });
                break;
            }
            case 'ubah': if (!f) throw new Error('Folder tidak ada'); f.nama = String(b?.nama || f.nama).trim().slice(0, 40) || f.nama; f.ikon = String(b?.ikon || f.ikon).slice(0, 4); break;
            case 'hapus': this.st.folders = this.st.folders.filter((x) => x.id !== id); break;
            case 'tambah': {
                if (!f) throw new Error('Folder tidak ada');
                const s = this.bersih(b?.simbol);
                if (!s) throw new Error('Simbol tidak valid');
                if (!f.simbol.includes(s)) f.simbol.push(s);
                f.simbol = f.simbol.slice(0, 200);
                break;
            }
            case 'buang': if (!f) throw new Error('Folder tidak ada'); f.simbol = f.simbol.filter((x) => x !== this.bersih(b?.simbol)); break;
            case 'urut': if (!f) throw new Error('Folder tidak ada'); if (Array.isArray(b?.simbol)) f.simbol = b.simbol.map((x: string) => this.bersih(x)).filter((x: string) => f.simbol.includes(x)); break;
            default: throw new Error('Aksi tidak dikenal');
        }
        this.simpan();
        return this.st.folders;
    }
}
