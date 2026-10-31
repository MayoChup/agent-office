import React, { useEffect, useState } from 'react';
import { eventBus, lastDetail } from '../events';

interface Usage {
    used: number;
    dailyLimit: number;
    activeModel: string | null;
    enabled: boolean;
    lastError: string | null;
    autonomousTasksLeft: number;
    hireProposalsLeft: number;
    thinkIntervalMinutes: number;
}

interface OfficeInfo { officeName: string; owner: string }

export function UsageBadge() {
    const [usage, setUsage] = useState<Usage | undefined>(() => lastDetail<Usage>('usage'));
    const [info, setInfo] = useState<OfficeInfo | undefined>(() => lastDetail<OfficeInfo>('office-info'));
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onUsage = (e: Event) => setUsage((e as CustomEvent).detail);
        const onInfo = (e: Event) => setInfo((e as CustomEvent).detail);
        eventBus.addEventListener('usage', onUsage);
        eventBus.addEventListener('office-info', onInfo);
        return () => {
            eventBus.removeEventListener('usage', onUsage);
            eventBus.removeEventListener('office-info', onInfo);
        };
    }, []);

    useEffect(() => {
        if (info?.officeName) document.title = `🏢 ${info.officeName}`;
    }, [info?.officeName]);

    const pct = usage && usage.dailyLimit ? Math.min(100, Math.round((usage.used / usage.dailyLimit) * 100)) : 0;
    const barColor = pct > 85 ? '#e17055' : pct > 60 ? '#fdcb6e' : '#00b894';

    return (
        <div
            onClick={() => setOpen(!open)}
            style={{
                position: 'absolute', bottom: 20, left: 20, color: 'white', cursor: 'pointer',
                backgroundColor: 'rgba(10,10,30,0.88)', padding: '12px 16px', borderRadius: 10,
                zIndex: 10, border: '1px solid rgba(108,92,231,0.3)', width: 260
            }}
        >
            <h1 style={{ margin: 0, fontSize: '16px' }}>🏢 {info?.officeName || 'Kantor Virtual'}</h1>
            <p style={{ margin: '2px 0 8px', opacity: 0.6, fontSize: '11px' }}>
                Milik {info?.owner || 'Pak Rico'} • tersambung ke Hermes
            </p>

            {!usage && <div style={{ fontSize: 11, opacity: 0.7 }}>Memuat kuota AI…</div>}
            {usage && !usage.enabled && (
                <div style={{ fontSize: 11, color: '#fdcb6e' }}>
                    Otak AI gratis belum diatur (OPENROUTER_API_KEY). Agen tetap mengikuti Kanban.
                </div>
            )}
            {usage && usage.enabled && (
                <>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                        <span>🧠 AI gratis hari ini</span>
                        <span>{usage.used}/{usage.dailyLimit}</span>
                    </div>
                    <div style={{ height: 6, background: '#333', borderRadius: 3, marginTop: 4 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                    </div>
                </>
            )}

            {open && usage && (
                <div style={{ marginTop: 8, fontSize: 10, lineHeight: 1.6, opacity: 0.85 }}>
                    <div>Model: {usage.activeModel || '—'}</div>
                    <div>Berpikir tiap ±{usage.thinkIntervalMinutes} menit per agen</div>
                    <div>Sisa tugas otomatis hari ini: {usage.autonomousTasksLeft}</div>
                    <div>Sisa usulan rekrut hari ini: {usage.hireProposalsLeft}</div>
                    {usage.lastError && <div style={{ color: '#fab1a0' }}>Catatan: {usage.lastError.slice(0, 120)}</div>}
                </div>
            )}
        </div>
    );
}
