import React, { useMemo } from 'react';
import { useKantor, statusOf, AgentView, DivisionView, TaskView } from '../kantor/store';
import { eventBus } from '../events';
import { Avatar } from './Avatar';
import { Panel } from './Panel';

const HEAD_COLOR = '#818cf8';

function StatusChip({ action }: { action: string }) {
    const s = statusOf(action);
    return <span className="chip" style={{ ['--c' as any]: s.color }}>● {s.label}</span>;
}

function focusDivision(id: string) {
    eventBus.dispatchEvent(new CustomEvent('focus-division', { detail: { id } }));
}

function greet(name: string) {
    eventBus.dispatchEvent(new CustomEvent('open-chat', { detail: { text: `@${name} ` } }));
}

function MemberRow({ a, isHead, color }: { a: AgentView; isHead: boolean; color: string }) {
    return (
        <div className="member">
            <Avatar skin={a.skin} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="member-name">
                    {a.name}
                    {isHead && <span className="tag" style={{ color }}>Kepala divisi</span>}
                    <StatusChip action={a.action} />
                </div>
                <div className="member-role">{a.role}</div>
                {a.currentTask && <div className="member-task">💼 {a.currentTask}</div>}
                {!a.currentTask && a.thought && <div className="member-task" style={{ fontStyle: 'italic' }}>💭 {a.thought}</div>}
                <div className="member-actions">
                    <button className="btn small" onClick={() => {
                        eventBus.dispatchEvent(new CustomEvent('focus-agent', { detail: { id: a.id } }));
                        eventBus.dispatchEvent(new CustomEvent('agent-select', { detail: { id: a.id } }));
                    }}>📍 Lihat di kantor</button>
                    <button className="btn small" onClick={() => greet(a.name)}>💬 Sapa</button>
                </div>
            </div>
        </div>
    );
}

function taskIcon(status: string) {
    return status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : status === 'blocked' ? '⚠️' : status === 'review' ? '📝' : '⏳';
}

function DivisionDetail({ division, members, tasks, onBack }: {
    division: { id: string; name: string; icon: string; color: string; headId: string };
    members: AgentView[];
    tasks: TaskView[];
    onBack: () => void;
}) {
    const working = members.filter((m) => m.action === 'work').length;
    const done = tasks.filter((t) => t.status === 'completed').length;
    const open = tasks.filter((t) => t.status !== 'completed').length;
    return (
        <div>
            <button className="back" onClick={onBack}>← Kembali ke bagan</button>
            <div className="hero" style={{ ['--c' as any]: division.color }}>
                <div className="hero-title">
                    <div className="div-icon" style={{ ['--c' as any]: division.color, width: 44, height: 44, fontSize: 22 }}>{division.icon}</div>
                    <div>
                        <h3>{division.name}</h3>
                        <p>{members.length} orang · {working ? `${working} sedang bekerja` : 'semua santai'}</p>
                    </div>
                </div>
                <div className="stat-row">
                    <div className="stat"><b>{members.length}</b><span>Anggota</span></div>
                    <div className="stat"><b>{open}</b><span>Tugas aktif</span></div>
                    <div className="stat"><b>{done}</b><span>Selesai (3 hr)</span></div>
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn small" onClick={() => focusDivision(division.id)}>📍 Lihat ruangannya</button>
                </div>
            </div>

            <div className="section-title">Anggota</div>
            {members.length === 0 && <div className="empty">Belum ada anggota.</div>}
            {members.map((m) => <MemberRow key={m.id} a={m} isHead={m.id === division.headId && members.length > 1} color={division.color} />)}

            <div className="section-title">Tugas terbaru</div>
            {tasks.length === 0 && <div className="empty">Belum ada tugas untuk divisi ini.</div>}
            {tasks.slice(0, 8).map((t) => (
                <div key={t.id} className="task" style={{ ['--c' as any]: division.color }}>
                    <div>{taskIcon(t.status)}</div>
                    <div style={{ minWidth: 0 }}>
                        <div className="task-title">{t.title}</div>
                        <div className="task-meta"><span>→ {t.assigned_to}</span>{t.created_by.startsWith('kantor:') && t.created_by !== 'kantor:pemilik' && <span className="tag">🤖 usulan otomatis</span>}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function OrgPanel({ selected, onSelect, onClose }: {
    selected: string | null;
    onSelect: (id: string | null) => void;
    onClose: () => void;
}) {
    const agents = useKantor((s) => s.agents);
    const divisions = useKantor((s) => s.divisions);
    const tasks = useKantor((s) => s.tasks);
    const owner = useKantor((s) => s.owner);

    const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
    const head = byId.get('default');

    const detail = useMemo(() => {
        if (!selected) return null;
        if (selected === 'default') {
            return {
                division: { id: 'default', name: head ? `${head.name} — Kepala Kantor` : 'Kepala Kantor', icon: '👑', color: HEAD_COLOR, headId: 'default' },
                members: head ? [head] : [],
                tasks: tasks.filter((t) => t.assignee_id === 'default')
            };
        }
        const d = divisions.find((x) => x.id === selected);
        if (!d) return null;
        const ids = new Set(d.memberIds);
        return {
            division: d,
            members: d.memberIds.map((id) => byId.get(id)).filter(Boolean) as AgentView[],
            tasks: tasks.filter((t) => ids.has(t.assignee_id))
        };
    }, [selected, divisions, tasks, byId, head]);

    return (
        <Panel
            title="🧭 Bagan Organisasi"
            sub={detail ? 'Detail divisi' : `${divisions.length} divisi · ${agents.length} orang`}
            onClose={onClose}
        >
            {detail ? (
                <DivisionDetail {...detail} onBack={() => onSelect(null)} />
            ) : (
                <div className="org">
                    <div className="org-node owner">
                        <div className="div-icon" style={{ ['--c' as any]: '#f59e0b' }}>👤</div>
                        <div>
                            <div style={{ fontWeight: 700 }}>{owner}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pemilik · perintah lewat Telegram & kantor ini</div>
                        </div>
                    </div>
                    <div className="org-line" />
                    <div className="org-node head" onClick={() => onSelect('default')}>
                        {head ? <Avatar skin={head.skin} size={40} /> : <div className="div-icon">👑</div>}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{head?.name || 'Kepala Kantor'}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Kepala Kantor · membagi tugas</div>
                        </div>
                        {head && <StatusChip action={head.action} />}
                    </div>

                    {divisions.length > 0 ? (
                        <>
                            <div className="org-branch" />
                            <div className="org-grid">
                                {divisions.map((d: DivisionView) => {
                                    const members = d.memberIds.map((id) => byId.get(id)).filter(Boolean) as AgentView[];
                                    const working = members.filter((m) => m.action === 'work').length;
                                    const blocked = members.filter((m) => m.action === 'blocked').length;
                                    return (
                                        <div key={d.id} className="div-card" style={{ ['--c' as any]: d.color }} onClick={() => { onSelect(d.id); focusDivision(d.id); }}>
                                            <div className="div-icon" style={{ ['--c' as any]: d.color }}>{d.icon}</div>
                                            <div className="div-name">{d.name}</div>
                                            <div className="div-meta">
                                                {members.length} orang · {blocked ? `⚠️ ${blocked} tertahan` : working ? `💻 ${working} bekerja` : 'santai'}
                                            </div>
                                            <div className="avatars">
                                                {members.slice(0, 5).map((m) => <Avatar key={m.id} skin={m.skin} size={26} title={m.name} />)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="org-line" />
                            <div className="empty" style={{ width: '100%' }}>
                                Belum ada divisi.<br />Minta Joni lewat Telegram: <i>"buatkan divisi baru …"</i>
                            </div>
                        </>
                    )}
                    <p style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 16, lineHeight: 1.5, textAlign: 'center' }}>
                        Bagan ini otomatis berubah saat divisi dibuat atau dihapus.<br />
                        Anggota tambahan masuk ke divisi lewat nama profil <code>divisi-nama</code> (mis. <code>video-subtitle</code>).
                    </p>
                </div>
            )}
        </Panel>
    );
}
