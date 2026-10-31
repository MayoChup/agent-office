import { useSyncExternalStore } from 'react';
import { eventBus } from '../events';
import { getRoom, ConnStatus } from './connection';

/** Data kantor yang dipakai panel-panel React. Diperbarui dari pesan server. */

export interface AgentView {
    id: string;
    name: string;
    role: string;
    skin: number;
    action: string;
    thought: string;
    currentTask: string;
    x: number;
    y: number;
}

export interface DivisionView {
    id: string;
    name: string;
    icon: string;
    color: string;
    headId: string;
    memberIds: string[];
}

export interface TaskView {
    id: string;
    title: string;
    assigned_to: string;
    assignee_id: string;
    status: string;
    created_by: string;
    completed_at: number | null;
}

export interface UsageView {
    used: number;
    dailyLimit: number;
    activeModel: string | null;
    enabled: boolean;
    lastError: string | null;
    autonomousTasksLeft: number;
    hireProposalsLeft: number;
    thinkIntervalMinutes: number;
}

export interface ChatMessage { id: number; sender: string; text: string; at: number }
export interface Highlight { id: number; type: string; title: string; body: string; agentId?: string | null; at: number }
export interface Toast { id: number; icon: string; title: string; body: string; color?: string }

export interface KantorState {
    status: ConnStatus;
    error: string;
    officeName: string;
    owner: string;
    agents: AgentView[];
    divisions: DivisionView[];
    tasks: TaskView[];
    usage: UsageView | null;
    chat: ChatMessage[];
    highlights: Highlight[];
    toasts: Toast[];
    unreadChat: number;
}

let seq = 1;
let state: KantorState = {
    status: 'checking',
    error: '',
    officeName: 'Kantor Virtual',
    owner: 'Pak Rico',
    agents: [],
    divisions: [],
    tasks: [],
    usage: null,
    chat: [],
    highlights: [],
    toasts: [],
    unreadChat: 0
};

const listeners = new Set<() => void>();
function set(patch: Partial<KantorState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
}

export function getState() { return state; }

export function useKantor<T>(selector: (s: KantorState) => T): T {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
        () => selector(state),
        () => selector(state)
    );
}

export function pushToast(t: Omit<Toast, 'id'>) {
    const toast = { ...t, id: seq++ };
    set({ toasts: [...state.toasts, toast].slice(-4) });
    setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== toast.id) }), 6500);
}

export function dismissToast(id: number) {
    set({ toasts: state.toasts.filter((x) => x.id !== id) });
}

let chatOpen = false;
export function setChatOpen(open: boolean) {
    chatOpen = open;
    if (open && state.unreadChat) set({ unreadChat: 0 });
}

const on = (type: string, fn: (detail: any) => void) =>
    eventBus.addEventListener(type, (e) => fn((e as CustomEvent).detail));

on('conn-status', (d) => set({ status: d.status, error: d.error || '' }));
on('office-info', (d) => set({ officeName: d?.officeName || state.officeName, owner: d?.owner || state.owner }));
on('office-layout', (d) => set({ divisions: Array.isArray(d?.divisions) ? d.divisions : [] }));
on('tasks-sync', (d) => set({ tasks: Array.isArray(d) ? d : [] }));
on('usage', (d) => set({ usage: d }));
on('chat-message', (d) => {
    const msg: ChatMessage = { id: seq++, sender: String(d?.sender || ''), text: String(d?.text || ''), at: Date.now() };
    set({ chat: [...state.chat, msg].slice(-200), unreadChat: chatOpen ? 0 : state.unreadChat + 1 });
    if (/^✅/.test(msg.sender)) pushToast({ icon: '✅', title: 'Tugas selesai', body: msg.text });
});
on('highlight-event', (d) => {
    const h: Highlight = { id: seq++, type: d?.type, title: d?.title, body: d?.body, agentId: d?.agentId, at: Date.now() };
    set({ highlights: [h, ...state.highlights].slice(0, 80) });
});
on('division-event', (d) => {
    const div = d?.division;
    if (!div) return;
    if (d.type === 'added') pushToast({ icon: div.icon, title: 'Divisi baru dibuka', body: `${div.name} sudah punya ruangan di kantor.`, color: div.color });
    else pushToast({ icon: '📦', title: 'Divisi ditutup', body: `${div.name} sudah tidak ada di kantor.`, color: div.color });
});

// Ambil posisi & status agen dari ruangan secara berkala (ringan: maksimal 8 agen).
setInterval(() => {
    const room = getRoom();
    if (!room?.state?.agents) return;
    const list: AgentView[] = [];
    room.state.agents.forEach((a: any, id: string) => list.push({
        id,
        name: a.name,
        role: a.role || '',
        skin: Number(a.skin) || 0,
        action: a.action || 'idle',
        thought: a.thought || '',
        currentTask: a.currentTask || '',
        x: a.x,
        y: a.y
    }));
    const key = JSON.stringify(list.map((a) => [a.id, a.name, a.role, a.action, a.thought, a.currentTask]));
    if (key !== lastAgentsKey) {
        lastAgentsKey = key;
        set({ agents: list });
    }
}, 700);
let lastAgentsKey = '';

export const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    work: { label: 'Bekerja', color: '#4ade80' },
    blocked: { label: 'Tertahan', color: '#f87171' },
    review: { label: 'Minta dicek', color: '#60a5fa' },
    queued: { label: 'Ada antrean', color: '#fbbf24' },
    think: { label: 'Berpikir', color: '#c084fc' },
    talk: { label: 'Ngobrol', color: '#38bdf8' },
    walk: { label: 'Berjalan', color: '#94a3b8' },
    done: { label: 'Baru selesai', color: '#4ade80' },
    sleep: { label: 'Istirahat', color: '#64748b' },
    idle: { label: 'Santai', color: '#94a3b8' }
};

export function statusOf(action: string) {
    return STATUS_LABEL[action] || STATUS_LABEL.idle;
}
