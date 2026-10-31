import Phaser from 'phaser';
import { eventBus, lastDetail } from '../events';
import type { AgentState } from './schema';

/** Jenis data denah dari server (lihat server/src/kantor/layout.ts). */
interface LayoutItem { key: string; x: number; y: number; flipX?: boolean; wall?: boolean; pcOf?: string; dy?: number }
interface LayoutRoom { id: string; kind: string; x: number; y: number; w: number; h: number; floor: number; tint: string; label?: string; icon?: string; divisionId?: string }
interface OfficeLayout {
    cols: number; rows: number; tiles: number[][];
    rooms: LayoutRoom[]; items: LayoutItem[];
    seats: Record<string, { x: number; y: number }>;
    divisions: Array<{ id: string; name: string; icon: string; color: string; memberIds: string[] }>;
    revision: string;
}

const T = 16;
const SKINS = 6;
const FURNITURE = [
    'BIN', 'BOOKSHELF', 'CACTUS', 'CLOCK', 'COFFEE', 'COFFEE_TABLE', 'CUSHIONED_BENCH', 'CUSHIONED_CHAIR_BACK',
    'CUSHIONED_CHAIR_FRONT', 'CUSHIONED_CHAIR_SIDE', 'DESK_FRONT', 'DESK_SIDE', 'DOUBLE_BOOKSHELF', 'HANGING_PLANT',
    'LARGE_PAINTING', 'LARGE_PLANT', 'PC_BACK', 'PC_FRONT_OFF', 'PC_FRONT_ON_1', 'PC_FRONT_ON_2', 'PC_FRONT_ON_3',
    'PC_SIDE', 'PLANT', 'PLANT_2', 'POT', 'SMALL_PAINTING', 'SMALL_PAINTING_2', 'SMALL_TABLE_FRONT', 'SMALL_TABLE_SIDE',
    'SOFA_BACK', 'SOFA_FRONT', 'SOFA_SIDE', 'TABLE_FRONT', 'WHITEBOARD', 'WOODEN_BENCH', 'WOODEN_CHAIR_BACK',
    'WOODEN_CHAIR_FRONT', 'WOODEN_CHAIR_SIDE'
];

const EMOTES: Record<string, string> = {
    work: '💻', talk: '💬', think: '💡', blocked: '⚠️', review: '📝', queued: '⏳', done: '✅', sleep: '😴'
};

/** Baris frame karakter (7 kolom × 3 baris: hadap bawah, atas, kanan). */
const ROW: Record<string, number> = { down: 0, up: 1, right: 2, left: 2 };

const hex = (c: string) => parseInt(c.replace('#', ''), 16);

/** Warna lantai ruangan divisi dicerahkan supaya terasa terang. */
function lighten(c: string, amount: number) {
    const n = hex(c);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (v: number) => Math.round(v + (255 - v) * amount);
    return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

interface AgentView {
    container: Phaser.GameObjects.Container;
    sprite: Phaser.GameObjects.Sprite;
    shadow: Phaser.GameObjects.Ellipse;
    nameTag: Phaser.GameObjects.Text;
    emote: Phaser.GameObjects.Text;
    bubble: Phaser.GameObjects.Text;
    skin: number;
    lastThought: string;
    bubbleTimer?: Phaser.Time.TimerEvent;
}

export class OfficeScene extends Phaser.Scene {
    private layout?: OfficeLayout;
    private layoutObjects: Phaser.GameObjects.GameObject[] = [];
    private pcs = new Map<string, Phaser.GameObjects.Image>();
    private agents = new Map<string, AgentView>();
    private room?: any;
    private pcFrame = 0;
    private dragStart?: { x: number; y: number; sx: number; sy: number };
    private dragged = false;
    private pinchStart?: { dist: number; zoom: number };
    private hasFitted = false;

    constructor() {
        super('OfficeScene');
    }

    preload() {
        for (let i = 0; i <= 8; i++) this.load.image(`floor_${i}`, `/assets/floors/floor_${i}.png`);
        this.load.spritesheet('walls', '/assets/walls/wall_0.png', { frameWidth: 16, frameHeight: 32 });
        for (const key of FURNITURE) this.load.image(key, `/assets/furniture/${key}.png`);
        for (let i = 0; i < SKINS; i++) {
            this.load.spritesheet(`char_${i}`, `/assets/characters/char_${i}.png`, { frameWidth: 16, frameHeight: 32 });
        }
    }

    create() {
        this.cameras.main.setBackgroundColor('#0b1020');

        for (let i = 0; i < SKINS; i++) {
            const key = `char_${i}`;
            const f = (row: number, cols: number[]) => cols.map((c) => ({ key, frame: row * 7 + c }));
            this.anims.create({ key: `${key}-walk-down`, frames: f(0, [0, 1, 2, 1]), frameRate: 8, repeat: -1 });
            this.anims.create({ key: `${key}-walk-up`, frames: f(1, [0, 1, 2, 1]), frameRate: 8, repeat: -1 });
            this.anims.create({ key: `${key}-walk-right`, frames: f(2, [0, 1, 2, 1]), frameRate: 8, repeat: -1 });
            this.anims.create({ key: `${key}-type-up`, frames: f(1, [3, 4]), frameRate: 4, repeat: -1 });
            this.anims.create({ key: `${key}-read-down`, frames: f(0, [5, 6]), frameRate: 2, repeat: -1 });
        }

        this.setupCameraControls();

        // Layar komputer yang menyala berkedip pelan.
        this.time.addEvent({
            delay: 350, loop: true, callback: () => {
                this.pcFrame = (this.pcFrame + 1) % 3;
                this.refreshPcs();
            }
        });

        const onLayout = (e: Event) => this.renderLayout((e as CustomEvent).detail as OfficeLayout);
        const onRoom = (e: Event) => this.bindRoom((e as CustomEvent).detail?.room);
        const onFocusDivision = (e: Event) => this.focusDivision((e as CustomEvent).detail?.id);
        const onFocusAgent = (e: Event) => this.focusAgent((e as CustomEvent).detail?.id);
        const onFit = () => this.fitCamera(true);
        const onSelect = (e: Event) => this.markSelected((e as CustomEvent).detail?.id || null);
        eventBus.addEventListener('office-layout', onLayout);
        eventBus.addEventListener('room-ready', onRoom);
        eventBus.addEventListener('focus-division', onFocusDivision);
        eventBus.addEventListener('focus-agent', onFocusAgent);
        eventBus.addEventListener('camera-fit', onFit);
        eventBus.addEventListener('agent-select', onSelect);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            eventBus.removeEventListener('office-layout', onLayout);
            eventBus.removeEventListener('room-ready', onRoom);
            eventBus.removeEventListener('focus-division', onFocusDivision);
            eventBus.removeEventListener('focus-agent', onFocusAgent);
            eventBus.removeEventListener('camera-fit', onFit);
            eventBus.removeEventListener('agent-select', onSelect);
        });

        const existing = lastDetail<OfficeLayout>('office-layout');
        if (existing) this.renderLayout(existing);
        const ready = lastDetail<{ room: any }>('room-ready');
        if (ready?.room) this.bindRoom(ready.room);

        this.scale.on('resize', () => this.fitCamera(false));
    }

    // ── Kamera: geser, zoom roda, cubit (HP) ─────────────────

    private setupCameraControls() {
        this.input.addPointer(1);
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
            const cam = this.cameras.main;
            this.dragStart = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY };
            this.dragged = false;
        });
        this.input.on('pointerup', () => { this.dragStart = undefined; this.pinchStart = undefined; });
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            const cam = this.cameras.main;
            const p1 = this.input.pointer1;
            const p2 = this.input.pointer2;
            if (p1.isDown && p2.isDown) {
                const dist = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
                if (!this.pinchStart) this.pinchStart = { dist, zoom: cam.zoom };
                cam.setZoom(Phaser.Math.Clamp(this.pinchStart.zoom * (dist / Math.max(1, this.pinchStart.dist)), 0.6, 5));
                this.dragStart = undefined;
                this.dragged = true;
                return;
            }
            if (!p.isDown || !this.dragStart) return;
            const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) this.dragged = true;
            cam.scrollX = this.dragStart.sx - dx / cam.zoom;
            cam.scrollY = this.dragStart.sy - dy / cam.zoom;
        });
        this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
            const cam = this.cameras.main;
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.6, 5));
        });
    }

    /** Muatkan seluruh kantor di layar (menyisakan ruang untuk panel UI). */
    private fitCamera(force: boolean) {
        if (!this.layout) return;
        if (this.hasFitted && !force) return;
        const cam = this.cameras.main;
        const mobile = this.scale.width < 768;
        const padTop = 72, padBottom = mobile ? 84 : 24, padLeft = mobile ? 12 : 92, padRight = 24;
        const availW = Math.max(200, this.scale.width - padLeft - padRight);
        const availH = Math.max(200, this.scale.height - padTop - padBottom);
        const worldW = this.layout.cols * T, worldH = this.layout.rows * T;
        const zoom = Phaser.Math.Clamp(Math.min(availW / worldW, availH / worldH), 0.6, 4);
        cam.setZoom(zoom);
        const cx = worldW / 2 - (padLeft - padRight) / 2 / zoom;
        const cy = worldH / 2 - (padTop - padBottom) / 2 / zoom;
        cam.centerOn(cx, cy);
        this.hasFitted = true;
    }

    private panTo(x: number, y: number, zoom: number) {
        const cam = this.cameras.main;
        cam.zoomTo(zoom, 450, 'Sine.easeInOut');
        cam.pan(x, y, 450, 'Sine.easeInOut');
    }

    private focusDivision(id: string) {
        const room = this.layout?.rooms.find((r) => r.divisionId === id || (id === 'default' && r.kind === 'head'));
        if (!room) return;
        const w = room.w * T, h = room.h * T;
        const zoom = Phaser.Math.Clamp(Math.min((this.scale.width * 0.5) / w, (this.scale.height * 0.55) / h), 1.2, 4);
        this.panTo(room.x * T + w / 2, room.y * T + h / 2, zoom);
    }

    private focusAgent(id: string) {
        const a = this.agents.get(id);
        if (a) this.panTo(a.container.x, a.container.y - 10, Math.max(this.cameras.main.zoom, 3));
    }

    // ── Denah ────────────────────────────────────────────────

    private renderLayout(layout: OfficeLayout) {
        if (!layout?.tiles) return;
        const changedSize = !this.layout || this.layout.cols !== layout.cols || this.layout.rows !== layout.rows;
        this.layout = layout;
        this.layoutObjects.forEach((o) => o.destroy());
        this.layoutObjects = [];
        this.pcs.clear();

        const W = layout.cols * T, H = layout.rows * T;

        // Lantai dipanggang ke satu tekstur supaya ringan.
        const rt = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(-10);
        this.layoutObjects.push(rt);
        for (const room of layout.rooms) {
            const tint = room.kind === 'division' ? lighten(room.tint, 0.45) : hex(room.tint);
            for (let y = room.y; y < room.y + room.h; y++) {
                for (let x = room.x; x < room.x + room.w; x++) {
                    rt.draw(`floor_${room.floor}`, x * T, y * T, 1, tint);
                }
            }
        }
        // Lantai di ambang pintu (lantai yang tidak termasuk ruangan mana pun).
        for (let y = 0; y < layout.rows; y++) {
            for (let x = 0; x < layout.cols; x++) {
                if (layout.tiles[y][x] !== 1) continue;
                const inRoom = layout.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
                if (!inRoom) rt.draw('floor_1', x * T, y * T, 1, 0x9aa3bd);
            }
        }

        // Dinding (dipilih otomatis menurut dinding tetangganya).
        const isWall = (x: number, y: number) => layout.tiles[y]?.[x] === 2;
        for (let y = 0; y < layout.rows; y++) {
            for (let x = 0; x < layout.cols; x++) {
                if (!isWall(x, y)) continue;
                let mask = 0;
                if (isWall(x, y - 1)) mask |= 1;
                if (isWall(x + 1, y)) mask |= 2;
                if (isWall(x, y + 1)) mask |= 4;
                if (isWall(x - 1, y)) mask |= 8;
                const img = this.add.image(x * T, (y + 1) * T, 'walls', mask).setOrigin(0, 1).setDepth((y + 1) * T);
                this.layoutObjects.push(img);
            }
        }

        // Furnitur
        for (const it of layout.items) {
            if (!this.textures.exists(it.key)) continue;
            const frame = this.textures.getFrame(it.key);
            const height = frame ? frame.height : T;
            const px = it.x * T;
            const py = it.wall ? (it.y - 1) * T + 2 : it.y * T + (it.dy || 0);
            const img = this.add.image(px, py, it.key).setOrigin(0).setFlipX(Boolean(it.flipX));
            let depth = it.wall ? (it.y + 1) * T + 1 : py + height;
            if (it.key.startsWith('PC') || it.key === 'COFFEE') depth += 18; // di atas meja
            if (it.key.startsWith('CUSHIONED_CHAIR') || it.key === 'WOODEN_CHAIR_BACK') depth += 4; // sandaran menutupi punggung
            img.setDepth(depth);
            this.layoutObjects.push(img);
            if (it.pcOf) this.pcs.set(it.pcOf, img);
        }

        // Papan nama ruangan (bisa diklik untuk membuka bagan divisi).
        for (const room of layout.rooms) {
            if (!room.label || room.kind === 'corridor') continue;
            const isDiv = room.kind === 'division';
            const text = `${room.icon ? room.icon + ' ' : ''}${room.label}`;
            const tag = this.add.text((room.x + room.w / 2) * T, room.y * T + 3, text, {
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '7px',
                fontStyle: 'bold',
                color: '#ffffff',
                backgroundColor: isDiv ? room.tint : '#1f2640',
                padding: { x: 4, y: 2 }
            }).setOrigin(0.5, 0).setResolution(4).setDepth(5000).setAlpha(0.95);
            if (isDiv || room.kind === 'head') {
                tag.setInteractive({ useHandCursor: true });
                tag.on('pointerup', () => {
                    if (this.dragged) return;
                    const id = room.kind === 'head' ? 'default' : room.divisionId;
                    eventBus.dispatchEvent(new CustomEvent('open-division', { detail: { id } }));
                });
            }
            this.layoutObjects.push(tag);
        }

        if (changedSize) this.hasFitted = false;
        this.fitCamera(false);
        this.refreshPcs();
        // Posisi kursi bisa berubah: perbarui pose semua karakter.
        this.agents.forEach((v, id) => {
            const a = this.room?.state?.agents?.get(id);
            if (a) this.applyAgent(v, a, id, true);
        });
    }

    private refreshPcs() {
        for (const [id, img] of this.pcs) {
            const a = this.room?.state?.agents?.get(id);
            const seat = this.layout?.seats[id];
            const seated = Boolean(a && seat && a.x === seat.x && a.y === seat.y);
            const key = seated && a.action === 'work' ? `PC_FRONT_ON_${this.pcFrame + 1}` : seated ? 'PC_FRONT_ON_1' : 'PC_FRONT_OFF';
            if (img.texture.key !== key) img.setTexture(key);
        }
    }

    // ── Karakter ─────────────────────────────────────────────

    private bindRoom(room: any) {
        if (!room || this.room === room) return;
        this.room = room;
        this.agents.forEach((a) => a.container.destroy());
        this.agents.clear();

        room.state.agents.onAdd((agent: AgentState, id: string) => {
            const view = this.createAgent(agent, id);
            this.agents.set(id, view);
            this.applyAgent(view, agent, id, true);
            agent.onChange(() => this.applyAgent(view, agent, id, false));
        });
        room.state.agents.onRemove((_agent: AgentState, id: string) => {
            const v = this.agents.get(id);
            if (v) {
                this.tweens.add({ targets: v.container, alpha: 0, duration: 400, onComplete: () => v.container.destroy() });
                this.agents.delete(id);
            }
        });
    }

    private createAgent(agent: AgentState, id: string): AgentView {
        const skin = Math.abs(Number(agent.skin) || 0) % SKINS;
        const container = this.add.container(agent.x * T + T / 2, agent.y * T + T);
        const shadow = this.add.ellipse(0, -1, 12, 4, 0x000000, 0.28);
        const sprite = this.add.sprite(0, 0, `char_${skin}`, 1).setOrigin(0.5, 1);
        const nameTag = this.add.text(0, 3, agent.name, {
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: '6px', fontStyle: 'bold',
            color: '#ffffff', backgroundColor: '#0f172acc', padding: { x: 3, y: 1 }
        }).setOrigin(0.5, 0).setResolution(4);
        const emote = this.add.text(7, -30, '', { fontSize: '9px' }).setOrigin(0.5, 1).setResolution(4).setVisible(false);
        const bubble = this.add.text(0, -34, '', {
            fontFamily: 'Inter, system-ui, sans-serif', fontSize: '6px', color: '#0f172a',
            backgroundColor: '#ffffffee', padding: { x: 4, y: 3 },
            wordWrap: { width: 110, useAdvancedWrap: true }, align: 'center'
        }).setOrigin(0.5, 1).setResolution(4).setVisible(false);
        container.add([shadow, sprite, nameTag, emote, bubble]);
        container.setSize(16, 32);
        container.setInteractive(new Phaser.Geom.Rectangle(-8, -32, 16, 36), Phaser.Geom.Rectangle.Contains);
        container.on('pointerup', () => {
            if (this.dragged) return;
            eventBus.dispatchEvent(new CustomEvent('agent-select', { detail: { id } }));
        });
        container.setAlpha(0);
        this.tweens.add({ targets: container, alpha: 1, duration: 500 });
        return { container, sprite, shadow, nameTag, emote, bubble, skin, lastThought: '' };
    }

    private applyAgent(v: AgentView, agent: AgentState, id: string, first: boolean) {
        const targetX = agent.x * T + T / 2;
        const targetY = agent.y * T + T;
        const moving = targetX !== v.container.x || targetY !== v.container.y;
        if (moving) {
            if (first) v.container.setPosition(targetX, targetY);
            else this.tweens.add({ targets: v.container, x: targetX, y: targetY, duration: 290, ease: 'Linear' });
        }
        v.container.setDepth(targetY + 2);

        const seat = this.layout?.seats[id];
        const seated = Boolean(seat && seat.x === agent.x && seat.y === agent.y);
        const dir = String(agent.direction || 'down');
        const key = `char_${v.skin}`;
        v.sprite.setFlipX(dir === 'left');
        v.sprite.y = seated ? 3 : 0;

        if (moving && !first) {
            v.sprite.play(`${key}-walk-${dir === 'left' ? 'right' : dir}`, true);
        } else if (seated) {
            if (agent.action === 'work') v.sprite.play(`${key}-type-up`, true);
            else { v.sprite.stop(); v.sprite.setFrame(ROW.up * 7 + 3); }
        } else if (agent.action === 'think') {
            v.sprite.play(`${key}-read-down`, true);
        } else {
            v.sprite.stop();
            v.sprite.setFrame((ROW[dir] ?? 0) * 7 + 1);
        }
        v.shadow.setVisible(!seated);

        if (agent.name !== v.nameTag.text) v.nameTag.setText(agent.name);

        const emote = EMOTES[agent.action] || '';
        v.emote.setText(emote).setVisible(Boolean(emote));

        if (agent.thought && agent.thought !== v.lastThought) {
            v.lastThought = agent.thought;
            v.bubble.setText(agent.thought.length > 90 ? `${agent.thought.slice(0, 88)}…` : agent.thought).setVisible(true);
            v.bubbleTimer?.remove();
            v.bubbleTimer = this.time.delayedCall(9000, () => v.bubble.setVisible(false));
        }
    }

    private markSelected(id: string | null) {
        this.agents.forEach((v, key) => {
            v.nameTag.setBackgroundColor(key === id ? '#6366f1' : '#0f172acc');
        });
    }

    update() {
        // Emoji status ikut naik saat gelembung pikiran tampil.
        this.agents.forEach((v) => {
            const want = v.bubble.visible ? -34 - v.bubble.height : -30;
            if (v.emote.y !== want) v.emote.y = want;
        });
    }
}

export function setupPhaser(parentId: string) {
    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: parentId,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#0b1020',
        scene: [OfficeScene],
        pixelArt: true,
        scale: { mode: Phaser.Scale.RESIZE },
        input: { keyboard: false }
    };
    return new Phaser.Game(config);
}
