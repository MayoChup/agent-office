import React, { useEffect, useState } from 'react';
import { apiGet } from '../../kantor/connection';
import { usd } from './types';

interface Prof { nama: string; masuk: number; target: number; stop: number; ket: string; pMasuk: number; pTarget: number; pStop: number; pTidak: number; rr: number; harapan: number; hariTarget: number | null }
interface Sim { simulasi: number; langkah: number; satuan: 'hari' | 'batang'; harga: number; profil: Prof[]; contoh: Array<{ c: number[]; akhir: 'target' | 'stop' | 'tidak' }>; sumber: string; menitPerBatang?: number; horizon: number; mode: string }

/** Simulasi 10.000 jalur masa depan dari pergerakan historis saham itu sendiri (bukan prediksi). */
export function Simulasi({ simbol, q, onTutup }: { simbol: string; q: string; onTutup: () => void }) {
    const [d, setD] = useState<Sim | null>(null);
    const [err, setErr] = useState('');
    const [pil, setPil] = useState(1);
    useEffect(() => { let a = true; apiGet<Sim>(`/api/kantor/simulasi/${encodeURIComponent(simbol)}?${q}`).then((r) => a && setD(r)).catch((e) => a && setErr(String(e.message || e))); return () => { a = false; }; }, [simbol, q]);
    const p = d?.profil[pil];
    const W = 1000, Hh = 340, padR = 0;
    const view = (() => {
        if (!d || !p) return null;
        const semua = d.contoh.flatMap((x) => x.c).concat([p.target, p.stop, p.masuk]);
        let lo = Math.min(...semua), hi = Math.max(...semua);
        const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
        const y = (v: number) => Hh - ((v - lo) / (hi - lo)) * Hh;
        const x = (i: number) => (i / d.langkah) * (W - padR);
        return { y, x };
    })();
    const akhirLabel = d?.satuan === 'batang' ? 'TUTUP BURSA' : `${d?.langkah} HARI BURSA`;
    return (
        <section className="sb-card sim">
            <div className="sim-h">
                <span className="sim-tag">📊 {simbol}</span>
                <div className="sim-n"><b>10.000</b> simulasi</div>
                <button className="icon-btn" onClick={onTutup} aria-label="Tutup">✕</button>
            </div>
            {!d && !err && <div className="fin-empty">Menjalankan 10.000 simulasi…</div>}
            {err && <div className="error">{err}</div>}
            {d && p && view && (
                <>
                    <div className="sb-seg sim-prof">{d.profil.map((x, i) => <button key={x.nama} className={pil === i ? 'on' : ''} onClick={() => setPil(i)}>{x.nama}</button>)}</div>
                    <div className="sim-chart">
                        <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none">
                            <rect x={0} y={view.y(p.target)} width={W} height={Math.max(0, view.y(p.masuk) - view.y(p.target))} fill="rgba(34,197,94,0.10)" />
                            <rect x={0} y={view.y(p.masuk)} width={W} height={Math.max(0, view.y(p.stop) - view.y(p.masuk))} fill="rgba(239,68,68,0.10)" />
                            {d.contoh.map((j, k) => (
                                <polyline key={k} fill="none" strokeWidth={1.4} vectorEffect="non-scaling-stroke" opacity={0.75}
                                    stroke={j.akhir === 'target' ? '#4ade80' : j.akhir === 'stop' ? '#f87171' : '#7dd3fc'}
                                    points={j.c.map((v, i) => `${view.x(i).toFixed(1)},${view.y(v).toFixed(1)}`).join(' ')} />
                            ))}
                            <line x1={0} x2={W} y1={view.y(p.target)} y2={view.y(p.target)} stroke="#22c55e" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                            <line x1={0} x2={W} y1={view.y(p.stop)} y2={view.y(p.stop)} stroke="#ef4444" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                            <line x1={0} x2={W} y1={view.y(p.masuk)} y2={view.y(p.masuk)} stroke="#fff" strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
                        </svg>
                        {(() => {
                            // Label tidak boleh bertumpuk: jaga jarak minimal ±17% tinggi grafik.
                            const g = 17; let t = (view.y(p.target) / Hh) * 100, m = (view.y(p.masuk) / Hh) * 100, st = (view.y(p.stop) / Hh) * 100;
                            m = Math.max(m, t + g); st = Math.max(st, m + g);
                            if (st > 100 - 8) { const geser = st - 92; st -= geser; m -= geser; t -= geser; }
                            return (<>
                                <div className="sim-lbl t" style={{ top: `${t}%` }}><small>TARGET</small><b className="mono">{usd(p.target)}</b></div>
                                <div className="sim-lbl m" style={{ top: `${m}%` }}><small>MASUK</small><b className="mono">{usd(p.masuk)}</b></div>
                                <div className="sim-lbl s" style={{ top: `${st}%` }}><small>STOP LOSS</small><b className="mono">{usd(p.stop)}</b></div>
                            </>);
                        })()}
                    </div>
                    <div className="sim-axis"><span>SEKARANG</span><i /><span>🕑 {akhirLabel}</span></div>
                    <div className="sim-grid">
                        {d.profil.map((x, i) => (
                            <button key={x.nama} className={`sim-card ${pil === i ? 'on' : ''}`} onClick={() => setPil(i)}>
                                <b>{x.nama}</b><small>{x.ket}</small>
                                <div className="sim-kv mono">
                                    <span>Masuk {usd(x.masuk)}</span><em>{x.pMasuk}% tersentuh</em>
                                    <span className="up">Target {usd(x.target)} (+{((x.target / x.masuk - 1) * 100).toFixed(1)}%)</span><em>{x.pTarget}%</em>
                                    <span className="down">Stop {usd(x.stop)} (−{((1 - x.stop / x.masuk) * 100).toFixed(1)}%)</span><em>{x.pStop}%</em>
                                    <span>Tidak kena keduanya</span><em>{x.pTidak}%</em>
                                </div>
                                <div className="sim-bar"><i className="g" style={{ width: `${x.pTarget}%` }} /><i className="r" style={{ width: `${x.pStop}%` }} /><i className="b" style={{ width: `${x.pTidak}%` }} /></div>
                                <small>Risiko:hasil 1:{x.rr} · rata-rata hasil {x.harapan >= 0 ? '+' : ''}{x.harapan}%{x.hariTarget ? ` · target biasanya tercapai di ${d.satuan === 'batang' ? `batang ke-${x.hariTarget} (±${(x.hariTarget * (d.menitPerBatang || 5)).toFixed(0)} menit)` : `hari ke-${x.hariTarget}`}` : ''}</small>
                            </button>
                        ))}
                    </div>
                    <div className="sim-foot"><span className="sim-pill">simulasi, bukan prediksi</span><span className="sim-pill blue">🔒 0 order terkirim · modal masih utuh</span></div>
                    <p className="sb-note">Tiap jalur menyusun {d.langkah} {d.satuan === 'batang' ? `batang ${d.menitPerBatang || 5} menit (sampai bursa tutup)` : 'hari bursa'} dari potongan pergerakan nyata saham ini ({d.sumber}), diacak 10.000 kali. Persentase target/stop dihitung dari jalur yang sempat menyentuh harga masuk. Kalau target & stop tersentuh di langkah yang sama, dihitung kena stop (lebih hati-hati). Garis: hijau = kena target dulu, merah = kena stop dulu, biru = belum kena keduanya.</p>
                </>
            )}
        </section>
    );
}
