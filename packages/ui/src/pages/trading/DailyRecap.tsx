import React, { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { Ikon } from '../../components/Ikon';

interface CalonTop { s: string; nama: string; sektor: string; H: number; gaya: string; jenis: 'momentum' | 'pantul' | 'swing'; harga: number; skor: number; label: string;
    target: { nama: string; harga: number; pct: number; peluang: number; rr: number | null; harapan: number | null }; stop: { harga: number; pct: number }; masuk: [number, number]; bukti: boolean; tanda: string[]; faktor: Record<string, string | null> }
interface Edisi {
    tgl: string; dibuat: number; oleh: string; judul: string; subjudul: string; tldr: string[]; kutipan: string; badan: Array<{ id: string; judul: string; md: string }>;
    alasanTop: Record<string, string>; top: CalonTop[]; catatanTop: string; kode: Record<string, string>;
    pasar: { spy: number | null; naik: number; turun: number; sektorAtas: Array<{ nama: string; chg: number }>; sektorBawah: Array<{ nama: string; chg: number }>; naikTerbesar: Array<{ s: string; nama: string; chg: number }>; turunTerbesar: Array<{ s: string; nama: string; chg: number }> };
    sumber: Array<{ id: string; t: string; sumber: string; url: string }>;
}
interface Data { daftar: Array<{ tgl: string; judul: string }>; edisi: Edisi | null; kini: Record<string, number | null>; jalan: boolean; galat: string; sesi: string }

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'], BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tglPanjang = (t: string) => { const d = new Date(`${t}T12:00:00Z`); return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const tglPendek = (t: string) => { const d = new Date(`${t}T12:00:00Z`); return `${d.getUTCDate()} ${BLN[d.getUTCMonth()].slice(0, 3)}`; };
const pct = (v: number | null | undefined, d = 2) => (v == null ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const usd = (v: number) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const JENIS: Record<string, string> = { momentum: 'Momentum', pantul: 'Pantul', swing: 'Swing' };

/** Teks ber-markdown kecil: **tebal**, *miring*, $KODE → tautan saham, [B12] → tautan sumber berita. */
function Inline({ t, ctx }: { t: string; ctx: Ctx }) {
    const parts: React.ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\$[A-Z][A-Z0-9.-]{0,6}\b|\[B\d+\](?:\s*\[B\d+\])*)/g;
    let last = 0, m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(t))) {
        if (m.index > last) parts.push(t.slice(last, m.index));
        const x = m[0];
        if (x.startsWith('**')) parts.push(<strong key={i++}><Inline t={x.slice(2, -2)} ctx={ctx} /></strong>);
        else if (x.startsWith('*')) parts.push(<em key={i++}>{x.slice(1, -1)}</em>);
        else if (x.startsWith('$')) { const k = x.slice(1); parts.push(ctx.kode[k] ? <button key={i++} className="rk-saham" title={`${ctx.kode[k]} · buka halaman saham`} onClick={() => ctx.buka(k)}>{k}</button> : k); }
        else {
            const ids = x.match(/B\d+/g) || [];
            parts.push(<sup key={i++} className="rk-cite">{ids.map((id) => { const s = ctx.sumber.get(id); return s ? <a key={id} href={s.url} target="_blank" rel="noreferrer" title={`${s.sumber}: ${s.t}`}>{s.sumber || id}</a> : null; })}</sup>);
        }
        last = m.index + x.length;
    }
    if (last < t.length) parts.push(t.slice(last));
    return <>{parts}</>;
}
interface Ctx { kode: Record<string, string>; sumber: Map<string, { t: string; sumber: string; url: string }>; buka: (s: string) => void }
function Md({ md, ctx, dropcap = false }: { md: string; ctx: Ctx; dropcap?: boolean }) {
    const blok: React.ReactNode[] = [];
    const baris = md.split('\n');
    let para: string[] = [], list: string[] = [], k = 0, pertama = true;
    const tutupPara = () => { if (para.length) { blok.push(<p key={k++} className={dropcap && pertama ? 'rk-drop' : ''}><Inline t={para.join(' ')} ctx={ctx} /></p>); pertama = false; para = []; } };
    const tutupList = () => { if (list.length) { blok.push(<ul key={k++}>{list.map((x, i) => <li key={i}><Inline t={x} ctx={ctx} /></li>)}</ul>); list = []; } };
    for (const b0 of baris) {
        const b = b0.trim();
        if (!b) { tutupPara(); tutupList(); continue; }
        if (/^#{2,4}\s/.test(b)) { tutupPara(); tutupList(); blok.push(<h3 key={k++}><Inline t={b.replace(/^#+\s*/, '')} ctx={ctx} /></h3>); continue; }
        if (/^[-•*]\s+/.test(b)) { tutupPara(); list.push(b.replace(/^[-•*]\s+/, '')); continue; }
        tutupList(); para.push(b);
    }
    tutupPara(); tutupList();
    return <>{blok}</>;
}

export function DailyRecap({ onOpen }: { onOpen: (s: string) => void }) {
    const [tgl, setTgl] = useState('');
    const q = useApi<Data>(`/api/kantor/rekap${tgl ? `?tgl=${tgl}` : ''}`, 0);
    const [minta, setMinta] = useState(false); const [err, setErr] = useState('');
    const d = q.data, e = d?.edisi;
    const jalan = minta || !!d?.jalan;
    useEffect(() => { if (!jalan) return; const t = setInterval(() => q.reload(), 6000); return () => clearInterval(t); }, [jalan]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (minta && d && !d.jalan) { setMinta(false); setTgl(''); } }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
    const buat = async () => { setErr(''); setMinta(true); try { await apiPost('/api/kantor/rekap/buat', {}); q.reload(); } catch (x: any) { setErr(String(x?.message || x)); setMinta(false); } };
    const ctx: Ctx = useMemo(() => ({ kode: e?.kode || {}, sumber: new Map((e?.sumber || []).map((s) => [s.id, s])), buka: onOpen }), [e, onOpen]);
    const idx = d && e ? d.daftar.findIndex((x) => x.tgl === e.tgl) : -1;
    const kata = e ? [e.subjudul, ...e.badan.map((b) => b.md), ...Object.values(e.alasanTop)].join(' ').split(/\s+/).length : 0;
    const terbit = e ? new Date(e.dibuat + 7 * 3600_000) : null;
    const belumTerbit = d && d.sesi && !d.daftar.some((x) => x.tgl === d.sesi);
    const pasarId = e?.badan.findIndex((b) => b.id === 'berita') ?? -1;

    return (
        <div className="rk">
            <div className="rk-bar">
                <div className="rk-bar-l"><small>Kabar pasar & dunia, terbit tiap pagi ±06.30 WIB</small></div>
                <div className="rk-bar-r">
                    {d && d.daftar.length > 0 && (
                        <div className="rk-nav">
                            <button disabled={idx < 0 || idx >= d.daftar.length - 1} onClick={() => setTgl(d.daftar[idx + 1].tgl)} aria-label="Edisi sebelumnya"><Ikon n="chevron-left" /></button>
                            <select value={e?.tgl || ''} onChange={(x) => setTgl(x.target.value)} aria-label="Pilih edisi">{d.daftar.map((x) => <option key={x.tgl} value={x.tgl}>{tglPendek(x.tgl)} · {x.judul.slice(0, 40)}</option>)}</select>
                            <button disabled={idx <= 0} onClick={() => setTgl(d.daftar[idx - 1].tgl)} aria-label="Edisi berikutnya"><Ikon n="chevron-right" /></button>
                        </div>
                    )}
                    <button className="btn" disabled={jalan} onClick={buat}>{jalan ? 'Menyusun… ±3–5 menit' : belumTerbit ? 'Buat edisi hari ini' : 'Buat ulang'}</button>
                </div>
            </div>
            {(err || (!jalan && d?.galat)) && <div className="error">{err || d?.galat}</div>}
            {!d && !q.error && <div className="fin-empty">Memuat…</div>}
            {q.error && <div className="error">{q.error}</div>}
            {d && !e && !jalan && <div className="rk-kosong"><h2>Belum ada edisi</h2><p>Edisi pertama terbit otomatis besok pagi setelah pasar AS tutup, atau tekan <b>Buat edisi hari ini</b>.</p></div>}
            {e && (
                <article className="rk-art">
                    <header className="rk-head">
                        <div className="rk-kicker">Edisi {tglPanjang(e.tgl)} · ±{Math.max(2, Math.round(kata / 200))} menit baca</div>
                        <h1>{e.judul}</h1>
                        {e.subjudul && <p className="rk-sub">{e.subjudul}</p>}
                        <div className="rk-by">Ditulis {e.oleh} untuk Pak Rico{terbit ? ` · terbit ${terbit.getUTCDate()} ${BLN[terbit.getUTCMonth()].slice(0, 3)}, ${String(terbit.getUTCHours()).padStart(2, '0')}.${String(terbit.getUTCMinutes()).padStart(2, '0')} WIB` : ''}</div>
                    </header>

                    {e.tldr.length > 0 && <aside className="rk-tldr"><b>TL;DR</b><ol>{e.tldr.map((t, i) => <li key={i}><Inline t={t} ctx={ctx} /></li>)}</ol></aside>}

                    <section className="rk-pasar" aria-label="Pasar sekilas">
                        <div className="rk-angka"><small>S&P 500</small><b className={`mono ${(e.pasar.spy ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(e.pasar.spy)}</b></div>
                        <div className="rk-angka"><small>Naik · turun</small><b className="mono">{e.pasar.naik} · {e.pasar.turun}</b></div>
                        <div className="rk-angka lebar"><small>Sektor terkuat</small><span>{e.pasar.sektorAtas.map((x) => <i key={x.nama} className="up">{x.nama} {pct(x.chg, 1)}</i>)}</span></div>
                        <div className="rk-angka lebar"><small>Sektor terlemah</small><span>{e.pasar.sektorBawah.map((x) => <i key={x.nama} className="down">{x.nama} {pct(x.chg, 1)}</i>)}</span></div>
                        <div className="rk-angka lebar"><small>Naik terbesar</small><span>{e.pasar.naikTerbesar.map((x) => <button key={x.s} className="up" onClick={() => onOpen(x.s)} title={x.nama}>{x.s} {pct(x.chg, 1)}</button>)}</span></div>
                        <div className="rk-angka lebar"><small>Turun terdalam</small><span>{e.pasar.turunTerbesar.map((x) => <button key={x.s} className="down" onClick={() => onOpen(x.s)} title={x.nama}>{x.s} {pct(x.chg, 1)}</button>)}</span></div>
                    </section>

                    <div className="rk-isi">
                        {e.badan.map((b, i) => (
                            <React.Fragment key={b.id}>
                                <section className={`rk-bag rk-b-${b.id}`}>
                                    {b.judul && <h2>{b.judul}</h2>}
                                    <Md md={b.md} ctx={ctx} dropcap={b.id === 'pembuka'} />
                                </section>
                                {i === pasarId && e.kutipan && <blockquote className="rk-kutip">{e.kutipan}</blockquote>}
                                {b.id === 'agenda' && <TopLima e={e} kini={d?.kini || {}} ctx={ctx} lama={idx > 0} />}
                            </React.Fragment>
                        ))}
                        {!e.badan.some((b) => b.id === 'agenda') && <TopLima e={e} kini={d?.kini || {}} ctx={ctx} lama={idx > 0} />}
                    </div>

                    {e.sumber.length > 0 && (
                        <footer className="rk-sumber">
                            <h4>Sumber berita</h4>
                            <ol>{e.sumber.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noreferrer">{s.t}</a> <small>· {s.sumber}</small></li>)}</ol>
                        </footer>
                    )}
                    <p className="rk-disclaimer">Disusun AI kantor dari data & judul berita yang dikumpulkan kantor. Analisis dan prediksi statistik, bukan saran beli/jual. Kantor tidak terhubung ke broker.</p>
                </article>
            )}
        </div>
    );
}

function TopLima({ e, kini, ctx, lama }: { e: Edisi; kini: Record<string, number | null>; ctx: Ctx; lama: boolean }) {
    return (
        <section className="rk-top">
            <div className="rk-top-h"><span>Top {e.top.length || 5}</span><h2>Sinyal terbaik hari ini</h2></div>
            <p className="rk-top-ket">Dipilih dari semua rencana pegang posisi (±1, 5, 20 & 60 hari bursa): skor 4 faktor, harapan & R:R historis, bukti uji mundur, tanda pantul, aliran dana besar, dan berita. Saham yang laporan labanya ≤5 hari lagi dilewati. Maks. 2 per sektor.</p>
            {e.catatanTop && <p className="rk-top-cat">{e.catatanTop}</p>}
            <ol className="rk-kartu-list">
                {e.top.map((c, i) => {
                    const h = kini[c.s]; const gerak = lama && h != null ? (h / c.harga - 1) * 100 : null;
                    return (
                        <li key={c.s} className="rk-kartu">
                            <div className="rk-no">{i + 1}</div>
                            <div className="rk-kartu-isi">
                                <div className="rk-kartu-h">
                                    <button className="rk-kode" onClick={() => ctx.buka(c.s)}>{c.s}</button>
                                    <span className="rk-nama">{c.nama}</span>
                                    <span className={`rk-chip j-${c.jenis}`}>{JENIS[c.jenis]}</span>
                                    <span className="rk-chip">{c.gaya}</span>
                                </div>
                                {e.alasanTop[c.s] && <p className="rk-alasan"><Inline t={e.alasanTop[c.s]} ctx={ctx} /></p>}
                                <div className="rk-rencana">
                                    <div><small>Masuk sekitar</small><b className="mono">{usd(c.masuk[0])} – {usd(c.masuk[1])}</b></div>
                                    <div><small>Target {c.target.nama.toLowerCase()}</small><b className="mono up">{usd(c.target.harga)} <em>+{c.target.pct.toLocaleString('id-ID')}%</em></b></div>
                                    <div><small>Batas rugi</small><b className="mono down">{usd(c.stop.harga)} <em>{c.stop.pct.toLocaleString('id-ID')}%</em></b></div>
                                    <div><small>Peluang · R:R · harapan</small><b className="mono">{c.target.peluang}% · {c.target.rr != null ? `1:${c.target.rr.toLocaleString('id-ID', { maximumFractionDigits: 1 })}` : '–'} · <span className={(c.target.harapan ?? 0) >= 0 ? 'up' : 'down'}>{pct(c.target.harapan, 1)}</span></b></div>
                                </div>
                                <div className="rk-tanda">
                                    <span className="rk-label">{c.label} · {c.skor}/100</span>
                                    {c.tanda.map((t) => <span key={t}>{t}</span>)}
                                </div>
                                {gerak != null && <div className={`rk-rapor ${gerak >= 0 ? 'up' : 'down'}`}>Sejak terbit: {usd(c.harga)} → {usd(h!)} ({pct(gerak)})</div>}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
