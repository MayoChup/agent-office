/**
 * Denah kantor (koordinat petak 16px). Harus sejalan dengan gambar di
 * packages/ui/src/game/Game.ts (DESK_SLOTS di sana memakai piksel yang sama).
 */

export interface Spot { x: number; y: number }

/** Posisi meja dalam piksel (pojok kiri atas meja). Sama persis dengan UI. */
export const DESK_SLOTS_PX: Array<[number, number]> = [
    [64, 240], [136, 240],
    [64, 320], [136, 320],
    [64, 400], [136, 400], [208, 400],
    [64, 480], [136, 480], [208, 480]
];

/** Titik duduk (kursi di depan meja) dalam petak. */
export const DESK_SEATS: Spot[] = DESK_SLOTS_PX.map(([x, y]) => ({
    x: Math.round((x + 22) / 16),
    y: Math.round((y + 38) / 16)
}));

export const PLACES: Record<string, Spot[]> = {
    pantry: [{ x: 24, y: 26 }, { x: 23, y: 28 }, { x: 27, y: 28 }, { x: 25, y: 29 }],
    water: [{ x: 30, y: 26 }, { x: 29, y: 27 }],
    meeting: [{ x: 6, y: 4 }, { x: 8, y: 4 }, { x: 11, y: 4 }, { x: 6, y: 9 }, { x: 8, y: 9 }, { x: 11, y: 9 }],
    lounge: [{ x: 20, y: 9 }, { x: 23, y: 10 }, { x: 27, y: 9 }],
    bookshelf: [{ x: 34, y: 9 }, { x: 33, y: 10 }]
};

export const DOOR: Spot = { x: 16, y: 13 };

export const PLACE_LABELS: Record<string, string> = {
    desk: 'di meja kerja',
    pantry: 'di pantry (kopi & camilan)',
    water: 'dekat dispenser air',
    meeting: 'di ruang rapat',
    lounge: 'di area santai (bean bag)',
    bookshelf: 'dekat rak buku'
};

export function pickSpot(place: string, taken: Spot[]): Spot | null {
    const spots = PLACES[place];
    if (!spots) return null;
    const free = spots.filter((s) => !taken.some((t) => t.x === s.x && t.y === s.y));
    const pool = free.length ? free : spots;
    return pool[Math.floor(Math.random() * pool.length)];
}
