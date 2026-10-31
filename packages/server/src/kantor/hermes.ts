import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

/**
 * Jembatan ke Hermes.
 *
 * - Membaca daftar profil (= divisi) dari ~/.hermes/profiles.
 * - Membaca papan Kanban (~/.hermes/kanban.db) dalam mode HANYA-BACA.
 * - Membuat tugas baru HANYA lewat perintah resmi `hermes kanban create`,
 *   tidak pernah menulis langsung ke database Hermes.
 */

export interface HermesProfile {
    id: string; // nama profil, "default" = profil utama (Kepala)
    displayName: string;
    description: string;
}

export interface KanbanTask {
    id: string;
    title: string;
    assignee: string | null;
    status: string; // triage | todo | ready | running | blocked | review | done | archived
    createdBy: string | null;
    createdAt: number; // detik epoch
    startedAt: number | null;
    completedAt: number | null;
    result: string | null;
}

function readYamlField(file: string, field: string): string {
    try {
        if (!fs.existsSync(file)) return '';
        const text = fs.readFileSync(file, 'utf8');
        // YAML sederhana: field: nilai  (cukup untuk description / display_name)
        const re = new RegExp(`^${field}:\\s*(.*)$`, 'm');
        const m = text.match(re);
        if (!m) return '';
        let value = m[1].trim();
        if (value === '|' || value === '>' || value === '|-' || value === '>-') {
            // blok multi-baris: ambil baris-baris yang menjorok setelahnya
            const after = text.slice((m.index || 0) + m[0].length).split(/\r?\n/);
            const lines: string[] = [];
            for (const line of after.slice(1)) {
                if (/^\s+\S/.test(line)) lines.push(line.trim());
                else if (line.trim() === '') continue;
                else break;
            }
            value = lines.join(' ');
        }
        return value.replace(/^['"]|['"]$/g, '').trim();
    } catch {
        return '';
    }
}

export class HermesBridge {
    private db: Database | null = null;
    private dbOpenFailedAt = 0;

    constructor(
        private hermesHome: string,
        private kanbanDbPath: string,
        private hermesBin: string
    ) { }

    // ── Profil / divisi ─────────────────────────────────────────

    listProfiles(): HermesProfile[] {
        const profiles: HermesProfile[] = [];
        if (fs.existsSync(this.hermesHome)) {
            profiles.push({
                id: 'default',
                displayName: readYamlField(path.join(this.hermesHome, 'profile.yaml'), 'display_name'),
                description: readYamlField(path.join(this.hermesHome, 'profile.yaml'), 'description')
            });
        }
        const dir = path.join(this.hermesHome, 'profiles');
        if (!fs.existsSync(dir)) return profiles;

        const identityFiles = ['config.yaml', '.env', 'SOUL.md', 'profile.yaml', 'auth.json', 'state.db'];
        for (const name of fs.readdirSync(dir).sort()) {
            if (name.startsWith('.') || name.startsWith('_')) continue;
            const full = path.join(dir, name);
            try {
                if (!fs.statSync(full).isDirectory()) continue;
            } catch {
                continue;
            }
            // Sama seperti Hermes: folder dianggap profil hanya kalau punya file identitas.
            if (!identityFiles.some((f) => fs.existsSync(path.join(full, f)))) continue;
            const yaml = path.join(full, 'profile.yaml');
            profiles.push({
                id: name,
                displayName: readYamlField(yaml, 'display_name'),
                description: readYamlField(yaml, 'description')
            });
        }
        return profiles;
    }

    // ── Kanban (hanya-baca) ─────────────────────────────────────

    get kanbanAvailable(): boolean {
        return fs.existsSync(this.kanbanDbPath);
    }

    private async getDb(): Promise<Database | null> {
        if (this.db) return this.db;
        if (!this.kanbanAvailable) return null;
        if (Date.now() - this.dbOpenFailedAt < 30_000) return null;
        try {
            this.db = await open({
                filename: this.kanbanDbPath,
                driver: sqlite3.Database,
                mode: sqlite3.OPEN_READONLY
            });
            await this.db.exec('PRAGMA busy_timeout = 3000');
            return this.db;
        } catch (err) {
            this.dbOpenFailedAt = Date.now();
            console.error('[Hermes] Gagal membuka kanban.db:', err);
            return null;
        }
    }

    /** Tugas yang masih aktif + yang baru selesai/diubah dalam `sinceSeconds` terakhir. */
    async recentTasks(sinceSeconds = 3 * 24 * 3600, limit = 60): Promise<KanbanTask[]> {
        const db = await this.getDb();
        if (!db) return [];
        const since = Math.floor(Date.now() / 1000) - sinceSeconds;
        try {
            const rows = await db.all(
                `SELECT id, title, assignee, status, created_by, created_at, started_at, completed_at, result
                   FROM tasks
                  WHERE status NOT IN ('archived')
                    AND (status NOT IN ('done') OR COALESCE(completed_at, created_at) >= ?)
                  ORDER BY COALESCE(completed_at, started_at, created_at) DESC
                  LIMIT ?`,
                [since, limit]
            );
            return rows.map((r: any) => ({
                id: String(r.id),
                title: String(r.title || ''),
                assignee: r.assignee ? String(r.assignee) : null,
                status: String(r.status || ''),
                createdBy: r.created_by ? String(r.created_by) : null,
                createdAt: Number(r.created_at) || 0,
                startedAt: r.started_at != null ? Number(r.started_at) : null,
                completedAt: r.completed_at != null ? Number(r.completed_at) : null,
                result: r.result ? String(r.result) : null
            }));
        } catch (err) {
            console.error('[Hermes] Gagal membaca tugas:', err);
            // Koneksi mungkin basi (misalnya DB dibuat ulang) — buka ulang lain kali.
            try { await this.db?.close(); } catch { /* */ }
            this.db = null;
            return [];
        }
    }

    // ── Membuat tugas lewat CLI resmi ───────────────────────────

    createTask(opts: {
        title: string;
        assignee: string;
        body: string;
        createdBy: string;
        maxRuntime?: string;
    }): Promise<{ ok: boolean; id?: string; error?: string }> {
        const args = [
            'kanban', 'create', opts.title.slice(0, 200),
            '--assignee', opts.assignee,
            '--body', opts.body.slice(0, 4000),
            '--created-by', opts.createdBy,
            '--max-runtime', opts.maxRuntime || '30m',
            '--json'
        ];
        return new Promise((resolve) => {
            execFile(this.hermesBin, args, { timeout: 60_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    resolve({ ok: false, error: (stderr || err.message || '').toString().slice(0, 300) });
                    return;
                }
                let id: string | undefined;
                try {
                    const parsed = JSON.parse(stdout);
                    id = parsed?.id || parsed?.task_id || parsed?.task?.id;
                } catch {
                    const m = stdout.match(/\b(t_[A-Za-z0-9]+)\b/);
                    id = m?.[1];
                }
                resolve({ ok: true, id });
            });
        });
    }

    async close() {
        try { await this.db?.close(); } catch { /* */ }
        this.db = null;
    }
}
