import React, { useEffect, useState } from 'react';
import { useKantor } from '../kantor/store';
import { logout } from '../kantor/connection';
import { useTema } from '../kantor/tema';
import { eventBus } from '../events';

import { Ikon } from './Ikon';
import { TombolKeputusan } from './Keputusan';
import { TombolCari } from './Cari';
import { TombolLonceng } from './Lonceng';
import { konfirmasi } from './Konfirmasi';
function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 15_000);
        return () => clearInterval(t);
    }, []);
    return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(now) + ' WIB';
}

const JUDUL: Record<string, string> = { home: 'Beranda', obrolan: 'Chat', kr: 'Knowledge Reels', keuangan: 'Keuangan', trading: 'Trading', sosmed: 'Konten', catatan: 'Catatan', berkas: 'Berkas', tugas: 'Tugas', jadwal: 'Jadwal', kantor: 'Kantor' };

export function TopBar() {
    const officeName = useKantor((s) => s.officeName);
    const owner = useKantor((s) => s.owner);
    const status = useKantor((s) => s.status);
    const usage = useKantor((s) => s.usage);
    const clock = useClock();
    const [showQuota, setShowQuota] = useState(false);
    const [tema, gantiTema] = useTema();
    // Di HP bilah atas menampilkan nama halaman yang sedang dibuka.
    const [judul, setJudul] = useState('');
    useEffect(() => { const f = (e: Event) => setJudul(JUDUL[(e as CustomEvent).detail?.page] || ''); eventBus.addEventListener('page-change', f); return () => eventBus.removeEventListener('page-change', f); }, []);

    const dotClass = status === 'connected' ? 'ok' : status === 'connecting' || status === 'checking' ? 'wait' : 'bad';
    const statusText = status === 'connected' ? 'Terhubung' : status === 'connecting' || status === 'checking' ? 'Menyambung…' : status === 'login' ? 'Belum masuk' : 'Terputus';
    const pct = usage && usage.dailyLimit ? Math.min(100, Math.round((usage.used / usage.dailyLimit) * 100)) : 0;
    const barColor = pct > 85 ? 'var(--bad)' : pct > 60 ? 'var(--warn)' : 'var(--good)';

    return (
        <div className="topbar interactive">
            <button className="icon-btn menu-btn" aria-label="Buka menu" onClick={() => eventBus.dispatchEvent(new CustomEvent('buka-menu'))}><Ikon e="☰" /></button>
            <div className="brand">
                <div className="brand-logo"><Ikon e="🏢" /></div>
                <div style={{ minWidth: 0 }}>
                    <div className="brand-name"><span className="nama-kantor">{officeName}</span>{judul && <span className="nama-halaman">{judul}</span>}</div>
                    <div className="brand-sub">Milik {owner} · tersambung ke Hermes</div>
                </div>
            </div>
            <div className="topbar-spacer" />
            <div className="clock">{clock}</div>
            {usage && (
                <div className="quota" onClick={() => setShowQuota(!showQuota)} title="Kuota AI gratis hari ini">
                    <div className="quota-row"><span><Ikon e="🧠" /> <span className="hide-sm">AI gratis</span></span><span>{usage.enabled ? `${usage.used}/${usage.dailyLimit}` : 'off'}</span></div>
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
            <div className="pill hide-hp" title={statusText}><span className={`dot ${dotClass}`} /><span className="hide-sm">{statusText}</span></div>
            {status !== 'login' && <TombolCari />}
            {status !== 'login' && <TombolLonceng />}
            {status !== 'login' && <TombolKeputusan />}
            <MenuProfil tema={tema} gantiTema={gantiTema} owner={owner} statusText={statusText} dotClass={dotClass} bisaKeluar={status !== 'login'} />
        </div>
    );
}

/** Menu profil: tema & keluar dipindah ke sini supaya tidak salah pencet (dulu tombol Keluar persis di samping tombol tema). */
function MenuProfil({ tema, gantiTema, owner, statusText, dotClass, bisaKeluar }: { tema: string; gantiTema: () => void; owner: string; statusText: string; dotClass: string; bisaKeluar: boolean }) {
    const [buka, setBuka] = useState(false);
    useEffect(() => { if (!buka) return; const f = () => setBuka(false); setTimeout(() => document.addEventListener('click', f), 0); return () => document.removeEventListener('click', f); }, [buka]);
    return (
        <div className="mp">
            <button className="mp-btn" aria-haspopup="menu" aria-expanded={buka} aria-label="Menu profil" onClick={() => setBuka((b) => !b)}>{(owner || 'R').replace(/^Pak\s+/i, '').slice(0, 1).toUpperCase()}</button>
            {buka && (
                <div className="mp-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                    <div className="mp-kepala"><b>{owner}</b><small><span className={`dot ${dotClass}`} /> {statusText}</small></div>
                    <button role="menuitem" onClick={() => { gantiTema(); }}>{tema === 'dark' ? <><Ikon e="☀" /> Tampilan terang</> : <><Ikon e="☾" /> Tampilan gelap</>}</button>
                    {bisaKeluar && <button role="menuitem" className="mp-keluar" onClick={async () => { if ((await konfirmasi('Keluar dari Kantor Virtual? Nanti perlu masukkan kata sandi lagi.'))) logout(); }}><Ikon e="🚪" /> Keluar</button>}
                </div>
            )}
        </div>
    );
}
