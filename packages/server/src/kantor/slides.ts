import fs from 'fs';
import path from 'path';
import { Google } from './pencatat';

/**
 * Google Slides untuk divisi Editor (Putri si Presentasi).
 * Memakai izin Google yang sama dengan Hermes (scope "drive" sudah mencakup Slides),
 * jadi tidak perlu login ulang — cukup Slides API diaktifkan di Google Cloud.
 *
 *   node kantor-server.js --slides buat <kerangka.md|kerangka.json>
 *   node kantor-server.js --slides cek
 *
 * Kerangka Markdown:
 *   # Judul presentasi
 *   Subjudul (opsional, baris biasa setelah judul)
 *   ## Judul slide
 *   - poin
 *   - poin
 *   > catatan pembicara (opsional)
 */

export interface SlideOutline { judul: string; subjudul?: string; slides: Array<{ judul: string; poin: string[]; catatan?: string }> }

const API = 'https://slides.googleapis.com/v1/presentations';
const ENABLE_URL = 'https://console.cloud.google.com/apis/library/slides.googleapis.com';

export function parseOutline(text: string): SlideOutline {
    const t = text.trim();
    if (t.startsWith('{')) {
        const j = JSON.parse(t);
        return {
            judul: String(j.judul || j.title || 'Presentasi'),
            subjudul: j.subjudul || j.subtitle || '',
            slides: (j.slides || []).map((s: any) => ({
                judul: String(s.judul || s.title || ''),
                poin: (s.poin || s.points || s.bullets || []).map(String),
                catatan: s.catatan || s.notes || ''
            }))
        };
    }
    const out: SlideOutline = { judul: '', subjudul: '', slides: [] };
    let cur: SlideOutline['slides'][number] | null = null;
    for (const raw of t.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (/^#\s+/.test(line) && !out.judul) { out.judul = line.replace(/^#\s+/, ''); continue; }
        if (/^##\s+/.test(line)) { cur = { judul: line.replace(/^##+\s+/, ''), poin: [], catatan: '' }; out.slides.push(cur); continue; }
        if (/^>\s?/.test(line)) { if (cur) cur.catatan = `${cur.catatan ? `${cur.catatan}\n` : ''}${line.replace(/^>\s?/, '')}`; continue; }
        const bullet = line.replace(/^([-*•]|\d+[.)])\s+/, '');
        if (cur) cur.poin.push(bullet);
        else if (out.judul && !out.subjudul) out.subjudul = line;
    }
    if (!out.judul) out.judul = out.slides[0]?.judul || 'Presentasi';
    return out;
}

function friendly(e: any): Error {
    const msg = String(e?.message || e);
    if (/SERVICE_DISABLED|has not been used|is disabled/i.test(msg)) {
        return new Error(`Google Slides API belum diaktifkan. Pak Rico buka ${ENABLE_URL} (akun Google yang sama), klik "Aktifkan", tunggu 1–2 menit, lalu coba lagi.`);
    }
    if (/insufficient|PERMISSION_DENIED|403/i.test(msg)) {
        return new Error(`Izin Google belum mencakup Slides. Minta Joni: "Login ulang Google Workspace". (${msg.slice(0, 120)})`);
    }
    return e instanceof Error ? e : new Error(msg);
}

export class Slides {
    private g: Google;
    constructor(hermesHome: string) { this.g = new Google(path.join(hermesHome, 'google_token.json')); }

    async cek(): Promise<string> {
        try {
            // Presentasi yang tidak ada → 404 berarti API aktif; 403 SERVICE_DISABLED berarti belum.
            await this.g.call(`${API}/tidak-ada-${Date.now()}`);
            return '✅ Google Slides siap.';
        } catch (e: any) {
            if (/Google API 404/.test(String(e?.message))) return '✅ Google Slides siap.';
            throw friendly(e);
        }
    }

    async buat(o: SlideOutline): Promise<{ id: string; url: string; jumlah: number }> {
        if (!o.slides.length) throw new Error('Kerangka kosong: butuh minimal satu "## Judul slide".');
        if (o.slides.length > 60) throw new Error('Terlalu banyak slide (maks 60).');
        try {
            const p = await this.g.call(API, { method: 'POST', body: JSON.stringify({ title: o.judul }) });
            const id: string = p.presentationId;
            const first = p.slides?.[0];
            const reqs: any[] = [];
            // Slide pertama bawaan (layout judul) dipakai untuk judul presentasi.
            const titleBox = first?.pageElements?.find((el: any) => ['CENTERED_TITLE', 'TITLE'].includes(el.shape?.placeholder?.type))?.objectId;
            const subBox = first?.pageElements?.find((el: any) => el.shape?.placeholder?.type === 'SUBTITLE')?.objectId;
            if (titleBox) reqs.push({ insertText: { objectId: titleBox, text: o.judul } });
            if (subBox && o.subjudul) reqs.push({ insertText: { objectId: subBox, text: o.subjudul } });

            o.slides.forEach((s, i) => {
                const sid = `s${i}_${Date.now().toString(36)}`;
                reqs.push({
                    createSlide: {
                        objectId: sid,
                        slideLayoutReference: { predefinedLayout: s.poin.length ? 'TITLE_AND_BODY' : 'SECTION_HEADER' },
                        placeholderIdMappings: [
                            { layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: `${sid}_t` },
                            ...(s.poin.length ? [{ layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: `${sid}_b` }] : [])
                        ]
                    }
                });
                reqs.push({ insertText: { objectId: `${sid}_t`, text: s.judul || ' ' } });
                if (s.poin.length) {
                    reqs.push({ insertText: { objectId: `${sid}_b`, text: s.poin.join('\n') } });
                    reqs.push({ createParagraphBullets: { objectId: `${sid}_b`, textRange: { type: 'ALL' }, bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE' } });
                }
            });
            await this.g.call(`${API}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: reqs }) });

            // Catatan pembicara (perlu id kotak catatan tiap slide).
            if (o.slides.some((s) => s.catatan)) {
                const full = await this.g.call(`${API}/${id}?fields=slides(objectId,slideProperties(notesPage(notesProperties)))`);
                const notes: any[] = [];
                (full.slides || []).slice(1).forEach((sl: any, i: number) => {
                    const nid = sl.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
                    const txt = o.slides[i]?.catatan;
                    if (nid && txt) notes.push({ insertText: { objectId: nid, text: txt } });
                });
                if (notes.length) await this.g.call(`${API}/${id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests: notes }) });
            }
            return { id, url: `https://docs.google.com/presentation/d/${id}/edit`, jumlah: o.slides.length + 1 };
        } catch (e) { throw friendly(e); }
    }
}

export async function slidesCli(hermesHome: string, args: string[]): Promise<string> {
    const s = new Slides(hermesHome);
    const [cmd, file] = args;
    if (cmd === 'cek') return s.cek();
    if (cmd === 'buat') {
        if (!file) throw new Error('Pakai: --slides buat <kerangka.md|kerangka.json>');
        const text = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
        const r = await s.buat(parseOutline(text));
        return `✅ Presentasi dibuat (${r.jumlah} slide): ${r.url}`;
    }
    return 'Perintah: --slides cek | --slides buat <kerangka.md|kerangka.json>';
}
