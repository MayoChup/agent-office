import React, { useEffect, useState } from 'react';
import { useKantor } from '../kantor/store';
import { logout } from '../kantor/connection';

function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 15_000);
        return () => clearInterval(t);
    }, []);
    return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(now) + ' WIB';
}

export function TopBar() {
    const officeName = useKantor((s) => s.officeName);
    const owner = useKantor((s) => s.owner);
    const status = useKantor((s) => s.status);
    const usage = useKantor((s) => s.usage);
    const clock = useClock();
    const [showQuota, setShowQuota] = useState(false);

    const dotClass = status === 'connected' ? 'ok' : status === 'connecting' || status === 'checking' ? 'wait' : 'bad';
    const statusText = status === 'connected' ? 'Terhubung' : status === 'connecting' || status === 'checking' ? 'Menyambung…' : status === 'login' ? 'Belum masuk' : 'Terputus';
    const pct = usage && usage.dailyLimit ? Math.min(100, Math.round((usage.used / usage.dailyLimit) * 100)) : 0;
    const barColor = pct > 85 ? 'var(--bad)' : pct > 60 ? 'var(--warn)' : 'var(--good)';

    return (
        <div className="topbar interactive">
            <div className="brand">
                <div className="brand-logo">🏢</div>
                <div style={{ minWidth: 0 }}>
                    <div className="brand-name">{officeName}</div>
                    <div className="brand-sub">Milik {owner} · tersambung ke Hermes</div>
                </div>
            </div>
            <div className="topbar-spacer" />
            <div className="clock">{clock}</div>
            {usage && (
                <div className="quota" onClick={() => setShowQuota(!showQuota)} title="Kuota AI gratis hari ini">
                    <div className="quota-row"><span>🧠 <span className="hide-sm">AI gratis</span></span><span>{usage.enabled ? `${usage.used}/${usage.dailyLimit}` : 'off'}</span></div>
                    <div className="bar"><div style={{ width: `${pct}%`, background: barColor }} /></div>
                    {showQuota && (
                        <div className="interactive" style={{ position: 'absolute', top: 60, right: 60, width: 260, padding: 12, borderRadius: 14, background: 'var(--panel-solid)', border: '1px solid var(--line-strong)', boxShadow: 'var(--shadow)', fontSize: 12, lineHeight: 1.7, color: 'var(--muted)' }}>
                            <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>Otak AI gratis (OpenRouter)</div>
                            <div>Model: {usage.activeModel || '—'}</div>
                            <div>Berpikir tiap ±{usage.thinkIntervalMinutes} menit per agen</div>
                            <div>Sisa tugas otomatis hari ini: {usage.autonomousTasksLeft}</div>
                            <div>Sisa usulan rekrut hari ini: {usage.hireProposalsLeft}</div>
                            {usage.lastError && <div style={{ color: '#fca5a5', marginTop: 4 }}>Catatan: {usage.lastError.slice(0, 140)}</div>}
                        </div>
                    )}
                </div>
            )}
            <div className="pill"><span className={`dot ${dotClass}`} /><span className="hide-sm">{statusText}</span></div>
            {status !== 'login' && <button className="icon-btn" title="Keluar" onClick={logout}>⎋</button>}
        </div>
    );
}
