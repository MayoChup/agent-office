import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useKembali } from '../kantor/kembali';
import { Ikon } from './Ikon';

/**
 * U30 · Pemilih tanggal sendiri (pengganti <input type="date"> bawaan browser yang tampilannya beda-beda tiap HP).
 * Nilai tetap string "YYYY-MM-DD" seperti input bawaan, jadi bisa langsung menggantikannya.
 * Laptop: kalender melayang di bawah tombol. HP: lembar dari bawah. Keyboard: panah, PageUp/PageDown, Enter, Esc.
 */
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const keTgl = (s: string) => new Date(`${s}T00:00:00Z`);
const geser = (s: string, hari: number) => iso(new Date(keTgl(s).getTime() + hari * 86400_000));
const hariIniWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export const labelTanggal = (s: string) => (s ? keTgl(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

export function TanggalInput({ value, onChange, min, max, placeholder = 'Pilih tanggal', ariaLabel, bisaKosong = true, className, tampil }: {
    value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string; ariaLabel?: string; bisaKosong?: boolean; className?: string; tampil?: React.ReactNode;
}) {
    const [buka, setBuka] = useState(false);
    const tombol = useRef<HTMLButtonElement>(null);
    useKembali(buka, () => setBuka(false));
    return (
        <>
            <button type="button" ref={tombol} className={`tgl-tombol ${value ? '' : 'kosong'} ${className || ''}`} aria-label={ariaLabel ? `${ariaLabel}: ${labelTanggal(value) || 'belum dipilih'}` : undefined} aria-haspopup="dialog" aria-expanded={buka} onClick={() => setBuka((b) => !b)}>
                {tampil ?? <><Ikon e="📅" size={14} /><span>{labelTanggal(value) || placeholder}</span></>}
            </button>
            {buka && createPortal(<Kalender nilai={value} min={min} max={max} jangkar={tombol.current} bisaKosong={bisaKosong} judul={ariaLabel}
                pilih={(v) => { onChange(v); setBuka(false); tombol.current?.focus(); }} tutup={() => { setBuka(false); tombol.current?.focus(); }} />, document.body)}
        </>
    );
}

function Kalender({ nilai, min, max, jangkar, pilih, tutup, bisaKosong, judul }: { nilai: string; min?: string; max?: string; jangkar: HTMLElement | null; pilih: (v: string) => void; tutup: () => void; bisaKosong: boolean; judul?: string }) {
    const hari = hariIniWib();
    const awal = nilai || (max && hari > max ? max : min && hari < min ? min : hari);
    const [fokus, setFokus] = useState(awal);
    const [bulan, setBulan] = useState(awal.slice(0, 7));
    const kotak = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });
    const hp = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
    const boleh = (s: string) => (!min || s >= min) && (!max || s <= max);
    useLayoutEffect(() => {
        if (hp || !jangkar || !kotak.current) { setPos({}); return; }
        const r = jangkar.getBoundingClientRect(), t = kotak.current.offsetHeight, l = kotak.current.offsetWidth;
        const bawah = r.bottom + 6 + t <= window.innerHeight - 8;
        setPos({ position: 'fixed', top: bawah ? r.bottom + 6 : Math.max(8, r.top - 6 - t), left: Math.min(Math.max(8, r.left), window.innerWidth - l - 8) });
    }, [jangkar, hp]);
    useEffect(() => { setBulan(fokus.slice(0, 7)); }, [fokus]);
    useEffect(() => { kotak.current?.querySelector<HTMLButtonElement>(`[data-tgl="${fokus}"]`)?.focus(); }, [fokus, bulan]);
    useEffect(() => {
        const f = (e: MouseEvent) => { if (!hp && kotak.current && !kotak.current.contains(e.target as Node) && !jangkar?.contains(e.target as Node)) tutup(); };
        document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
    }, [hp, jangkar, tutup]);

    const sel = useMemo(() => {
        const [y, m] = bulan.split('-').map(Number);
        const pertama = new Date(Date.UTC(y, m - 1, 1));
        const mulai = (pertama.getUTCDay() + 6) % 7; // Senin = 0
        const jml = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return [...Array(mulai).fill(''), ...Array.from({ length: jml }, (_, i) => `${bulan}-${String(i + 1).padStart(2, '0')}`)];
    }, [bulan]);
    const gantiBulan = (n: number) => { const [y, m] = bulan.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); setBulan(iso(d).slice(0, 7)); };
    const [y, m] = bulan.split('-').map(Number);
    const tombolKe = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); const k = iso(d).slice(0, 7); return n < 0 ? !min || k >= min.slice(0, 7) : !max || k <= max.slice(0, 7); };
    const kunci = (e: React.KeyboardEvent) => {
        const lompat: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        if (lompat[e.key] != null) { e.preventDefault(); const b = geser(fokus, lompat[e.key]); if (boleh(b)) setFokus(b); }
        else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); const d = keTgl(fokus); d.setUTCMonth(d.getUTCMonth() + (e.key === 'PageUp' ? -1 : 1)); const b = iso(d); if (boleh(b)) setFokus(b); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tutup(); }
    };
    const isi = (
        <div ref={kotak} className={`tgl-kal ${hp ? 'hp' : ''}`} style={pos} role="dialog" aria-label={judul || 'Pilih tanggal'} onKeyDown={kunci} onClick={(e) => e.stopPropagation()}>
            {hp && <div className="peta-pegangan" aria-hidden />}
            <div className="tgl-kepala">
                <button type="button" onClick={() => gantiBulan(-1)} disabled={!tombolKe(-1)} aria-label="Bulan sebelumnya"><Ikon n="chevron-left" /></button>
                <b aria-live="polite">{BULAN[m - 1]} {y}</b>
                <button type="button" onClick={() => gantiBulan(1)} disabled={!tombolKe(1)} aria-label="Bulan berikutnya"><Ikon n="chevron-right" /></button>
            </div>
            <div className="tgl-grid" role="grid">
                {HARI.map((h) => <span key={h} className="tgl-hari" role="columnheader">{h}</span>)}
                {sel.map((s, i) => s ? (
                    <button key={s} type="button" data-tgl={s} role="gridcell" tabIndex={s === fokus ? 0 : -1} disabled={!boleh(s)} aria-selected={s === nilai}
                        className={`${s === nilai ? 'pilih' : ''} ${s === hari ? 'kini' : ''}`} onClick={() => pilih(s)}>{Number(s.slice(8))}</button>
                ) : <span key={`k${i}`} />)}
            </div>
            <div className="tgl-kaki">
                {boleh(hari) && <button type="button" className="btn small" onClick={() => pilih(hari)}>Hari ini</button>}
                {boleh(geser(hari, -1)) && <button type="button" className="btn small" onClick={() => pilih(geser(hari, -1))}>Kemarin</button>}
                <span className="tgl-sp" />
                {bisaKosong && nilai && <button type="button" className="btn small" onClick={() => pilih('')}>Hapus</button>}
            </div>
        </div>
    );
    return hp ? <div className="peta-latar" onClick={tutup}>{isi}</div> : isi;
}
