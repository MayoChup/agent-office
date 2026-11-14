/**
 * Denah kantor yang dibangun otomatis dari daftar divisi.
 *
 * Satuan = petak 16px. Server memakai hasilnya untuk tempat duduk & pencarian
 * jalan, lalu mengirim denah yang sama ke tampilan (UI) untuk digambar.
 *
 *  ┌────────┬──────────┬─────────┬────────┐
 *  │ Kepala │  Rapat   │ Lounge  │ Pantry │   ← baris atas (tetap)
 *  └──  ────┴───  ─────┴───  ────┴──  ────┘
 *  ═══════════════ koridor ════════════════
 *  ┌──  ─────────┬──  ─────────┬──  ───────┐
 *  │ Divisi A    │ Divisi B    │ Divisi C  │   ← ruangan divisi (otomatis)
 *  └─────────────┴─────────────┴───────────┘
 */

export interface Spot { x: number; y: number }

export interface LayoutItem {
    /** Nama berkas aset tanpa .png, misalnya "DESK_FRONT". */
    key: string;
    x: number; // petak kiri
    y: number; // petak atas
    flipX?: boolean;
    /** Dipasang di dinding (digambar di atas dinding). */
    wall?: boolean;
    /** Komputer milik anggota ini (layar menyala saat ia bekerja). */
    pcOf?: string;
    /** Geser piksel tambahan (misalnya PC di atas meja). */
    dy?: number;
}

export interface LayoutRoom {
    id: string;
    kind: 'head' | 'meeting' | 'lounge' | 'pantry' | 'division' | 'corridor' | 'empty';
    x: number; y: number; w: number; h: number;
    floor: number;
    tint: string;
    label?: string;
    icon?: string;
    divisionId?: string;
}

export interface DivisionInfo {
    id: string;
    name: string;
    icon: string;
    color: string;
    headId: string;
    memberIds: string[];
}

export interface OfficeLayout {
    cols: number;
    rows: number;
    /** 0 = kosong, 1 = lantai, 2 = dinding (baris demi baris). */
    tiles: number[][];
    rooms: LayoutRoom[];
    items: LayoutItem[];
    seats: Record<string, Spot>;
    places: Record<string, Spot[]>;
    divisions: DivisionInfo[];
    revision: string;
}

/** Ukuran & petak penghalang tiap jenis furnitur (dalam petak, dari pojok kiri atas). */
const FOOTPRINT: Record<string, { w: number; h: number; block?: [number, number, number, number] }> = {
    DESK_FRONT: { w: 3, h: 2, block: [0, 0, 3, 2] },
    DESK_SIDE: { w: 1, h: 4, block: [0, 0, 1, 4] },
    TABLE_FRONT: { w: 3, h: 4, block: [0, 0, 3, 4] },
    COFFEE_TABLE: { w: 2, h: 2, block: [0, 0, 2, 2] },
    SMALL_TABLE_FRONT: { w: 2, h: 2, block: [0, 0, 2, 2] },
    DOUBLE_BOOKSHELF: { w: 2, h: 2, block: [0, 1, 2, 1] },
    LARGE_PLANT: { w: 2, h: 3, block: [0, 2, 2, 1] },
    PLANT: { w: 1, h: 2, block: [0, 1, 1, 1] },
    PLANT_2: { w: 1, h: 2, block: [0, 1, 1, 1] },
    CACTUS: { w: 1, h: 2, block: [0, 1, 1, 1] },
    BIN: { w: 1, h: 1, block: [0, 0, 1, 1] },
    POT: { w: 1, h: 1, block: [0, 0, 1, 1] }
};

const ICONS: Array<[RegExp, string]> = [
    [/uang|keuangan|finance|akunt/i, '💰'],
    [/trad|saham|invest/i, '📈'],
    [/excel|sheet|spreadsheet|data|rekap/i, '📊'],
    [/video|konten|content|reels|tiktok/i, '🎬'],
    [/r&d|rnd|riset|research/i, '🔬'],
    [/market|sosmed|social/i, '📣'],
    [/hr|rekrut|sdm/i, '🧑‍💼'],
    [/desain|design/i, '🎨'],
    [/tulis|writer|copy/i, '✍️'],
    [/dev|kode|code|program/i, '💻']
];

export const DIVISION_COLORS = ['#5b8def', '#f2994a', '#27ae60', '#bb6bd9', '#eb5757', '#2bb3c0', '#f2c94c', '#ff7eb6'];

export function pickIcon(text: string): string {
    for (const [re, icon] of ICONS) if (re.test(text)) return icon;
    return '🏢';
}

function hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
}

export function colorFor(id: string): string {
    return DIVISION_COLORS[hash(id) % DIVISION_COLORS.length];
}

export interface LayoutMember { id: string; name: string; role: string }
export interface DivisionOverride { name?: string; icon?: string; color?: string }

/**
 * Kelompokkan anggota jadi divisi.
 * - "default" = Kepala Kantor (punya ruangan sendiri, bukan divisi).
 * - Profil bernama "<divisi>-<nama>" (mis. "video-subtitle") masuk ke divisi "video"
 *   kalau profil "video" ada, atau kalau diatur lewat config `division`.
 */
export function groupDivisions(
    members: LayoutMember[],
    memberDivision: Record<string, string | undefined>,
    overrides: Record<string, DivisionOverride>
): DivisionInfo[] {
    const ids = new Set(members.map((m) => m.id));
    const groups = new Map<string, LayoutMember[]>();
    for (const m of members) {
        if (m.id === 'default') continue;
        let div = memberDivision[m.id];
        if (!div) {
            const prefix = m.id.split('-')[0];
            div = prefix !== m.id && ids.has(prefix) ? prefix : m.id;
        }
        if (!groups.has(div)) groups.set(div, []);
        groups.get(div)!.push(m);
    }
    const result: DivisionInfo[] = [];
    for (const [divId, list] of groups) {
        const head = list.find((m) => m.id === divId) || list[0];
        list.sort((a, b) => (a.id === head.id ? -1 : b.id === head.id ? 1 : a.name.localeCompare(b.name)));
        const o = overrides[divId] || {};
        const baseName = o.name || (head.id === divId ? head.role : divId);
        const name = baseName
            .replace(/^divisi\s+/i, '')
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
            .slice(0, 28) || divId;
        result.push({
            id: divId,
            name,
            icon: o.icon || pickIcon(`${divId} ${head.role} ${name}`),
            color: o.color || colorFor(divId),
            headId: head.id,
            memberIds: list.map((m) => m.id)
        });
    }
    result.sort((a, b) => a.id.localeCompare(b.id));
    return result;
}

export function buildLayout(members: LayoutMember[], divisions: DivisionInfo[], headName: string): OfficeLayout {
    const COLS = 42;
    const POD_W = 12;
    const PODS_PER_ROW = 3;

    // Hitung tinggi baris ruangan divisi.
    const podRows: DivisionInfo[][] = [];
    for (let i = 0; i < divisions.length; i += PODS_PER_ROW) podRows.push(divisions.slice(i, i + PODS_PER_ROW));
    const podHeights = podRows.map((row) => Math.max(...row.map((d) => 1 + 4 * Math.ceil(Math.max(1, d.memberIds.length) / 2))));

    let rows = 14 + (podRows.length ? podHeights.reduce((s, h) => s + h + 1, 0) : 6) + 2;
    rows = Math.max(rows, 22);

    const tiles: number[][] = Array.from({ length: rows }, () => Array(COLS).fill(0));
    const rooms: LayoutRoom[] = [];
    const items: LayoutItem[] = [];
    const seats: Record<string, Spot> = {};
    const places: Record<string, Spot[]> = { pantry: [], meeting: [], lounge: [], bookshelf: [], water: [] };

    const carve = (x: number, y: number, w: number, h: number) => {
        for (let yy = y - 1; yy <= y + h; yy++) {
            for (let xx = x - 1; xx <= x + w; xx++) {
                if (yy < 0 || xx < 0 || yy >= rows || xx >= COLS) continue;
                const inside = xx >= x && xx < x + w && yy >= y && yy < y + h;
                if (inside) tiles[yy][xx] = 1;
                else if (tiles[yy][xx] === 0) tiles[yy][xx] = 2;
            }
        }
    };
    const door = (x: number, y: number, w = 2) => {
        for (let i = 0; i < w; i++) if (tiles[y]?.[x + i] !== undefined) tiles[y][x + i] = 1;
    };
    const room = (r: LayoutRoom) => { rooms.push(r); carve(r.x, r.y, r.w, r.h); };

    // ── Baris atas ──────────────────────────────────────────
    room({ id: 'kepala', kind: 'head', x: 2, y: 2, w: 8, h: 8, floor: 5, tint: '#d9b48a', label: `Ruang ${headName}`, icon: '👑' });
    room({ id: 'rapat', kind: 'meeting', x: 11, y: 2, w: 10, h: 8, floor: 3, tint: '#a497d6', label: 'Ruang Rapat', icon: '🗂️' });
    room({ id: 'lounge', kind: 'lounge', x: 22, y: 2, w: 9, h: 8, floor: 0, tint: '#e0a98a', label: 'Lounge', icon: '🛋️' });
    room({ id: 'pantry', kind: 'pantry', x: 32, y: 2, w: 8, h: 8, floor: 8, tint: '#b6dcc4', label: 'Pantry', icon: '☕' });
    // Koridor
    room({ id: 'koridor', kind: 'corridor', x: 2, y: 11, w: 38, h: 2, floor: 1, tint: '#9aa3bd' });
    door(5, 10); door(15, 10); door(26, 10); door(35, 10);

    // Ruang kepala
    items.push({ key: 'DESK_FRONT', x: 4, y: 4 });
    items.push({ key: 'PC_FRONT_OFF', x: 5, y: 3, dy: 6, pcOf: 'default' });
    items.push({ key: 'CUSHIONED_CHAIR_BACK', x: 5, y: 6 });
    seats.default = { x: 5, y: 6 };
    items.push({ key: 'DOUBLE_BOOKSHELF', x: 8, y: 2 });
    items.push({ key: 'LARGE_PLANT', x: 2, y: 7 });
    items.push({ key: 'CLOCK', x: 4, y: 1, wall: true });
    items.push({ key: 'LARGE_PAINTING', x: 6, y: 1, wall: true });
    places.bookshelf.push({ x: 8, y: 4 }, { x: 9, y: 4 });

    // Ruang rapat
    items.push({ key: 'TABLE_FRONT', x: 14, y: 4 });
    for (const y of [5, 6]) {
        items.push({ key: 'WOODEN_CHAIR_SIDE', x: 13, y: y - 1 });
        items.push({ key: 'WOODEN_CHAIR_SIDE', x: 17, y: y - 1, flipX: true });
        places.meeting.push({ x: 13, y }, { x: 17, y });
    }
    items.push({ key: 'WOODEN_CHAIR_BACK', x: 15, y: 7 });
    places.meeting.push({ x: 15, y: 8 });
    items.push({ key: 'WHITEBOARD', x: 17, y: 1, wall: true });
    items.push({ key: 'PLANT', x: 20, y: 2 });
    items.push({ key: 'PLANT_2', x: 11, y: 8 });

    // Lounge
    items.push({ key: 'SOFA_FRONT', x: 24, y: 3 });
    items.push({ key: 'COFFEE_TABLE', x: 24, y: 4 });
    items.push({ key: 'SOFA_SIDE', x: 23, y: 4 });
    items.push({ key: 'SOFA_SIDE', x: 26, y: 4, flipX: true });
    items.push({ key: 'SOFA_BACK', x: 24, y: 6 });
    places.lounge.push({ x: 24, y: 3 }, { x: 25, y: 3 }, { x: 23, y: 5 }, { x: 26, y: 5 }, { x: 24, y: 6 }, { x: 25, y: 6 });
    items.push({ key: 'LARGE_PLANT', x: 29, y: 7 });
    items.push({ key: 'BOOKSHELF', x: 22, y: 1, wall: true });
    items.push({ key: 'HANGING_PLANT', x: 28, y: 1, wall: true });
    items.push({ key: 'SMALL_PAINTING', x: 26, y: 1, wall: true });
    places.bookshelf.push({ x: 22, y: 2 }, { x: 23, y: 2 });

    // Pantry
    items.push({ key: 'SMALL_TABLE_FRONT', x: 35, y: 4 });
    items.push({ key: 'COFFEE', x: 35, y: 4, dy: 2 });
    items.push({ key: 'COFFEE', x: 36, y: 5, dy: -4 });
    items.push({ key: 'WOODEN_CHAIR_SIDE', x: 34, y: 4 });
    items.push({ key: 'WOODEN_CHAIR_SIDE', x: 37, y: 4, flipX: true });
    items.push({ key: 'DESK_SIDE', x: 39, y: 2 });
    items.push({ key: 'COFFEE', x: 39, y: 3, dy: -6 });
    items.push({ key: 'BIN', x: 32, y: 9 });
    items.push({ key: 'CACTUS', x: 32, y: 2 });
    items.push({ key: 'SMALL_PAINTING_2', x: 36, y: 1, wall: true });
    places.pantry.push({ x: 34, y: 5 }, { x: 37, y: 5 }, { x: 35, y: 7 }, { x: 36, y: 7 });
    places.water.push({ x: 38, y: 3 }, { x: 38, y: 4 });

    // Dekorasi koridor
    items.push({ key: 'PLANT', x: 2, y: 11 });
    items.push({ key: 'PLANT_2', x: 39, y: 11 });

    // ── Ruangan divisi ──────────────────────────────────────
    let y = 14;
    if (podRows.length === 0) {
        room({ id: 'kosong', kind: 'empty', x: 2, y, w: 38, h: 5, floor: 4, tint: '#7f8aa8', label: 'Area Divisi — belum ada divisi. Minta Joni merekrut!', icon: '✨' });
        door(20, y - 1);
        items.push({ key: 'POT', x: 20, y: y + 2 });
    }
    podRows.forEach((row, ri) => {
        const h = podHeights[ri];
        row.forEach((div, ci) => {
            const x = 2 + ci * (POD_W + 1);
            room({
                id: `div-${div.id}`, kind: 'division', x, y, w: POD_W, h,
                floor: 4, tint: div.color, label: div.name, icon: div.icon, divisionId: div.id
            });
            door(x + 5, y - 1);
            const nextRowExists = ri < podRows.length - 1;
            if (nextRowExists) door(x + 5, y + h);

            div.memberIds.forEach((mid, i) => {
                const dx = x + 1 + (i % 2) * 6;
                const dy = y + 1 + Math.floor(i / 2) * 4;
                items.push({ key: 'DESK_FRONT', x: dx, y: dy });
                items.push({ key: 'PC_FRONT_OFF', x: dx + 1, y: dy - 1, dy: 6, pcOf: mid });
                items.push({ key: 'CUSHIONED_CHAIR_BACK', x: dx + 1, y: dy + 2 });
                seats[mid] = { x: dx + 1, y: dy + 2 };
            });
            items.push({ key: 'PLANT', x: x + POD_W - 1, y });
            items.push({ key: 'BIN', x: x + POD_W - 1, y: y + h - 1 });
            if (/trading|saham|invest/i.test(`${div.id} ${div.name}`)) {
                // Ruang Trading: papan analisa + jam bursa di dinding.
                items.push({ key: 'WHITEBOARD', x: x + 2, y: y - 1, wall: true });
                items.push({ key: 'CLOCK', x: x + 8, y: y - 1, wall: true });
            } else {
                items.push({ key: ci % 2 ? 'SMALL_PAINTING_2' : 'SMALL_PAINTING', x: x + 2, y: y - 1, wall: true });
            }
        });
        y += h + 1;
    });

    // Anggota tanpa kursi (mis. kelebihan) duduk di lounge.
    for (const m of members) if (!seats[m.id]) seats[m.id] = places.lounge[0];

    const revision = `${divisions.map((d) => `${d.id}:${d.memberIds.join('+')}:${d.name}:${d.color}`).join('|')}#${headName}`;
    return { cols: COLS, rows, tiles, rooms, items, seats, places, divisions, revision };
}

/** Peta petak yang bisa dilewati (lantai, bukan furnitur penghalang). */
export function walkableGrid(layout: OfficeLayout): boolean[][] {
    const grid = layout.tiles.map((row) => row.map((t) => t === 1));
    for (const it of layout.items) {
        if (it.wall) continue;
        const fp = FOOTPRINT[it.key];
        if (!fp?.block) continue;
        const [bx, by, bw, bh] = fp.block;
        for (let yy = it.y + by; yy < it.y + by + bh; yy++) {
            for (let xx = it.x + bx; xx < it.x + bx + bw; xx++) {
                if (grid[yy]?.[xx] !== undefined) grid[yy][xx] = false;
            }
        }
    }
    // Kursi & titik tujuan selalu bisa ditempati.
    for (const s of Object.values(layout.seats)) if (grid[s.y]?.[s.x] !== undefined) grid[s.y][s.x] = true;
    for (const list of Object.values(layout.places)) for (const s of list) if (grid[s.y]?.[s.x] !== undefined) grid[s.y][s.x] = true;
    return grid;
}

/** Cari jalan terpendek (BFS, 4 arah). Mengembalikan langkah-langkah tanpa titik awal. */
export function findPath(grid: boolean[][], from: Spot, to: Spot): Spot[] | null {
    if (from.x === to.x && from.y === to.y) return [];
    const rows = grid.length;
    const cols = grid[0]?.length || 0;
    const inBounds = (p: Spot) => p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows;
    if (!inBounds(to)) return null;
    const key = (p: Spot) => p.y * cols + p.x;
    const prev = new Map<number, number>();
    const start = key(from);
    const goal = key(to);
    prev.set(start, -1);
    const queue: Spot[] = [from];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length) {
        const cur = queue.shift()!;
        if (key(cur) === goal) break;
        for (const [dx, dy] of dirs) {
            const nxt = { x: cur.x + dx, y: cur.y + dy };
            if (!inBounds(nxt)) continue;
            const k = key(nxt);
            if (prev.has(k)) continue;
            if (!grid[nxt.y][nxt.x] && k !== goal) continue;
            prev.set(k, key(cur));
            queue.push(nxt);
        }
    }
    if (!prev.has(goal)) return null;
    const path: Spot[] = [];
    let k = goal;
    while (k !== start && k !== -1) {
        path.unshift({ x: k % cols, y: Math.floor(k / cols) });
        k = prev.get(k)!;
    }
    return path;
}

export const PLACE_LABELS: Record<string, string> = {
    desk: 'di meja kerja',
    pantry: 'di pantry (kopi & camilan)',
    water: 'dekat dispenser air',
    meeting: 'di ruang rapat',
    lounge: 'di lounge (sofa)',
    bookshelf: 'dekat rak buku'
};

export function pickSpot(layout: OfficeLayout, place: string, taken: Spot[]): Spot | null {
    const spots = layout.places[place];
    if (!spots?.length) return null;
    const free = spots.filter((s) => !taken.some((t) => t.x === s.x && t.y === s.y));
    const pool = free.length ? free : spots;
    return pool[Math.floor(Math.random() * pool.length)];
}

/** Titik masuk kantor (koridor, dekat ruang kepala). */
export const DOOR: Spot = { x: 20, y: 12 };
