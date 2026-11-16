import React, { useMemo, useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiPost } from '../../kantor/connection';
import { useInterval } from '../../kantor/aktif';

export interface AkunInfo { id: string; nama: string; platform: string; handle: string; warna: string; tersambung: boolean; pengikut: number | null; menunggu: number; sibuk: string }
export interface PlatInfo { nama: string; ikon: string; format: string[]; label: Record<string, string>; kunci: Array<{ k: string; label: string; rahasia: boolean }>; catatan: string }
interface Baris { nama: string; n: number; rataTayang: number; rataJangkauan: number; er: number | null }
interface Top { akun: string; namaAkun: string; warna: string; platform: string; id: string; kode?: string; judul: string; format: string; tgl: string; tayang?: number; jangkauan?: number; suka?: number; komentar?: number; simpan?: number; bagikan?: number; er: number | null; tautan?: string; nilai?: string }
interface Ringkasan { at: number; teks: string; arahNiche: string; poin: string[]; ide: string[]; perAkun: Array<{ id: string; saran: string }> }
interface DataBeranda {
    hari: number; dari: string; sampai: string;
    akun: Array<{ id: string; nama: string; platform: string; warna: string; tersambung: boolean; pengikut: number | null; tumbuh: number | null; posting: number; terukur: number; tayang: number; jangkauan: number; suka: number; komentar: number; simpan: number; bagikan: number; er: number | null; rataTayang: number | null; terjadwal: number; menunggu: number; niche: string }>;
    total: { posting: number; terukur: number; tayang: number; jangkauan: number; suka: number; komentar: number; simpan: number; bagikan: number; ikuti: number; interaksi: number; er: number | null; rataTayang: number | null; rataInteraksi: number | null; pengikut: number | null; tumbuh: number | null; terjadwal: number; menunggu: number };
    seri: Array<{ tgl: string; tayang: number; interaksi: number; posting: number; pengikut: number | null }>;
    perPlatform: Baris[]; perFormat: Baris[]; perPilar: Baris[]; top: Top[]; ringkasan: Ringkasan | null; sibuk: string;
}
interface Master { bulan: string; isi: Array<{ akun: string; namaAkun: string; warna: string; platform: string; id: string; kode: string; tgl: string; jam: string; format: string; label: string; judul: string; status: string }> }

const angka = (n?: number | null) => (n == null ? '–' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}jt` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}rb` : n.toLocaleString('id-ID'));
const tgl = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const tambah = (t: string, n: number) => new Date(Date.parse(`${t}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const HURUF: Record<string, string> = { reel: 'R', feed: 'F', carousel: 'C', story: 'S', video: 'V' };

/** Grafik garis sederhana (SVG), bisa beberapa seri. */
function Garis({ label, seri, tinggi = 150 }: { label: string[]; seri: Array<{ nama: string; warna: string; nilai: Array<number | null> }>; tinggi?: number }) {
    const W = 600, H = tinggi, pad = { l: 44, r: 10, t: 10, b: 22 };
    const semuaV = seri.flatMap((s) => s.nilai.filter((v): v is number => v != null));
    if (!semuaV.length) return <div className="fin-empty">Belum ada data di periode ini.</div>;
    let lo = Math.min(...semuaV), hi = Math.max(...semuaV);
    if (!seri.some((s) => s.nama === 'Pengikut')) lo = Math.min(0, lo); // tayangan/interaksi mulai dari nol; pengikut boleh dipotong supaya perubahan terlihat
    if (lo === hi) { lo = Math.max(0, lo - 1); hi = hi + 1; }
    const x = (i: number) => pad.l + (i / Math.max(1, label.length - 1)) * (W - pad.l - pad.r), y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const garis = (nilai: Array<number | null>) => nilai.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
    const lang = Math.max(1, Math.ceil(label.length / 6));
    return (
        <div className="br-garis">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={seri.map((s) => s.nama).join(' dan ')}>
                {[0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="br-grid" /><text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="br-ax">{angka(Math.round(v))}</text></g>; })}
                {label.map((l, i) => (i % lang === 0 || i === label.length - 1 ? <text key={l} x={x(i)} y={H - 6} textAnchor="middle" className="br-ax">{tgl(l)}</text> : null))}
                {seri.map((s) => <polyline key={s.nama} points={garis(s.nilai)} fill="none" stroke={s.warna} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
            </svg>
            {seri.length > 1 && <div className="br-leg">{seri.map((s) => <span key={s.nama}><i style={{ background: s.warna }} />{s.nama}</span>)}</div>}
        </div>
    );
}
function Batang({ judul, data, metrik }: { judul: string; data: Baris[]; metrik: 'rataTayang' | 'er' }) {
    const mx = Math.max(1, ...data.map((d) => (d[metrik] as number) || 0));
    return (
        <div className="br-bt"><h4>{judul}</h4>
            {!data.length && <small className="sb-note">Belum ada data.</small>}
            {data.map((d) => <div key={d.nama} className="br-bt-r"><span>{d.nama} <small>({d.n})</small></span><i style={{ width: `${(((d[metrik] as number) || 0) / mx) * 100}%` }} /><b>{metrik === 'er' ? (d.er == null ? '–' : `${d.er}%`) : angka(d.rataTayang)}</b></div>)}
        </div>
    );
}

/** Beranda Konten: performa semua akun (atau satu akun/platform), kalender master, ringkasan AI lintas akun. */
export function Beranda({ tab, akun, platform, pilihAkun, kabar }: { tab: string; akun: AkunInfo[]; platform: Record<string, PlatInfo>; pilihAkun: (id: string) => void; kabar: (m: string) => void }) {
    const [fAkun, setFAkun] = useState('semua'), [fPlat, setFPlat] = useState('semua'), [hari, setHari] = useState(30), [metrik, setMetrik] = useState<'rataTayang' | 'er'>('rataTayang');
    const d = useApi<DataBeranda>(`/api/kantor/sosmed/beranda?akun=${fAkun}&platform=${fPlat}&hari=${hari}`, 120_000);
    useInterval(() => d.reload(), d.data?.sibuk ? 6000 : null);
    const x = d.data, plats = [...new Set(akun.map((a) => a.platform))];
    const Filter = (
        <div className="br-filter">
            <label>Akun<select value={fAkun} onChange={(e) => setFAkun(e.target.value)}><option value="semua">Semua akun (digabung)</option>{akun.map((a) => <option key={a.id} value={a.id}>{platform[a.platform]?.ikon} {a.nama}</option>)}</select></label>
            <label>Platform<select value={fPlat} onChange={(e) => setFPlat(e.target.value)}><option value="semua">Semua platform</option>{plats.map((p) => <option key={p} value={p}>{platform[p]?.nama || p}</option>)}</select></label>
            {tab === 'ringkasan' && <label>Periode<select value={hari} onChange={(e) => setHari(+e.target.value)}><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option><option value={365}>1 tahun</option></select></label>}
        </div>
    );
    if (tab === 'kalender') return <>{Filter}<KalenderMaster akun={fAkun} plat={fPlat} daftar={akun} platform={platform} pilihAkun={pilihAkun} /></>;
    if (!x) return <>{Filter}<section className="sb-card">{d.error ? <div className="error">{d.error}</div> : <div className="pg-skel" style={{ height: 220 }} />}</section></>;
    const t = x.total, adaPk = x.seri.some((s) => s.pengikut != null);
    const KPI: Array<[string, string, string?]> = [
        ['Pengikut', angka(t.pengikut), t.tumbuh != null ? `${t.tumbuh >= 0 ? '▲ +' : '▼ '}${angka(t.tumbuh)} periode ini` : 'isi/sambungkan akun'],
        ['Tayangan', angka(t.tayang), t.rataTayang != null ? `rata-rata ${angka(t.rataTayang)}/posting` : undefined],
        ['Jangkauan', angka(t.jangkauan)], ['Interaksi', angka(t.interaksi), t.rataInteraksi != null ? `rata-rata ${angka(t.rataInteraksi)}/posting` : undefined],
        ['Engagement rate', t.er == null ? '–' : `${t.er}%`, '(suka+komen+simpan+bagikan) ÷ jangkauan'],
        ['Posting terbit', String(t.posting), `${t.terukur} sudah ada angkanya`], ['Komentar', angka(t.komentar)], ['Disimpan', angka(t.simpan)], ['Dibagikan', angka(t.bagikan)],
        ['Menunggu Bapak', String(t.menunggu), `${t.terjadwal} terjadwal`]
    ];
    const r = x.ringkasan;
    return (<>
        {Filter}
        <section className="br-kpi">{KPI.map(([l, v, k]) => <div key={l}><small>{l}</small><b>{v}</b>{k && <em className={k.startsWith('▲') ? 'naik' : k.startsWith('▼') ? 'turun' : ''}>{k}</em>}</div>)}</section>
        <div className="br-dua">
            <section className="sb-card"><div className="sd-h"><h3>Tayangan & interaksi <small>per tanggal terbit</small></h3></div>
                <Garis label={x.seri.map((s) => s.tgl)} seri={[{ nama: 'Tayangan', warna: '#14b8a6', nilai: x.seri.map((s) => s.tayang) }, { nama: 'Interaksi', warna: '#f59e0b', nilai: x.seri.map((s) => s.interaksi) }]} /></section>
            <section className="sb-card"><div className="sd-h"><h3>Pengikut <small>{fAkun === 'semua' ? 'jumlah semua akun' : 'akun ini'}</small></h3></div>
                {adaPk ? <Garis label={x.seri.map((s) => s.tgl)} seri={[{ nama: 'Pengikut', warna: '#8b5cf6', nilai: x.seri.map((s) => s.pengikut) }]} /> : <div className="fin-empty">Belum ada catatan pengikut. Sambungkan akun (otomatis tiap hari) atau isi manual di tab "Akun & tim" tiap akun.</div>}</section>
        </div>
        <section className="sb-card">
            <div className="sd-h"><h3>Ringkasan AI <small>{r ? `Maya · ${new Date(r.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · dipakai otomatis untuk ide konten berikutnya di semua akun` : 'dibuat otomatis tiap Senin bila sudah ada data'}</small></h3>
                <button className="btn small primary" disabled={!!x.sibuk} onClick={() => apiPost('/api/kantor/sosmed/ringkasan-ai', {}).then(() => { kabar('Maya sedang membaca data semua akun (±1–3 menit).'); d.reload(); }).catch((e) => kabar(String(e.message || e)))}>{x.sibuk ? 'Sedang dibuat…' : r ? '↻ Perbarui ringkasan' : 'Buat ringkasan AI'}</button></div>
            {!r && <div className="fin-empty">Belum ada ringkasan. Maya akan membaca angka semua postingan dan pengikut, lalu menyimpulkan ke mana niche bergerak dan ide apa yang layak dibuat berikutnya.</div>}
            {r && (<div className="br-ai">
                <p className="sm-lead">{r.teks}</p>
                {r.arahNiche && <div className="br-arah"><small>🧭 Arah niche menurut data</small><p>{r.arahNiche}</p></div>}
                <div className="br-ai-dua">
                    {r.poin.length > 0 && <div><h4>Insight</h4><ul>{r.poin.map((p) => <li key={p}>{p}</li>)}</ul></div>}
                    {r.ide.length > 0 && <div><h4>💡 Ide konten berikutnya</h4><ul>{r.ide.map((p) => <li key={p}>{p}</li>)}</ul></div>}
                </div>
                {r.perAkun.length > 0 && <div className="br-saran">{r.perAkun.map((p) => { const a = akun.find((y) => y.id === p.id); return a ? <div key={p.id}><b style={{ color: a.warna }}>{platform[a.platform]?.ikon} {a.nama}</b><p>{p.saran}</p></div> : null; })}</div>}
            </div>)}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Per akun <small>{tgl(x.dari)} – {tgl(x.sampai)}</small></h3></div>
            <div className="sm-tabel"><table className="um-t br-akun"><thead><tr><th>Akun</th><th>Pengikut</th><th>Tumbuh</th><th>Posting</th><th>Tayangan</th><th>Rata/posting</th><th>ER</th><th>Menunggu</th></tr></thead>
                <tbody>{x.akun.map((a) => <tr key={a.id} onClick={() => pilihAkun(a.id)} title="Buka akun ini"><td><i className="br-dot" style={{ background: a.warna }} />{platform[a.platform]?.ikon} <b>{a.nama}</b>{!a.tersambung && <small className="br-man"> manual</small>}<br /><small>{a.niche}</small></td><td className="mono">{angka(a.pengikut)}</td><td className={`mono ${a.tumbuh && a.tumbuh > 0 ? 'naik' : a.tumbuh && a.tumbuh < 0 ? 'turun' : ''}`}>{a.tumbuh == null ? '–' : `${a.tumbuh >= 0 ? '+' : ''}${angka(a.tumbuh)}`}</td><td className="mono">{a.posting}</td><td className="mono">{angka(a.tayang || a.jangkauan)}</td><td className="mono">{angka(a.rataTayang)}</td><td className="mono">{a.er == null ? '–' : `${a.er}%`}</td><td className="mono">{a.menunggu || '–'}</td></tr>)}</tbody></table></div>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Apa yang paling berhasil</h3><div className="br-seg">{(['rataTayang', 'er'] as const).map((m) => <button key={m} className={metrik === m ? 'on' : ''} onClick={() => setMetrik(m)}>{m === 'er' ? 'Engagement' : 'Rata-rata tayangan'}</button>)}</div></div>
            <div className="br-tiga"><Batang judul="Per platform" data={x.perPlatform.map((b) => ({ ...b, nama: platform[b.nama]?.nama || b.nama }))} metrik={metrik} /><Batang judul="Per format" data={x.perFormat} metrik={metrik} /><Batang judul="Per pilar" data={x.perPilar} metrik={metrik} /></div>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Postingan teratas <small>berdasarkan jangkauan/tayangan</small></h3></div>
            {!x.top.length && <div className="fin-empty">Belum ada postingan dengan angka di periode ini.</div>}
            <div className="br-top">{x.top.map((p, i) => (
                <div key={`${p.akun}-${p.id}`} className="br-tp"><span className="br-rank">{i + 1}</span><div><b>{p.judul}</b><small><i className="br-dot" style={{ background: p.warna }} />{platform[p.platform]?.ikon} {p.namaAkun} · {p.format} · {tgl(p.tgl)}{p.kode ? ` · ${p.kode}` : ''}</small></div>
                    <span className="br-tp-m"><b>{angka(p.jangkauan || p.tayang)}</b><small>{p.er == null ? '' : `ER ${p.er}%`}{p.nilai ? ` · ${p.nilai}` : ''}</small></span>{p.tautan && <a href={p.tautan} target="_blank" rel="noreferrer" aria-label="Buka postingan">↗</a>}</div>
            ))}</div>
        </section>
    </>);
}

function KalenderMaster({ akun, plat, daftar, platform, pilihAkun }: { akun: string; plat: string; daftar: AkunInfo[]; platform: Record<string, PlatInfo>; pilihAkun: (id: string) => void }) {
    const hariIni = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const [bulan, setBulan] = useState(hariIni.slice(0, 7)), [pilih, setPilih] = useState(hariIni);
    const d = useApi<Master>(`/api/kantor/sosmed/kalender-master?bulan=${bulan}&akun=${akun}`, 120_000);
    const isi = useMemo(() => (d.data?.isi || []).filter((k) => plat === 'semua' || k.platform === plat), [d.data, plat]);
    const awal = `${bulan}-01`, dow = (new Date(`${awal}T00:00:00Z`).getUTCDay() + 6) % 7, jml = new Date(Date.UTC(+bulan.slice(0, 4), +bulan.slice(5, 7), 0)).getUTCDate();
    const sel = Array.from({ length: Math.ceil((dow + jml) / 7) * 7 }, (_, i) => (i < dow || i >= dow + jml ? null : tambah(awal, i - dow)));
    const geser = (n: number) => setBulan(new Date(Date.UTC(+bulan.slice(0, 4), +bulan.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7));
    const tampil = daftar.filter((a) => (akun === 'semua' || a.id === akun) && (plat === 'semua' || a.platform === plat));
    const hariPilih = isi.filter((k) => k.tgl === pilih);
    const STATUS: Record<string, string> = { rencana: 'ide', sketsa: 'pilih sketsa', naskah: 'naskah', prompt: 'prompt siap', aset: 'berkas masuk', terjadwal: 'terjadwal', mengunggah: 'mengunggah', terbit: 'terbit', manual: 'unggah manual', gagal: 'gagal' };
    return (<>
        <section className="sb-card sm-kal">
            <div className="sm-kal-h"><div className="sm-kal-nav"><button className="icon-btn" onClick={() => geser(-1)} aria-label="Bulan sebelumnya">‹</button><h3>{new Date(`${awal}T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h3><button className="icon-btn" onClick={() => geser(1)} aria-label="Bulan berikutnya">›</button></div><small className="sb-note" style={{ margin: 0 }}>{isi.length} konten dari {tampil.length} akun</small></div>
            <div className="sm-legend">{tampil.map((a) => <span key={a.id}><i style={{ background: a.warna }} />{platform[a.platform]?.ikon} {a.nama}</span>)}</div>
            <div className="sm-grid br-grid-m">
                {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((h) => <div key={h} className="sm-gh">{h}</div>)}
                {sel.map((t, i) => {
                    if (!t) return <div key={i} className="sm-gc luar" />;
                    const k = isi.filter((y) => y.tgl === t);
                    return (
                        <button key={t} className={`sm-gc ${t === hariIni ? 'kini' : ''} ${t === pilih ? 'pilih' : ''} ${t < hariIni ? 'lewat' : ''}`} onClick={() => setPilih(t)} aria-label={`${t}: ${k.length} konten`}>
                            <b>{+t.slice(8)}</b>
                            {k.slice(0, 4).map((y) => <span key={`${y.akun}-${y.id}`} className={`br-mk ${y.status === 'terbit' ? 'ok' : ''}`} style={{ ['--ak' as any]: y.warna }}><i>{HURUF[y.format]}</i><em>{y.judul}</em></span>)}
                            {k.length > 4 && <small className="br-lagi">+{k.length - 4} lagi</small>}
                        </button>
                    );
                })}
            </div>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>{new Date(`${pilih}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</h3></div>
            {!hariPilih.length && <div className="fin-empty">Tidak ada konten di tanggal ini.</div>}
            <div className="sm-ablist">{hariPilih.map((y) => (
                <button key={`${y.akun}-${y.id}`} className="sm-ab br-ab" style={{ borderLeftColor: y.warna }} onClick={() => pilihAkun(y.akun)} title="Buka akun ini">
                    <span className="sm-kode">{y.kode}</span><span className="sm-ab-w">{y.jam} WIB</span><span>{platform[y.platform]?.ikon} {y.namaAkun}</span><span className="sm-pil">{y.label}</span><b>{y.judul}</b><em className="sm-ab-s">{STATUS[y.status] || y.status}</em>
                </button>
            ))}</div>
        </section>
    </>);
}
