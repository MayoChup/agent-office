import React, { useState, useEffect } from 'react';
import { getColyseusRoom } from '../game/Game';
import { eventBus, lastDetail } from '../events';

interface TaskItem {
    id: string | number;
    title: string;
    assigned_to: string;
    status: string;
}

interface AgentOption { id: string; name: string; role: string }

function readAgents(): AgentOption[] {
    const room = getColyseusRoom();
    const list: AgentOption[] = [];
    room?.state?.agents?.forEach((a: any, id: string) => list.push({ id, name: a.name, role: a.role || '' }));
    return list.sort((a, b) => (a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.name.localeCompare(b.name)));
}

export function TaskBoard() {
    const [tasks, setTasks] = useState<TaskItem[]>(() => lastDetail<TaskItem[]>('tasks-sync') || []);
    const [agents, setAgents] = useState<AgentOption[]>([]);
    const [newTask, setNewTask] = useState('');
    const [targetAgent, setTargetAgent] = useState('default');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        const onTasks = (e: Event) => setTasks(((e as CustomEvent).detail || []) as TaskItem[]);
        const onAgents = () => setAgents(readAgents());
        eventBus.addEventListener('tasks-sync', onTasks);
        eventBus.addEventListener('agents-changed', onAgents);
        const poll = setInterval(onAgents, 3000);
        onAgents();
        return () => {
            eventBus.removeEventListener('tasks-sync', onTasks);
            eventBus.removeEventListener('agents-changed', onAgents);
            clearInterval(poll);
        };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.trim()) return;
        const room = getColyseusRoom();
        if (room) {
            setSending(true);
            room.send('assign-task', { title: newTask.trim(), agentId: targetAgent });
            setNewTask('');
            setTimeout(() => setSending(false), 1500);
        }
    };

    const statusColor = (s: string) => {
        if (s === 'completed') return '#00b894';
        if (s === 'in_progress') return '#fdcb6e';
        if (s === 'blocked') return '#e17055';
        if (s === 'review') return '#74b9ff';
        return '#dfe6e9';
    };

    const statusIcon = (s: string) => {
        if (s === 'completed') return '✅';
        if (s === 'in_progress') return '🔄';
        if (s === 'blocked') return '⚠️';
        if (s === 'review') return '📝';
        return '⏳';
    };

    return (
        <div style={{
            position: 'absolute', left: 20, top: 20, width: 290,
            backgroundColor: 'rgba(10,10,30,0.92)', color: 'white',
            padding: 16, borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            border: '1px solid rgba(108,92,231,0.3)',
            maxHeight: '50vh', display: 'flex', flexDirection: 'column', zIndex: 5
        }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '14px' }}>📋 Papan Tugas (Hermes)</h3>
            <p style={{ margin: '0 0 10px 0', fontSize: '10px', color: '#9aa' }}>
                Tugas di sini = kerja nyata oleh divisi di Hermes.
            </p>

            <form onSubmit={handleSubmit} style={{ marginBottom: 10 }}>
                <input
                    type="text"
                    value={newTask}
                    onChange={(e) => setNewTask(e.target.value)}
                    placeholder="Tulis tugas baru..."
                    style={{
                        width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid #444', backgroundColor: '#1a1a3e',
                        color: 'white', fontSize: '12px', outline: 'none',
                        boxSizing: 'border-box', marginBottom: 6
                    }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                    <select
                        value={targetAgent}
                        onChange={(e) => setTargetAgent(e.target.value)}
                        style={{
                            flex: 1, padding: '6px', borderRadius: 6,
                            border: '1px solid #444', backgroundColor: '#1a1a3e',
                            color: '#ddd', fontSize: '11px'
                        }}
                    >
                        {agents.length === 0 && <option value="default">Kepala Kantor</option>}
                        {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}{a.role ? ` — ${a.role}` : ''}</option>
                        ))}
                    </select>
                    <button type="submit" disabled={sending} style={{
                        padding: '6px 14px', borderRadius: 6, border: 'none',
                        backgroundColor: sending ? '#555' : '#6c5ce7', color: 'white', fontSize: '11px',
                        cursor: 'pointer', fontWeight: 'bold'
                    }}>
                        {sending ? 'Mengirim…' : 'Kirim'}
                    </button>
                </div>
            </form>

            <div style={{ flex: 1, overflowY: 'auto', fontSize: '12px' }}>
                {tasks.length === 0 && (
                    <p style={{ color: '#777', fontStyle: 'italic', margin: 0, fontSize: '11px' }}>
                        Belum ada tugas. Tugas dari Telegram juga akan muncul di sini.
                    </p>
                )}
                {tasks.map(task => (
                    <div key={task.id} style={{
                        padding: '6px 8px', marginBottom: 4, borderRadius: 6,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        borderLeft: `3px solid ${statusColor(task.status)}`
                    }}>
                        <div style={{ fontWeight: 'bold', fontSize: '11px' }}>
                            {statusIcon(task.status)} {task.title}
                        </div>
                        <div style={{ fontSize: '10px', color: '#888', marginTop: 2 }}>
                            → {task.assigned_to || 'belum ditugaskan'}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
