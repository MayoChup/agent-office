import React, { useEffect, useState } from 'react';
import { apiGetSimpan, taruhApi } from '../../kantor/api';
import { apiGet, apiPost } from '../../kantor/connection';
import { usd } from './types';

interface Prof { nama: string; masuk: number; target: number; stop: number; ket: string; pMasuk: number; pTarget: number; pStop: number; pTidak: number; rr: number; harapan: number; hariTarget: number | null }
interface Sim { simulasi: number; langkah: number; satuan: 'hari' | 'batang'; harga: number; profil: Prof[]; contoh: Array<{ c: number[]; akhir: 'target' | 'stop' | 'tidak' }>; sumber: string; menitPerBatang?: number; horizon: number; mode: string;
    mesin?: 'kronos' | 'acak'; model?: string; pita?: Array<{ p10: number; p50: number; p90: number }>; riwayat?: Array<{ t: string; c: number }>; pNaik?: number; medianAkhir?: number; medianPct?: number; detik?: number;
    kronos?: { terpasang: boolean; memasang: boolean; catatan: string } }
interface StatusK { terpasang: boolean; memasang: boolean; log: string[]; error: string; model: string }

/** Kartu pemasangan Kronos di VPS (sekali saja). */
function PasangKronos({ onSiap }: { onSiap: () => void }) {
    const [st, setSt] = useState<StatusK | null>(null);
    const [err, setErr] = useState('');
    useEffect(() => {
        let a = true; let lama = false;
        const cek = () => apiGet<StatusK>('/api/kantor/kronos/status').then((r) => { if (!a) return; setSt(r); if (r.terpasang && lama) onSiap(); lama = lama || r.memasang; }).catch(() => undefined);
        cek(); const t = setInterval(cek, 4000); return () => { a = false; clearInterval(t); };
    }, []);
    if (!st || st.terpasang) return null;
    return (
        <div className="sim-pasang">
            <b>🔮 Aktifkan prediksi Kronos</b>
            <p>Kronos adalah model AI sumber terbuka yang dilatih khusus membaca candlestick dari puluhan bursa dunia. Model ini berjalan di VPS Bapak sendiri (gratis, data tidak dikirim ke mana-mana). Pemasangan sekali saja: ±1,5 GB, sekitar 5–10 menit.</p>
            {st.memasang
                ? <div className="sim-log"><span className="pk-jalan"><i /> sedang memasang…</span>{st.log.slice(-4).map((l, i) => <code key={i}>{l}</code>)}</div>
                : <button className="btn primary" onClick={() => apiPost<StatusK>('/api/kantor/kronos/pasang', {}).then(setSt).catch((e) => setErr(String(e.message || e)))}>Pasang Kronos di VPS</button>}
            {(st.error || err) && <div className="error">{st.error || err}</div>}
            <small>Sebelum terpasang, yang tampil di bawah adalah simulasi acak dari riwayat harga (cadangan).</small>
        </div>
    );
}

/** Prediksi harga ke depan: Kronos (model AI candlestick) — cadangan: simulasi acak 10.000 jalur dari riwayat. */
export function Simulasi({ simbol, q, onTutup }: { simbol: string; q: string; onTutup: () => void }) {
    const [d, setD] = useState<Sim | null>(null);
    const [err, setErr] = useState('');
    const [pil, setPil] = useState(1);
    const [ulang, setUlang] = useState(0);
    const url = `/api/kantor/simulasi/${encodeURIComponent(simbol)}?${q}`;
    useEffect(() => {
        let a = true; setErr('');
        (ulang ? apiGet<Sim>(url).then((r) => { taruhApi(url, r); return r; }) : apiGetSimpan<Sim>(url, 600_000)).then((r) => a && setD(r)).catch((e) => a && setErr(String(e.message || e)));
        return () => { a = false; };
    }, [simbol, q, ulang]);
    const K = d?.mesin === 'kronos';
    const p = d?.profil[pil];
    const W = 1000, Hh = 340, padR = 0;
    const view = (() => {
        if (!d || !p) return null;
        const rw = K ? (d.riwayat || []).map((r) => r.c) : [];
        const semua = d.contoh.flatMap((x) => x.c).concat([p.target, p.stop, p.masuk], rw.slice(-60));
        let lo = Math.min(...semua), hi = Math.max(...semua);
        const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
        const y = (v: number) => Hh - ((v - lo) / (hi - lo)) * Hh;
        // Kronos: 38% kiri = riwayat nyata, sisanya = prediksi (seperti grafik "sebelum → sesudah").
        const x0 = K && rw.length > 5 ? W * 0.38 : 0;
        const x = (i: number) => x0 + (i / d.langkah) * (W - padR - x0);
        const hist = rw.slice(-60);
        const xh = (i: number) => (i / Math.max(1, hist.length - 1)) * x0;
        return { y, x, x0, hist, xh };
    })();
    const akhirLabel = d?.satuan === 'batang' ? 'TUTUP BURSA' : `${d?.langkah} HARI BURSA`;
    return (
        <section className="sb-card sim">
            <div className="sim-h">
                <span className="sim-tag">{K ? '🔮' : '📊'} {simbol}</span>
                <div className="sim-n">{!d ? <><b>Prediksi</b> sedang dihitung…</> : K ? <><b>Kronos</b> · {d.simulasi} jalur prediksi</> : <><b>10.000</b> simulasi acak</>}</div>
                <button className="icon-btn" onClick={onTutup} aria-label="Tutup">✕</button>
            </div>
            {!d && !err && <div className="fin-empty">Menghitung prediksi… (Kronos di CPU VPS bisa butuh ½–2 menit untuk saham yang baru pertama dibuka)</div>}
            {d && !K && <PasangKronos onSiap={() => setUlang((n) => n + 1)} />}
            {d?.kronos?.catatan && <div className="hz-bukti warn">⚠️ <span>Kronos gagal untuk permintaan ini ({d.kronos.catatan}) — yang tampil adalah simulasi acak cadangan. <button className="btn small" onClick={() => setUlang((n) => n + 1)}>Coba lagi</button></span></div>}
            {err && <div className="error">{err}</div>}
            {d && p && view && (
                <>
                    {K && d.pita && (
                        <div className="sim-kronos">
                            <div><small>Peluang naik di akhir</small><b className={`mono ${(d.pNaik ?? 50) >= 50 ? 'up' : 'down'}`}>{d.pNaik}%</b></div>
                            <div><small>Perkiraan tengah</small><b className="mono">{usd(d.medianAkhir ?? 0)} <em className={(d.medianPct ?? 0) >= 0 ? 'up' : 'down'}>{(d.medianPct ?? 0) >= 0 ? '+' : ''}{d.medianPct}%</em></b></div>
                            <div><small>Rentang 80% jalur</small><b className="mono">{usd(d.pita[d.pita.length - 1].p10)} – {usd(d.pita[d.pita.length - 1].p90)}</b></div>
                        </div>
                    )}
                    <div className="sb-seg sim-prof">{d.profil.map((x, i) => <button key={x.nama} className={pil === i ? 'on' : ''} onClick={() => setPil(i)}>{x.nama}</button>)}</div>
                    <div className="sim-chart">
                        <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none">
                            <rect x={0} y={view.y(p.target)} width={W} height={Math.max(0, view.y(p.masuk) - view.y(p.target))} fill="rgba(34,197,94,0.10)" />
                            <rect x={0} y={view.y(p.masuk)} width={W} height={Math.max(0, view.y(p.stop) - view.y(p.masuk))} fill="rgba(239,68,68,0.10)" />
                            {K && d.pita && view.x0 > 0 && (<>
                                <polygon fill="rgba(45,212,191,0.10)" points={[...d.pita.map((b, i) => `${view.x(i + 1).toFixed(1)},${view.y(b.p90).toFixed(1)}`), ...[...d.pita].reverse().map((b, i) => `${view.x(d.pita!.length - i).toFixed(1)},${view.y(b.p10).toFixed(1)}`)].join(' ')} />
                                <polyline fill="none" stroke="#e2e8f0" strokeWidth={2} vectorEffect="non-scaling-stroke" points={view.hist.map((v, i) => `${view.xh(i).toFixed(1)},${view.y(v).toFixed(1)}`).join(' ')} />
                                <line x1={view.x0} x2={view.x0} y1={0} y2={Hh} stroke="rgba(45,212,191,0.7)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                            </>)}
                            {d.contoh.map((j, k) => (
                                <polyline key={k} fill="none" strokeWidth={1.4} vectorEffect="non-scaling-stroke" opacity={0.75}
                                    stroke={j.akhir === 'target' ? '#4ade80' : j.akhir === 'stop' ? '#f87171' : '#7dd3fc'}
                                    points={j.c.map((v, i) => `${view.x(i).toFixed(1)},${view.y(v).toFixed(1)}`).join(' ')} />
                            ))}
                            {K && d.pita && <polyline fill="none" stroke="#fde047" strokeWidth={2.6} vectorEffect="non-scaling-stroke" points={[`${view.x(0).toFixed(1)},${view.y(d.harga).toFixed(1)}`, ...d.pita.map((b, i) => `${view.x(i + 1).toFixed(1)},${view.y(b.p50).toFixed(1)}`)].join(' ')} />}
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
                    <div className="sim-axis">{K && view.x0 > 0 ? <><span>{view.hist.length} {d.satuan === 'batang' ? 'BATANG' : 'HARI'} TERAKHIR</span><i style={{ flex: '0 0 12%' }} /><span>SEKARANG</span><i /><span>🕑 {akhirLabel}</span></> : <><span>SEKARANG</span><i /><span>🕑 {akhirLabel}</span></>}</div>
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
                    <div className="sim-foot"><span className="sim-pill">{K ? 'prediksi model, bukan kepastian' : 'simulasi, bukan prediksi'}</span><span className="sim-pill blue">🔒 0 order terkirim · modal masih utuh</span></div>
                    {K ? <p className="sb-note"><b>Cara membaca:</b> Kronos ({d.model}) membaca {d.sumber}, lalu menghasilkan {d.simulasi} kemungkinan jalur candlestick untuk {d.langkah} {d.satuan === 'batang' ? `batang ${d.menitPerBatang || 5} menit` : 'hari bursa'} ke depan. Garis kuning = jalur tengah, area hijau-kebiruan = rentang 80% jalur, garis tipis = tiap jalur (hijau kena target dulu, merah kena stop dulu). Persentase dihitung dari {d.simulasi} jalur itu, jadi kasar (tiap jalur ≈ {(100 / d.simulasi).toFixed(0)}%). Kronos belum diuji mundur di data kita — perlakukan sebagai salah satu pandangan, bukan kepastian. Bukan saran keuangan.</p>
                        : <p className="sb-note">Tiap jalur menyusun {d.langkah} {d.satuan === 'batang' ? `batang ${d.menitPerBatang || 5} menit (sampai bursa tutup)` : 'hari bursa'} dari potongan pergerakan nyata saham ini ({d.sumber}), diacak 10.000 kali. Persentase target/stop dihitung dari jalur yang sempat menyentuh harga masuk. Kalau target & stop tersentuh di langkah yang sama, dihitung kena stop (lebih hati-hati). Garis: hijau = kena target dulu, merah = kena stop dulu, biru = belum kena keduanya.</p>}
                </>
            )}
        </section>
    );
}
