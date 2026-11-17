import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiGet, apiPost } from '../../kantor/connection';
import { useSubNav } from '../../kantor/subnav';
import { useAktif } from '../../kantor/aktif';
import { eventBus } from '../../events';
import { LembarKr, SampulKr, lembarDari, type KPost, type KTema, type KCatatan } from './Slide';

interface Status {
    per: Record<string, { total: number; baru: number }>; folder: Array<{ id: string; nama: string; n: number; sampul: string | null }>;
    hariIni: number; dibaca: number; skor: { main: number; benar: number }; tema: Record<string, KTema>; segmen: Array<[string, string]>;
    sibuk: string; progres: string; log: Array<{ at: number; teks: string }>; siap: boolean; tim: Array<{ id: string; nama: string; peran: string; ada: boolean }>;
}
type View = { v: 'feed' } | { v: 'tema'; kat?: string } | { v: 'simpan'; folder: string };
const LS_SEG = 'kantor:kr-segmen';
const tglId = (s?: string) => { if (!s) return ''; const d = new Date(s.length <= 10 ? `${s}T00:00:00+07:00` : s); return Number.isNaN(+d) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }); };
const jamId = (ms: number) => new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const sejak = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${Math.max(1, m)} mnt` : m < 1440 ? `${Math.round(m / 60)} jam` : `${Math.round(m / 1440)} hr`; };

function useHp() {
    const q = '(max-width: 899px)';
    const [hp, setHp] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
    useEffect(() => { const m = window.matchMedia(q); const f = () => setHp(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
    return hp;
}
/** Pesan singkat di bawah layar (dengan tombol Batal opsional). */
function usePesan() {
    const [p, setP] = useState<{ teks: string; batal?: () => void } | null>(null);
    const t = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tampil = useCallback((teks: string, batal?: () => void) => { setP({ teks, batal }); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setP(null), 4200); }, []);
    const el = p && <div className="kr-pesan" role="status">{p.teks}{p.batal && <button onClick={() => { p.batal!(); setP(null); }}>Batal</button>}</div>;
    return { tampil, el };
}

export function KnowledgeReelsPage() {
    const st = useApi<Status>('/api/kantor/kr/status', 30_000);
    const hp = useHp();
    const [view, setView] = useState<View>({ v: 'feed' });
    const [segmen, setSegmenS] = useState(() => { try { return localStorage.getItem(LS_SEG) || 'semua'; } catch { return 'semua'; } });
    const setSegmen = (s: string) => { setSegmenS(s); try { localStorage.setItem(LS_SEG, s); } catch { /* */ } };
    const [modal, setModal] = useState<string | null>(null);
    const pesan = usePesan();
    const tema = st.data?.tema || {};
    useSubNav([{ k: 'feed', ico: '🏠', label: 'Untukmu' }, { k: 'tema', ico: '🗂️', label: 'Tema' }, { k: 'simpan', ico: '🔖', label: 'Tersimpan' }], view.v, (k) => setView(k === 'simpan' ? { v: 'simpan', folder: 'umum' } : k === 'tema' ? { v: 'tema' } : { v: 'feed' }));

    // Lompat dari halaman Catatan ke postingan tertentu.
    useEffect(() => {
        const buka = (id?: string | null) => { if (id) { setModal(id); setTimeout(() => { try { sessionStorage.removeItem('kantor:kr-buka'); } catch { /* */ } }, 50); } };
        try { buka(sessionStorage.getItem('kantor:kr-buka')); } catch { /* */ }
        const f = (e: Event) => buka((e as CustomEvent).detail?.id);
        eventBus.addEventListener('open-kr', f);
        return () => eventBus.removeEventListener('open-kr', f);
    }, []);

    const bukaTema = (kat: string) => { setModal(null); setView({ v: 'tema', kat }); };
    const ctx: Ctx = { tema, hp, bukaTema, pesan: pesan.tampil, folder: st.data?.folder || [], muatStatus: () => st.reload(), bukaPost: setModal };

    return (
        <div className={`kr ${hp ? 'kr-hp' : 'kr-dt'} kr-v-${view.v}`}>
            {view.v === 'feed' && <Feed key={segmen} ctx={ctx} segmen={segmen} setSegmen={setSegmen} st={st.data} />}
            {view.v === 'tema' && (view.kat ? <ProfilTema key={view.kat} ctx={ctx} kat={view.kat} kembali={() => setView({ v: 'tema' })} /> : <DaftarTema ctx={ctx} st={st.data} />)}
            {view.v === 'simpan' && <Tersimpan ctx={ctx} folder={view.folder} setFolder={(f) => setView({ v: 'simpan', folder: f })} />}
            {!hp && view.v === 'feed' && <Samping ctx={ctx} st={st.data} setView={setView} />}
            {!hp && view.v !== 'feed' && <button className="kr-ke-feed" onClick={() => setView({ v: 'feed' })}>← Kembali ke feed</button>}
            {modal && <ModalPost id={modal} ctx={ctx} tutup={() => setModal(null)} />}
            {pesan.el}
        </div>
    );
}
interface Ctx { tema: Record<string, KTema>; hp: boolean; bukaTema: (k: string) => void; pesan: (t: string, batal?: () => void) => void; folder: Status['folder']; muatStatus: () => void; bukaPost: (id: string) => void }

/* ── Feed (All + segmen) ── */
function Feed({ ctx, segmen, setSegmen, st }: { ctx: Ctx; segmen: string; setSegmen: (s: string) => void; st: Status | null }) {
    const [list, setList] = useState<KPost[]>([]);
    const [habis, setHabis] = useState(false);
    const [muat, setMuat] = useState(false);
    const [galat, setGalat] = useState('');
    const aktif = useAktif();
    const wadah = useRef<HTMLDivElement>(null);
    const ambil = useCallback(async (ulang = false) => {
        setMuat(true);
        try {
            const lewati = ulang ? '' : list.map((p) => p.id).join(',');
            const r = await apiGet<{ post: KPost[] }>(`/api/kantor/kr/feed?segmen=${segmen}&n=15${lewati ? `&lewati=${lewati}` : ''}`);
            setList((l) => { const ada = new Set((ulang ? [] : l).map((p) => p.id)); return [...(ulang ? [] : l), ...r.post.filter((p) => !ada.has(p.id))]; });
            setHabis(r.post.length < 15); setGalat('');
        } catch (e: any) { setGalat(String(e?.message || e)); }
        setMuat(false);
    }, [segmen, list]);
    useEffect(() => { ambil(true); }, [segmen]); // eslint-disable-line react-hooks/exhaustive-deps
    // Muat lagi saat mendekati akhir.
    const ujung = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const el = ujung.current; if (!el || habis) return;
        const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && !muat) ambil(); }, { root: wadah.current, rootMargin: '600px' });
        io.observe(el); return () => io.disconnect();
    }, [ambil, habis, muat, list.length]);
    // Tandai "sudah terlihat" (bukan "sudah baca") supaya yang belum pernah terlihat didahulukan berikutnya.
    useEffect(() => {
        if (!aktif || !wadah.current) return;
        const antre = new Set<string>(), timer = new Map<string, ReturnType<typeof setTimeout>>();
        const io = new IntersectionObserver((es) => es.forEach((e) => {
            const id = (e.target as HTMLElement).dataset.id!;
            if (e.isIntersecting) timer.set(id, setTimeout(() => antre.add(id), 1500));
            else { clearTimeout(timer.get(id)); timer.delete(id); }
        }), { root: wadah.current, threshold: 0.6 });
        wadah.current.querySelectorAll('[data-id]').forEach((n) => io.observe(n));
        const kirim = setInterval(() => { if (antre.size) { const ids = [...antre]; antre.clear(); apiPost('/api/kantor/kr/lihat', { ids }).catch(() => undefined); } }, 4000);
        return () => { io.disconnect(); clearInterval(kirim); timer.forEach(clearTimeout); if (antre.size) apiPost('/api/kantor/kr/lihat', { ids: [...antre] }).catch(() => undefined); };
    }, [aktif, list.length]);
    const ganti = (p: KPost) => setList((l) => l.map((x) => (x.id === p.id ? p : x)));
    const segmenList = st?.segmen || [['semua', 'All']];

    return (
        <div className="kr-feed-wrap">
            <div className="kr-tabs" role="tablist">
                {segmenList.map(([k, label]) => <button key={k} role="tab" aria-selected={segmen === k} className={segmen === k ? 'on' : ''} onClick={() => setSegmen(k)}>{label}</button>)}
            </div>
            <div className="kr-feed" ref={wadah}>
                {st?.sibuk && <div className="kr-sibuk">✍️ Redaksi sedang menyiapkan postingan{st.progres ? ` · ${st.progres}` : ''}</div>}
                {list.map((p) => <Pos key={p.id} p={p} ctx={ctx} ganti={ganti} />)}
                <div ref={ujung} />
                {muat && <div className="kr-akhir">Memuat…</div>}
                {galat && <div className="kr-akhir">⚠️ {galat} <button className="btn" onClick={() => ambil(true)}>Coba lagi</button></div>}
                {!muat && habis && <Habis ctx={ctx} kosong={!list.length} segmen={segmen} st={st} muatUlang={() => ambil(true)} />}
            </div>
        </div>
    );
}
function Habis({ ctx, kosong, segmen, st, muatUlang }: { ctx: Ctx; kosong: boolean; segmen: string; st: Status | null; muatUlang: () => void }) {
    const [kirim, setKirim] = useState(false);
    const kat = segmen === 'semua' || segmen === 'berita' ? '' : segmen;
    const buat = async () => { setKirim(true); try { await apiPost('/api/kantor/kr/buat', { kat }); ctx.pesan('Redaksi mulai bekerja. Postingan baru muncul dalam beberapa menit.'); ctx.muatStatus(); } catch (e: any) { ctx.pesan(String(e?.message || e)); } setKirim(false); };
    return (
        <div className={`kr-habis ${kosong ? 'kosong' : ''}`} data-habis>
            <b>{kosong ? 'Belum ada postingan baru di sini' : 'Semua postingan baru sudah kamu lihat'}</b>
            <p>Edisi pagi terbit pukul 05.00 WIB, tambahan berita pukul 12.00 dan 18.00. Postingan yang ditandai “sudah baca” tetap bisa dibuka dari halaman temanya.</p>
            <div className="kr-habis-aksi">
                <button className="btn primary" disabled={kirim || !!st?.sibuk} onClick={buat}>{st?.sibuk ? 'Redaksi sedang bekerja…' : 'Buat postingan baru sekarang'}</button>
                <button className="btn" onClick={muatUlang}>Muat ulang</button>
            </div>
        </div>
    );
}

/* ── Satu postingan ── */
function Pos({ p, ctx, ganti, diModal }: { p: KPost; ctx: Ctx; ganti: (p: KPost) => void; diModal?: boolean }) {
    const [buka, setBuka] = useState<'' | 'catatan' | 'simpan'>('');
    const [lengkap, setLengkap] = useState(false);
    const tema = ctx.tema[p.kat];
    const tt = ctx.hp && !diModal;
    const baca = async () => {
        const ya = !p.baca; ganti({ ...p, baca: ya });
        try {
            await apiPost('/api/kantor/kr/baca', { id: p.id, ya });
            if (ya) ctx.pesan('Ditandai sudah baca — tidak muncul lagi saat feed dimuat ulang.', () => { ganti({ ...p, baca: false }); apiPost('/api/kantor/kr/baca', { id: p.id, ya: false }).catch(() => undefined); });
            ctx.muatStatus();
        } catch (e: any) { ganti(p); ctx.pesan(String(e?.message || e)); }
    };
    const kepala = (
        <div className="kr-kepala">
            <button className={`kr-ava ${p.baca ? '' : 'baru'}`} onClick={() => ctx.bukaTema(p.kat)} aria-label={`Buka tema ${tema?.nama}`}><span>{tema?.ikon}</span></button>
            <div className="kr-kepala-t">
                <button className="kr-akun" onClick={() => ctx.bukaTema(p.kat)}>{tema?.nama || p.kat}</button>
                <small>{sejak(p.dibuat)} · oleh {p.oleh.map((o) => o.nama).join(', ')}</small>
            </div>
        </div>
    );
    const aksi = (
        <div className="kr-aksi">
            <button className={`kr-baca ${p.baca ? 'on' : ''}`} onClick={baca} aria-pressed={!!p.baca} title={p.baca ? 'Batalkan sudah baca' : 'Tandai sudah baca'}>
                <span className="kr-ico">✓</span><span className="kr-lbl">Sudah baca</span>
            </button>
            <button className={buka === 'catatan' ? 'on' : ''} onClick={() => setBuka(buka === 'catatan' ? '' : 'catatan')} title="Catatan saya">
                <span className="kr-ico">✎</span><span className="kr-lbl">{p.catatan?.length ? `${p.catatan.length} catatan` : 'Catatan'}</span>
            </button>
            <button className={`kr-simpan ${p.folder?.length ? 'on' : ''}`} onClick={() => setBuka(buka === 'simpan' ? '' : 'simpan')} title="Simpan ke folder">
                <span className="kr-ico">{p.folder?.length ? '★' : '☆'}</span><span className="kr-lbl">{p.folder?.length ? 'Tersimpan' : 'Simpan'}</span>
            </button>
        </div>
    );
    const keterangan = (
        <div className={`kr-ket ${lengkap ? 'lengkap' : ''}`}>
            <p><button className="kr-akun" onClick={() => ctx.bukaTema(p.kat)}>{tema?.nama}</button> {p.judul}{p.sub ? ` — ${p.sub}` : ''}</p>
            {!!p.dampak?.length && <p className="kr-kode">{p.dampak.map((d) => <span key={d.kode} className={`a-${d.arah}`}>${d.kode}</span>)}</p>}
            {!!p.sumber.length && (
                <div className="kr-sumber">
                    <b>Sumber</b>
                    {p.sumber.map((s, i) => (
                        <div key={i}>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.judul}</a> : <span>{s.judul}</span>}{(s.penerbit || s.tgl) && <small> — {[s.penerbit, tglId(s.tgl)].filter(Boolean).join(', ')}</small>}</div>
                    ))}
                </div>
            )}
            {tt && !lengkap && (p.sumber.length > 0 || (p.sub || '').length > 60) && <button className="kr-lagi" onClick={() => setLengkap(true)}>selengkapnya</button>}
            {!!p.catatan?.length && buka !== 'catatan' && <button className="kr-lagi" onClick={() => setBuka('catatan')}>Lihat {p.catatan.length} catatan saya</button>}
            <small className="kr-tgl">{tglId(p.tgl)}</small>
        </div>
    );
    const panel = buka === 'catatan' ? <PanelCatatan p={p} ctx={ctx} ganti={ganti} tutup={() => setBuka('')} /> : buka === 'simpan' ? <PanelSimpan p={p} ctx={ctx} ganti={ganti} tutup={() => setBuka('')} /> : null;

    if (tt) return (
        <article className={`kr-pos tt ${p.baca ? 'dibaca' : ''}`} data-id={p.id}>
            <div className={`kr-tt-latar p-${p.desain.p}`} />
            <div className="kr-tt-kartu"><Carousel p={p} ctx={ctx} ganti={ganti} /></div>
            <div className="kr-tt-bawah">{kepala}{keterangan}</div>
            <div className="kr-tt-rel">{aksi}</div>
            {panel && <div className="kr-lembar-bawah" onClick={(e) => { if (e.target === e.currentTarget) setBuka(''); }}><div>{panel}</div></div>}
        </article>
    );
    return (
        <article className="kr-pos ig" data-id={p.id}>
            {kepala}
            <Carousel p={p} ctx={ctx} ganti={ganti} />
            {aksi}
            {panel}
            {keterangan}
        </article>
    );
}

/* ── Carousel: geser (HP) atau tombol panah (laptop) ── */
function Carousel({ p, ctx, ganti }: { p: KPost; ctx: Ctx; ganti: (p: KPost) => void }) {
    const lembar = useMemo(() => lembarDari(p), [p]);
    const [i, setI] = useState(0);
    const rel = useRef<HTMLDivElement>(null);
    const ke = (n: number) => { const el = rel.current; if (!el) return; const x = Math.max(0, Math.min(lembar.length - 1, n)); el.scrollTo({ left: x * el.clientWidth, behavior: 'smooth' }); };
    const onScroll = () => { const el = rel.current; if (el) setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
    const kunci = (e: React.KeyboardEvent) => { if (e.key === 'ArrowRight') { e.preventDefault(); ke(i + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); ke(i - 1); } };
    return (
        <div className="kr-car" tabIndex={0} onKeyDown={kunci} aria-roledescription="carousel" aria-label={p.judul}>
            <div className="kr-rel" ref={rel} onScroll={onScroll}>
                {lembar.map((l, n) => (
                    <div className="kr-sel" key={n} aria-hidden={n !== i}>
                        <LembarKr p={p} l={l} tema={ctx.tema[p.kat]} n={n} total={lembar.length}>
                            {p.game && <Permainan p={p} ganti={ganti} ctx={ctx} />}
                        </LembarKr>
                    </div>
                ))}
            </div>
            {lembar.length > 1 && (
                <>
                    {i > 0 && <button className="kr-panah kiri" onClick={() => ke(i - 1)} aria-label="Slide sebelumnya">‹</button>}
                    {i < lembar.length - 1 && <button className="kr-panah kanan" onClick={() => ke(i + 1)} aria-label="Slide berikutnya">›</button>}
                    <div className="kr-titik">{lembar.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
                </>
            )}
        </div>
    );
}

/* ── Brain games interaktif ── */
function Permainan({ p, ganti, ctx }: { p: KPost; ganti: (p: KPost) => void; ctx: Ctx }) {
    const g = p.game!; const [kirim, setKirim] = useState(false);
    const [hasil, setHasil] = useState<{ benar: boolean | null; jawaban?: number; penjelasan?: string; pilih?: number } | null>(p.jawab ? { benar: p.jawab.benar, jawaban: g.jawaban, penjelasan: g.penjelasan } : null);
    const jawab = async (pilihan: number | null, isi?: string) => {
        if (kirim || hasil) return; setKirim(true);
        try {
            const r = await apiPost<{ benar: boolean | null; jawaban?: number; penjelasan?: string; skor: { main: number; benar: number } }>('/api/kantor/kr/jawab', { id: p.id, pilihan, isi });
            setHasil({ ...r, pilih: pilihan ?? undefined });
            ganti({ ...p, jawab: { benar: r.benar, at: Date.now(), isi }, game: { ...g, jawaban: r.jawaban, penjelasan: r.penjelasan } });
            ctx.muatStatus();
        } catch (e: any) { ctx.pesan(String(e?.message || e)); }
        setKirim(false);
    };
    const umpan = hasil && (
        <div className={`krg-hasil ${hasil.benar === true ? 'benar' : hasil.benar === false ? 'salah' : ''}`}>
            <b>{hasil.benar === true ? 'Tepat!' : hasil.benar === false ? 'Belum tepat.' : 'Terima kasih, jawabanmu tersimpan.'}</b>
            {hasil.penjelasan && <span>{g.jenis === 'imajinasi' ? `Contoh jawaban: ${hasil.penjelasan}` : hasil.penjelasan}</span>}
        </div>
    );
    if (g.urutan) return <GameIngat g={g} selesai={!!hasil} kirim={(isi) => jawab(null, isi)} umpan={umpan} />;
    if (g.pilihan?.length) return (
        <div className="krg">
            <div className="krg-pilih">
                {g.pilihan.map((x, n) => {
                    const st = hasil ? (n === hasil.jawaban ? 'benar' : n === hasil.pilih ? 'salah' : 'redup') : '';
                    return <button key={n} className={st} disabled={!!hasil || kirim} onClick={() => jawab(n)}>{x}</button>;
                })}
            </div>
            {umpan}
        </div>
    );
    return <GameBebas selesai={!!hasil} kirim={(isi) => jawab(null, isi)} umpan={umpan} awal={p.jawab?.isi} />;
}
function GameIngat({ g, selesai, kirim, umpan }: { g: KPost['game'] & {}; selesai: boolean; kirim: (isi: string) => void; umpan: React.ReactNode }) {
    const [tahap, setTahap] = useState<'siap' | 'lihat' | 'ketuk'>(selesai ? 'ketuk' : 'siap');
    const [sisa, setSisa] = useState(g.tampilDetik || 4);
    const [pilih, setPilih] = useState<string[]>([]);
    const pool = useMemo(() => Array.from(g.acak || g.urutan!.join('')), [g]);
    useEffect(() => {
        if (tahap !== 'lihat') return;
        if (sisa <= 0) { setTahap('ketuk'); return; }
        const t = setTimeout(() => setSisa((s) => s - 1), 1000); return () => clearTimeout(t);
    }, [tahap, sisa]);
    const ketuk = (x: string) => { if (selesai || pilih.includes(x)) return; const b = [...pilih, x]; setPilih(b); if (b.length === g.urutan!.length) kirim(b.join(',')); };
    if (tahap === 'siap') return <div className="krg"><button className="krg-mulai" onClick={() => setTahap('lihat')}>Mulai ({g.tampilDetik || 4} detik)</button></div>;
    if (tahap === 'lihat') return <div className="krg"><div className="krg-urut">{g.urutan!.map((x, n) => <span key={n}>{x}</span>)}</div><small className="krg-detik">Hafalkan… {sisa}</small></div>;
    return (
        <div className="krg">
            <div className="krg-urut isi">{g.urutan!.map((x, n) => <span key={n} className={selesai ? (pilih[n] && pilih[n] !== x ? 'salah' : 'benar') : ''}>{selesai ? x : pilih[n] || '·'}</span>)}</div>
            {!selesai && <div className="krg-pool">{pool.map((x) => <button key={x} disabled={pilih.includes(x)} onClick={() => ketuk(x)}>{x}</button>)}</div>}
            {!selesai && !!pilih.length && <button className="krg-ulang" onClick={() => setPilih([])}>Ulangi</button>}
            {umpan}
        </div>
    );
}
function GameBebas({ selesai, kirim, umpan, awal }: { selesai: boolean; kirim: (isi: string) => void; umpan: React.ReactNode; awal?: string }) {
    const [t, setT] = useState(awal || '');
    return (
        <div className="krg">
            {selesai ? (awal && <p className="krg-jawabku">“{awal}”</p>) : (
                <>
                    <textarea value={t} onChange={(e) => setT(e.target.value)} placeholder="Tulis jawabanmu…" rows={3} maxLength={1000} />
                    <button className="krg-mulai" disabled={t.trim().length < 3} onClick={() => kirim(t.trim())}>Kirim jawaban</button>
                </>
            )}
            {umpan}
        </div>
    );
}

/* ── Catatan (komentar pribadi) & simpan ke folder ── */
function PanelCatatan({ p, ctx, ganti, tutup }: { p: KPost; ctx: Ctx; ganti: (p: KPost) => void; tutup: () => void }) {
    const [t, setT] = useState(''); const [kirim, setKirim] = useState(false);
    const tambah = async () => {
        if (!t.trim()) return; setKirim(true);
        try {
            const r = await apiPost<{ catatan: KCatatan; vault: string }>('/api/kantor/kr/catatan', { postId: p.id, teks: t });
            ganti({ ...p, catatan: [...(p.catatan || []), r.catatan] }); setT('');
            ctx.pesan(r.vault ? 'Catatan tersimpan — juga ada di Catatan › Knowledge Reels.' : 'Catatan tersimpan.');
        } catch (e: any) { ctx.pesan(String(e?.message || e)); }
        setKirim(false);
    };
    const hapus = async (c: KCatatan) => { try { await apiPost(`/api/kantor/kr/catatan/${c.id}/hapus`, {}); ganti({ ...p, catatan: (p.catatan || []).filter((x) => x.id !== c.id) }); } catch (e: any) { ctx.pesan(String(e?.message || e)); } };
    return (
        <div className="kr-panel">
            <div className="kr-panel-h"><b>Catatan saya</b><small>Hanya untuk Bapak · ikut tersimpan di halaman Catatan</small><button onClick={tutup} aria-label="Tutup">×</button></div>
            {(p.catatan || []).map((c) => (
                <div key={c.id} className="kr-cat"><p>{c.teks}</p><small>{jamId(c.at)}</small><button onClick={() => hapus(c)}>Hapus</button></div>
            ))}
            <div className="kr-cat-tulis">
                <textarea value={t} onChange={(e) => setT(e.target.value)} placeholder="Tulis catatan tentang postingan ini…" rows={2} maxLength={3000}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) tambah(); }} />
                <button className="btn primary" disabled={kirim || !t.trim()} onClick={tambah}>Simpan catatan</button>
            </div>
        </div>
    );
}
function PanelSimpan({ p, ctx, ganti, tutup }: { p: KPost; ctx: Ctx; ganti: (p: KPost) => void; tutup: () => void }) {
    const [baru, setBaru] = useState(''); const [folder, setFolder] = useState(ctx.folder);
    useEffect(() => setFolder(ctx.folder), [ctx.folder]);
    const atur = async (fid: string, ya: boolean) => {
        try { const r = await apiPost<{ folder: string[] }>('/api/kantor/kr/simpan', { postId: p.id, folderId: fid, ya }); ganti({ ...p, folder: r.folder }); ctx.muatStatus(); }
        catch (e: any) { ctx.pesan(String(e?.message || e)); }
    };
    const buat = async () => {
        if (!baru.trim()) return;
        try { const r = await apiPost<{ folder: { id: string; nama: string } }>('/api/kantor/kr/folder', { nama: baru }); setFolder((f) => [...f, { id: r.folder.id, nama: r.folder.nama, n: 0, sampul: null }]); setBaru(''); await atur(r.folder.id, true); }
        catch (e: any) { ctx.pesan(String(e?.message || e)); }
    };
    return (
        <div className="kr-panel">
            <div className="kr-panel-h"><b>Simpan ke folder</b><small>Pilih satu atau beberapa</small><button onClick={tutup} aria-label="Tutup">×</button></div>
            <div className="kr-folder-pilih">
                {folder.map((f) => {
                    const on = !!p.folder?.includes(f.id);
                    return <label key={f.id} className={on ? 'on' : ''}><input type="checkbox" checked={on} onChange={() => atur(f.id, !on)} /><span>{f.nama}</span><small>{f.n}</small></label>;
                })}
            </div>
            <div className="kr-cat-tulis baris"><input value={baru} onChange={(e) => setBaru(e.target.value)} placeholder="Nama folder baru" maxLength={40} onKeyDown={(e) => { if (e.key === 'Enter') buat(); }} /><button className="btn" disabled={!baru.trim()} onClick={buat}>Buat & simpan</button></div>
        </div>
    );
}

/* ── Daftar tema ("akun") & profil tema ── */
function DaftarTema({ ctx, st }: { ctx: Ctx; st: Status | null }) {
    return (
        <div className="kr-hal">
            <h2 className="kr-hal-j">Tema</h2>
            <p className="kr-hal-k">Tiap tema seperti satu akun. Buka untuk melihat semua postingannya, termasuk yang sudah dibaca.</p>
            <div className="kr-tema-grid">
                {Object.entries(ctx.tema).map(([k, t]) => (
                    <button key={k} className="kr-tema-k" onClick={() => ctx.bukaTema(k)}>
                        <span className={`kr-ava ${st?.per[k]?.baru ? 'baru' : ''}`}><span>{t.ikon}</span></span>
                        <b>{t.nama}</b><small>{st?.per[k]?.total || 0} postingan{st?.per[k]?.baru ? ` · ${st.per[k].baru} baru` : ''}</small>
                        <em>{t.ket}</em>
                    </button>
                ))}
            </div>
        </div>
    );
}
function ProfilTema({ ctx, kat, kembali }: { ctx: Ctx; kat: string; kembali: () => void }) {
    const r = useApi<{ info: KTema; jumlah: number; dibaca: number; post: KPost[] }>(`/api/kantor/kr/tema/${kat}`, 60_000);
    const [filter, setFilter] = useState<'semua' | 'belum' | 'dibaca'>('semua');
    const t = ctx.tema[kat] || r.data?.info;
    const list = (r.data?.post || []).filter((p) => filter === 'semua' || (filter === 'dibaca' ? p.baca : !p.baca));
    return (
        <div className="kr-hal">
            <button className="kr-kembali" onClick={kembali}>‹ Semua tema</button>
            <header className="kr-profil">
                <span className="kr-ava besar"><span>{t?.ikon}</span></span>
                <div>
                    <h2>{t?.nama}</h2>
                    <div className="kr-profil-angka"><span><b>{r.data?.jumlah ?? '–'}</b> postingan</span><span><b>{r.data?.dibaca ?? '–'}</b> sudah dibaca</span></div>
                    <p>{t?.ket}</p>
                </div>
            </header>
            <div className="kr-saring">{(['semua', 'belum', 'dibaca'] as const).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'semua' ? 'Semua' : f === 'belum' ? 'Belum dibaca' : 'Sudah dibaca'}</button>)}</div>
            {r.error && <div className="kr-akhir">⚠️ {r.error}</div>}
            {!r.data && !r.error && <div className="kr-akhir">Memuat…</div>}
            {r.data && !list.length && <div className="kr-akhir">Belum ada postingan di sini.</div>}
            <div className="kr-grid">{list.map((p) => <SampulKr key={p.id} p={p} tema={t} onClick={() => ctx.bukaPost(p.id)} tanda={p.baca ? '✓' : p.folder?.length ? '★' : p.catatan?.length ? '✎' : undefined} />)}</div>
        </div>
    );
}
function Tersimpan({ ctx, folder, setFolder }: { ctx: Ctx; folder: string; setFolder: (f: string) => void }) {
    const r = useApi<{ folder: { id: string; nama: string }; post: KPost[] }>(`/api/kantor/kr/tersimpan?folder=${folder}`, 60_000);
    const ubah = async (id: string, lama: string) => { const n = prompt('Nama folder', lama); if (!n?.trim()) return; try { await apiPost(`/api/kantor/kr/folder/${id}/ubah`, { nama: n }); ctx.muatStatus(); } catch (e: any) { ctx.pesan(String(e?.message || e)); } };
    const hapus = async (id: string) => { if (!confirm('Hapus folder ini? Postingannya tidak ikut terhapus.')) return; try { await apiPost(`/api/kantor/kr/folder/${id}/hapus`, {}); ctx.muatStatus(); setFolder('umum'); } catch (e: any) { ctx.pesan(String(e?.message || e)); } };
    const f = ctx.folder.find((x) => x.id === folder);
    return (
        <div className="kr-hal">
            <h2 className="kr-hal-j">Tersimpan</h2>
            <div className="kr-saring">{ctx.folder.map((x) => <button key={x.id} className={folder === x.id ? 'on' : ''} onClick={() => setFolder(x.id)}>{x.nama} <small>{x.n}</small></button>)}</div>
            {f && f.id !== 'umum' && <div className="kr-folder-aksi"><button onClick={() => ubah(f.id, f.nama)}>Ganti nama</button><button onClick={() => hapus(f.id)}>Hapus folder</button></div>}
            {r.data && !r.data.post.length && <div className="kr-akhir">Folder ini masih kosong. Tekan ☆ Simpan di postingan mana pun untuk menyimpannya di sini.</div>}
            <div className="kr-grid">{(r.data?.post || []).map((p) => <SampulKr key={p.id} p={p} tema={ctx.tema[p.kat]} onClick={() => ctx.bukaPost(p.id)} />)}</div>
        </div>
    );
}

/* ── Kolom samping (laptop), seperti saran akun di Instagram ── */
function Samping({ ctx, st, setView }: { ctx: Ctx; st: Status | null; setView: (v: View) => void }) {
    const [pasang, setPasang] = useState(false);
    const bentuk = async () => { setPasang(true); try { await apiPost('/api/kantor/kr/pasang', {}); ctx.pesan('Kirana siap bekerja.'); ctx.muatStatus(); } catch (e: any) { ctx.pesan(String(e?.message || e)); } setPasang(false); };
    return (
        <aside className="kr-samping">
            <div className="kr-ringkas">
                <div><b>{st?.hariIni ?? '–'}</b><small>terbit hari ini</small></div>
                <div><b>{st?.dibaca ?? '–'}</b><small>sudah dibaca</small></div>
                <div><b>{st ? `${st.skor.benar}/${st.skor.main}` : '–'}</b><small>brain games benar</small></div>
            </div>
            <div className="kr-sm-h"><b>Tema</b><button onClick={() => setView({ v: 'tema' })}>Lihat semua</button></div>
            {Object.entries(ctx.tema).map(([k, t]) => (
                <button key={k} className="kr-sm-tema" onClick={() => ctx.bukaTema(k)}>
                    <span className={`kr-ava kecil ${st?.per[k]?.baru ? 'baru' : ''}`}><span>{t.ikon}</span></span>
                    <span><b>{t.nama}</b><small>{st?.per[k]?.baru ? `${st.per[k].baru} baru` : `${st?.per[k]?.total || 0} postingan`}</small></span>
                </button>
            ))}
            <div className="kr-sm-h"><b>Tersimpan</b><button onClick={() => setView({ v: 'simpan', folder: 'umum' })}>Buka</button></div>
            <div className="kr-sm-folder">{(st?.folder || []).map((f) => <button key={f.id} onClick={() => setView({ v: 'simpan', folder: f.id })}>{f.nama}<small>{f.n}</small></button>)}</div>
            <details className="kr-tim">
                <summary>Tim redaksi ({st?.tim.length || 0} AI)</summary>
                {st?.tim.map((a) => <div key={a.id}><b>{a.nama}</b><small>{a.peran}{a.ada ? '' : ' · otak cadangan'}</small></div>)}
                {st && !st.siap && <button className="btn" disabled={pasang} onClick={bentuk}>{pasang ? 'Membentuk…' : 'Bentuk profil Kirana'}</button>}
                {!!st?.log.length && <div className="kr-log">{st.log.slice(0, 6).map((l, i) => <small key={i}>{jamId(l.at)} · {l.teks}</small>)}</div>}
            </details>
        </aside>
    );
}

/* ── Buka satu postingan (dari grid tema/tersimpan/Catatan) ── */
function ModalPost({ id, ctx, tutup }: { id: string; ctx: Ctx; tutup: () => void }) {
    const [p, setP] = useState<KPost | null>(null); const [galat, setGalat] = useState('');
    useEffect(() => { apiGet<{ post: KPost }>(`/api/kantor/kr/post/${id}`).then((r) => setP(r.post)).catch((e) => setGalat(String(e?.message || e))); }, [id]);
    useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') tutup(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [tutup]);
    return (
        <div className="kr-modal" onClick={(e) => { if (e.target === e.currentTarget) tutup(); }} role="dialog" aria-modal="true">
            <button className="kr-modal-x" onClick={tutup} aria-label="Tutup">×</button>
            <div className="kr-modal-isi">
                {galat && <div className="kr-akhir">⚠️ {galat}</div>}
                {!p && !galat && <div className="kr-akhir">Memuat…</div>}
                {p && <Pos p={p} ctx={ctx} ganti={setP} diModal />}
            </div>
        </div>
    );
}
