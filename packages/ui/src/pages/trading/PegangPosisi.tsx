import React, { useMemo, useState } from 'react';
import { TanggalInput } from '../../components/Tanggal';
import { createPortal } from 'react-dom';
import { apiPost } from '../../kantor/connection';
import { usd } from './types';

import { Ikon } from '../../components/Ikon';
type Target = { nama: 'Konservatif' | 'Moderat' | 'Agresif'; harga: number; pct: number; peluang: number };
type Proy = { horizon: number; target: Target[]; stop: { harga: number; pct: number; peluang: number }; terbaik: string } | null | undefined;
type Profil = 'konservatif' | 'moderat' | 'agresif' | 'kustom';
const hariIni = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const angka = (s: string) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

/** Catat posisi yang Bapak beli di broker: profil target, target & stop kustom, modal → lembar dihitung otomatis. */
export function PegangPosisi({ simbol, harga, proyeksi, ai, kas, onTutup, onSelesai }: {
    simbol: string; harga: number; proyeksi: Proy; ai: { label?: string; skor?: number; mode?: string; H?: number; pt?: string; pf?: string };
    kas?: number | null; onTutup: () => void; onSelesai: (pesan: string) => void;
}) {
    const awal = proyeksi?.target.find((t) => t.nama === proyeksi.terbaik) || proyeksi?.target[1];
    const [profil, setProfil] = useState<Profil>(awal ? (awal.nama.toLowerCase() as Profil) : 'kustom');
    const [entry, setEntry] = useState(harga.toFixed(2));
    const [target, setTarget] = useState(awal ? awal.harga.toFixed(2) : (harga * 1.1).toFixed(2));
    const [stop, setStop] = useState(proyeksi ? proyeksi.stop.harga.toFixed(2) : (harga * 0.93).toFixed(2));
    const [mode, setMode] = useState<'modal' | 'lembar'>('modal');
    const [modal, setModal] = useState('');
    const [lembar, setLembar] = useState('');
    const [tgl, setTgl] = useState(hariIni());
    const [catatan, setCatatan] = useState('');
    const [err, setErr] = useState('');
    const [kirim, setKirim] = useState(false);

    const pilihProfil = (p: Profil) => {
        setProfil(p);
        const t = proyeksi?.target.find((x) => x.nama.toLowerCase() === p);
        if (t) { setTarget(t.harga.toFixed(2)); if (proyeksi) setStop(proyeksi.stop.harga.toFixed(2)); }
    };
    const e = angka(entry), tg = angka(target), sl = angka(stop);
    const sh = mode === 'modal' ? angka(modal) / e : angka(lembar);
    const biaya = sh * e;
    const ok = e > 0 && tg > e && sl > 0 && sl < e && sh > 0;
    const hitung = useMemo(() => ({ untung: (tg - e) * sh, rugi: (e - sl) * sh, rr: (tg - e) / Math.max(0.0001, e - sl) }), [e, tg, sl, sh]);
    const pctDari = (v: number) => (e > 0 ? ((v / e - 1) * 100).toFixed(1) : '–');

    const simpan = async () => {
        if (!ok) { setErr('Periksa isian: stop < harga beli < target, dan modal/lembar > 0.'); return; }
        setKirim(true); setErr('');
        try {
            await apiPost('/api/kantor/portofolio/buka', { symbol: simbol, entry: e, shares: +sh.toFixed(4), target: tg, stop: sl, profil, ai, tgl, catatan });
            onSelesai(`✓ ${simbol} tercatat di Portofolio: ${(+sh.toFixed(4)).toLocaleString('id-ID')} lembar @ ${usd(e)}. Dito akan mengabari saat target/stop tersentuh.`);
        } catch (x: any) { setErr(String(x.message || x)); } finally { setKirim(false); }
    };

    return createPortal(
        <div className="k-sheet interactive" onClick={onTutup}>
            <div className="k-sheet-in pp" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label={`Pegang posisi ${simbol}`}>
                <div className="k-sheet-h"><b><Ikon e="📌" /> Pegang posisi {simbol}</b><button onClick={onTutup} aria-label="Tutup">✕</button></div>
                <p className="sb-note">Hanya pencatatan — belinya tetap Bapak lakukan sendiri di broker. Isi sesuai transaksi Bapak supaya hitungan untung di Portofolio akurat.</p>

                <h4>Profil target <small>dari proyeksi {proyeksi ? `±${proyeksi.horizon} hari bursa` : ''}</small></h4>
                <div className="pp-profil">
                    {(proyeksi?.target || []).map((t) => (
                        <button key={t.nama} className={profil === t.nama.toLowerCase() ? 'on' : ''} onClick={() => pilihProfil(t.nama.toLowerCase() as Profil)}>
                            <b>{t.nama}{t.nama === proyeksi?.terbaik ? ' ★' : ''}</b><span className="mono">{usd(t.harga)} · +{t.pct.toFixed(1)}%</span><small>peluang {t.peluang}%</small>
                        </button>
                    ))}
                    <button className={profil === 'kustom' ? 'on' : ''} onClick={() => setProfil('kustom')}><b>Kustom</b><span>atur sendiri</span><small>target & stop bebas</small></button>
                </div>

                <div className="pp-grid">
                    <label>Harga beli (USD)<input inputMode="decimal" value={entry} onChange={(x) => setEntry(x.target.value)} /></label>
                    <label>Tanggal beli<TanggalInput bisaKosong={false} value={tgl} max={hariIni()} onChange={(v) => setTgl(v)} /></label>
                    <label>Target jual <small className="up">+{pctDari(tg)}%</small><input inputMode="decimal" value={target} onChange={(x) => { setTarget(x.target.value); setProfil('kustom'); }} /></label>
                    <label>Stop loss <small className="down">{pctDari(sl)}%</small><input inputMode="decimal" value={stop} onChange={(x) => { setStop(x.target.value); setProfil('kustom'); }} /></label>
                </div>

                <h4>Dana yang dipakai</h4>
                <div className="sb-seg pp-seg"><button className={mode === 'modal' ? 'on' : ''} onClick={() => setMode('modal')}>Modal (USD)</button><button className={mode === 'lembar' ? 'on' : ''} onClick={() => setMode('lembar')}>Jumlah lembar</button></div>
                {mode === 'modal'
                    ? <label className="pp-full">Modal untuk saham ini (USD){kas != null && <small> · kas tersedia {usd(kas)}</small>}<input inputMode="decimal" placeholder="mis. 250" value={modal} onChange={(x) => setModal(x.target.value)} /></label>
                    : <label className="pp-full">Jumlah lembar (boleh pecahan)<input inputMode="decimal" placeholder="mis. 1.5" value={lembar} onChange={(x) => setLembar(x.target.value)} /></label>}

                {ok && (
                    <div className="pp-ringkas">
                        <div><small>Lembar</small><b className="mono">{(+sh.toFixed(4)).toLocaleString('id-ID')}</b></div>
                        <div><small>Total beli</small><b className="mono">{usd(biaya)}</b></div>
                        <div><small>Kalau target</small><b className="mono up">+{usd(hitung.untung)}</b></div>
                        <div><small>Kalau stop</small><b className="mono down">−{usd(hitung.rugi)}</b></div>
                        <div><small>Risiko : hasil</small><b className="mono">1 : {hitung.rr.toFixed(1)}</b></div>
                    </div>
                )}
                {kas != null && ok && biaya > kas + 0.01 && <p className="sd-warn"><Ikon e="⚠" /> Total beli melebihi kas tersedia ({usd(kas)}). Kalau Bapak menambah dana, catat "Suntik dana" di Portofolio supaya hitungannya pas.</p>}
                <label className="pp-full">Catatan (opsional)<input value={catatan} maxLength={300} placeholder="alasan beli, broker, dll." onChange={(x) => setCatatan(x.target.value)} /></label>
                {ai.label && <p className="sb-note">Sinyal saat ini ikut dicatat ({ai.label}{ai.pt ? ` · preset ${ai.pt}` : ''}), supaya nanti terlihat hasil mengikuti sinyal AI.</p>}
                {err && <div className="error">{err}</div>}
                <button className="btn primary pp-simpan" disabled={!ok || kirim} onClick={simpan}>{kirim ? 'Menyimpan…' : 'Simpan ke Portofolio'}</button>
            </div>
        </div>, document.body);
}
