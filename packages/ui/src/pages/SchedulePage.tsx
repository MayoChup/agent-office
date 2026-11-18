import React, { useMemo } from 'react';
import { useApi, Acara } from '../kantor/api';
import { todayWib, dateLabel } from '../kantor/finance';

import { Ikon } from '../components/Ikon';
export function SchedulePage() {
    const { data, error, loading, reload } = useApi<{ acara: Acara[] }>('/api/kantor/jadwal?hari=30', 300_000);
    const today = todayWib();
    const groups = useMemo(() => {
        const m = new Map<string, Acara[]>();
        (data?.acara || []).forEach((e) => { const d = e.mulai.slice(0, 10); m.set(d, [...(m.get(d) || []), e]); });
        return Array.from(m.entries());
    }, [data]);
    const jam = (e: Acara) => (e.seharian ? 'Seharian' : `${e.mulai.slice(11, 16)}–${e.selesai.slice(11, 16)}`);
    return (
        <div className="pg">
            <div className="pg-head">
                <div><h2><Ikon e="📅" /> Jadwal</h2><p>Google Calendar · diurus Sekar si Sekretaris · janji dari WhatsApp ditandai WA</p></div>
                <button className="icon-btn" onClick={() => reload('&sync=1')} disabled={loading} title="Muat ulang">{loading ? '…' : <Ikon e="↻" />}</button>
            </div>
            {error && <div className="error">Kalender belum bisa dibaca: {error}</div>}
            {data && groups.length === 0 && <div className="fin-empty">Tidak ada agenda 30 hari ke depan.<br />Minta Sekar lewat Telegram: "jadwalkan meeting dengan Budi Selasa jam 2 siang".</div>}
            {groups.map(([d, xs]) => (
                <section key={d} className={`fin-card ${d === today ? 'today' : ''}`}>
                    <h3>{d === today ? 'Hari ini' : dateLabel(d)} <small>{xs.length} acara</small></h3>
                    {xs.map((e) => (
                        <a key={e.id} className="cal-ev" href={e.link} target="_blank" rel="noreferrer">
                            <div className="cal-time">{jam(e)}</div>
                            <div className="fin-tx-main">
                                <b>{e.judul}{e.dariWa && <em className="tag-wa">WA</em>}</b>
                                {(e.tempat || e.catatan) && <span>{e.tempat ? <><Ikon e="📍" /> {`${e.tempat}`}</> : ''}{e.tempat && e.catatan ? ' · ' : ''}{e.catatan.replace(/\[dari WhatsApp\]/, '').trim()}</span>}
                            </div>
                        </a>
                    ))}
                </section>
            ))}
            <a className="btn small" href="https://calendar.google.com" target="_blank" rel="noreferrer" style={{ alignSelf: 'center' }}>Buka Google Calendar ↗</a>
        </div>
    );
}
