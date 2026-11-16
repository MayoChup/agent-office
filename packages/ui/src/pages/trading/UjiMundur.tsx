import React, { useEffect, useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';

type R = { n: number; rataEx: number | null; menang: number | null; galatStd: number | null };
interface HasilH { semua: R; label: Record<string, R>; kuintil: R[]; komponen: Array<R & { nama: string }>; preset: Array<{ id: string; guru: string; nama: string; lolos75: R; lolos50: R; kurang: R }> }
interface Hasil { at: number; saham: number; gagal: number; sampel: number; periode: { dari: string; sampai: string }; catatan: string[]; H: Record<string, HasilH> }
interface Data { status: { jalan: boolean; progres: string; mulai: number; selesai: number; galat: string }; hasil: Hasil | null }

const MODE: Array<{ H: number; label: string }> = [{ H: 1, label: 'Day trading (1 hari)' }, { H: 5, label: 'Swing pendek (5 hari)' }, { H: 20, label: 'Swing (20 hari)' }, { H: 60, label: 'Posisi/Investasi (60 hari)' }];
const LABEL = ['Beli kuat', 'Beli', 'Tahan', 'Jual', 'Jual kuat'];
const p = (x: number | null, d = 2) => (x == null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}%`);
const bermakna = (a: R, base: R) => a.n >= 300 && a.rataEx != null && base.rataEx != null && a.rataEx - base.rataEx > 2 * (a.galatStd ?? 0);
const kelasEx = (x: number | null) => (x == null ? '' : x > 0 ? 'up' : x < 0 ? 'down' : '');

/** Hasil uji mundur: apakah skor & preset benar-benar mengalahkan pasar di masa lalu. */
export function UjiMundur() {
    const d = useApi<Data>('/api/kantor/ujimundur', 0);
    const [H, setH] = useState(20);
    const [msg, setMsg] = useState('');
    useEffect(() => { if (!d.data?.status.jalan) return; const t = setInterval(() => d.reload(), 10_000); return () => clearInterval(t); }, [d.data?.status.jalan]);
    const jalankan = async () => { setMsg(''); try { await apiPost('/api/kantor/ujimundur/jalankan', {}); d.reload(); } catch (e: any) { setMsg(String(e.message || e)); } };
    const st = d.data?.status, h = d.data?.hasil, r = h?.H[String(H)];
    const lbl = r ? LABEL.map((k) => ({ k, ...r.label[k] })) : [];
    const bk = r?.label['Beli kuat'], jk = r?.label['Jual kuat'];
    const urut = lbl.filter((x) => x.n >= 100 && x.rataEx != null).map((x) => x.rataEx as number);
    const menurun = urut.length >= 3 && urut.every((v, i) => i === 0 || v <= urut[i - 1] + 0.05);
    const vonis = !r ? '' : bk && jk && bk.n >= 100 && jk.n >= 100 && bk.rataEx! > jk.rataEx! + 2 * Math.hypot(bk.galatStd || 0, jk.galatStd || 0)
        ? (menurun ? '✅ Skor PUNYA daya pembeda: makin tinggi labelnya, makin baik hasilnya — berurutan rapi.' : '🟡 "Beli kuat" memang lebih baik dari "Jual kuat", tapi urutan label di tengah tidak rapi. Pakai label ekstrem saja.')
        : '❌ Skor BELUM terbukti: saham berlabel "Beli kuat" tidak jelas lebih baik dari "Jual kuat" untuk horison ini.';
    return (
        <div className="um">
            <section className="sb-card">
                <div className="sd-h"><h3>🧪 Uji mundur (backtest)</h3></div>
                <p className="sb-note">Skor teknikal & preset guru dihitung ulang di setiap tanggal selama ±4 tahun terakhir (hanya memakai data sampai tanggal itu), lalu dibandingkan dengan hasil sesudahnya — <b>dibanding S&P 500 pada periode yang sama</b>. Positif = mengalahkan pasar.</p>
                <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn primary" disabled={!!st?.jalan} onClick={jalankan}>{st?.jalan ? '⏳ Sedang berjalan…' : h ? '↻ Jalankan ulang' : '▶ Jalankan uji mundur'}</button>
                    <small className="sb-note">{st?.jalan ? `${st.progres} — ±20–40 menit, bisa ditinggal` : h ? `Terakhir: ${new Date(h.at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} · ${h.saham} saham · ${h.sampel.toLocaleString('id-ID')} sampel · ${h.periode.dari} s/d ${h.periode.sampai}` : 'Belum pernah dijalankan.'}</small>
                </div>
                {(st?.galat || msg) && <div className="error">{st?.galat || msg}</div>}
            </section>
            {h && r && (<>
                <div className="sb-seg scroll">{MODE.map((m) => <button key={m.H} className={H === m.H ? 'on' : ''} onClick={() => setH(m.H)}>{m.label}</button>)}</div>
                <section className="sb-card">
                    <div className="sd-h"><h3>Apakah skor teknikal berguna?</h3></div>
                    <p className="um-vonis">{vonis}</p>
                    <table className="um-t"><thead><tr><th>Label saat itu</th><th>Kasus</th><th>Rata-rata vs S&P 500</th><th>Mengalahkan pasar</th></tr></thead>
                        <tbody>
                            {lbl.map((x) => <tr key={x.k}><td>{x.k}</td><td className="mono">{x.n.toLocaleString('id-ID')}</td><td className={`mono ${kelasEx(x.rataEx)}`}>{p(x.rataEx)}</td><td className="mono">{x.menang ?? '–'}%</td></tr>)}
                            <tr className="um-base"><td>Semua saham</td><td className="mono">{r.semua.n.toLocaleString('id-ID')}</td><td className={`mono ${kelasEx(r.semua.rataEx)}`}>{p(r.semua.rataEx)}</td><td className="mono">{r.semua.menang}%</td></tr>
                        </tbody></table>
                    <p className="sb-note">Rata-rata per posisi selama {H} hari bursa. Contoh: +0,50% artinya rata-rata unggul 0,5% dari S&P 500 dalam {H} hari.</p>
                </section>
                <section className="sb-card">
                    <div className="sd-h"><h3>Preset guru (teknikal) — saham yang lolos ≥75% kriteria</h3></div>
                    <table className="um-t"><thead><tr><th>Preset</th><th>Kasus</th><th>Rata-rata vs S&P 500</th><th>Menang</th><th>Terbukti?</th></tr></thead>
                        <tbody>{[...r.preset].sort((a, b) => (b.lolos75.rataEx ?? -99) - (a.lolos75.rataEx ?? -99)).map((x) => {
                            const ok = bermakna(x.lolos75, r.semua) && (x.lolos75.rataEx ?? 0) > 0;
                            return <tr key={x.id}><td>{x.guru}<small> · {x.nama}</small></td><td className="mono">{x.lolos75.n.toLocaleString('id-ID')}</td><td className={`mono ${kelasEx(x.lolos75.rataEx)}`}>{p(x.lolos75.rataEx)}</td><td className="mono">{x.lolos75.menang ?? '–'}%</td><td>{x.lolos75.n < 300 ? <span className="pr-pct">kasus sedikit</span> : ok ? <span className="pr-pct ok">✓ ya</span> : <span className="pr-pct no">belum</span>}</td></tr>;
                        })}</tbody></table>
                    <p className="sb-note">"Terbukti" = mengalahkan pasar DAN rata-rata semua saham dengan selisih lebih dari 2× galat standar (kecil kemungkinan kebetulan), minimal 300 kasus. Preset yang terbukti dipakai sebagai rekomendasi berbasis data di panel preset.</p>
                </section>
                <section className="sb-card">
                    <div className="sd-h"><h3>Sinyal mana yang benar-benar membantu?</h3></div>
                    <div className="um-komp">
                        {r.komponen.slice(0, 8).map((k) => <div key={k.nama}><span>{k.nama.slice(2)}</span><b className={`mono ${kelasEx(k.rataEx)}`}>{p(k.rataEx)}</b><small>{k.n.toLocaleString('id-ID')} kasus · {k.nama[0] === '+' ? 'dihitung plus' : 'dihitung minus'}</small></div>)}
                    </div>
                    <details className="scr-legend"><summary>Lihat semua {r.komponen.length} sinyal</summary>
                        {r.komponen.map((k) => <div key={k.nama}><b className={kelasEx(k.rataEx)}>{p(k.rataEx)}</b> · {k.nama.slice(2)} <small>({k.n} kasus, {k.nama[0] === '+' ? 'skor menambah' : 'skor mengurangi'})</small></div>)}
                    </details>
                    <p className="sb-note">Sinyal yang dihitung <b>plus</b> tapi hasilnya negatif (atau sebaliknya) adalah kandidat untuk dikecilkan/dibalik bobotnya.</p>
                </section>
                <section className="sb-card"><div className="sd-h"><h3>Catatan kejujuran</h3></div><ul className="sd-alasan">{h.catatan.map((c) => <li key={c}>{c}</li>)}</ul></section>
            </>)}
        </div>
    );
}
