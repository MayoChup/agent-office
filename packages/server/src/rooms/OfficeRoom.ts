import fs from 'fs';
import path from 'path';
import { Room, Client, ServerError } from 'colyseus';
import { OfficeState } from '../schema/OfficeState';
import { MemoryStore } from '../memory/MemoryStore';
import { KantorConfig } from '../kantor/config';
import { KantorAuth } from '../kantor/auth';
import { FreeLlm, extractJson } from '../kantor/freeLlm';
import { HermesBridge, HermesProfile, KanbanTask } from '../kantor/hermes';
import { DOOR, PLACE_LABELS, Spot, pickSpot, buildLayout, groupDivisions, walkableGrid, findPath, OfficeLayout, DivisionInfo } from '../kantor/layout';

/**
 * Kantor Virtual — versi yang tersambung ke Hermes.
 *
 * - Karakter = profil Hermes (divisi). "default" = si Kepala.
 * - "Kehidupan kantor" (jalan, ngobrol, berpikir, mengusulkan) memakai model
 *   gratis OpenRouter, dengan tempo beberapa menit per agen.
 * - Status kerja nyata dibaca dari papan Kanban Hermes (hanya-baca).
 * - Tugas nyata dibuat lewat `hermes kanban create`, dengan batas harian dan
 *   kunci pengaman (lihat GUARD_FOOTER & isSensitive).
 */

interface MemoryEntry {
    content: string;
    type: 'thought' | 'conversation' | 'task_result' | 'observation' | 'achievement' | 'relationship';
    timestamp: string;
    importance: number;
}

interface InboxMessage { from: string; text: string; at: number; fromOwner: boolean }

type WorkStatus = 'running' | 'blocked' | 'review' | 'queued' | null;

interface Member {
    id: string;
    name: string;
    role: string;
    persona: string;
    desk: number;
    skin: number;
    inbox: InboxMessage[];
    memories: MemoryEntry[];
    nextThinkAt: number;
    lastThinkAt: number;
    thinking: boolean;
    place: string;
    goal: Spot | null;
    talkTarget: string | null;
    path: Spot[];
    pathKey: string;
    work: WorkStatus;
    workTitle: string;
    flash: string;
    flashUntil: number;
    sleepingNoticeAt: number;
    /** Kapan gerak-gerik harian berikutnya (pakai aturan, tanpa AI). */
    nextIdleAt: number;
    /** Berapa kali balasan untuk pemilik sudah dicoba ulang karena AI gratis sibuk. */
    ownerRetries: number;
}

interface HighlightEvent {
    type: string;
    title: string;
    body: string;
    agentId?: string | null;
    scenario: string;
    time: string;
}

interface RelationshipEdge {
    a: string;
    b: string;
    score: number;
    status: 'alliance' | 'neutral' | 'rivalry';
    updatedAt: string;
}

const SENSITIVE = /\b(e-?mail|gmail|kirim(kan)?\s+(pesan|email|wa|whatsapp)|posting|post\s+ke|upload|unggah|publish|terbitkan|tweet|transfer|bayar|beli|hapus|delete|rm\s+-|uninstall|reset|drop\s+table|password|pin|otp|broker|order\s+saham|jual\s+saham|beli\s+saham)\b/i;

const MAX_PARALLEL_THINK = 2;       // maksimal agen berpikir bersamaan
/** Berapa kali sehari agen boleh "merencanakan" pakai AI (untuk usulan tugas/rekrut). */
const DAILY_PLAN_THINKS = 12;
/** Jarak minimal antar perencanaan satu agen. */
const MIN_PLAN_MINUTES = 120;

// ── Gerak-gerik harian tanpa AI ──────────────────────────────
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const IDLE_THOUGHTS: Record<string, string[]> = {
    desk: ['Merapikan catatan kerja 📝', 'Cek ulang daftar tugas', 'Baca-baca referensi sebentar', 'Siap kalau ada tugas baru 💪', 'Rapikan file di komputer'],
    pantry: ['Ngopi dulu ☕', 'Ambil camilan 🍪', 'Isi tenaga sebentar', 'Bikin teh hangat 🍵'],
    water: ['Minum air dulu 💧', 'Jangan lupa minum 💧'],
    lounge: ['Istirahat sebentar di sofa 🛋️', 'Peregangan dulu 🙆', 'Cari ide sambil santai'],
    bookshelf: ['Cari buku referensi 📚', 'Baca artikel menarik 📖'],
    meeting: ['Siapkan bahan rapat 🗂️', 'Corat-coret ide di papan tulis']
};
const SMALL_TALK = [
    ['Gimana kerjaan hari ini?', 'Lancar, aman 👍'],
    ['Udah ngopi belum?', 'Belum nih, nanti ah ☕'],
    ['Ada tugas baru dari Pak Rico?', 'Belum, lagi standby'],
    ['Semangat ya hari ini!', 'Siap, kamu juga 💪'],
    ['Laporanmu udah beres?', 'Hampir, tinggal dirapikan'],
    ['Istirahat dulu yuk', 'Bentar lagi, nanggung']
];

export class OfficeRoom extends Room<OfficeState> {
    private static activeRoom: OfficeRoom | null = null;
    static config: KantorConfig;
    static auth: KantorAuth;

    maxClients = 20;

    private cfg!: KantorConfig;
    private llm!: FreeLlm;
    private hermes!: HermesBridge;
    private memoryStore = new MemoryStore(process.env.OLLAMA_URL || null);
    private sessionId = `session_${Date.now()}`;

    private members = new Map<string, Member>();
    private layout!: OfficeLayout;
    private grid: boolean[][] = [];
    private knownDivisions = new Map<string, DivisionInfo>();
    private thinkingNow = 0;
    private moveTick = 0;

    private taskStatus = new Map<string, string>();
    private kanbanSeeded = false;
    private lastTasksHash = '';
    private lastTasksPayload: any[] = [];
    /** Judul tugas yang masih terbuka / baru selesai (untuk mencegah tugas dobel). */
    private knownTitles = new Set<string>();

    private autonomy = { date: '', tasks: 0, hires: 0, plans: 0 };

    private highlights: HighlightEvent[] = [];
    private relationships: Map<string, RelationshipEdge> = new Map();
    private currentLayout: any[] = [];
    private timers: NodeJS.Timeout[] = [];

    static getActiveRoom(): OfficeRoom | null {
        return OfficeRoom.activeRoom;
    }

    // ════════════════════════════════════════════════════════
    //  SETUP
    // ════════════════════════════════════════════════════════

    async onCreate() {
        OfficeRoom.activeRoom = this;
        this.cfg = OfficeRoom.config;
        this.setState(new OfficeState());
        this.autoDispose = false;

        fs.mkdirSync(this.cfg.dataDir, { recursive: true });
        await this.memoryStore.initialize(path.join(this.cfg.dataDir, 'office-memory.db'));

        this.llm = new FreeLlm({
            apiKey: this.cfg.openRouterApiKey,
            baseUrl: this.cfg.openRouterBaseUrl,
            model: this.cfg.model,
            dailyLimit: this.cfg.dailyRequestLimit,
            perMinuteLimit: this.cfg.perMinuteLimit,
            dataDir: this.cfg.dataDir
        });
        this.hermes = new HermesBridge(this.cfg.hermesHome, this.cfg.kanbanDbPath, this.cfg.hermesBin);

        this.autonomy = Object.assign({ date: '', tasks: 0, hires: 0, plans: 0 }, this.readJsonFile('kantor-autonomy.json', {}));

        if (!this.llm.enabled) {
            console.warn('[Kantor] OPENROUTER_API_KEY belum diisi: agen tetap tampil & mengikuti Kanban, tapi tidak berpikir/ngobrol.');
        }

        await this.syncProfiles(true);
        const savedLayout = await this.memoryStore.loadLayout('default');
        this.currentLayout = Array.isArray(savedLayout) ? savedLayout : [];
        await this.pollKanban();

        this.registerHandlers();

        this.timers.push(setInterval(() => this.pollKanban().catch((e) => console.error('[Kanban]', e)), this.cfg.kanbanPollSeconds * 1000));
        this.timers.push(setInterval(() => this.syncProfiles(false).catch((e) => console.error('[Profil]', e)), this.cfg.profilePollSeconds * 1000));
        this.timers.push(setInterval(() => this.broadcast('usage', this.usagePayload()), 30_000));

        this.setSimulationInterval(() => this.update(), 100);
        console.log(`[Kantor] ${this.cfg.officeName} siap. Anggota: ${Array.from(this.members.values()).map((m) => m.name).join(', ') || '(belum ada)'}`);
    }

    private readJsonFile<T>(name: string, fallback: T): T {
        try {
            const file = path.join(this.cfg.dataDir, name);
            if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch { /* */ }
        return fallback;
    }

    private writeJsonFile(name: string, value: any) {
        try {
            fs.writeFileSync(path.join(this.cfg.dataDir, name), JSON.stringify(value, null, 2));
        } catch (err) {
            console.error(`[Kantor] Gagal menyimpan ${name}:`, err);
        }
    }

    private registerHandlers() {
        // Obrolan dari Pak Rico di panel chat kantor.
        this.onMessage('chat', (_client, message) => {
            const raw = String(message?.text || '').trim().slice(0, 500);
            if (!raw) return;
            this.broadcast('chat', { sender: this.cfg.ownerName, text: raw });

            let target = this.members.get('default') || Array.from(this.members.values())[0];
            let text = raw;
            const mention = raw.match(/^@([\w.-]+)[,:]?\s*(.*)$/s);
            if (mention) {
                const found = this.findMember(mention[1]);
                if (found) { target = found; text = mention[2] || raw; }
            }
            if (!target) return;

            target.inbox.push({ from: this.cfg.ownerName, text, at: Date.now(), fromOwner: true });
            if (target.inbox.length > 10) target.inbox.shift();
            // Pesan dari pemilik dijawab secepatnya (tetap mengikuti kuota).
            target.nextThinkAt = Math.min(target.nextThinkAt, Date.now() + 1500);
            if (!this.llm.enabled) {
                this.broadcast('chat', { sender: '🏢 Kantor', text: 'Otak AI gratis belum diatur (OPENROUTER_API_KEY kosong), jadi agen belum bisa membalas.' });
            }
        });

        // Tugas NYATA dari papan tugas: dibuat di Hermes atas perintah Pak Rico.
        this.onMessage('assign-task', async (_client, message) => {
            const title = String(message?.title || '').trim().slice(0, 200);
            if (!title) return;
            const member = (message?.agentId && this.members.get(String(message.agentId))) || this.members.get('default');
            const assignee = member?.id || 'default';
            const result = await this.hermes.createTask({
                title,
                assignee,
                body: `Tugas dari ${this.cfg.ownerName} lewat papan tugas Kantor Virtual.`,
                createdBy: 'kantor:pemilik'
            });
            if (result.ok) {
                this.broadcast('chat', { sender: '📋 Papan Tugas', text: `Tugas "${title}" dikirim ke ${member?.name || assignee}.` });
                this.pollKanban().catch(() => undefined);
            } else {
                this.broadcast('chat', { sender: '⚠️ Papan Tugas', text: `Gagal membuat tugas di Hermes: ${result.error}` });
            }
        });

        this.onMessage('save-layout', async (_client, message) => {
            const layoutName = message?.name || 'default';
            const layout = Array.isArray(message?.layout) ? message.layout : [];
            await this.memoryStore.saveLayout(layoutName, JSON.stringify(layout));
            this.currentLayout = layout;
            this.broadcast('layout-sync', { name: layoutName, layout: this.currentLayout });
            this.broadcast('chat', { sender: '🏢 Kantor', text: '✅ Tata letak kantor disimpan.' });
        });
    }

    // ════════════════════════════════════════════════════════
    //  ANGGOTA (profil Hermes)
    // ════════════════════════════════════════════════════════

    private titleCase(s: string) {
        return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }

    private roleFromDescription(desc: string): string {
        if (!desc) return 'Divisi';
        const first = desc.split(/[.\n]/)[0].trim();
        return first.length > 48 ? `${first.slice(0, 45)}…` : first;
    }

    private findMember(nameOrId: string): Member | undefined {
        const key = nameOrId.trim().toLowerCase();
        for (const m of this.members.values()) {
            if (m.id.toLowerCase() === key || m.name.toLowerCase() === key) return m;
        }
        for (const m of this.members.values()) {
            if (m.name.toLowerCase().startsWith(key) || key.startsWith(m.name.toLowerCase())) return m;
        }
        return undefined;
    }

    private async syncProfiles(initial: boolean) {
        let profiles: HermesProfile[] = this.hermes.listProfiles();
        if (profiles.length === 0 && initial) {
            console.warn(`[Kantor] Tidak menemukan Hermes di ${this.cfg.hermesHome}. Cek HERMES_HOME.`);
        }
        const limit = this.cfg.maxAgents;
        if (profiles.length > limit) {
            console.warn(`[Kantor] Ada ${profiles.length} divisi, yang ditampilkan hanya ${limit} (maxAgents).`);
            profiles = profiles.slice(0, limit);
        }

        const seen = new Set<string>();
        for (const p of profiles) {
            seen.add(p.id);
            const override = this.cfg.agents[p.id] || {};
            const name = override.name || p.displayName || this.titleCase(p.id);
            const role = override.role || this.roleFromDescription(p.description);
            const existing = this.members.get(p.id);
            if (existing) {
                existing.name = name;
                existing.role = role;
                const st = this.state.agents.get(p.id);
                if (st) { st.name = name; st.role = role; }
                continue;
            }
            await this.addMember(p, name, role, override.persona || p.description || '', override.skin, initial);
        }

        for (const id of Array.from(this.members.keys())) {
            if (!seen.has(id)) {
                const m = this.members.get(id)!;
                this.members.delete(id);
                this.state.removeAgent(id);
                this.broadcast('chat', { sender: '🏢 Kantor', text: `${m.name} tidak lagi terdaftar di kantor.` });
            }
        }
        this.rebuildLayout(initial);
        this.rebuildRelationshipGraph();
    }

    /** Bangun ulang denah dari divisi yang ada. Mengumumkan divisi baru / yang dihapus. */
    private rebuildLayout(initial: boolean) {
        const list = Array.from(this.members.values()).map((m) => ({ id: m.id, name: m.name, role: m.role }));
        const memberDivision: Record<string, string | undefined> = {};
        for (const m of this.members.values()) memberDivision[m.id] = this.cfg.agents[m.id]?.division;
        const divisions = groupDivisions(list, memberDivision, this.cfg.divisions);
        const headName = this.members.get('default')?.name || 'Kepala';
        const layout = buildLayout(list, divisions, headName);
        if (this.layout && this.layout.revision === layout.revision) return;

        if (!initial && this.layout) {
            for (const d of divisions) {
                if (!this.knownDivisions.has(d.id)) {
                    this.broadcast('division-event', { type: 'added', division: d });
                    this.emitHighlight('hiring', `Divisi baru: ${d.icon} ${d.name}`, `Ruangan ${d.name} sudah disiapkan di kantor.`, d.headId);
                }
            }
            for (const [id, d] of this.knownDivisions) {
                if (!divisions.some((x) => x.id === id)) {
                    this.broadcast('division-event', { type: 'removed', division: d });
                    this.emitHighlight('chaos', `Divisi ditutup: ${d.icon} ${d.name}`, `Ruangan ${d.name} dikosongkan.`);
                }
            }
        }
        this.knownDivisions = new Map(divisions.map((d) => [d.id, d]));
        this.layout = layout;
        this.grid = walkableGrid(layout);
        for (const m of this.members.values()) { m.path = []; m.pathKey = ''; }
        this.broadcast('office-layout', layout);
    }

    private seatOf(id: string): Spot {
        return this.layout?.seats[id] || DOOR;
    }

    private async addMember(p: HermesProfile, name: string, role: string, persona: string, skin: number | undefined, initial: boolean) {
        const n = this.members.size;
        const desk = n;
        const member: Member = {
            id: p.id, name, role, persona,
            desk,
            skin: typeof skin === 'number' ? skin % 6 : desk % 6,
            inbox: [],
            memories: await this.memoryStore.loadMemories(p.id, 20) as MemoryEntry[],
            // Berpikir pertama tersebar supaya tidak menghabiskan kuota sekaligus.
            // Perencanaan AI pertama disebar 10–60 menit setelah menyala, supaya restart tidak menghabiskan kuota.
            nextThinkAt: Date.now() + (10 + Math.random() * 50) * 60_000,
            lastThinkAt: 0,
            thinking: false,
            place: 'desk',
            goal: null,
            talkTarget: null,
            path: [],
            pathKey: '',
            work: null,
            workTitle: '',
            flash: '',
            flashUntil: 0,
            sleepingNoticeAt: 0,
            nextIdleAt: Date.now() + 8_000 + Math.random() * 30_000,
            ownerRetries: 0
        };
        this.members.set(p.id, member);

        this.state.createAgent(p.id, name);
        const st = this.state.agents.get(p.id)!;
        st.role = role;
        st.desk = desk;
        st.skin = member.skin;
        if (initial) { st.x = DOOR.x; st.y = DOOR.y; }
        else {
            st.x = DOOR.x; st.y = DOOR.y;
            this.broadcast('chat', { sender: '🏢 Kantor', text: `🎉 Selamat datang, ${name} (${role})!` });
            this.emitHighlight('hiring', `${name} bergabung`, `${name} sekarang bagian dari tim sebagai ${role}.`, p.id);
        }
    }

    // ════════════════════════════════════════════════════════
    //  KANBAN HERMES → STATUS KERJA
    // ════════════════════════════════════════════════════════

    private uiStatus(status: string) {
        if (status === 'running') return 'in_progress';
        if (status === 'done') return 'completed';
        if (status === 'blocked') return 'blocked';
        if (status === 'review') return 'review';
        return 'pending';
    }

    private async pollKanban() {
        if (!this.hermes.kanbanAvailable) return;
        const tasks = await this.hermes.recentTasks();

        // Status kerja per anggota.
        const rank: Record<string, number> = { running: 4, blocked: 3, review: 2, ready: 1, todo: 1 };
        const best = new Map<string, KanbanTask>();
        for (const t of tasks) {
            if (!t.assignee || !rank[t.status]) continue;
            const cur = best.get(t.assignee);
            if (!cur || rank[t.status] > rank[cur.status]) best.set(t.assignee, t);
        }
        for (const m of this.members.values()) {
            const t = best.get(m.id);
            const status: WorkStatus = !t ? null
                : t.status === 'running' ? 'running'
                    : t.status === 'blocked' ? 'blocked'
                        : t.status === 'review' ? 'review'
                            : 'queued';
            m.work = status;
            m.workTitle = t?.title || '';
            const st = this.state.agents.get(m.id);
            if (st) st.currentTask = m.workTitle;
        }

        // Umumkan perubahan (setelah pembacaan pertama).
        for (const t of tasks) {
            const prev = this.taskStatus.get(t.id);
            this.taskStatus.set(t.id, t.status);
            if (!this.kanbanSeeded || prev === t.status) continue;
            const m = t.assignee ? this.members.get(t.assignee) : undefined;
            const who = m?.name || t.assignee || 'seseorang';

            if (prev === undefined) {
                this.broadcast('chat', { sender: '📋 Kanban', text: `Tugas baru untuk ${who}: "${t.title}"` });
            } else if (t.status === 'running') {
                this.emitHighlight('task', `${who} mulai bekerja`, t.title, m?.id);
            } else if (t.status === 'done') {
                this.broadcast('chat', { sender: '✅ Kanban', text: `${who} menyelesaikan "${t.title}"` });
                this.emitHighlight('task', `${who} selesai`, t.title, m?.id);
                if (m) {
                    m.flash = 'done';
                    m.flashUntil = Date.now() + 10_000;
                    this.remember(m, {
                        content: `Saya menyelesaikan tugas "${t.title}".${t.result ? ` Ringkasan: ${t.result.slice(0, 160)}` : ''}`,
                        type: 'achievement',
                        timestamp: new Date().toISOString(),
                        importance: 0.85
                    });
                }
            } else if (t.status === 'blocked') {
                this.broadcast('chat', { sender: '⚠️ Kanban', text: `${who} butuh bantuan / izin untuk "${t.title}"` });
                this.emitHighlight('high_risk', `${who} tertahan`, t.title, m?.id);
            } else if (t.status === 'review') {
                this.emitHighlight('task', `${who} minta dicek`, t.title, m?.id);
            }
        }
        this.kanbanSeeded = true;

        const dayAgo = Math.floor(Date.now() / 1000) - 24 * 3600;
        this.knownTitles = new Set(
            tasks.filter((t) => t.status !== 'done' || (t.completedAt || 0) >= dayAgo).map((t) => this.normTitle(t.title))
        );

        const payload = tasks.slice(0, 30).map((t) => ({
            id: t.id,
            title: t.title,
            assigned_to: (t.assignee && this.members.get(t.assignee)?.name) || t.assignee || '',
            assignee_id: t.assignee || '',
            created_by: t.createdBy || '',
            completed_at: t.completedAt || null,
            status: this.uiStatus(t.status)
        }));
        const hash = JSON.stringify(payload);
        if (hash !== this.lastTasksHash) {
            this.lastTasksHash = hash;
            this.lastTasksPayload = payload;
            this.broadcast('tasks-sync', payload);
        }
    }

    // ════════════════════════════════════════════════════════
    //  OTONOMI: berpikir, ngobrol, mengusulkan
    // ════════════════════════════════════════════════════════

    private normTitle(title: string) {
        return title.replace(/^\[[^\]]*\]\s*/, '').replace(/^usulan rekrut divisi baru:\s*/i, 'rekrut ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    private todayKey() {
        return new Date().toISOString().slice(0, 10);
    }

    private autonomyLeft() {
        if (this.autonomy.date !== this.todayKey()) {
            this.autonomy = { date: this.todayKey(), tasks: 0, hires: 0, plans: 0 };
        }
        return {
            tasks: this.cfg.allowAutonomousTasks ? Math.max(0, this.cfg.dailyAutonomousTaskLimit - this.autonomy.tasks) : 0,
            hires: Math.max(0, this.cfg.dailyHireProposalLimit - this.autonomy.hires),
            plans: Math.max(0, DAILY_PLAN_THINKS - (this.autonomy.plans || 0))
        };
    }

    private nowLabel() {
        try {
            return new Intl.DateTimeFormat('id-ID', {
                timeZone: process.env.KANTOR_TZ || 'Asia/Jakarta',
                weekday: 'long', hour: '2-digit', minute: '2-digit'
            }).format(new Date());
        } catch {
            return new Date().toISOString();
        }
    }

    private describeColleague(m: Member): string {
        const doing = m.work === 'running' ? `sedang mengerjakan "${m.workTitle}"`
            : m.work === 'blocked' ? `tertahan di "${m.workTitle}"`
                : m.work === 'review' ? `menunggu dicek: "${m.workTitle}"`
                    : m.work === 'queued' ? `punya antrean tugas "${m.workTitle}"`
                        : PLACE_LABELS[m.place] || 'santai';
        return `- ${m.name} (${m.role}) — ${doing}`;
    }

    private buildPrompts(m: Member) {
        const left = this.autonomyLeft();
        const colleagues = Array.from(this.members.values()).filter((o) => o.id !== m.id).map((o) => this.describeColleague(o)).join('\n') || '- (belum ada rekan)';
        const isHead = m.id === 'default';

        const system = `Kamu adalah ${m.name}, ${m.role} di "${this.cfg.officeName}", kantor virtual milik ${this.cfg.ownerName}.
${m.persona ? `Tentang dirimu: ${m.persona.slice(0, 400)}` : ''}
${isHead ? 'Kamu kepala kantor: kamu mengoordinasi rekan-rekan dan menjaga semuanya berjalan.' : ''}

Rekan kerjamu:
${colleagues}

Kamu "hidup" di kantor pixel: bisa jalan-jalan, ngobrol dengan rekan, dan mengusulkan pekerjaan.
Gunakan bahasa Indonesia santai tapi sopan, singkat. Panggil pemilik dengan "${this.cfg.ownerName}".

BATASAN PENTING:
- Kamu TIDAK bisa mengirim email/pesan ke luar, posting ke sosmed, mengubah data keuangan, atau menghapus apa pun.
- Jangan mengaku sudah menyelesaikan pekerjaan nyata. Pekerjaan nyata hanya terjadi lewat tugas di papan Kanban.
- create_task hanya kalau benar-benar berguna, spesifik, dan masuk akal untuk divisi yang dituju. Sisa jatah hari ini: ${left.tasks}.
- propose_hire hanya kalau ada peran penting yang belum ada di tim. Sisa jatah hari ini: ${left.hires}.

Balas HANYA dengan SATU objek JSON, tanpa teks lain:
{"thought":"isi pikiran, maks 20 kata","action":"idle|walk|talk|create_task|propose_hire","place":"desk|pantry|water|meeting|lounge|bookshelf","target":"nama rekan atau ${this.cfg.ownerName} (untuk talk)","message":"isi omongan, maks 35 kata (untuk talk)","task":{"title":"judul tugas","assignee":"nama rekan","detail":"penjelasan singkat"},"hire":{"name":"nama panggilan","role":"peran","reason":"alasan"}}`;

        const inbox = m.inbox.map((msg) => `- ${msg.from}: "${msg.text}"`).join('\n');
        const memories = m.memories.slice(-6).map((e) => `- ${e.content}`).join('\n');
        const events = this.highlights.slice(0, 5).map((h) => `- ${h.title}: ${h.body}`).join('\n');

        const user = `Waktu: ${this.nowLabel()}
Posisimu: ${PLACE_LABELS[m.place] || 'di kantor'}
${inbox ? `Pesan untukmu (WAJIB dibalas dengan action "talk" ke pengirimnya):\n${inbox}` : 'Tidak ada pesan baru untukmu.'}
${memories ? `Ingatanmu:\n${memories}` : ''}
${events ? `Kejadian terbaru di kantor:\n${events}` : ''}

Apa yang kamu lakukan sekarang?`;

        return { system, user };
    }

    private remember(m: Member, entry: MemoryEntry) {
        m.memories.push(entry);
        if (m.memories.length > 40) {
            m.memories.sort((a, b) => b.importance - a.importance);
            m.memories = m.memories.slice(0, 30);
            m.memories.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        }
        if (entry.importance >= 0.6) {
            this.memoryStore.saveMemory(m.id, entry, this.sessionId).catch(() => undefined);
        }
    }

    private scheduleNext(m: Member) {
        const interval = Math.max(this.cfg.thinkIntervalMinutes, MIN_PLAN_MINUTES) * 60_000;
        m.nextThinkAt = Date.now() + interval * (0.8 + Math.random() * 0.4);
    }

    private async think(m: Member) {
        m.thinking = true;
        this.thinkingNow++;
        const st = this.state.agents.get(m.id);
        const hadOwnerMessage = m.inbox.some((i) => i.fromOwner);
        try {
            if (st) st.action = 'think';
            if (!hadOwnerMessage) {
                this.autonomyLeft();
                this.autonomy.plans = (this.autonomy.plans || 0) + 1;
                this.writeJsonFile('kantor-autonomy.json', this.autonomy);
            }
            const { system, user } = this.buildPrompts(m);
            // Pesan pemilik: coba lebih banyak model gratis sebelum menyerah.
            const answer = await this.llm.complete(system, user, 350, hadOwnerMessage ? 4 : 2);
            m.lastThinkAt = Date.now();
            this.scheduleNext(m);

            if (!answer) {
                if (st) st.action = 'idle';
                if (hadOwnerMessage) {
                    if (this.llm.remainingToday() > 0 && m.ownerRetries < 3) {
                        // AI gratis sedang ramai: tunggu sebentar lalu coba lagi sendiri.
                        if (m.ownerRetries === 0) {
                            this.broadcast('chat', { sender: m.name, text: '(AI gratisnya lagi antre ramai, sebentar ya — saya coba lagi otomatis…)' });
                        }
                        m.ownerRetries++;
                        m.nextThinkAt = Date.now() + 45_000 * m.ownerRetries;
                    } else {
                        this.broadcast('chat', { sender: m.name, text: '(Maaf, AI gratis sedang penuh terus. Coba lagi beberapa menit lagi, atau kirim lewat Telegram — di sana tetap jalan.)' });
                        m.inbox = [];
                        m.ownerRetries = 0;
                    }
                }
                return;
            }
            m.ownerRetries = 0;
            const d = extractJson(answer) || {};
            await this.applyDecision(m, d);
        } catch (err) {
            console.error(`[Kantor] ${m.name} gagal berpikir:`, err);
            this.scheduleNext(m);
        } finally {
            m.thinking = false;
            this.thinkingNow--;
        }
    }

    private async applyDecision(m: Member, d: any) {
        const st = this.state.agents.get(m.id);
        const thought = String(d.thought || '').slice(0, 140);
        const action = String(d.action || 'idle').toLowerCase();
        if (st) {
            st.thought = thought;
            st.action = action === 'talk' ? 'talk' : action === 'walk' ? 'walk' : 'idle';
        }
        if (thought) {
            this.remember(m, { content: thought, type: 'thought', timestamp: new Date().toISOString(), importance: 0.3 });
        }

        const place = String(d.place || '').toLowerCase();
        if (place && (place === 'desk' || PLACE_LABELS[place])) {
            m.place = place;
            m.goal = place === 'desk' || !this.layout ? null : pickSpot(this.layout, place, this.takenSpots(m.id));
            m.talkTarget = null;
        }

        const repliedTo = new Set<string>();

        if (action === 'talk' && d.message) {
            const text = String(d.message).slice(0, 300);
            const targetName = String(d.target || '');
            const ownerish = targetName && this.cfg.ownerName.toLowerCase().includes(targetName.toLowerCase().replace(/^pak\s+/, ''));
            const target = !ownerish && targetName ? this.findMember(targetName) : undefined;

            if (target && target.id !== m.id) {
                this.broadcast('chat', { sender: m.name, text: `💬 (ke ${target.name}) ${text}` });
                // Rekan tidak membalas pakai AI (hemat kuota): cukup balasan singkat.
                const tst = this.state.agents.get(target.id);
                if (tst && !target.work) tst.thought = pick(['Oke, siap 👍', 'Noted!', 'Boleh juga tuh', 'Nanti aku cek ya']);
                m.talkTarget = target.id;
                m.nextIdleAt = Date.now() + 90_000;
                m.goal = null;
                this.updateRelationship(m.id, target.id, 0.08);
                this.emitHighlight('conversation', `${m.name} ngobrol dengan ${target.name}`, text.slice(0, 120), m.id);
                this.remember(m, { content: `Saya bilang ke ${target.name}: "${text}"`, type: 'conversation', timestamp: new Date().toISOString(), importance: 0.6 });
                repliedTo.add(target.name);
            } else {
                // Ke pemilik (atau target tidak dikenal → anggap ke pemilik).
                this.broadcast('chat', { sender: m.name, text });
                this.remember(m, { content: `Saya bilang ke ${this.cfg.ownerName}: "${text}"`, type: 'conversation', timestamp: new Date().toISOString(), importance: 0.7 });
                repliedTo.add(this.cfg.ownerName);
            }
        }

        // Simpan pesan yang masuk sebagai ingatan, lalu kosongkan kotak masuk.
        for (const msg of m.inbox) {
            this.remember(m, { content: `${msg.from} bilang: "${msg.text}"`, type: 'conversation', timestamp: new Date(msg.at).toISOString(), importance: msg.fromOwner ? 0.8 : 0.6 });
        }
        const ownerUnanswered = m.inbox.some((i) => i.fromOwner) && !repliedTo.has(this.cfg.ownerName);
        m.inbox = [];
        if (ownerUnanswered && thought) {
            this.broadcast('chat', { sender: m.name, text: thought });
        }

        if (action === 'create_task' && d.task) {
            await this.autonomousTask(m, d.task);
        } else if (action === 'propose_hire' && d.hire) {
            await this.proposeHire(m, d.hire);
        }
    }

    private guardFooter(m: Member) {
        return `\n\n---\nTugas ini diusulkan otomatis oleh ${m.name} di Kantor Virtual (bukan perintah langsung ${this.cfg.ownerName}).
ATURAN: JANGAN mengirim email/pesan ke orang lain, posting ke sosmed, mengubah atau menghapus data keuangan, menghapus file atau divisi, atau melakukan transaksi apa pun.
Kalau tugas ini ternyata memerlukan salah satu hal tersebut, hentikan, tandai blocked, dan minta izin ${this.cfg.ownerName} lewat Kepala Kantor.`;
    }

    private async autonomousTask(m: Member, task: any) {
        const left = this.autonomyLeft();
        const title = String(task?.title || '').trim().slice(0, 160);
        if (!title) return;
        if (left.tasks <= 0) {
            this.remember(m, { content: `Saya ingin membuat tugas "${title}", tapi jatah tugas otomatis hari ini sudah habis.`, type: 'observation', timestamp: new Date().toISOString(), importance: 0.4 });
            return;
        }
        if (this.knownTitles.has(this.normTitle(title))) {
            // Tugas serupa sudah ada: tidak dibuat lagi, jatah tidak terpakai.
            this.remember(m, { content: `Tugas "${title}" sudah ada di papan, jadi tidak saya buat lagi.`, type: 'observation', timestamp: new Date().toISOString(), importance: 0.5 });
            return;
        }
        const detail = String(task?.detail || '').slice(0, 800);
        let assignee = this.findMember(String(task?.assignee || '')) || this.members.get('default');
        if (!assignee) return;

        let finalTitle = title;
        let note = '';
        const sensitive = SENSITIVE.test(`${title} ${detail}`);
        if (sensitive || this.cfg.protectedProfiles.includes(assignee.id)) {
            // Kunci pengaman: diarahkan ke Kepala sebagai usulan yang butuh izin.
            note = `\n\nUsulan ini ditujukan untuk ${assignee.name}, tapi memerlukan izin ${this.cfg.ownerName} terlebih dulu. Kepala Kantor: tanyakan ke ${this.cfg.ownerName} sebelum meneruskan.`;
            assignee = this.members.get('default') || assignee;
            finalTitle = `[Perlu izin ${this.cfg.ownerName}] ${title}`;
        }

        const result = await this.hermes.createTask({
            title: finalTitle,
            assignee: assignee.id,
            body: `${detail}${note}${this.guardFooter(m)}`,
            createdBy: `kantor:${m.id}`,
            idempotencyKey: `kantor-${this.todayKey()}-${this.normTitle(title).slice(0, 80)}`
        });
        if (result.ok) {
            this.knownTitles.add(this.normTitle(title));
            this.autonomy.tasks++;
            this.writeJsonFile('kantor-autonomy.json', this.autonomy);
            this.broadcast('chat', { sender: m.name, text: `📋 Saya membuat tugas untuk ${assignee.name}: "${finalTitle}"` });
            this.emitHighlight('task', `${m.name} membuat tugas`, `"${finalTitle}" → ${assignee.name}`, m.id);
            this.remember(m, { content: `Saya membuat tugas "${finalTitle}" untuk ${assignee.name}.`, type: 'achievement', timestamp: new Date().toISOString(), importance: 0.7 });
            this.pollKanban().catch(() => undefined);
        } else {
            console.error('[Kantor] Gagal membuat tugas otomatis:', result.error);
        }
    }

    private async proposeHire(m: Member, hire: any) {
        const left = this.autonomyLeft();
        const name = String(hire?.name || '').trim().slice(0, 30);
        const role = String(hire?.role || '').trim().slice(0, 80);
        const reason = String(hire?.reason || '').trim().slice(0, 500);
        if (!name || !role) return;
        if (left.hires <= 0) return;
        if (this.knownTitles.has(this.normTitle(`rekrut ${name} (${role})`)) || this.findMember(name)) return;
        if (this.members.size >= this.cfg.maxAgents) {
            this.broadcast('chat', { sender: m.name, text: `Saya ingin mengusulkan rekrut ${name} (${role}), tapi kantor sudah penuh (maks ${this.cfg.maxAgents} divisi).` });
            return;
        }
        const head = this.members.get('default');
        const result = await this.hermes.createTask({
            title: `Usulan rekrut divisi baru: ${name} (${role})`,
            assignee: head?.id || 'default',
            body: `${m.name} mengusulkan divisi baru.\nNama panggilan: ${name}\nPeran: ${role}\nAlasan: ${reason}\n\nIkuti SOP REKRUT: sampaikan usulan ini ke ${this.cfg.ownerName} dan JANGAN membuat divisi sebelum ${this.cfg.ownerName} membalas OK.${this.guardFooter(m)}`,
            createdBy: `kantor:${m.id}`,
            idempotencyKey: `kantor-rekrut-${name.toLowerCase()}`
        });
        if (result.ok) {
            this.knownTitles.add(this.normTitle(`rekrut ${name} (${role})`));
            this.autonomy.hires++;
            this.writeJsonFile('kantor-autonomy.json', this.autonomy);
            this.broadcast('chat', { sender: m.name, text: `🤝 Saya mengusulkan rekrut ${name} sebagai ${role}. Menunggu persetujuan ${this.cfg.ownerName} lewat ${head?.name || 'Kepala'}.` });
            this.emitHighlight('hiring', `Usulan rekrut: ${name}`, `${m.name} mengusulkan ${name} (${role}).`, m.id);
        }
    }

    // ════════════════════════════════════════════════════════
    //  LOOP UTAMA (gerak & jadwal berpikir)
    // ════════════════════════════════════════════════════════

    private takenSpots(exceptId: string): Spot[] {
        const spots: Spot[] = [];
        this.state.agents.forEach((a, id) => { if (id !== exceptId) spots.push({ x: a.x, y: a.y }); });
        return spots;
    }

    /** Satu langkah kegiatan santai tanpa AI: pindah tempat, atau ngobrol singkat dengan rekan. */
    private idleStep(m: Member) {
        const st = this.state.agents.get(m.id);
        m.talkTarget = null;
        if (!st || !this.layout) { m.nextIdleAt = Date.now() + 60_000; return; }

        const friends = Array.from(this.members.values()).filter((o) => o.id !== m.id && !o.work && !o.thinking && !o.talkTarget);
        const roll = Math.random();
        if (friends.length && roll < 0.15) {
            const other = pick(friends);
            const [ask, reply] = pick(SMALL_TALK);
            m.talkTarget = other.id;
            m.goal = null;
            st.thought = `💬 ${other.name}, ${ask.charAt(0).toLowerCase()}${ask.slice(1)}`;
            const ost = this.state.agents.get(other.id);
            if (ost) ost.thought = `💬 ${reply}`;
            other.nextIdleAt = Math.max(other.nextIdleAt, Date.now() + 60_000);
            this.updateRelationship(m.id, other.id, 0.02);
            m.nextIdleAt = Date.now() + 60_000 + Math.random() * 30_000;
            return;
        }
        const place = roll < 0.6 ? 'desk' : pick(['pantry', 'pantry', 'water', 'lounge', 'bookshelf', 'meeting']);
        m.place = place;
        m.goal = place === 'desk' ? null : pickSpot(this.layout, place, this.takenSpots(m.id));
        if (!m.goal) m.place = 'desk';
        st.thought = pick(IDLE_THOUGHTS[m.place] || IDLE_THOUGHTS.desk);
        // Di meja lebih lama, di tempat lain sebentar saja.
        m.nextIdleAt = Date.now() + (m.place === 'desk' ? 3 + Math.random() * 5 : 1 + Math.random() * 2) * 60_000;
    }

    update() {
        this.state.officeTime = new Date().toISOString();
        const now = Date.now();

        // Jadwal berpikir. Agen yang sedang disapa Pak Rico didahulukan.
        const queue = Array.from(this.members.values()).sort(
            (a, b) => Number(b.inbox.some((i) => i.fromOwner)) - Number(a.inbox.some((i) => i.fromOwner))
        );
        for (const m of queue) {
            // Gerak-gerik harian: aturan biasa, TIDAK memakai kuota AI.
            if (!m.thinking && !m.work && now >= m.nextIdleAt) this.idleStep(m);

            if (m.thinking || now < m.nextThinkAt) continue;
            const hasOwnerMsg = m.inbox.some((i) => i.fromOwner);
            if (!hasOwnerMsg) {
                // AI hanya dipakai untuk merencanakan usulan tugas/rekrut, dan hanya kalau jatahnya masih ada.
                const left = this.autonomyLeft();
                const wantsPlan = this.llm.enabled && !m.work && left.plans > 0 && (left.tasks > 0 || left.hires > 0)
                    && this.llm.remainingToday() > 5;
                if (m.work === 'running') {
                    const st = this.state.agents.get(m.id);
                    if (st) st.thought = `Mengerjakan: ${m.workTitle}`.slice(0, 140);
                }
                if (!wantsPlan) { this.scheduleNext(m); continue; }
            }
            if (!this.llm.enabled) { m.inbox = []; this.scheduleNext(m); continue; }
            if (this.thinkingNow >= MAX_PARALLEL_THINK) continue;
            if (!this.llm.canCall()) {
                if (hasOwnerMsg && this.llm.remainingToday() <= 0) {
                    this.broadcast('chat', { sender: m.name, text: '(Jatah AI gratis hari ini sudah habis, jadi saya belum bisa membalas di sini. Perintah kerja lewat Telegram tetap jalan seperti biasa 👍)' });
                    m.inbox = [];
                    this.scheduleNext(m);
                } else {
                    m.nextThinkAt = now + (hasOwnerMsg ? 3_000 : 30 * 60_000);
                }
                continue;
            }
            this.think(m).catch(() => undefined);
        }

        // Gerak: satu petak tiap 0,3 detik, mengikuti lorong (tidak menembus dinding).
        this.moveTick++;
        if (this.moveTick < 3) return;
        this.moveTick = 0;
        if (!this.layout) return;

        for (const m of this.members.values()) {
            const st = this.state.agents.get(m.id);
            if (!st) continue;

            let target: Spot = this.seatOf(m.id);
            if (m.work) {
                target = this.seatOf(m.id);
            } else if (m.talkTarget && this.state.agents.get(m.talkTarget)) {
                const other = this.state.agents.get(m.talkTarget)!;
                const options = [{ x: other.x - 1, y: other.y }, { x: other.x + 1, y: other.y }, { x: other.x, y: other.y + 1 }, { x: other.x, y: other.y - 1 }];
                target = options.find((o) => this.grid[o.y]?.[o.x]) || target;
            } else if (m.goal) {
                target = m.goal;
            }

            const key = `${target.x},${target.y}`;
            if (m.pathKey !== key) {
                m.pathKey = key;
                m.path = findPath(this.grid, { x: st.x, y: st.y }, target) || [];
            }
            const before = `${st.x},${st.y}`;
            const next = m.path.shift();
            if (next) {
                st.direction = next.x > st.x ? 'right' : next.x < st.x ? 'left' : next.y > st.y ? 'down' : 'up';
                st.x = next.x;
                st.y = next.y;
            } else if (st.x === target.x && st.y === target.y) {
                const atSeat = target.x === this.seatOf(m.id).x && target.y === this.seatOf(m.id).y;
                const facing = atSeat ? 'up' : 'down';
                if (st.direction !== facing) st.direction = facing;
            }
            const moved = before !== `${st.x},${st.y}`;

            // Aksi yang terlihat.
            let action = st.action;
            if (m.flash && now < m.flashUntil) action = m.flash;
            else if (m.work === 'running') action = moved ? 'walk' : 'work';
            else if (m.work === 'blocked') action = 'blocked';
            else if (m.work === 'review') action = 'review';
            else if (m.work === 'queued') action = moved ? 'walk' : 'queued';
            else if (m.thinking) action = 'think';
            else if (moved) action = 'walk';
            else if (['walk', 'work', 'queued', 'blocked', 'review', 'done'].includes(action)) action = 'idle';
            if (st.action !== action) st.action = action;

            if (m.work === 'running' && !m.thinking) {
                const t = `Mengerjakan: ${m.workTitle}`.slice(0, 140);
                if (st.thought !== t) st.thought = t;
            }
        }
    }

    // ════════════════════════════════════════════════════════
    //  SOROTAN & HUBUNGAN
    // ════════════════════════════════════════════════════════

    private emitHighlight(type: string, title: string, body: string, agentId?: string) {
        const payload: HighlightEvent = {
            type, title, body,
            agentId: agentId || null,
            scenario: this.cfg.officeName,
            time: this.state.officeTime
        };
        this.highlights = [payload, ...this.highlights].slice(0, 100);
        this.broadcast('highlight-event', payload);
    }

    private relationshipKey(a: string, b: string): string {
        return [a, b].sort().join('::');
    }

    private rebuildRelationshipGraph() {
        const ids = Array.from(this.state.agents.keys());
        for (const key of Array.from(this.relationships.keys())) {
            const [a, b] = key.split('::');
            if (!ids.includes(a) || !ids.includes(b)) this.relationships.delete(key);
        }
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                const key = this.relationshipKey(ids[i], ids[j]);
                if (!this.relationships.has(key)) {
                    this.relationships.set(key, { a: ids[i], b: ids[j], score: 0, status: 'neutral', updatedAt: this.state.officeTime });
                }
            }
        }
        this.broadcast('relationship-update', this.buildRelationshipPayload());
    }

    private updateRelationship(a: string, b: string, delta: number) {
        const key = this.relationshipKey(a, b);
        const existing = this.relationships.get(key) || { a: [a, b].sort()[0], b: [a, b].sort()[1], score: 0, status: 'neutral' as const, updatedAt: this.state.officeTime };
        const score = Math.max(-1, Math.min(1, existing.score + delta));
        this.relationships.set(key, {
            ...existing,
            score,
            status: score > 0.35 ? 'alliance' : score < -0.35 ? 'rivalry' : 'neutral',
            updatedAt: this.state.officeTime
        });
        this.broadcast('relationship-update', this.buildRelationshipPayload());
    }

    private buildRelationshipPayload() {
        const idToName: Record<string, string> = {};
        this.state.agents.forEach((agent, id) => { idToName[id] = agent.name; });
        return {
            edges: Array.from(this.relationships.values()).map((edge) => ({ ...edge, aName: idToName[edge.a] || edge.a, bName: idToName[edge.b] || edge.b })),
            time: this.state.officeTime
        };
    }

    // ════════════════════════════════════════════════════════
    //  STATUS & KONEKSI
    // ════════════════════════════════════════════════════════

    usagePayload() {
        const left = this.autonomyLeft();
        return {
            ...this.llm.snapshot(),
            autonomousTasksLeft: left.tasks,
            hireProposalsLeft: left.hires,
            thinkIntervalMinutes: this.cfg.thinkIntervalMinutes
        };
    }

    statusPayload() {
        return {
            office: this.cfg.officeName,
            owner: this.cfg.ownerName,
            hermesHome: this.cfg.hermesHome,
            kanbanConnected: this.hermes.kanbanAvailable,
            members: Array.from(this.members.values()).map((m) => ({
                id: m.id, name: m.name, role: m.role,
                work: m.work, workTitle: m.workTitle, place: m.place,
                nextThinkInSeconds: Math.max(0, Math.round((m.nextThinkAt - Date.now()) / 1000))
            })),
            divisions: this.layout?.divisions || [],
            usage: this.usagePayload()
        };
    }

    /** Hanya yang sudah login (punya token) boleh masuk ke kantor. */
    onAuth(_client: Client, options: any) {
        if (!OfficeRoom.auth.verify(options?.token)) {
            throw new ServerError(401, 'Perlu login');
        }
        return true;
    }

    onJoin(client: Client) {
        client.send('office-info', { officeName: this.cfg.officeName, owner: this.cfg.ownerName });
        if (this.layout) client.send('office-layout', this.layout);
        client.send('tasks-sync', this.lastTasksPayload);
        client.send('relationship-update', this.buildRelationshipPayload());
        client.send('layout-sync', { name: 'default', layout: this.currentLayout });
        client.send('usage', this.usagePayload());
        for (const h of this.highlights.slice(0, 15).reverse()) client.send('highlight-event', h);
    }

    onLeave() { /* tidak ada yang perlu dibersihkan */ }

    async onDispose() {
        OfficeRoom.activeRoom = null;
        this.timers.forEach((t) => clearInterval(t));
        await this.hermes.close();
        await this.memoryStore.close();
    }
}

