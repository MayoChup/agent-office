import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiBlob, apiPost, serverBase, tokenLogin } from '../../kantor/connection';
import { useInterval } from '../../kantor/aktif';
import { Ikon } from '../../components/Ikon';
import { konfirmasi } from '../../components/Konfirmasi';

/**
 * Studio konten: Gudang aset per akun, brand kit, galeri 12 gaya desain, gambar AI atas perintah,
 * desain carousel otomatis, dan "Kirim ke Claude" (teks + paket aset).
 */
export interface ItemGudang { id: string; jenis: string; nama: string; ket: string; sumber: 'unggah' | 'ai' | 'kantor'; at: number; label: 'menunggu' | 'ok' | 'gagal'; calon?: string; galat?: string; path: string }
export interface SaranAset { id: string; jenis: string; nama: string; prompt: string; alasan: string; pengganti?: string; acuan?: string[]; status: 'saran' | 'dibuat' | 'pakai' | 'lewati'; hasil?: string }
interface Brand { warna: string[]; fontJudul: string; fontIsi: string; gayaDesain: string; aksenMerek: boolean; logoId?: string; at: number; sementara?: boolean; palet?: number }
interface Usulan { at: number; warna: string[]; fontJudul: string; fontIsi: string; gayaDesain: string; alasan: string; logo: unknown[]; highlight: string[]; palet?: Array<{ nama: string }> }
interface Kerja { id: string; jenis: string; judul: string; status: 'jalan' | 'selesai' | 'gagal'; galat?: string; at: number; usd?: number; batch?: string; konten?: string }
interface GayaD { id: string; nama: string; nuansa: string; cocok: string; gelap: boolean; judul: string; isi: string; warna: string[] }
export interface DataGudang {
    item: ItemGudang[]; brand: Brand | null; usulan: Usulan | null; kerja: Kerja[]; jenis: Array<{ id: string; nama: string }>;
    gambarAi: { ada: boolean; batasHari: number; terpakaiHari: number; batasOtomatis: number; terpakaiOtomatis: number; terpakaiBulan: number; jumlah: number; model: string; perkiraan: { standar: number; tinggi: number } };
    desain: { siap: boolean; pesan: string }; gaya: GayaD[]; font: string[]; claude: { aktif: boolean; carouselHari: number; batasHari: number } | null;
}
/** Bagian konten yang dipakai studio. */
export interface KontenStudio {
    id: string; kode?: string; judul: string; format: string; status: string; hook?: string; slide?: Array<{ no: number; judul: string; isi: string; visual: string; aset?: string }>;
    hiasan?: 'otomatis' | 'sedikit' | 'tanpa'; pakaiAset?: string[]; saranAset?: SaranAset[]; desain?: { gaya: string; oleh: 'templat' | 'claude'; at: number; catatan?: string } | null;
    promptEdit?: string; promptVideo?: string; rekam?: string; promptSuara?: unknown; gayaId?: string; aset?: { path: string } | null;
}

const VIDEO = (f: string) => f === 'reel' || f === 'story' || f === 'video';
const q = (akun: string) => `akun=${encodeURIComponent(akun)}`;
const post = <T = any,>(akun: string, p: string, body: unknown) => apiPost<T>(`${p}${p.includes('?') ? '&' : '?'}${q(akun)}`, body);
const usd = (n: number) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;
const rupiah = (n: number) => `±Rp${Math.round((n * 16500) / 100) * 100 >= 1000 ? `${(Math.round((n * 16500) / 100) * 100 / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })}rb` : Math.max(100, Math.round((n * 16500) / 100) * 100)}`;

function unggahBerkas(folder: string, f: File, onPct: (n: number) => void): Promise<{ path: string }> {
    return new Promise((ok, gagal) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${serverBase()}/api/kantor/berkas/unggah?p=${encodeURIComponent(folder)}&nama=${encodeURIComponent(f.name)}&ukuran=${f.size}`);
        xhr.setRequestHeader('Authorization', `Bearer ${tokenLogin()}`); xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => { let j: any = {}; try { j = JSON.parse(xhr.responseText); } catch { /* */ } if (xhr.status < 300) ok(j); else gagal(new Error(j.error || `HTTP ${xhr.status}`)); };
        xhr.onerror = () => gagal(new Error('Koneksi terputus')); xhr.send(f);
    });
}
function Salin({ teks, label = 'Salin', utama }: { teks: string; label?: string; utama?: boolean }) {
    const [ok, setOk] = useState(false);
    return <button className={`btn small ${utama ? 'primary' : ''}`} onClick={() => { navigator.clipboard?.writeText(teks).then(() => { setOk(true); setTimeout(() => setOk(false), 1600); }).catch(() => undefined); }}>{ok ? '✓ Tersalin' : <><Ikon e="📋" /> {label}</>}</button>;
}

/* ── Thumbnail aset (butuh login → blob) ── */
const petaThumb = new Map<string, string>();
function Thumb({ akun, id, alt, besar }: { akun: string; id: string; alt: string; besar?: boolean }) {
    const kunci = `${akun}:${id}`;
    const [src, setSrc] = useState(petaThumb.get(kunci) || '');
    useEffect(() => {
        if (petaThumb.has(kunci)) { setSrc(petaThumb.get(kunci)!); return; }
        let batal = false;
        apiBlob(`/api/kantor/sosmed/gudang/thumb/${id}?${q(akun)}`).then((b) => { const u = URL.createObjectURL(b); petaThumb.set(kunci, u); if (!batal) setSrc(u); }).catch(() => undefined);
        return () => { batal = true; };
    }, [kunci]); // eslint-disable-line react-hooks/exhaustive-deps
    return src ? <img className={`gd-img ${besar ? 'besar' : ''}`} src={src} alt={alt} loading="lazy" /> : <span className={`gd-img kosong ${besar ? 'besar' : ''}`} aria-label={alt} />;
}

/* ── Form membuat aset baru dengan AI (hanya jalan saat ditekan) ── */
export interface IsiBuat { jenis: string; nama: string; prompt: string; acuan: string[]; saran?: { konten: string; id: string }; transparan?: boolean }
function FormBuat({ akun, g, awal, tutup, selesai, kabar }: { akun: string; g: DataGudang; awal?: Partial<IsiBuat>; tutup: () => void; selesai: () => void; kabar: (m: string) => void }) {
    const [f, setF] = useState<IsiBuat>({ jenis: awal?.jenis || 'maskot', nama: awal?.nama || '', prompt: awal?.prompt || '', acuan: awal?.acuan || [], saran: awal?.saran, transparan: awal?.transparan ?? ['maskot', 'produk', 'ikon', 'logo'].includes(awal?.jenis || 'maskot') });
    const [n, setN] = useState(3), [tinggi, setTinggi] = useState(false), [kirim, setKirim] = useState(false);
    const ai = g.gambarAi, biaya = n * (tinggi ? ai.perkiraan.tinggi : ai.perkiraan.standar), sisa = Math.max(0, ai.batasHari - ai.terpakaiHari);
    const bisaAcuan = g.item.filter((x) => !x.calon && ['maskot', 'produk', 'logo', 'foto', 'ikon'].includes(x.jenis));
    const togel = (id: string) => setF({ ...f, acuan: f.acuan.includes(id) ? f.acuan.filter((x) => x !== id) : [...f.acuan, id].slice(0, 8) });
    const jalan = async () => {
        setKirim(true);
        try { await post(akun, '/api/kantor/sosmed/gudang/buat', { ...f, n, tinggi, rasio: f.jenis === 'latar' ? '4:5' : '1:1' }); kabar(`Vino membuat ${n} pilihan "${f.nama || 'aset baru'}" (±1–2 menit). Pilih yang terbaik di Gudang aset.`); selesai(); tutup(); }
        catch (e: any) { kabar(String(e.message || e)); } finally { setKirim(false); }
    };
    return (
        <section className="sb-card gd-buat" aria-label="Buat aset baru dengan AI">
            <div className="sd-h"><h3><Ikon e="✨" /> Buat aset baru dengan AI</h3><button className="btn small" onClick={tutup}>Tutup</button></div>
            {!ai.ada && <div className="hz-bukti warn"><span>Kunci OpenRouter belum ada di VPS, jadi gambar AI belum bisa dibuat.</span></div>}
            <p className="sb-note">Untuk aset <b>baru</b> saja: maskot dengan pose/ekspresi lain, produk dari sudut lain, latar, properti. Dibuat {n} pilihan, Bapak memilih satu — sisanya dibuang. Mengedit & menyusun desain tetap oleh Claude / mesin desain.</p>
            <div className="gd-form">
                <label>Jenis<select value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}>{g.jenis.filter((j) => !['highlight', 'profil'].includes(j.id)).map((j) => <option key={j.id} value={j.id}>{j.nama}</option>)}</select></label>
                <label>Nama aset<input value={f.nama} maxLength={80} placeholder="mis. Maskot Kiko – menunjuk" onChange={(e) => setF({ ...f, nama: e.target.value })} /></label>
                <label className="lebar">Gambar seperti apa?<textarea rows={3} value={f.prompt} maxLength={2000} placeholder="mis. maskot yang sama sedang menunjuk ke kanan sambil tersenyum lebar, seluruh badan terlihat" onChange={(e) => setF({ ...f, prompt: e.target.value })} /></label>
            </div>
            {bisaAcuan.length > 0 && <div className="gd-acuan"><small>Acuan supaya tokoh/produk tetap sama <span className="sb-note">(ketuk untuk memilih)</span></small>
                <div className="gd-acuan-l">{bisaAcuan.map((x) => <button key={x.id} type="button" className={f.acuan.includes(x.id) ? 'on' : ''} aria-pressed={f.acuan.includes(x.id)} onClick={() => togel(x.id)} title={x.nama}><Thumb akun={akun} id={x.id} alt={x.nama} /><span>{x.nama}</span></button>)}</div></div>}
            <div className="gd-opsi">
                <label>Jumlah pilihan<select value={n} onChange={(e) => setN(+e.target.value)}>{[2, 3, 4].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
                <label className="st-cek"><input type="checkbox" checked={tinggi} onChange={(e) => setTinggi(e.target.checked)} /> Kualitas tinggi <small className="sb-note">(untuk aset penting)</small></label>
                <label className="st-cek"><input type="checkbox" checked={!!f.transparan} onChange={(e) => setF({ ...f, transparan: e.target.checked })} /> Latar transparan</label>
            </div>
            <div className="gd-biaya"><span>Perkiraan biaya <b>{usd(biaya)}</b> ({rupiah(biaya)}) · terpakai hari ini {usd(ai.terpakaiHari)} dari batas {usd(ai.batasHari)}</span>
                <button className="btn primary" disabled={kirim || !ai.ada || f.prompt.trim().length < 8 || biaya > sisa + 1e-9} onClick={jalan}>{kirim ? 'Mengirim…' : `Buat ${n} pilihan`}</button></div>
            {biaya > sisa + 1e-9 && <small className="sb-note">Melebihi sisa batas hari ini. Kurangi jumlah pilihan / kualitas, atau ubah batas harian di bagian Gambar AI (bawah).</small>}
        </section>
    );
}

/* ── Tab Gudang aset & brand ── */
export function TabAset({ akun, kabar, namaAkun }: { akun: string; kabar: (m: string) => void; namaAkun: string }) {
    const d = useApi<DataGudang>(`/api/kantor/sosmed/gudang?${q(akun)}`, 60_000);
    const g = d.data;
    const jalan = !!g?.kerja.some((k) => k.status === 'jalan') || !!g?.item.some((x) => x.label === 'menunggu');
    useInterval(() => d.reload(), jalan ? 4000 : null);
    const [buat, setBuat] = useState<Partial<IsiBuat> | null>(null);
    const [naik, setNaik] = useState('');
    const [filter, setFilter] = useState('semua');
    const input = useRef<HTMLInputElement>(null);
    if (!g) return <section className="sb-card">{d.error ? <div className="error">{d.error}</div> : <div className="pg-skel" style={{ height: 200 }} />}</section>;
    const aksi = (p: Promise<any>, ok?: string) => p.then(() => { if (ok) kabar(ok); d.reload(); }).catch((e) => kabar(String(e.message || e)));
    const unggah = async (files: File[]) => {
        try {
            const { folder } = await post<{ folder: string }>(akun, '/api/kantor/sosmed/gudang/folder', {});
            for (let i = 0; i < files.length; i++) {
                setNaik(`${i + 1}/${files.length}`);
                const r = await unggahBerkas(folder, files[i], (n) => setNaik(`${i + 1}/${files.length} · ${n}%`));
                await post(akun, '/api/kantor/sosmed/gudang/daftar', { path: r.path, jenis: filter !== 'semua' ? filter : undefined });
            }
            kabar(`${files.length} aset masuk gudang. Maya sedang memberi label (jenis, nama, keterangan).`); d.reload();
        } catch (e: any) { kabar(String(e.message || e)); } finally { setNaik(''); }
    };
    const calon = new Map<string, ItemGudang[]>(); for (const x of g.item) if (x.calon) calon.set(x.calon, [...(calon.get(x.calon) || []), x]);
    const ada = g.item.filter((x) => !x.calon);
    const tampil = filter === 'semua' ? ada : ada.filter((x) => x.jenis === filter);
    const kerjaAktif = g.kerja.filter((k) => k.status === 'jalan' || (k.status === 'gagal' && Date.now() - k.at < 3600_000));
    return (<>
        <section className="sb-card gd" aria-label="Gudang aset">
            <div className="sd-h"><h3><Ikon e="🧰" /> Gudang aset <small>{ada.length} aset · semua konten {namaAkun} mengambil dari sini</small></h3>
                <div className="sm-aksi" style={{ margin: 0 }}>
                    <button className="btn small primary" disabled={!!naik} onClick={() => input.current?.click()}>{naik ? `Mengunggah ${naik}` : <><Ikon e="⬆" /> Unggah</>}</button>
                    <button className="btn small" onClick={() => setBuat({})}><Ikon e="✨" /> Buat dengan AI</button>
                </div>
                <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) void unggah(f); }} />
            </div>
            {!ada.length && !calon.size && <div className="fin-empty">Isi gudang dengan logo, maskot, foto produk, foto toko/tempat, atau foto Bapak. Tim akan memakai aset yang sama di setiap konten supaya feed konsisten — tidak mengarang produk atau maskot lain.</div>}
            {kerjaAktif.map((k) => <div key={k.id} className={`hz-bukti ${k.status === 'gagal' ? 'warn' : 'ok'}`}>{k.status === 'jalan' ? <span className="pk-jalan"><i /></span> : <Ikon e="⚠️" />}<span>{k.judul}{k.status === 'gagal' ? ` — ${k.galat}` : ' …'}</span></div>)}
            {[...calon.entries()].map(([batch, xs]) => (
                <div key={batch} className="gd-calon">
                    <div className="sm-blok-h"><b><Ikon e="👆" /> Pilih satu: {xs[0].nama.replace(/ – pilihan \d+$/, '')}</b><button className="btn small" onClick={async () => { if (await konfirmasi('Buang semua pilihan ini?')) aksi(post(akun, '/api/kantor/sosmed/gudang/pilih', { batch, id: '' }), 'Pilihan dibuang.'); }}>Buang semua</button></div>
                    <div className="gd-grid">{xs.map((x) => <button key={x.id} className="gd-item pilih" onClick={() => aksi(post(akun, '/api/kantor/sosmed/gudang/pilih', { batch, id: x.id }), `✓ "${x.nama}" masuk gudang.`)}><Thumb akun={akun} id={x.id} alt={x.nama} besar /><span>Pakai yang ini</span></button>)}</div>
                </div>
            ))}
            {ada.length > 0 && <div className="gd-filter" role="tablist">{[['semua', 'Semua'], ...g.jenis.filter((j) => ada.some((x) => x.jenis === j.id)).map((j) => [j.id, j.nama])].map(([id, nm]) => <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{nm} <small>{id === 'semua' ? ada.length : ada.filter((x) => x.jenis === id).length}</small></button>)}</div>}
            <div className="gd-grid">{tampil.map((x) => <ItemAset key={x.id} akun={akun} x={x} g={g} aksi={aksi} variasi={() => setBuat({ jenis: x.jenis, nama: `${x.nama} – variasi`, acuan: [x.id], prompt: '' })} />)}</div>
        </section>
        {buat && <FormBuat akun={akun} g={g} awal={buat} tutup={() => setBuat(null)} selesai={() => d.reload()} kabar={kabar} />}
        <BrandKit akun={akun} g={g} aksi={aksi} kabar={kabar} muat={() => d.reload()} />
        <section className="sb-card"><div className="sd-h"><h3><Ikon e="💳" /> Gambar AI <small>saldo OpenRouter · hanya saat Bapak menekan Buat</small></h3>
            <label className="gd-batas">Batas/hari $<input type="number" min={0} max={20} step={0.1} defaultValue={g.gambarAi.batasHari} key={g.gambarAi.batasHari} onBlur={(e) => { const v = +e.target.value; if (v !== g.gambarAi.batasHari) aksi(post(akun, '/api/kantor/sosmed/gambar-ai/batas', { usd: v }), `Batas harian gambar AI: $${v}.`); }} aria-label="Batas biaya gambar AI per hari (dolar)" /></label></div>
            <div className="gd-oto"><span>Elemen konten otomatis (ilustrasi kulkas, gelas, dll. saat carousel membutuhkannya): hari ini {usd(g.gambarAi.terpakaiOtomatis)} dari batas</span>
                <label className="gd-batas">$<input type="number" min={0} max={10} step={0.05} defaultValue={g.gambarAi.batasOtomatis} key={`o${g.gambarAi.batasOtomatis}`} onBlur={(e) => { const v = +e.target.value; if (v !== g.gambarAi.batasOtomatis) aksi(post(akun, '/api/kantor/sosmed/gambar-ai/batas', { usd: v, otomatis: true }), `Batas elemen otomatis: $${v}/hari.`); }} aria-label="Batas elemen otomatis per hari (dolar)" />/hari</label></div>
            <p className="sb-note" style={{ margin: 0 }}>Aset atas perintah Bapak: hari ini {usd(g.gambarAi.terpakaiHari)} dari batas {usd(g.gambarAi.batasHari)} · bulan ini {usd(g.gambarAi.terpakaiBulan)} ({g.gambarAi.jumlah} gambar) · model {g.gambarAi.model}. Satu gambar standar ±{usd(g.gambarAi.perkiraan.standar)}, kualitas tinggi ±{usd(g.gambarAi.perkiraan.tinggi)}.</p></section>
    </>);
}
function ItemAset({ akun, x, g, aksi, variasi }: { akun: string; x: ItemGudang; g: DataGudang; aksi: (p: Promise<any>, ok?: string) => void; variasi: () => void }) {
    const [ubah, setUbah] = useState(false), [nama, setNama] = useState(x.nama), [jenis, setJenis] = useState(x.jenis), [ket, setKet] = useState(x.ket);
    const url = (a: string) => `/api/kantor/sosmed/gudang/${x.id}/${a}`;
    const buka = async () => { try { const r = await post<{ url: string }>(akun, url('tautan'), {}); window.open(`${serverBase()}${r.url}`, '_blank', 'noopener'); } catch { /* */ } };
    return (
        <div className="gd-item">
            <button className="gd-gbr" onClick={buka} aria-label={`Buka ${x.nama} ukuran penuh`}><Thumb akun={akun} id={x.id} alt={x.nama} /></button>
            {ubah ? (<div className="gd-ubah">
                <select value={jenis} onChange={(e) => setJenis(e.target.value)} aria-label="Jenis">{g.jenis.map((j) => <option key={j.id} value={j.id}>{j.nama}</option>)}</select>
                <input value={nama} maxLength={80} onChange={(e) => setNama(e.target.value)} aria-label="Nama" />
                <textarea rows={2} value={ket} maxLength={300} onChange={(e) => setKet(e.target.value)} aria-label="Keterangan" />
                <div className="sm-aksi kecil"><button className="btn small primary" onClick={() => { aksi(post(akun, url('ubah'), { nama, jenis, ket })); setUbah(false); }}>Simpan</button><button className="btn small" onClick={() => setUbah(false)}>Batal</button></div>
            </div>) : (<div className="gd-teks">
                <b>{x.nama}</b>
                <small>{g.jenis.find((j) => j.id === x.jenis)?.nama || x.jenis}{x.sumber === 'ai' ? ' · gambar AI' : x.sumber === 'kantor' ? ' · dibuat kantor' : ''}{g.brand?.logoId === x.id ? ' · logo utama' : ''}</small>
                {x.label === 'menunggu' ? <small className="sb-note"><span className="pk-jalan"><i /></span> Maya memberi label…</small> : x.ket ? <small className="gd-ket">{x.ket}</small> : null}
                {x.label === 'gagal' && <small className="sb-note">Label belum berhasil. <button className="btn-link" onClick={() => aksi(post(akun, url('label'), {}))}>Coba lagi</button></small>}
                <div className="gd-menu">
                    <button className="btn-link" onClick={() => setUbah(true)}>Ubah</button>
                    {['maskot', 'produk', 'logo', 'ikon'].includes(x.jenis) && <button className="btn-link" onClick={variasi}>Buat variasi</button>}
                    {x.jenis === 'logo' && g.brand?.logoId !== x.id && <button className="btn-link" onClick={() => aksi(post(akun, '/api/kantor/sosmed/brand', { logoId: x.id }), 'Jadi logo utama.')}>Jadikan logo utama</button>}
                    <button className="btn-link bahaya" onClick={async () => { if (await konfirmasi(`Hapus "${x.nama}" dari gudang? Berkasnya masuk tempat sampah Berkas (30 hari).`, { bahaya: true })) aksi(post(akun, url('hapus'), {}), 'Dihapus.'); }}>Hapus</button>
                </div>
            </div>)}
        </div>
    );
}

/* ── Pemilih palet: 4 pilihan dengan contoh feed Instagram mini ── */
interface PratinjauPalet { palet: Array<{ nama: string; nuansa: string; warna: string[]; fontJudul: string; fontIsi: string; gaya: string; grid: string[]; avatar: string; font: string }>; nama: string; handle?: string; bio: string; alasan: string; pilihan: number | null; sementara: boolean }
const PERAN = ['Utama', 'Gelap', 'Terang', 'Aksen', 'Netral'];
export function PilihPalet({ akun, kabar, kunci, muat, jalan, setup }: { akun: string; kabar: (m: string) => void; kunci: string; muat: () => void; jalan?: boolean; setup?: boolean }) {
    const [d, setD] = useState<PratinjauPalet | null>(null), [galat, setGalat] = useState('');
    const [kirim, setKirim] = useState(-1), [arahan, setArahan] = useState(''), [lain, setLain] = useState(false);
    useEffect(() => {
        let batal = false; setGalat('');
        post<PratinjauPalet>(akun, '/api/kantor/sosmed/brand/pratinjau-palet', {}).then((r) => { if (!batal) setD(r); }).catch((e) => { if (!batal) setGalat(String(e.message || e)); });
        return () => { batal = true; };
    }, [akun, kunci]);
    if (galat) return <div className="error">{galat}</div>;
    if (setup && d && !d.sementara) return null;
    const pakai = async (i: number) => {
        setKirim(i);
        try { await post(akun, '/api/kantor/sosmed/brand/pilih-palet', { i }); setD((x) => (x ? { ...x, pilihan: i, sementara: false } : x)); kabar(`✓ Palet "${d?.palet[i]?.nama}" dipakai — galeri gaya & desain berikutnya ikut warna ini.`); muat(); }
        catch (e: any) { kabar(String(e.message || e)); } finally { setKirim(-1); }
    };
    const baru = async () => {
        try { await post(akun, '/api/kantor/sosmed/brand/usul', { arahan, paletSaja: true }); kabar('Maya menyusun 4 palet baru (±1 menit).'); setLain(false); setArahan(''); muat(); }
        catch (e: any) { kabar(String(e.message || e)); }
    };
    return (
        <section className={`pp ${setup ? 'sb-card' : ''}`} aria-label="Pilih palet brand">
            <div className="pp-kepala">
                <div><h3>{setup ? 'Pilih palet untuk akun ini' : 'Palet brand'}</h3>
                    <p className="sb-note">{d?.sementara ? 'Maya sudah memasang pilihan pertama sementara. Ketuk palet yang paling Bapak suka — semua desain ikut warnanya.' : 'Ketuk untuk ganti. Contoh feed memakai nama & logo akun ini.'}</p></div>
                <button className="btn small" disabled={jalan} onClick={() => setLain(!lain)} aria-expanded={lain}>{jalan ? 'Maya menyusun…' : <><Ikon e="↻" /> Pilihan lain</>}</button>
            </div>
            {lain && <div className="pp-lain"><input value={arahan} maxLength={300} placeholder="Arahan (opsional): lebih cerah, jangan ungu, nuansa kopi…" onChange={(e) => setArahan(e.target.value)} aria-label="Arahan palet" /><button className="btn small primary" onClick={baru}>Minta 4 palet baru</button></div>}
            <div className="pp-daftar" role="radiogroup" aria-label="Pilihan palet">
                {(d?.palet || [0, 1, 2, 3].map(() => null)).map((p, i) => {
                    if (!p) return <div key={i} className="pp-kartu muat" aria-hidden><span className="pg-skel" style={{ height: 420 }} /></div>;
                    const dipakai = d!.pilihan === i || (d!.sementara && i === 0);
                    return (
                        <div key={i} className={`pp-kartu ${d!.pilihan === i ? 'on' : ''}`} role="radio" aria-checked={d!.pilihan === i}>
                            <div className="pp-judul"><div><b>{p.nama}</b><small>{p.nuansa}</small></div>{d!.pilihan === i ? <span className="pp-cek">✓ Dipakai</span> : d!.sementara && i === 0 ? <span className="pp-cek sementara">Sementara</span> : null}</div>
                            <div className="pp-warna">{p.warna.map((w, j) => <div key={j}><i style={{ background: w }} /><small>{PERAN[j] || ''}</small><small className="mono">{w}</small></div>)}</div>
                            <div className="pp-ig" aria-label={`Contoh profil Instagram dengan palet ${p.nama}`}>
                                <div className="pp-ig-atas"><img src={p.avatar} alt="" /><div><b>{d!.handle ? `@${d!.handle}` : d!.nama}</b><small>{d!.bio}</small></div></div>
                                <div className="pp-grid">{p.grid.map((src, j) => <img key={j} src={src} alt="" loading="lazy" />)}</div>
                            </div>
                            <img className="pp-font" src={p.font} alt={`Font ${p.fontJudul} dan ${p.fontIsi}`} />
                            <div className="pp-kaki"><small>Gaya {p.gaya}</small>
                                <button className={`btn small ${dipakai && !d!.sementara ? '' : 'primary'}`} disabled={kirim >= 0 || d!.pilihan === i} onClick={() => pakai(i)}>{kirim === i ? 'Memasang…' : d!.pilihan === i ? '✓ Dipakai' : 'Pakai palet ini'}</button></div>
                        </div>
                    );
                })}
            </div>
            {d?.alasan && <p className="sb-note">Catatan Maya: {d.alasan}</p>}
        </section>
    );
}

/* ── Brand kit + galeri gaya ── */
function BrandKit({ akun, g, aksi, kabar, muat }: { akun: string; g: DataGudang; aksi: (p: Promise<any>, ok?: string) => void; kabar: (m: string) => void; muat: () => void }) {
    const b = g.brand, u = g.usulan;
    const [warna, setWarna] = useState<string[]>(b?.warna?.length ? b.warna : ['#1f3a5f', '#0f172a', '#f8fafc', '#f59e0b', '#94a3b8']);
    const [fj, setFj] = useState(b?.fontJudul || 'Outfit'), [fi, setFi] = useState(b?.fontIsi || 'Outfit'), [aksen, setAksen] = useState(b?.aksenMerek ?? true);
    const [arahan, setArahan] = useState('');
    useEffect(() => { if (b) { setWarna(b.warna.length ? b.warna : warna); setFj(b.fontJudul); setFi(b.fontIsi); setAksen(b.aksenMerek); } }, [b?.at]); // eslint-disable-line react-hooks/exhaustive-deps
    const brandJalan = g.kerja.some((k) => k.jenis === 'brand' && k.status === 'jalan');
    const simpan = (x: Partial<Brand>) => aksi(post(akun, '/api/kantor/sosmed/brand', { warna, fontJudul: fj, fontIsi: fi, aksenMerek: aksen, ...x }), '✓ Brand kit disimpan — dipakai semua desain akun ini.');
    return (<>
        <section className="sb-card bk" aria-label="Brand kit">
            <div className="sd-h"><h3><Ikon e="🎨" /> Brand kit <small>{b ? 'dipakai di semua carousel & gambar akun ini' : 'belum diatur'}</small></h3></div>
            {!u?.palet?.length && <div className="bk-usul">
                <input value={arahan} maxLength={800} placeholder="Arahan (opsional), mis. 'hangat seperti kedai kopi', 'jangan ungu'" onChange={(e) => setArahan(e.target.value)} aria-label="Arahan brand kit" />
                <button className="btn small primary" disabled={brandJalan} onClick={() => aksi(post(akun, '/api/kantor/sosmed/brand/usul', { arahan }), 'Maya menyusun palet, font, gaya, dan 4 konsep logo (±1–2 menit).')}>{brandJalan ? 'Maya sedang menyusun…' : <><Ikon e="✨" /> Minta usulan Maya</>}</button>
            </div>}
            {u?.palet?.length ? <PilihPalet akun={akun} kabar={kabar} kunci={`${u.at}:${b?.at || 0}`} muat={muat} jalan={brandJalan} />
                : u ? <div className="bk-usulan"><div><b>Usulan Maya</b></div><div className="bk-swatch">{u.warna.map((w) => <i key={w} style={{ background: w }} title={w} />)}</div>
                    <button className="btn small" onClick={() => aksi(post(akun, '/api/kantor/sosmed/brand/terapkan', {}), '✓ Usulan diterapkan.')}>Terapkan usulan</button></div> : null}
            {g.item.some((x) => x.calon && x.jenis === 'logo') && <p className="sb-note">4 konsep logo menunggu Bapak pilih di Gudang aset (atas).</p>}
            <details className="bk-sendiri"><summary>Sesuaikan sendiri (warna, font)</summary>
            <div className="bk-isi">
                <div><small>Palet warna</small><div className="bk-warna">{warna.map((w, i) => <label key={i} className="bk-w"><input type="color" value={w} onChange={(e) => setWarna(warna.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Warna ${i + 1}`} /><span className="mono">{w}</span></label>)}</div>
                    <small className="sb-note">Urutan: utama · gelap · terang · aksen · netral</small></div>
                <div className="bk-font">
                    <label>Font judul<select value={fj} onChange={(e) => setFj(e.target.value)}>{g.font.map((f) => <option key={f}>{f}</option>)}</select></label>
                    <label>Font isi<select value={fi} onChange={(e) => setFi(e.target.value)}>{g.font.map((f) => <option key={f}>{f}</option>)}</select></label>
                    <label className="st-cek"><input type="checkbox" checked={aksen} onChange={(e) => setAksen(e.target.checked)} /> Pakai warna utama merek sebagai aksen di semua gaya</label>
                </div>
            </div>
            <div className="sm-aksi"><button className="btn primary" onClick={() => simpan({})}>Simpan warna & font ini</button></div></details>
            <div className="sm-aksi">
                <button className="btn" disabled={!b} onClick={() => aksi(post(akun, '/api/kantor/sosmed/brand/kit', { jenis: 'profil' }), '✓ Foto profil dibuat dari logo utama — ada di Gudang aset.')}><Ikon e="👤" /> Buat foto profil</button>
                <button className="btn" disabled={!b} onClick={() => aksi(post(akun, '/api/kantor/sosmed/brand/kit', { jenis: 'highlight' }), '✓ Cover highlight dibuat — ada di Gudang aset.')}><Ikon e="⭕" /> Buat cover highlight</button></div>
        </section>
        <GaleriGaya akun={akun} g={g} pilih={(id) => aksi(post(akun, '/api/kantor/sosmed/brand', { gayaDesain: id }), '✓ Gaya desain diganti — berlaku untuk desain berikutnya.')} kabar={kabar} muat={muat} />
    </>);
}
export function GaleriGaya({ akun, g, pilih, kabar }: { akun: string; g: DataGudang; pilih: (id: string) => void; kabar: (m: string) => void; muat?: () => void }) {
    const [gbr, setGbr] = useState<Record<string, string>>({});
    const [muatG, setMuatG] = useState(false);
    const kunci = JSON.stringify(g.brand || {});
    useEffect(() => {
        if (!g.desain.siap) return;
        let batal = false; setMuatG(true);
        post<{ gambar: Record<string, string> }>(akun, '/api/kantor/sosmed/desain/pratinjau', {}).then((r) => { if (!batal) setGbr(r.gambar); }).catch((e) => kabar(String(e.message || e))).finally(() => { if (!batal) setMuatG(false); });
        return () => { batal = true; };
    }, [akun, kunci]); // eslint-disable-line react-hooks/exhaustive-deps
    const aktif = g.brand?.gayaDesain || g.gaya[0]?.id;
    return (
        <section className="sb-card gg" aria-label="Gaya desain carousel">
            <div className="sd-h"><h3><Ikon e="🖼" /> Gaya desain carousel & gambar <small>12 gaya · pratinjau memakai nama & warna akun ini</small></h3></div>
            {!g.desain.siap && <div className="hz-bukti warn"><span>{g.desain.pesan}</span></div>}
            <div className="gg-grid" role="radiogroup" aria-label="Pilih gaya desain">
                {g.gaya.map((x) => (
                    <button key={x.id} role="radio" aria-checked={aktif === x.id} className={`gg-item ${aktif === x.id ? 'on' : ''}`} onClick={() => pilih(x.id)}>
                        {gbr[x.id] ? <img src={gbr[x.id]} alt={`Contoh gaya ${x.nama}`} /> : <span className={`gg-kosong ${muatG ? 'muat' : ''}`} style={{ background: `linear-gradient(135deg, ${x.warna[0]}, ${x.warna[2] || x.warna[1]})` }} />}
                        <b>{x.nama}{aktif === x.id ? ' ✓' : ''}</b><small>{x.nuansa}</small><small className="gg-cocok">Cocok: {x.cocok}</small>
                    </button>
                ))}
            </div>
            <p className="sb-note">Gaya diadaptasi dari preset <i>frontend-slides</i> (Zara Zhang, MIT). Tiap konten tetap bisa memakai gaya lain saat didesain.</p>
        </section>
    );
}

/* ── Bagian studio di dalam kartu konten ── */
export function StudioKonten({ akun, k, kabar, muat, sibuk }: { akun: string; k: KontenStudio; kabar: (m: string) => void; muat: () => void; sibuk: boolean }) {
    const d = useApi<DataGudang>(`/api/kantor/sosmed/gudang?${q(akun)}`, 120_000);
    const g = d.data;
    const [buat, setBuat] = useState<Partial<IsiBuat> | null>(null);
    const [claude, setClaude] = useState(false);
    const [gaya, setGaya] = useState('');
    const video = VIDEO(k.format);
    const kerja = g?.kerja.find((x) => x.konten === k.id && x.status === 'jalan');
    useInterval(() => { d.reload(); muat(); }, kerja ? 4000 : null);
    const aksi = (p: Promise<any>, ok?: string) => p.then(() => { if (ok) kabar(ok); muat(); d.reload(); }).catch((e) => kabar(String(e.message || e)));
    if (!g) return null;
    const peta = new Map(g.item.map((x) => [x.id, x]));
    const pakai = [...new Set([...(k.pakaiAset || []), ...(k.slide || []).map((s) => s.aset || '').filter(Boolean)])].map((id) => peta.get(id)).filter(Boolean) as ItemGudang[];
    const saran = (k.saranAset || []).filter((s) => s.status === 'saran');
    const url = (a: string) => `/api/kantor/sosmed/konten/${k.id}/${a}`;
    const gayaAktif = gaya || k.desain?.gaya || g.brand?.gayaDesain || g.gaya[0]?.id;
    return (<>
        {(pakai.length > 0 || saran.length > 0) && <section className="sm-blok sk-aset">
            <div className="sm-blok-h"><b><Ikon e="🧰" /> Aset dari gudang</b><small className="sb-note" style={{ margin: 0 }}>{pakai.length ? `${pakai.length} dipakai` : 'belum ada yang cocok'}</small></div>
            {pakai.length > 0 && <div className="sk-pakai">{pakai.map((x) => <span key={x.id} title={x.nama}><Thumb akun={akun} id={x.id} alt={x.nama} /><small>{x.nama}</small></span>)}</div>}
            {saran.map((s) => (
                <div key={s.id} className="sk-saran">
                    <div><b><Ikon e="💡" /> Saran aset: {s.nama}</b><small>{s.alasan}{s.pengganti && peta.get(s.pengganti) ? ` Bisa juga pakai yang ada: "${peta.get(s.pengganti)!.nama}".` : ''}</small></div>
                    <div className="sm-aksi kecil">
                        <button className="btn small primary" onClick={() => setBuat({ jenis: s.jenis, nama: s.nama, prompt: s.prompt, acuan: s.acuan || [], saran: { konten: k.id, id: s.id } })}>Buat</button>
                        {s.pengganti && peta.get(s.pengganti) && <button className="btn small" onClick={() => aksi(post(akun, url('saran'), { saran: s.id, aksi: 'pakai' }), 'Memakai aset yang sudah ada.')}>Pakai yang ada</button>}
                        <button className="btn small" onClick={() => aksi(post(akun, url('saran'), { saran: s.id, aksi: 'lewati' }))}>Lewati</button>
                    </div>
                </div>
            ))}
        </section>}
        {buat && <FormBuat akun={akun} g={g} awal={buat} tutup={() => setBuat(null)} selesai={() => d.reload()} kabar={kabar} />}
        {!video && k.status !== 'terbit' && k.status !== 'mengunggah' && (k.slide?.length || k.hook) && <section className="sm-blok sk-desain">
            <div className="sm-blok-h"><b><Ikon e="🖼" /> Desain {k.format === 'carousel' ? 'carousel' : 'gambar'}</b>{k.desain && <small className="sb-note" style={{ margin: 0 }}>terakhir: {g.gaya.find((x) => x.id === k.desain!.gaya)?.nama} · {k.desain.oleh === 'claude' ? 'ditata Claude' : 'templat'}</small>}</div>
            {k.desain?.catatan && <p className="sb-note" style={{ margin: '0 0 8px' }}>Catatan Claude: {k.desain.catatan}</p>}
            {k.aset && <SlideKonten akun={akun} id={k.id} kunci={`${k.desain?.at || 0}:${k.aset.path}`} />}
            {kerja ? <div className="hz-bukti ok"><span className="pk-jalan"><i /></span><span>{kerja.judul}…</span></div> : (<>
                <div className="sk-desain-a">
                    <label>Gaya<select value={gayaAktif} onChange={(e) => setGaya(e.target.value)}>{g.gaya.map((x) => <option key={x.id} value={x.id}>{x.nama}</option>)}</select></label>
                    <label>Elemen<select value={k.hiasan || 'otomatis'} onChange={(e) => aksi(post(akun, url('hiasan'), { mode: e.target.value }), e.target.value === 'tanpa' ? 'Desain berikutnya bersih tanpa elemen tangan.' : e.target.value === 'sedikit' ? 'Maksimal 1 elemen per slide, tanpa ilustrasi otomatis.' : 'Elemen tangan + ilustrasi otomatis (dalam batas harian).')}>
                        <option value="otomatis">Otomatis</option><option value="sedikit">Sedikit</option><option value="tanpa">Tanpa</option></select></label>
                    <button className="btn small primary" disabled={sibuk || !g.desain.siap} onClick={() => aksi(post(akun, url('desain'), { oleh: 'templat', gaya: gayaAktif }), 'Kantor menggambar slide — hasilnya langsung jadi berkas konten ini.')}>{k.aset ? 'Desain ulang (gratis)' : 'Desain sekarang (gratis)'}</button>
                    <button className="btn small" disabled={sibuk || !g.claude?.aktif || !g.desain.siap} title={g.claude?.aktif ? '' : 'Otak Claude sedang tidak tersedia'} onClick={() => aksi(post(akun, url('desain'), { oleh: 'claude', gaya: gayaAktif }), 'Claude menata gaya, teks & penempatan aset; kantor menggambar.')}><Ikon e="🧠" /> Ditata Claude</button>
                </div>
                <small className="sb-note">Gratis = templat mesin desain kantor. "Ditata Claude" memakai jatah langganan Claude (hari ini {g.claude?.carouselHari || 0} carousel otomatis dari batas {g.claude?.batasHari ?? 1}). Mau hasil paling maksimal? Pakai <b>Kirim ke Claude</b> di bawah.</small>
            </>)}
        </section>}
        <section className="sm-blok sk-claude">
            <div className="sm-blok-h"><b><Ikon e="🤖" /> Kirim ke Claude</b><button className="btn small primary" onClick={() => setClaude(!claude)} aria-expanded={claude}>{claude ? 'Tutup' : 'Siapkan'}</button></div>
            {!claude && <small className="sb-note">Satu pintu: teks siap tempel + paket aset (zip) untuk aplikasi Claude{video ? ' (skill /video-edit)' : ''}.</small>}
            {claude && <PaketClaude akun={akun} k={k} kabar={kabar} />}
        </section>
        <CaraBikin k={k} adaDesain={!video && g.desain.siap} />
    </>);
}
/** Strip pratinjau slide/gambar yang sudah jadi (supaya Bapak bisa melihat hasil desain langsung di kartu). */
function SlideKonten({ akun, id, kunci }: { akun: string; id: string; kunci: string }) {
    const d = useApi<{ gambar: Array<{ url: string; nama: string }> }>(`/api/kantor/sosmed/konten/${id}/pratinjau?${q(akun)}&k=${encodeURIComponent(kunci)}`, 0);
    const g = d.data?.gambar || [];
    if (!g.length) return null;
    return <div className="sk-slide" aria-label="Pratinjau hasil">{g.map((x, i) => <a key={x.url} href={`${serverBase()}${x.url}`} target="_blank" rel="noopener noreferrer" title={x.nama}><img src={`${serverBase()}${x.url}`} alt={`Slide ${i + 1}`} loading="lazy" /><small>{i + 1}</small></a>)}</div>;
}
function PaketClaude({ akun, k, kabar }: { akun: string; k: KontenStudio; kabar: (m: string) => void }) {
    const d = useApi<{ teks: string; aset: Array<{ id: string; nama: string; jenis: string }> }>(`/api/kantor/sosmed/konten/${k.id}/claude?${q(akun)}`, 0);
    const [zip, setZip] = useState(false);
    if (!d.data) return d.error ? <div className="error">{d.error}</div> : <div className="pg-skel" style={{ height: 80 }} />;
    const unduh = async () => {
        setZip(true);
        try { const r = await post<{ url: string; n: number }>(akun, `/api/kantor/sosmed/konten/${k.id}/paket`, {}); window.open(`${serverBase()}${r.url}`, '_blank', 'noopener'); kabar(`Paket berisi brief + ${r.n} aset. Lampirkan zip-nya di aplikasi Claude bersama teks yang disalin.`); }
        catch (e: any) { kabar(String(e.message || e)); } finally { setZip(false); }
    };
    return (<div className="sk-paket">
        <ol className="sk-langkah">
            <li><Salin teks={d.data.teks} label="1. Salin teks" utama /></li>
            <li><button className="btn small primary" disabled={zip} onClick={unduh}>{zip ? 'Menyiapkan…' : <><Ikon e="⬇" /> 2. Unduh paket aset ({d.data.aset.length})</>}</button></li>
            <li><a className="btn small" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">3. Buka aplikasi Claude</a></li>
        </ol>
        <small className="sb-note">Tempel teks, lampirkan zip{VIDEO(k.format) ? ' dan video mentahan' : ''}. Setelah jadi, unggah hasilnya di bagian "Taruh hasil" konten ini lalu Setujui.</small>
        {d.data.aset.length > 0 && <ul className="sk-daftar">{d.data.aset.map((a) => <li key={a.id}><Thumb akun={akun} id={a.id} alt={a.nama} /><span className="mono">{a.nama}</span></li>)}</ul>}
        <details><summary>Lihat teks</summary><pre className="sm-pre">{d.data.teks}</pre></details>
    </div>);
}
/** Panduan singkat membuat konten ini (tanpa AI). */
function CaraBikin({ k, adaDesain }: { k: KontenStudio; adaDesain: boolean }) {
    const langkah = useMemo(() => {
        if (k.format === 'carousel' || k.format === 'feed') return [
            adaDesain ? 'Tekan "Desain sekarang" (gratis) — slide langsung jadi dengan gaya & aset akun ini. Atau "Ditata Claude" untuk tata letak yang lebih matang.' : 'Pakai "Kirim ke Claude" untuk membuat slide-nya.',
            'Periksa gambar & caption. Kalau mau versi paling maksimal (edit foto produk, hapus latar, ilustrasi khusus), pakai "Kirim ke Claude".',
            'Tekan Setujui — kantor memposting pada jamnya (atau mengingatkan Bapak kalau akun belum tersambung).'];
        if (k.promptEdit || k.rekam) return ['Rekam mentahan dengan HP sesuai daftar "Yang perlu direkam" (cahaya dari depan, suara jelas).', 'Kirim ke Claude: salin teks, unduh paket aset, lampirkan video mentahan. Claude mengedit dengan skill /video-edit.', 'Kalau narasi pakai suara AI: salin prompt suara ke ElevenLabs, unduh MP3-nya, lampirkan juga ke Claude.', 'Unggah video final di "Taruh hasil", lalu Setujui.'];
        return ['Salin prompt video ke alat video AI pilihan Bapak (lampirkan gambar acuan gaya bila ada).', 'Salin prompt suara ke ElevenLabs, unduh MP3-nya.', 'Kirim ke Claude: gabungkan klip + suara + subtitle + logo/maskot dari paket aset.', 'Unggah video final di "Taruh hasil", lalu Setujui.'];
    }, [k.format, k.promptEdit, k.rekam, adaDesain]);
    return <details className="sm-blok sk-cara"><summary><Ikon e="🧭" /> Cara bikin konten ini</summary><ol>{langkah.map((l) => <li key={l}>{l}</li>)}</ol></details>;
}
