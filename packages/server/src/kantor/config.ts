import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Konfigurasi Kantor Virtual.
 *
 * Sumber (urutan prioritas): variabel lingkungan > kantor.config.json > nilai bawaan.
 * Rahasia (OPENROUTER_API_KEY) HANYA dibaca dari variabel lingkungan / file .env,
 * tidak pernah dari kantor.config.json.
 */

export interface AgentOverride {
    /** Nama panggilan yang tampil di kantor, misalnya "Joni" atau "Eca". */
    name?: string;
    /** Jabatan singkat, misalnya "Kepala Kantor". */
    role?: string;
    /** Kepribadian / gaya bicara singkat (opsional). */
    persona?: string;
    /** Nomor karakter 0-5 (opsional). */
    skin?: number;
    /** Masuk divisi mana (id divisi). Bawaan: dari nama profil "<divisi>-<nama>". */
    division?: string;
}

export interface DivisionConfig {
    name?: string;
    icon?: string;
    color?: string;
}

export interface KantorConfig {
    ownerName: string;
    officeName: string;
    hermesHome: string;
    hermesBin: string;
    kanbanDbPath: string;
    host: string;
    port: number;
    dataDir: string;
    uiDistDir: string;

    /** Profil Hermes → tampilan di kantor. Kunci "default" adalah si Kepala. */
    agents: Record<string, AgentOverride>;
    divisions: Record<string, DivisionConfig>;
    maxAgents: number;

    /** Kata sandi untuk membuka kantor (wajib kalau dibuka dari luar VPS). */
    password: string;
    /** Asal halaman yang boleh mengakses API (misalnya https://kantor.vercel.app). "*" = semua. */
    allowedOrigins: string[];

    // ── Otak gratis (OpenRouter :free) ──
    openRouterApiKey: string;
    openRouterBaseUrl: string;
    /** "auto" = pilih otomatis model :free yang tersedia, atau daftar id dipisah koma. */
    model: string;
    thinkIntervalMinutes: number;
    dailyRequestLimit: number;
    perMinuteLimit: number;

    // ── Otonomi ──
    allowAutonomousTasks: boolean;
    dailyAutonomousTaskLimit: number;
    dailyHireProposalLimit: number;
    /** Profil yang TIDAK boleh diberi tugas otomatis oleh agen (selalu lewat Joni + izin). */
    protectedProfiles: string[];

    kanbanPollSeconds: number;
    profilePollSeconds: number;
}

function readJson(file: string): any {
    try {
        if (!fs.existsSync(file)) return {};
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.error(`[Kantor] Gagal membaca ${file}:`, err);
        return {};
    }
}

/** Muat file .env sederhana (KEY=VALUE) tanpa menimpa variabel yang sudah ada. */
export function loadDotEnv(file: string) {
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
    }
}

const num = (v: any, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const bool = (v: any, fallback: boolean) => {
    if (v === undefined || v === null || v === '') return fallback;
    if (typeof v === 'boolean') return v;
    return ['1', 'true', 'yes', 'ya', 'on'].includes(String(v).toLowerCase());
};

export function loadConfig(): KantorConfig {
    const root = process.env.KANTOR_ROOT || process.cwd();
    loadDotEnv(path.join(root, '.env'));

    const configFile = process.env.KANTOR_CONFIG || path.join(root, 'kantor.config.json');
    const file = readJson(configFile);
    const env = process.env;

    const hermesHome = env.HERMES_HOME || file.hermesHome || path.join(os.homedir(), '.hermes');
    const defaultBin = path.join(os.homedir(), '.local', 'bin', 'hermes');

    const agents: Record<string, AgentOverride> = {
        default: { name: 'Joni', role: 'Kepala Kantor' },
        ...(file.agents || {})
    };

    return {
        ownerName: env.KANTOR_OWNER || file.ownerName || 'Pak Rico',
        officeName: env.KANTOR_NAME || file.officeName || 'Kantor Virtual',
        hermesHome,
        hermesBin: env.HERMES_BIN || file.hermesBin || (fs.existsSync(defaultBin) ? defaultBin : 'hermes'),
        kanbanDbPath: env.KANBAN_DB || file.kanbanDbPath || path.join(hermesHome, 'kanban.db'),
        host: env.HOST || file.host || '127.0.0.1',
        port: num(env.PORT || file.port, 3000),
        dataDir: env.KANTOR_DATA || file.dataDir || path.join(root, 'data'),
        uiDistDir: env.KANTOR_UI_DIST || file.uiDistDir || path.resolve(__dirname, '../../../ui/dist'),

        agents,
        divisions: file.divisions && typeof file.divisions === 'object' ? file.divisions : {},
        password: env.KANTOR_PASSWORD || '',
        allowedOrigins: String(env.KANTOR_ALLOWED_ORIGINS || file.allowedOrigins || '*').split(',').map((s: string) => s.trim()).filter(Boolean),
        maxAgents: num(env.KANTOR_MAX_AGENTS || file.maxAgents, 8),

        openRouterApiKey: env.OPENROUTER_API_KEY || '',
        openRouterBaseUrl: env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        model: env.KANTOR_MODEL || file.model || 'auto',
        thinkIntervalMinutes: num(env.KANTOR_THINK_MINUTES || file.thinkIntervalMinutes, 10),
        dailyRequestLimit: num(env.KANTOR_DAILY_REQUESTS || file.dailyRequestLimit, 900),
        perMinuteLimit: num(env.KANTOR_PER_MINUTE || file.perMinuteLimit, 12),

        allowAutonomousTasks: bool(env.KANTOR_AUTONOMOUS_TASKS ?? file.allowAutonomousTasks, true),
        dailyAutonomousTaskLimit: num(env.KANTOR_DAILY_TASKS || file.dailyAutonomousTaskLimit, 3),
        dailyHireProposalLimit: num(env.KANTOR_DAILY_HIRES || file.dailyHireProposalLimit, 1),
        protectedProfiles: Array.isArray(file.protectedProfiles) ? file.protectedProfiles : ['keuangan'],

        kanbanPollSeconds: num(env.KANTOR_KANBAN_POLL || file.kanbanPollSeconds, 10),
        profilePollSeconds: num(env.KANTOR_PROFILE_POLL || file.profilePollSeconds, 60)
    };
}
