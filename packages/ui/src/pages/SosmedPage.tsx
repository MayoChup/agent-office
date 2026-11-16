import React, { useEffect, useRef, useState } from 'react';
import { useApi } from '../kantor/api';
import { apiPost, serverBase, tokenLogin } from '../kantor/connection';
import { useSubNav } from '../kantor/subnav';
import { useInterval } from '../kantor/aktif';

type Status = 'rencana' | 'naskah' | 'prompt' | 'aset' | 'mengunggah' | 'terbit' | 'manual' | 'gagal';
interface Adegan { no: number; detik: string; visual: string; teksLayar: string; narasi: string }
interface Konten { id: string; tgl: string; pilar: string; format: 'reel' | 'carousel' | 'story'; judul: string; sudut: string; tujuan: string; hook?: string; hookLain?: string[]; naskah?: string; storyboard?: Adegan[]; caption?: string; hashtag?: string[]; ajakan?: string; promptVideo?: string; promptSuara?: { teks: string; gaya: string; pengaturan: string }; musik?: string; sampul?: string; status: Status; aset?: { path: string; nama: string } | null; ig?: { tautan?: string } | null; galat?: string }
interface Profil { akun: string; topik: string; audiens: string; tujuan: string; gaya: string; bahasa: string; perMinggu: number; format: string[]; durasi: number; suara: string; catatan: string }
interface Strategi { at: number; niche: string; alasan: string; audiens: string; janji: string; ritme: string; pilar: Array<{ nama: string; tujuan: string; porsi: number; contoh: string[] }>; opsiNiche?: Array<{ niche: string; alasan: string }> }
interface Data { profil: Profil; strategi: Strategi | null; tren: { at: number; teks: string } | null; hariIni: Konten[]; besok: Konten[]; mendatang: Konten[]; lalu: Konten[]; hari: string; sibuk: string; siap: boolean; tim: Array<{ id: string; nama: string; ada: boolean }>; ig: boolean }

const TAB = [{ k: 'hari', ico: '🎬', label: 'Hari ini' }, { k: 'kalender', ico: '🗓️', label: 'Rencana' }, { k: 'strategi', ico: '🧭', label: 'Strategi' }, { k: 'akun', ico: '⚙️', label: 'Akun & tim' }];
const LS = 'kantor:sosmed-tab';
const LANGKAH: Array<{ s: Status[]; label: string }> = [{ s: ['rencana'], label: 'Ide' }, { s: ['naskah'], label: 'Naskah' }, { s: ['prompt'], label: 'Prompt siap' }, { s: ['aset', 'manual', 'mengunggah', 'gagal'], label: 'Berkas masuk' }, { s: ['terbit'], label: 'Terbit' }];
const SIBUK: Record<string, string> = { strategi: 'Tara & Maya sedang menyusun strategi…', rencana: 'Maya sedang menyusun rencana 7 hari…', naskah: 'Lala menulis naskah, lalu Vino menyiapkan prompt…', harian: 'Tim sedang menyiapkan konten hari ini & besok…' };
const tglId = (t: string) => new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const FORMAT: Record<string, string> = { reel: '🎞️ Reel', carousel: '🖼️ Carousel', story: '⭕ Story' };

function Salin({ teks, label = 'Salin' }: { teks: string; label?: string }) {
    const [ok, setOk] = useState(false);
    return <button className="btn small" onClick={() => { navigator.clipboard?.writeText(teks).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }).catch(() => undefined); }}>{ok ? '✓ Tersalin' : `📋 ${label}`}</button>;
}

/** Divisi Social Media: tim AI memikirkan (strategi, rencana, naskah, prompt); Pak Rico produksi; unggah setelah "Setujui". */
export function SosmedPage() {
    const [tab, setTabS] = useState(() => { try { return localStorage.getItem(LS) || 'hari'; } catch { return 'hari'; } });
    const setTab = (k: string) => { setTabS(k); try { localStorage.setItem(LS, k); } catch { /* */ } };
    useSubNav(TAB, tab, setTab);
    const d = useApi<Data>('/api/kantor/sosmed', 60_000);
    const [msg, setMsg] = useState('');
    const [buka, setBuka] = useState<string | null>(null);
    useInterval(() => d.reload(), d.data?.sibuk || [...(d.data?.hariIni || []), ...(d.data?.besok || [])].some((k) => k.status === 'mengunggah') ? 5000 : null);
    const kabar = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 7000); };
    const aksi = (p: Promise<any>, ok?: string) => p.then(() => { if (ok) kabar(ok); d.reload(); }).catch((e) => kabar(String(e.message || e)));
    const jalankan = (jenis: string) => aksi(apiPost('/api/kantor/sosmed/jalankan', { jenis }), 'Sedang dikerjakan tim — perkembangannya juga terlihat di Kantor → Papan kerja.');
    const x = d.data;
    if (!x) return <div className="pg sm"><section className="sb-card">{d.error ? <div className="error">{d.error}</div> : <div className="pg-skel" style={{ height: 200 }} />}</section></div>;
    const timAda = x.tim.filter((t) => t.ada).length;
    const kartu = (k: Konten) => <KartuKonten key={k.id} k={k} buka={buka === k.id} onBuka={() => setBuka(buka === k.id ? null : k.id)} ig={x.ig} sibuk={!!x.sibuk} aksi={aksi} kabar={kabar} />;

    return (
        <div className="pg sm">
            <div className="pg-head"><div><h2>Konten</h2><p>Tim social media menyiapkan ide, naskah, dan prompt. Bapak membuat video & suaranya, lalu tinggal Setujui untuk diunggah.</p></div></div>
            <div className="tabs sm-tabs">{TAB.map((t) => <button key={t.k} className={`tab ${tab === t.k ? 'active' : ''}`} onClick={() => setTab(t.k)}>{t.ico} {t.label}</button>)}</div>
            {msg && <div className="fin-alert">{msg}</div>}
            {x.sibuk && <div className="hz-bukti ok"><span className="pk-jalan"><i /></span><span>{SIBUK[x.sibuk] || 'Tim sedang bekerja…'}</span></div>}
            {!x.siap && tab !== 'akun' && (
                <section className="sb-card sm-mulai">
                    <h3>Mulai dari sini</h3>
                    <ol>
                        <li><b>Bentuk timnya</b> ({timAda}/5 anggota ada) dan isi <b>profil akun</b> di tab "Akun & tim". Topik boleh dikosongkan — tim akan mengusulkan niche.</li>
                        <li>Tekan <b>Susun strategi</b>: Tara meriset tren, Maya menentukan niche & pilar konten.</li>
                        <li>Tekan <b>Susun rencana 7 hari</b>. Setelah itu tiap pagi tim otomatis menyiapkan naskah + prompt untuk hari itu dan besoknya.</li>
                    </ol>
                    <button className="btn primary" onClick={() => setTab('akun')}>Buka Akun & tim</button>
                </section>
            )}

            {tab === 'hari' && x.siap && (<>
                <section className="sb-card sm-hari">
                    <div className="sd-h"><h3>Hari ini <small>{tglId(x.hari)}</small></h3><button className="btn small" disabled={!!x.sibuk} onClick={() => jalankan('harian')}>↻ Siapkan sekarang</button></div>
                    {!x.hariIni.length && <div className="fin-empty">Tidak ada jadwal unggah hari ini. {x.besok.length ? 'Konten besok ada di bawah.' : 'Susun rencana di tab Rencana.'}</div>}
                    {x.hariIni.map(kartu)}
                </section>
                {x.besok.length > 0 && <section className="sb-card"><div className="sd-h"><h3>Besok <small>disiapkan lebih awal</small></h3></div>{x.besok.map(kartu)}</section>}
                <Balas kabar={kabar} />
            </>)}

            {tab === 'kalender' && x.siap && (<>
                <section className="sb-card">
                    <div className="sd-h"><h3>Rencana konten <small>{x.profil.perMinggu} konten/minggu</small></h3><button className="btn small primary" disabled={!!x.sibuk} onClick={() => jalankan('rencana')}>Susun rencana 7 hari</button></div>
                    <p className="sb-note">Maya mengisi hari yang masih kosong mulai hari ini, mengikuti porsi pilar. Hari yang sudah terisi tidak ditimpa.</p>
                    <IdeBaru pilar={x.strategi?.pilar.map((p) => p.nama) || []} hari={x.hari} aksi={aksi} />
                    {[...x.hariIni, ...x.besok, ...x.mendatang].map(kartu)}
                    {![...x.hariIni, ...x.besok, ...x.mendatang].length && <div className="fin-empty">Belum ada rencana.</div>}
                </section>
                {x.lalu.length > 0 && <section className="sb-card"><div className="sd-h"><h3>Sudah lewat <small>{x.lalu.length}</small></h3></div>{x.lalu.map(kartu)}</section>}
            </>)}

            {tab === 'strategi' && (
                <section className="sb-card sm-strategi">
                    <div className="sd-h"><h3>Niche & pilar konten</h3><button className="btn small primary" disabled={!!x.sibuk} onClick={() => jalankan('strategi')}>{x.strategi ? 'Susun ulang strategi' : 'Susun strategi'}</button></div>
                    {!x.strategi && <div className="fin-empty">Belum ada strategi. Tekan tombol di atas — Tara meriset tren, lalu Maya menentukan niche dan pilar konten.</div>}
                    {x.strategi && (<>
                        <div className="sm-niche"><small>Niche</small><b>{x.strategi.niche}</b><p>{x.strategi.alasan}</p></div>
                        <div className="sm-dua"><div><small>Penonton</small><p>{x.strategi.audiens}</p></div><div><small>Janji ke pengikut</small><p>{x.strategi.janji}</p></div><div><small>Ritme unggah</small><p>{x.strategi.ritme || '-'}</p></div></div>
                        <div className="sm-pilar-bar">{x.strategi.pilar.map((p, i) => <i key={p.nama} style={{ width: `${p.porsi}%`, opacity: 1 - i * 0.15 }} title={`${p.nama} ${p.porsi}%`} />)}</div>
                        <div className="sm-pilar">{x.strategi.pilar.map((p) => (
                            <div key={p.nama}><div className="sm-pilar-h"><b>{p.nama}</b><span className="mono">{p.porsi}%</span></div><p>{p.tujuan}</p>{p.contoh.length > 0 && <ul>{p.contoh.map((c) => <li key={c}>{c}</li>)}</ul>}</div>
                        ))}</div>
                        {!!x.strategi.opsiNiche?.length && <div className="sm-opsi"><small>Alternatif niche (kalau mau ganti, tulis di Profil akun → Topik, lalu susun ulang)</small>{x.strategi.opsiNiche.map((o) => <p key={o.niche}><b>{o.niche}</b> — {o.alasan}</p>)}</div>}
                    </>)}
                    {x.tren && <details className="sm-tren"><summary>Riset tren Tara ({new Date(x.tren.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})</summary><p>{x.tren.teks}</p></details>}
                    <p className="sb-note">Strategi disusun AI dari profil akun dan riset yang bisa dijangkaunya; angka jangkauan tidak dijamin. Ubah profil lalu susun ulang kapan saja.</p>
                </section>
            )}

            {tab === 'akun' && <Akun x={x} aksi={aksi} kabar={kabar} muat={() => d.reload()} />}
        </div>
    );
}

function KartuKonten({ k, buka, onBuka, ig, sibuk, aksi, kabar }: { k: Konten; buka: boolean; onBuka: () => void; ig: boolean; sibuk: boolean; aksi: (p: Promise<any>, ok?: string) => void; kabar: (m: string) => void }) {
    const langkah = Math.max(0, LANGKAH.findIndex((l) => l.s.includes(k.status)));
    const input = useRef<HTMLInputElement>(null);
    const [naik, setNaik] = useState<number | null>(null);
    const url = (a: string) => `/api/kantor/sosmed/konten/${k.id}/${a}`;
    const captionPenuh = [k.caption || '', k.ajakan && !(k.caption || '').includes(k.ajakan) ? k.ajakan : '', (k.hashtag || []).join(' ')].filter(Boolean).join('\n\n');
    const unggah = async (f: File) => {
        try {
            const { folder } = await apiPost<{ folder: string }>(url('folder'), {});
            setNaik(0);
            const r: any = await new Promise((ok, gagal) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `${serverBase()}/api/kantor/berkas/unggah?p=${encodeURIComponent(folder)}&nama=${encodeURIComponent(f.name)}&ukuran=${f.size}`);
                xhr.setRequestHeader('Authorization', `Bearer ${tokenLogin()}`); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
                xhr.upload.onprogress = (e) => { if (e.lengthComputable) setNaik(Math.round((e.loaded / e.total) * 100)); };
                xhr.onload = () => { let j: any = {}; try { j = JSON.parse(xhr.responseText); } catch { /* */ } xhr.status < 300 ? ok(j) : gagal(new Error(j.error || `HTTP ${xhr.status}`)); };
                xhr.onerror = () => gagal(new Error('Koneksi terputus')); xhr.send(f);
            });
            aksi(apiPost(url('aset'), { path: r.path }), '✓ Berkas tersimpan di cloud VPS (Berkas → Sosmed). Periksa caption, lalu tekan Setujui.');
        } catch (e: any) { kabar(String(e.message || e)); } finally { setNaik(null); }
    };
    return (
        <article className={`sm-k ${buka ? 'buka' : ''} st-${k.status}`}>
            <button className="sm-k-h" onClick={onBuka} aria-expanded={buka}>
                <div className="sm-k-atas"><span className="sm-fmt">{FORMAT[k.format]}</span><span className="sm-pil">{k.pilar}</span><small>{tglId(k.tgl)}</small></div>
                <b>{k.judul}</b>
                {k.hook && <em>"{k.hook}"</em>}
                <div className="sm-langkah">{LANGKAH.map((l, i) => <span key={l.label} className={i < langkah ? 'lewat' : i === langkah ? 'kini' : ''}>{l.label}</span>)}</div>
            </button>
            {k.galat && <div className="error">Terkendala: {k.galat}</div>}
            {buka && (
                <div className="sm-isi">
                    {k.sudut && <p className="sm-sudut"><b>Sudut:</b> {k.sudut}{k.tujuan ? ` · ${k.tujuan}` : ''}</p>}
                    {k.status === 'rencana' && <div className="sm-aksi"><button className="btn primary" disabled={sibuk} onClick={() => aksi(apiPost(url('kembangkan'), {}), 'Lala menulis naskah, lalu Vino menyiapkan prompt (±2–5 menit).')}>Buat naskah & prompt sekarang</button></div>}

                    {k.promptVideo && (
                        <section className="sm-blok utama">
                            <div className="sm-blok-h"><b>1 · Prompt video</b><Salin teks={k.promptVideo} label="Salin prompt video" /></div>
                            <pre>{k.promptVideo}</pre>
                        </section>
                    )}
                    {k.promptSuara && (
                        <section className="sm-blok utama">
                            <div className="sm-blok-h"><b>2 · Prompt suara ElevenLabs</b><Salin teks={k.promptSuara.teks} label="Salin teks + tag ekspresi" /></div>
                            <pre>{k.promptSuara.teks}</pre>
                            <div className="sm-suara"><div><small>Karakter suara</small><p>{k.promptSuara.gaya}</p></div><div><small>Pengaturan</small><p>{k.promptSuara.pengaturan}</p></div></div>
                            <small className="sb-note">Tag dalam kurung siku (mis. [excited]) adalah tag ekspresi ElevenLabs v3 — tempel apa adanya.</small>
                        </section>
                    )}
                    {(k.promptVideo || k.aset) && (
                        <section className="sm-blok utama">
                            <div className="sm-blok-h"><b>3 · Taruh hasil & setujui</b></div>
                            {k.aset ? <p className="sm-aset">📁 {k.aset.nama} <small>tersimpan di Berkas → Sosmed</small></p> : <p className="sb-note">Setelah video jadi, unggah di sini. Berkasnya tersimpan di cloud VPS Bapak.</p>}
                            <input ref={input} type="file" accept="video/mp4,video/quicktime,image/jpeg,image/png" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) unggah(f); e.target.value = ''; }} />
                            <div className="sm-aksi">
                                {k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn" disabled={naik != null} onClick={() => input.current?.click()}>{naik != null ? `Mengunggah ${naik}%…` : k.aset ? '↻ Ganti berkas' : '⬆️ Unggah video / gambar'}</button>}
                                {(k.status === 'aset' || k.status === 'gagal' || k.status === 'manual') && k.aset && <button className="btn primary" onClick={() => { if (confirm(ig ? `Unggah "${k.judul}" ke Instagram sekarang, beserta captionnya?` : `Instagram belum tersambung. Tandai "${k.judul}" siap diunggah manual?`)) aksi(apiPost(url('setujui'), {}), ig ? 'Disetujui — sedang diunggah ke Instagram.' : 'Siap diunggah manual: salin caption di bawah.'); }}>✓ Setujui{ig ? ' & unggah' : ''}</button>}
                                {k.status === 'mengunggah' && <span className="pk-jalan"><i /> sedang diunggah ke Instagram…</span>}
                                {k.status === 'terbit' && <span className="sm-terbit">✅ Terbit{k.ig?.tautan && <> · <a href={k.ig.tautan} target="_blank" rel="noreferrer">lihat di Instagram</a></>}</span>}
                            </div>
                            {k.status === 'manual' && <p className="sb-note">Instagram belum tersambung ke kantor, jadi unggah manual: unduh berkas dari menu Berkas → Sosmed, lalu tempel caption di bawah.</p>}
                        </section>
                    )}
                    {k.caption != null && (
                        <section className="sm-blok">
                            <div className="sm-blok-h"><b>Caption</b><Salin teks={captionPenuh} label="Salin caption + hashtag" /></div>
                            <EditTeks nilai={k.caption} baris={5} onSimpan={(v) => aksi(apiPost(url('ubah'), { caption: v }), 'Caption disimpan.')} />
                            {!!k.hashtag?.length && <p className="sm-tag">{k.hashtag.join(' ')}</p>}
                            {k.ajakan && <p className="sb-note">Ajakan: {k.ajakan}</p>}
                        </section>
                    )}
                    {!!k.storyboard?.length && (
                        <details className="sm-blok"><summary><b>Storyboard</b> · {k.storyboard.length} adegan</summary>
                            <table className="um-t sm-sb"><thead><tr><th>#</th><th>Detik</th><th>Visual</th><th>Teks di layar</th><th>Narasi</th></tr></thead>
                                <tbody>{k.storyboard.map((a) => <tr key={a.no}><td>{a.no}</td><td className="mono">{a.detik}</td><td>{a.visual}</td><td>{a.teksLayar}</td><td>{a.narasi}</td></tr>)}</tbody></table>
                            {(k.sampul || k.musik) && <p className="sb-note">{k.sampul ? `Sampul: ${k.sampul}. ` : ''}{k.musik ? `Musik: ${k.musik}.` : ''}</p>}
                        </details>
                    )}
                    {k.naskah && <details className="sm-blok"><summary><b>Naskah</b>{!!k.hookLain?.length && ` · ${k.hookLain.length} hook cadangan`}</summary><pre>{k.naskah}</pre>{!!k.hookLain?.length && <ul className="sm-hook">{k.hookLain.map((h) => <li key={h}>{h}</li>)}</ul>}</details>}
                    <div className="sm-aksi kecil">
                        {k.status !== 'rencana' && k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn small" disabled={sibuk} onClick={() => { if (confirm('Tulis ulang naskah & prompt dari awal?')) aksi(apiPost(url('kembangkan'), { ulang: true }), 'Sedang ditulis ulang.'); }}>↻ Tulis ulang</button>}
                        {k.status !== 'terbit' && k.status !== 'mengunggah' && <button className="btn small" onClick={() => { if (confirm(`Hapus "${k.judul}" dari rencana?`)) aksi(apiPost(url('hapus'), {}), 'Dihapus dari rencana.'); }}>🗑 Hapus</button>}
                    </div>
                </div>
            )}
        </article>
    );
}
function EditTeks({ nilai, baris, onSimpan }: { nilai: string; baris: number; onSimpan: (v: string) => void }) {
    const [v, setV] = useState(nilai);
    useEffect(() => setV(nilai), [nilai]);
    return <div className="sm-edit"><textarea value={v} rows={baris} onChange={(e) => setV(e.target.value)} />{v !== nilai && <button className="btn small primary" onClick={() => onSimpan(v)}>Simpan perubahan</button>}</div>;
}
function IdeBaru({ pilar, hari, aksi }: { pilar: string[]; hari: string; aksi: (p: Promise<any>, ok?: string) => void }) {
    const [f, setF] = useState({ judul: '', tgl: hari, format: 'reel', pilar: pilar[0] || '' });
    return (
        <form className="sm-ide" onSubmit={(e) => { e.preventDefault(); if (!f.judul.trim()) return; aksi(apiPost('/api/kantor/sosmed/konten', f), 'Ide ditambahkan ke rencana.'); setF({ ...f, judul: '' }); }}>
            <input placeholder="Punya ide sendiri? Tulis di sini…" value={f.judul} maxLength={90} onChange={(e) => setF({ ...f, judul: e.target.value })} />
            <input type="date" value={f.tgl} min={hari} onChange={(e) => setF({ ...f, tgl: e.target.value })} aria-label="Tanggal unggah" />
            <select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })} aria-label="Format"><option value="reel">Reel</option><option value="carousel">Carousel</option><option value="story">Story</option></select>
            {pilar.length > 0 && <select value={f.pilar} onChange={(e) => setF({ ...f, pilar: e.target.value })} aria-label="Pilar">{pilar.map((p) => <option key={p}>{p}</option>)}</select>}
            <button className="btn">Tambah</button>
        </form>
    );
}
function Balas({ kabar }: { kabar: (m: string) => void }) {
    const [t, setT] = useState(''); const [draf, setDraf] = useState(''); const [tunggu, setTunggu] = useState(false);
    return (
        <section className="sb-card">
            <div className="sd-h"><h3>Balas komentar & DM <small>draf oleh Dea</small></h3></div>
            <p className="sb-note">Tempel komentar atau DM dari Instagram; Dea menyiapkan draf balasannya untuk Bapak salin. Tidak ada yang dikirim otomatis.</p>
            <div className="sm-edit"><textarea rows={3} placeholder="Tempel komentar / DM di sini…" value={t} onChange={(e) => setT(e.target.value)} />
                <button className="btn" disabled={!t.trim() || tunggu} onClick={() => { setTunggu(true); apiPost<{ draf: string }>('/api/kantor/sosmed/balas', { komentar: t }).then((r) => setDraf(r.draf)).catch((e) => kabar(String(e.message || e))).finally(() => setTunggu(false)); }}>{tunggu ? 'Dea sedang menulis…' : 'Buatkan draf balasan'}</button></div>
            {draf && <div className="sm-blok"><div className="sm-blok-h"><b>Draf balasan</b><Salin teks={draf} /></div><pre>{draf}</pre></div>}
        </section>
    );
}
function Akun({ x, aksi, kabar, muat }: { x: Data; aksi: (p: Promise<any>, ok?: string) => void; kabar: (m: string) => void; muat: () => void }) {
    const [p, setP] = useState<Profil>(x.profil);
    const [pasang, setPasang] = useState(false);
    const set = (k: keyof Profil) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP({ ...p, [k]: e.target.value });
    const kurang = x.tim.filter((t) => !t.ada);
    return (<>
        <section className="sb-card">
            <div className="sd-h"><h3>Tim social media <small>{x.tim.length - kurang.length}/5 anggota</small></h3></div>
            <div className="sm-tim">{x.tim.map((t) => <span key={t.id} className={t.ada ? 'ada' : ''}>{t.ada ? '●' : '○'} {t.nama}</span>)}</div>
            {kurang.length > 0 && (<>
                <p className="sb-note">Anggota yang belum ada dibuat sekali di VPS (beserta 13 skill Instagram sumber terbuka yang dibagi per peran). Sebelum itu, pekerjaan mereka dikerjakan otak AI kantor.</p>
                <button className="btn primary" disabled={pasang} onClick={() => { setPasang(true); apiPost('/api/kantor/sosmed/pasang', {}).then(() => { kabar('✓ Divisi Social Media terbentuk. Anggotanya muncul di kantor dalam ±1 menit.'); setTimeout(muat, 1500); }).catch((e) => kabar(String(e.message || e))).finally(() => setPasang(false)); }}>{pasang ? 'Sedang membentuk tim…' : 'Bentuk Divisi Social Media'}</button>
            </>)}
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Profil akun <small>dibaca semua anggota tim</small></h3></div>
            <div className="sm-form">
                <label>Nama akun Instagram<input value={p.akun} placeholder="@namaakun" onChange={set('akun')} /></label>
                <label>Bahasa konten<input value={p.bahasa} onChange={set('bahasa')} /></label>
                <label className="lebar">Topik / niche <small>kosongkan kalau mau tim yang mengusulkan</small><input value={p.topik} placeholder="mis. AI praktis untuk pemilik usaha kecil" onChange={set('topik')} /></label>
                <label className="lebar">Siapa penontonnya<input value={p.audiens} placeholder="mis. pemilik UMKM 25–40 tahun yang gaptek" onChange={set('audiens')} /></label>
                <label className="lebar">Tujuan akun<input value={p.tujuan} placeholder="mis. bangun kepercayaan lalu jual kelas / jasa" onChange={set('tujuan')} /></label>
                <label className="lebar">Gaya bicara<textarea rows={2} value={p.gaya} placeholder="mis. santai, to the point, sedikit humor, pakai 'kamu'" onChange={set('gaya')} /></label>
                <label className="lebar">Karakter suara narasi (untuk prompt ElevenLabs)<input value={p.suara} placeholder="mis. pria 30-an, hangat, tempo sedang, logat Jakarta" onChange={set('suara')} /></label>
                <label>Konten per minggu<input type="number" min={1} max={14} value={p.perMinggu} onChange={(e) => setP({ ...p, perMinggu: +e.target.value })} /></label>
                <label>Durasi reel (detik)<input type="number" min={10} max={90} value={p.durasi} onChange={(e) => setP({ ...p, durasi: +e.target.value })} /></label>
                <div className="lebar sm-cek"><small>Format</small>{['reel', 'carousel', 'story'].map((f) => <label key={f}><input type="checkbox" checked={p.format.includes(f)} onChange={(e) => setP({ ...p, format: e.target.checked ? [...p.format, f] : p.format.filter((y) => y !== f) })} /> {FORMAT[f]}</label>)}</div>
                <label className="lebar">Catatan lain untuk tim<textarea rows={2} value={p.catatan} placeholder="hal yang harus dihindari, produk yang dijual, contoh akun panutan, dll." onChange={set('catatan')} /></label>
            </div>
            <button className="btn primary" onClick={() => aksi(apiPost('/api/kantor/sosmed/profil', p), '✓ Profil akun disimpan. Lanjut: tab Strategi → Susun strategi.')}>Simpan profil</button>
        </section>
        <section className="sb-card">
            <div className="sd-h"><h3>Sambungan Instagram <small>{x.ig ? 'tersambung' : 'belum tersambung'}</small></h3></div>
            {x.ig ? <p className="sb-note">✅ Kantor bisa mengunggah Reel/gambar setelah Bapak menekan Setujui di tiap konten. Tanpa Setujui, tidak ada yang diunggah.</p> : (<>
                <p className="sb-note">Tanpa sambungan, alurnya tetap jalan sampai "siap diunggah": Bapak tinggal unduh berkas dan tempel caption. Supaya kantor bisa mengunggah sendiri setelah Bapak Setujui, perlu sambungan resmi Instagram (Meta):</p>
                <ol className="sm-ol"><li>Akun Instagram harus jenis <b>Profesional</b> (Bisnis/Kreator).</li><li>Buat aplikasi di Meta for Developers dan ambil <b>ID akun Instagram</b> serta <b>token akses jangka panjang</b> dengan izin menerbitkan konten.</li><li>Simpan keduanya di VPS sebagai <code>INSTAGRAM_USER_ID</code> dan <code>INSTAGRAM_TOKEN</code> pada berkas <code>.env</code> kantor, lalu mulai ulang kantor. Jangan kirim token lewat chat.</li></ol>
            </>)}
        </section>
    </>);
}
