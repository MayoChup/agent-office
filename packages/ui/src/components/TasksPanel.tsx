import React, { useMemo, useState } from 'react';
import { useKantor } from '../kantor/store';
import { getRoom } from '../kantor/connection';
import { Panel } from './Panel';

const STATUS: Record<string, { icon: string; label: string; color: string }> = {
    in_progress: { icon: '🔄', label: 'Dikerjakan', color: '#fbbf24' },
    blocked: { icon: '⚠️', label: 'Tertahan', color: '#f87171' },
    review: { icon: '📝', label: 'Minta dicek', color: '#60a5fa' },
    pending: { icon: '⏳', label: 'Antre', color: '#94a3b8' },
    completed: { icon: '✅', label: 'Selesai', color: '#4ade80' }
};

export function TasksPanel({ onClose }: { onClose: () => void }) {
    const tasks = useKantor((s) => s.tasks);
    const agents = useKantor((s) => s.agents);
    const [tab, setTab] = useState<'active' | 'done' | 'all'>('active');
    const [title, setTitle] = useState('');
    const [target, setTarget] = useState('default');
    const [sent, setSent] = useState('');

    const sortedAgents = useMemo(() => [...agents].sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.name.localeCompare(b.name))), [agents]);
    const shown = useMemo(() => tasks.filter((t) => tab === 'all' || (tab === 'done' ? t.status === 'completed' : t.status !== 'completed')), [tasks, tab]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const room = getRoom();
        if (!title.trim() || !room) return;
        room.send('assign-task', { title: title.trim(), agentId: target });
        const who = agents.find((a) => a.id === target)?.name || 'Kepala';
        setSent(`Dikirim ke ${who}. Muncul di daftar dalam beberapa detik.`);
        setTitle('');
        setTimeout(() => setSent(''), 4000);
    };

    return (
        <Panel
            title="📋 Papan Tugas"
            sub="Kerja nyata, dikerjakan divisi di Hermes"
            onClose={onClose}
            footer={
                <form onSubmit={submit}>
                    <input className="input" placeholder="Tulis tugas baru, misal: rekap pengeluaran minggu ini" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <div className="row" style={{ marginTop: 8 }}>
                        <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                            {sortedAgents.length === 0 && <option value="default">Kepala Kantor</option>}
                            {sortedAgents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.role ? ` — ${a.role}` : ''}</option>)}
                        </select>
                        <button className="btn primary" type="submit" disabled={!title.trim()}>Kirim</button>
                    </div>
                    {sent && <div style={{ fontSize: 12, color: 'var(--good)', marginTop: 8 }}>{sent}</div>}
                </form>
            }
        >
            <div className="tabs">
                <button className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Aktif</button>
                <button className={`tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>Selesai</button>
                <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>Semua</button>
            </div>
            {shown.length === 0 && <div className="empty">{tab === 'done' ? 'Belum ada tugas selesai.' : 'Tidak ada tugas aktif. Tugas dari Telegram juga muncul di sini.'}</div>}
            {shown.map((t) => {
                const st = STATUS[t.status] || STATUS.pending;
                const auto = t.created_by.startsWith('kantor:') && t.created_by !== 'kantor:pemilik';
                return (
                    <div key={t.id} className="task" style={{ ['--c' as any]: st.color }}>
                        <div>{st.icon}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="task-title">{t.title}</div>
                            <div className="task-meta">
                                <span className="chip" style={{ ['--c' as any]: st.color }}>{st.label}</span>
                                <span>→ {t.assigned_to || 'belum ditugaskan'}</span>
                                {auto && <span className="tag">🤖 usulan otomatis</span>}
                            </div>
                        </div>
                    </div>
                );
            })}
        </Panel>
    );
}
