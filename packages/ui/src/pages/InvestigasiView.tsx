import React, { useState } from 'react';
import { useApi } from '../kantor/api';
import { apiPost } from '../kantor/connection';
import { RichText } from '../components/common/RichText';

interface Bukti { id: string; jenis: 'harga' | 'berita' | 'sec'; judul: string; isi: string; tanggal: string; url?: string }
interface Hipotesis { teks: string; mekanisme: string; dampak: string; keyakinan: 'tinggi' | 'sedang' | 'rendah'; sumber: string[] }
export interface Kasus {
    id: string; simbol: string; tanggal: string; dibuat: number;
    gerak: { hariIni: number; limaHari: number; volumeX: number; vsPasar: number; harga: number; pasar: number };
    ringkasan: string; hipotesis: Hipotesis[]; penyangkal: Array<{ teks: string; sumber: string[] }>;
    angka: Array<{ label: string; nilai: string; sumber: string }>; perkiraan: 'berlanjut' | 'berbalik' | 'tidak tahu'; cekSesi: number;
    bukti: Bukti[]; status: 'usulan' | 'diterima' | 'ditolak'; alasan?: string;
    hasil?: { nilai: 'tepat' | 'meleset' | 'datar'; vsPasar: number; dicek: string }; pemicu: 'otomatis' | 'manual';
}
interface Data { kasus: Kasus[]; catatan: Record<string, string[]>; skor: { tepat: number; meleset: number; datar: number; menunggu: number }; scanTerakhir: string; simbol: string[] }

const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(2).replace('.', ',')}%`;
const JENIS: Record<string, string> = { harga: 'Harga', berita: 'Berita', sec: 'Laporan SEC' };
const HASIL: Record<string, string> = { tepat: '✓ Tepat', meleset: '✗ Meleset', datar: '– Datar' };

export function InvestigasiView() {
    const { data, error, loading, reload } = useApi<Data>('/api/kantor/investigasi', 180_000);
    const [open, setOpen] = useState<string | null>(null);
    const [simbol, setSimbol] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const cur = data?.kasus.find((k) => k.id === open);

    const selidiki = async (s: string) => {
        if (!s.trim()) return;
        setBusy(true); setErr('');
        try {
            const r = await apiPost<{ kasus: Kasus }>('/api/kantor/investigasi/selidiki', { simbol: s.trim() });
            await reload();
            setOpen(r.kasus.id);
            setSimbol('');
        } catch (e: any) { setErr(String(e.message || e)); }
        setBusy(false);
    };

    if (cur && data) return <KasusDetail k={cur} catatan={data.catatan[cur.simbol] || []} onBack={() => setOpen(null)} onChange={reload} />;

    const sk = data?.skor;
    const dinilai = sk ? sk.tepat + sk.meleset : 0;
    return (
        <>
            <section className="fin-card inv-intro">
                <div className="inv-kicker">■ Investigasi pergerakan</div>
                <h3 className="inv-big">Dari berita, <span>sampai ke bisnisnya.</span></h3>
                <p className="inv-muted">Kalau saham di watchlist/posisi bergerak tajam (±3%, volume 2×, atau beda jauh dari pasar), kantor mengumpulkan bukti setelah bursa tutup dan AI menyusun sebab-akibatnya. Tiap angka ada sumbernya. Bukan saran beli/jual.</p>
                <form className="inv-search" onSubmit={(e) => { e.preventDefault(); selidiki(simbol); }}>
                    <input className="input" placeholder="Selidiki saham sekarang, mis. NVDA" value={simbol} onChange={(e) => setSimbol(e.target.value.toUpperCase())} />
                    <button className="btn primary" disabled={busy || !simbol.trim()}>{busy ? 'Menyelidiki… (±30 dtk)' : 'Selidiki'}</button>
                </form>
                {data && data.simbol.length > 0 && (
                    <div className="inv-chips">{data.simbol.map((s) => <button key={s} className="chip" style={{ ['--c' as any]: '#22c55e' }} disabled={busy} onClick={() => selidiki(s)}>{s}</button>)}</div>
                )}
                {err && <div className="error">{err}</div>}
            </section>

            {sk && (
                <section className="fin-card">
                    <h3>Seperti punya teman riset <small>klaim AI dinilai sendiri setelah N sesi</small></h3>
                    <div className="inv-score">
                        <div><b className="good">{sk.tepat}</b><span>tepat</span></div>
                        <div><b className="bad">{sk.meleset}</b><span>meleset</span></div>
                        <div><b>{sk.datar}</b><span>datar</span></div>
                        <div><b className="wait">{sk.menunggu}</b><span>menunggu</span></div>
                        <div><b>{dinilai ? `${Math.round((sk.tepat / dinilai) * 100)}%` : '–'}</b><span>akurasi</span></div>
                    </div>
                </section>
            )}

            {error && <div className="error">Gagal memuat: {error}</div>}
            {loading && !data && <div className="fin-empty">Memuat…</div>}
            {data && data.kasus.length === 0 && <div className="fin-empty">Belum ada kasus. Kasus otomatis muncul setelah bursa AS tutup (±04.00–05.00 WIB), atau selidiki saham di atas.</div>}
            {data?.kasus.map((k) => (
                <button key={k.id} className="inv-case" onClick={() => setOpen(k.id)}>
                    <div className="inv-case-top">
                        <b>{k.simbol}</b>
                        <span className={k.gerak.hariIni >= 0 ? 'up' : 'down'}>{k.gerak.hariIni >= 0 ? '▲' : '▼'} {pct(k.gerak.hariIni)}</span>
                        <small>${k.gerak.harga} · vol {k.gerak.volumeX}× · {k.tanggal}</small>
                        <span className={`inv-status ${k.status}`}>{k.status === 'usulan' ? 'Usulan' : k.status === 'diterima' ? 'Diterima' : 'Ditolak'}</span>
                    </div>
                    <div className="inv-case-sum">{k.ringkasan}</div>
                    <div className="inv-case-meta">
                        {k.hipotesis[0] && <span className={`kyk ${k.hipotesis[0].keyakinan}`}>Keyakinan {k.hipotesis[0].keyakinan}</span>}
                        <span>{k.bukti.length} bukti</span>
                        {k.hasil ? <span className={`hasil ${k.hasil.nilai}`}>{HASIL[k.hasil.nilai]}</span> : k.perkiraan !== 'tidak tahu' && <span>cek lagi {k.cekSesi} sesi</span>}
                    </div>
                </button>
            ))}
        </>
    );
}

function KasusDetail({ k, catatan, onBack, onChange }: { k: Kasus; catatan: string[]; onBack: () => void; onChange: () => void }) {
    const [alasan, setAlasan] = useState('');
    const [tolak, setTolak] = useState(false);
    const [err, setErr] = useState('');
    const bukti = (id: string) => k.bukti.find((b) => b.id === id);
    const up = k.gerak.hariIni >= 0;

    const putuskan = async (status: 'diterima' | 'ditolak') => {
        setErr('');
        try { await apiPost(`/api/kantor/investigasi/${encodeURIComponent(k.id)}/putuskan`, { status, alasan }); setTolak(false); onChange(); }
        catch (e: any) { setErr(String(e.message || e)); }
    };
    const Src = ({ ids }: { ids: string[] }) => <span className="inv-src">{ids.map((id) => <a key={id} href={`#bukti-${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`bukti-${k.id}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{id}</a>)}</span>;

    return (
        <>
            <button className="back" onClick={onBack}>‹ Semua kasus</button>
            <section className="inv-hero">
                <div className="inv-kicker">NYSE/NASDAQ · PENUTUPAN {k.tanggal}</div>
                <div className="inv-ticker">{k.simbol}</div>
                <div className="inv-price">${k.gerak.harga} <span className={up ? 'up' : 'down'}>{up ? '▲' : '▼'} {pct(k.gerak.hariIni)}</span></div>
                <div className="inv-sub">5 hari {pct(k.gerak.limaHari)} · volume {k.gerak.volumeX}× rata-rata · vs pasar {k.gerak.vsPasar >= 0 ? '+' : '−'}{Math.abs(k.gerak.vsPasar).toFixed(2)} poin</div>
                <p className="inv-summary">{k.ringkasan}</p>
            </section>

            {k.hipotesis.length > 0 && (
                <section className="fin-card">
                    <div className="inv-kicker">■ 01 — Peta sebab akibat</div>
                    <div className="inv-map-head"><span>01 Sumber</span><span>02 Mekanisme</span><span>03 Dampak</span></div>
                    {k.hipotesis.map((h, i) => (
                        <div key={i} className={`inv-map ${i === 0 ? 'main' : ''}`}>
                            <div className="inv-node">
                                <small>Sumber {h.sumber.length > 1 && `· +${h.sumber.length - 1}`}</small>
                                <b>{bukti(h.sumber[0])?.judul || h.teks}</b>
                                <span className="inv-node-foot">{k.simbol}<Src ids={h.sumber} /></span>
                            </div>
                            <i className="inv-arrow" />
                            <div className="inv-node">
                                <small>Mekanisme</small>
                                <b>{h.mekanisme || h.teks}</b>
                            </div>
                            <i className="inv-arrow" />
                            <div className="inv-node">
                                <small>Dampak bisnis</small>
                                <b>{h.dampak || '—'}</b>
                                <span className={`kyk ${h.keyakinan}`}>Keyakinan {h.keyakinan}</span>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            <section className="fin-card">
                <div className="inv-kicker">■ 02 — Setiap angka ada sumbernya</div>
                <div className="inv-nums">
                    {k.angka.map((a, i) => (
                        <div key={i}><b>{a.nilai}</b><span>{a.label}</span><small>↳ {a.sumber} · {bukti(a.sumber)?.judul.slice(0, 50)}</small></div>
                    ))}
                </div>
            </section>

            <section className="fin-card">
                <div className="inv-kicker">■ 02 — Plus bukti yang bisa mematahkannya</div>
                {k.hipotesis[0] && (
                    <div className="inv-hyp">
                        <div className="inv-hyp-top"><span>HIPOTESIS · URUTAN 1</span><span>KEYAKINAN {k.hipotesis[0].keyakinan.toUpperCase()}</span></div>
                        <b>{k.hipotesis[0].teks} → {k.hipotesis[0].mekanisme} → {k.hipotesis[0].dampak}</b>
                    </div>
                )}
                {k.penyangkal.map((p, i) => (
                    <div key={i} className="inv-counter">
                        <div className="inv-hyp-top"><span>BUKTI PENYANGKAL</span><Src ids={p.sumber} /></div>
                        <b>{p.teks}</b>
                    </div>
                ))}
                {k.penyangkal.length === 0 && <div className="fin-empty">Belum ada bukti penyangkal yang ditemukan.</div>}
                <div className="inv-check">
                    <div className="inv-hyp-top"><span>PERIKSA LAGI</span><span>{k.cekSesi} SESI</span></div>
                    <b>{k.hasil
                        ? `${HASIL[k.hasil.nilai]} — dicek ${k.hasil.dicek}: ${k.simbol} ${k.hasil.vsPasar >= 0 ? '+' : '−'}${Math.abs(k.hasil.vsPasar).toFixed(2)} poin vs pasar (perkiraan: ${k.perkiraan}).`
                        : k.perkiraan === 'tidak tahu' ? 'AI tidak berani memperkirakan arah; klaim ini tidak dinilai.' : `Perkiraan: gerakan ${k.perkiraan}. Dinilai otomatis setelah ${k.cekSesi} sesi bursa.`}</b>
                </div>
            </section>

            <section className="fin-card">
                <div className="inv-kicker">■ Bukti ({k.bukti.length})</div>
                {k.bukti.map((b) => (
                    <div key={b.id} id={`bukti-${k.id}-${b.id}`} className="inv-bukti">
                        <span className={`inv-bid ${b.jenis}`}>{b.id}</span>
                        <div className="fin-tx-main">
                            <b>{b.url ? <a href={b.url} target="_blank" rel="noreferrer">{b.judul}</a> : b.judul}</b>
                            <span>{JENIS[b.jenis]} · {b.tanggal}{b.isi && b.isi !== b.judul ? ` · ${b.isi}` : ''}</span>
                        </div>
                    </div>
                ))}
            </section>

            <section className={`fin-card inv-decide ${k.status}`}>
                <div className="inv-kicker">■ 04 — Kamu yang putuskan</div>
                {k.status === 'usulan' ? (
                    <>
                        <p className="inv-muted">Terima kalau penjelasannya masuk akal. Kalau ditolak, alasanmu dipakai AI agar tidak mengulang kesalahan yang sama.</p>
                        {!tolak ? (
                            <div className="row" style={{ gap: 8 }}>
                                <button className="btn primary" onClick={() => putuskan('diterima')}>Terima usulan</button>
                                <button className="btn" onClick={() => setTolak(true)}>Tolak…</button>
                            </div>
                        ) : (
                            <div className="row" style={{ gap: 8 }}>
                                <input className="input" style={{ flex: 1 }} placeholder="Alasan (wajib), mis. tidak material untuk saham ini" value={alasan} onChange={(e) => setAlasan(e.target.value)} autoFocus />
                                <button className="btn" disabled={alasan.trim().length < 3} onClick={() => putuskan('ditolak')}>Tolak</button>
                            </div>
                        )}
                    </>
                ) : <p className="inv-muted">{k.status === 'diterima' ? '✓ Diterima.' : `✗ Ditolak: ${k.alasan || '-'}`}</p>}
                {err && <div className="error">{err}</div>}
            </section>

            <Catatan simbol={k.simbol} list={catatan} onChange={onChange} />
            <Asisten k={k} />
        </>
    );
}

function Catatan({ simbol, list, onChange }: { simbol: string; list: string[]; onChange: () => void }) {
    const [t, setT] = useState('');
    const [err, setErr] = useState('');
    const kirim = async (body: any) => {
        setErr('');
        try { await apiPost('/api/kantor/investigasi/catatan', { simbol, ...body }); setT(''); onChange(); } catch (e: any) { setErr(String(e.message || e)); }
    };
    return (
        <section className="fin-card">
            <div className="inv-kicker">■ Ajari AI tentang {simbol}</div>
            <p className="inv-muted">Catatanmu dipakai sebagai konteks setiap kali {simbol} diselidiki. Mis. "Untuk {simbol}, saya selalu cek laporan penjualan iPhone dulu."</p>
            {list.map((c, i) => (
                <div key={i} className="inv-note"><span>{c}</span><button className="icon-btn" title="Hapus" onClick={() => kirim({ hapus: i })}>✕</button></div>
            ))}
            <form className="row" style={{ gap: 8, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (t.trim()) kirim({ teks: t }); }}>
                <input className="input" style={{ flex: 1 }} placeholder={`Yang ingin AI ketahui tentang ${simbol}…`} value={t} onChange={(e) => setT(e.target.value)} maxLength={500} />
                <button className="btn primary" disabled={!t.trim()}>Ajarkan</button>
            </form>
            {err && <div className="error">{err}</div>}
        </section>
    );
}

function Asisten({ k }: { k: Kasus }) {
    const [msgs, setMsgs] = useState<Array<{ dari: 'saya' | 'ai'; teks: string }>>([]);
    const [t, setT] = useState('');
    const [busy, setBusy] = useState(false);
    const saran = [`Kenapa ${k.simbol} masuk daftar hari ini?`, 'Apa bukti terkuat dan terlemahnya?', 'Data apa yang masih kosong?'];
    const tanya = async (q: string) => {
        if (!q.trim() || busy) return;
        const riwayat = msgs;
        setMsgs((m) => [...m, { dari: 'saya', teks: q }]); setT(''); setBusy(true);
        try {
            const r = await apiPost<{ jawaban: string }>(`/api/kantor/investigasi/${encodeURIComponent(k.id)}/tanya`, { pertanyaan: q, riwayat });
            setMsgs((m) => [...m, { dari: 'ai', teks: r.jawaban }]);
        } catch (e: any) { setMsgs((m) => [...m, { dari: 'ai', teks: `⚠️ ${e.message || e}` }]); }
        setBusy(false);
    };
    return (
        <section className="fin-card">
            <div className="inv-kicker">■ 03 — Tanya asistennya</div>
            <div className="inv-chat">
                {msgs.length === 0 && <div className="inv-muted">Jawaban hanya dari bukti kasus ini, dengan id sumber. Asisten tidak menilai beli/jual.</div>}
                {msgs.map((m, i) => <div key={i} className={`wa-bubble ${m.dari === 'saya' ? 'me' : 'them'}`}><div className="wa-text">{m.dari === 'saya' ? m.teks : <RichText text={m.teks} />}</div></div>)}
                {busy && <div className="wa-bubble them typing"><span className="dots"><i /><i /><i /></span></div>}
            </div>
            <div className="inv-chips">{saran.map((s) => <button key={s} className="chip" style={{ ['--c' as any]: '#94a3b8' }} disabled={busy} onClick={() => tanya(s)}>{s}</button>)}</div>
            <form className="row" style={{ gap: 8, marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); tanya(t); }}>
                <input className="input" style={{ flex: 1 }} placeholder="Tanya bukti atau dampak…" value={t} onChange={(e) => setT(e.target.value)} />
                <button className="btn primary" disabled={busy || !t.trim()}>Tanya</button>
            </form>
        </section>
    );
}
