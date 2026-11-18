import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../../kantor/api';
import { apiGet, apiPost } from '../../kantor/connection';
import { Markdown } from './Markdown';
import { Gambar } from './Gambar';
import { eventBus } from '../../events';
import { SampulKr, type KPost, type KTema } from '../kr/Slide';

import { Ikon } from '../../components/Ikon';
interface Simpul { nama: string; path: string; folder: boolean; mtime: number; size?: number; anak?: Simpul[] }
interface Pohon { pohon: Simpul; sinkron: { pushAt: number; error: string } }
const WARNA_BUKU = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2', '#4f46e5'];
const judul = (nama: string) => nama.replace(/\.md$/i, '');
const waktu = (ms: number) => new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

function semuaFile(s: Simpul, out: Simpul[] = []) { for (const a of s.anak || []) (a.folder ? semuaFile(a, out) : out.push(a)); return out; }
function cariSimpul(s: Simpul, p: string): Simpul | null { if (s.path === p) return s; for (const a of s.anak || []) { const r = a.folder ? cariSimpul(a, p) : null; if (r) return r; } return null; }

export function CatatanPage() {
    const ph = useApi<Pohon>('/api/kantor/catatan/pohon', 60_000);
    const [buku, setBuku] = useState<string>(() => { try { return localStorage.getItem('kantor:cat-buku') || ''; } catch { return ''; } });
    const [bagian, setBagian] = useState<string>('');
    const [hal, setHal] = useState<string>(() => { try { return localStorage.getItem('kantor:cat-hal') || ''; } catch { return ''; } });
    const [layar, setLayar] = useState<'buku' | 'halaman' | 'editor' | 'kr'>(() => (hal ? 'editor' : 'buku'));
    const [q, setQ] = useState('');
    const [hasil, setHasil] = useState<Array<{ path: string; cuplikan: string }> | null>(null);
    useEffect(() => { try { localStorage.setItem('kantor:cat-buku', buku); localStorage.setItem('kantor:cat-hal', hal); } catch { /* */ } }, [buku, hal]);

    const root = ph.data?.pohon;
    const bukuList = (root?.anak || []).filter((a) => a.folder);
    const bukuAktif = root && buku ? cariSimpul(root, buku) : null;
    const folderAktif = root ? (bagian ? cariSimpul(root, bagian) : bukuAktif) : null;
    const halaman = (folderAktif?.anak || []).filter((a) => !a.folder && a.nama.endsWith('.md')).sort((a, b) => b.mtime - a.mtime);
    const files = useMemo(() => (root ? semuaFile(root) : []), [root]);
    const cariFile = useCallback((nama: string) => {
        const n = nama.toLowerCase();
        return files.find((f) => f.path.toLowerCase() === n)?.path || files.find((f) => f.nama.toLowerCase() === n.split('/').pop())?.path || null;
    }, [files]);

    useEffect(() => {
        if (q.trim().length < 2) { setHasil(null); return; }
        const t = setTimeout(() => apiGet<{ hasil: any[] }>(`/api/kantor/catatan/cari?q=${encodeURIComponent(q)}`).then((r) => setHasil(r.hasil)).catch(() => setHasil([])), 300);
        return () => clearTimeout(t);
    }, [q]);

    const bukaHal = (p: string) => {
        setHal(p);
        const parts = p.split('/');
        if (parts.length > 1) setBuku(parts[0]);
        setBagian(parts.length > 2 ? parts.slice(0, -1).join('/') : '');
        setLayar('editor');
    };
    const halBaru = async () => {
        const nama = prompt('Judul halaman baru', `Catatan ${new Date().toLocaleDateString('id-ID')}`);
        if (!nama) return;
        const folder = folderAktif?.path || '';
        const p = [folder, `${nama.replace(/[\\/:*?"<>|#^[\]]/g, '').trim()}.md`].filter(Boolean).join('/');
        await apiPost('/api/kantor/catatan/tulis', { p, isi: `# ${nama}\n\n` });
        try { localStorage.setItem('kantor:cat-mode', 'edit'); } catch { /* */ }
        await ph.reload();
        bukaHal(p);
    };
    const folderBaru = async (induk: string, label: string) => {
        const nama = prompt(label);
        if (!nama) return;
        const p = [induk, nama.replace(/[\\/:*?"<>|#^[\]]/g, '').trim()].filter(Boolean).join('/');
        await apiPost('/api/kantor/catatan/folder', { p });
        await ph.reload();
        if (!induk) { setBuku(p); setBagian(''); } else setBagian(p);
        setLayar('halaman');
    };

    if (ph.error) return <div className="pg"><div className="sb-card fin-empty"><Ikon e="📓" /> {ph.error}<br /><small>Catatan memakai Otak Kantor (Obsidian) yang tersimpan di VPS.</small></div></div>;

    return (
        <div className={`cat layar-${layar}`}>
            <aside className="cat-buku">
                <div className="cat-h"><b><Ikon e="📓" /> Buku catatan</b><button onClick={() => folderBaru('', 'Nama buku catatan baru')} title="Buku baru">＋</button></div>
                <div className="sb-search cat-search"><span><Ikon e="⌕" /></span><input placeholder="Cari di semua catatan" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                {hasil && (
                    <div className="cat-hasil">
                        {hasil.length === 0 && <small>Tidak ditemukan.</small>}
                        {hasil.map((h) => <button key={h.path} onClick={() => { bukaHal(h.path); setQ(''); }}><b>{judul(h.path.split('/').pop()!)}</b><small>{h.path.split('/').slice(0, -1).join(' › ')}</small>{h.cuplikan && <em>…{h.cuplikan}…</em>}</button>)}
                    </div>
                )}
                {!hasil && <button className={`cat-kr-btn ${layar === 'kr' ? 'on' : ''}`} onClick={() => setLayar('kr')}><span><Ikon e="🧠" /></span><b>Dari Knowledge Reels</b><small>Catatan di postingan</small></button>}
                {!hasil && bukuList.map((b, i) => (
                    <div key={b.path} className="cat-book">
                        <button className={`cat-book-btn ${buku === b.path ? 'on' : ''}`} onClick={() => { setBuku(b.path); setBagian(''); setLayar('halaman'); }}>
                            <i style={{ background: WARNA_BUKU[i % WARNA_BUKU.length] }} />{b.nama}<small>{semuaFile(b).filter((f) => f.nama.endsWith('.md')).length}</small>
                        </button>
                        {buku === b.path && (
                            <div className="cat-sections">
                                {(b.anak || []).filter((a) => a.folder).map((s) => (
                                    <button key={s.path} className={bagian === s.path ? 'on' : ''} onClick={() => { setBagian(s.path); setLayar('halaman'); }} style={{ borderLeftColor: WARNA_BUKU[i % WARNA_BUKU.length] }}>{s.nama}</button>
                                ))}
                                <button className="add" onClick={() => folderBaru(b.path, 'Nama bagian baru')}>＋ Bagian</button>
                            </div>
                        )}
                    </div>
                ))}
                {ph.data?.sinkron && <div className="cat-sync">{ph.data.sinkron.error ? <><Ikon e="⚠" /> {`${ph.data.sinkron.error}`}</> : ph.data.sinkron.pushAt ? <><Ikon e="☁" /> {`Tersinkron ke Obsidian ${waktu(ph.data.sinkron.pushAt)}`}</> : <><Ikon e="☁" /> {'Tersinkron otomatis ke Obsidian'}</>}</div>}
            </aside>

            {layar === 'kr' && <CatatanKr kembali={() => setLayar('buku')} />}
            <section className="cat-hal">
                <div className="cat-h">
                    <button className="cat-back" onClick={() => setLayar('buku')}>‹</button>
                    <b>{folderAktif ? (bagian ? `${bukuAktif?.nama} › ${folderAktif.nama}` : folderAktif.nama) : 'Pilih buku'}</b>
                    {folderAktif && <button onClick={halBaru} title="Halaman baru">＋</button>}
                </div>
                {bukuAktif && (bukuAktif.anak || []).some((a) => a.folder) && (
                    <div className="cat-secchips">
                        <button className={!bagian ? 'on' : ''} onClick={() => setBagian('')}>Semua di {bukuAktif.nama}</button>
                        {(bukuAktif.anak || []).filter((a) => a.folder).map((s2) => <button key={s2.path} className={bagian === s2.path ? 'on' : ''} onClick={() => setBagian(s2.path)}>{s2.nama}</button>)}
                    </div>
                )}
                {folderAktif && halaman.length === 0 && <div className="fin-empty">Belum ada halaman.<br /><button className="btn primary" style={{ marginTop: 8 }} onClick={halBaru}>＋ Halaman baru</button></div>}
                {halaman.map((h) => (
                    <button key={h.path} className={`cat-page ${hal === h.path ? 'on' : ''}`} onClick={() => bukaHal(h.path)}>
                        <b>{judul(h.nama)}</b><small>{waktu(h.mtime)}</small>
                    </button>
                ))}
            </section>

            <section className="cat-ed">
                {hal ? <Editor key={hal} path={hal} cariFile={cariFile} bukaHal={bukaHal} onBack={() => setLayar('halaman')} onBerubah={() => ph.reload()} onHapus={() => { setHal(''); setLayar('halaman'); ph.reload(); }} />
                    : <div className="fin-empty cat-kosong">Pilih atau buat halaman.<br /><small>Semua yang ditulis di sini tersimpan di Otak Kantor dan ikut terbaca oleh tim AI (kecuali folder Pribadi di HP).</small></div>}
            </section>
        </div>
    );
}

function Editor({ path, cariFile, bukaHal, onBack, onBerubah, onHapus }: { path: string; cariFile: (n: string) => string | null; bukaHal: (p: string) => void; onBack: () => void; onBerubah: () => void; onHapus: () => void }) {
    const [isi, setIsi] = useState<string | null>(null);
    const [mtime, setMtime] = useState(0);
    const [mode, setMode] = useState<'baca' | 'edit'>(() => { try { return (localStorage.getItem('kantor:cat-mode') as any) || 'baca'; } catch { return 'baca'; } });
    const [status, setStatus] = useState('');
    const [gambar, setGambar] = useState<{ path?: string; awal?: string } | null>(null);
    const ta = useRef<HTMLTextAreaElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef({ isi: '', mtime: 0 });
    const kini = useRef('');
    const [rev, setRev] = useState(0);
    const folder = path.split('/').slice(0, -1).join('/');

    useEffect(() => { try { localStorage.setItem('kantor:cat-mode', mode); } catch { /* */ } }, [mode]);
    const muat = () => apiGet<{ isi: string; mtime: number }>(`/api/kantor/catatan/baca?p=${encodeURIComponent(path)}`).then((r) => { setIsi(r.isi); setMtime(r.mtime); latest.current = { isi: r.isi, mtime: r.mtime }; setStatus(''); }).catch((e) => setStatus(String(e.message || e)));
    useEffect(() => { muat(); }, [path]);

    const simpan = async (teks: string) => {
        setStatus('Menyimpan…');
        try {
            const r = await apiPost<{ mtime: number }>('/api/kantor/catatan/tulis', { p: path, isi: teks, mtime: latest.current.mtime });
            latest.current = { isi: teks, mtime: r.mtime }; setMtime(r.mtime);
            setStatus('✓ Tersimpan');
        } catch (e: any) { setStatus(`⚠️ ${e.message || e}`); }
    };
    const ubah = (teks: string) => {
        setIsi(teks); kini.current = teks;
        if (timer.current) clearTimeout(timer.current);
        setStatus('…');
        timer.current = setTimeout(() => simpan(teks), 1200);
    };
    useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); if (latest.current.isi !== kini.current) simpan(kini.current); } }, []); // simpan saat keluar

    const sisip = (awal: string, akhir = '', ph = '') => {
        const el = ta.current; if (!el || isi === null) return;
        const a = el.selectionStart, b = el.selectionEnd;
        const sel = isi.slice(a, b) || ph;
        const baru = isi.slice(0, a) + awal + sel + akhir + isi.slice(b);
        ubah(baru);
        requestAnimationFrame(() => { el.focus(); el.selectionStart = a + awal.length; el.selectionEnd = a + awal.length + sel.length; });
    };
    const awalBaris = (pref: string) => {
        const el = ta.current; if (!el || isi === null) return;
        const a = isi.lastIndexOf('\n', el.selectionStart - 1) + 1;
        ubah(isi.slice(0, a) + pref + isi.slice(a));
        requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = a + pref.length; });
    };
    const tambahDiAkhirAtauKursor = (teks: string) => {
        if (isi === null) return;
        const el = ta.current;
        if (mode === 'edit' && el) { const a = el.selectionStart; ubah(isi.slice(0, a) + teks + isi.slice(a)); }
        else ubah(`${isi.replace(/\s*$/, '')}\n\n${teks}\n`);
    };
    const unggah = async (f: File) => {
        if (f.size > 8 * 1024 * 1024) { setStatus('⚠️ Gambar maks 8 MB'); return; }
        setStatus('Mengunggah gambar…');
        const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(f); });
        const nama = `${Date.now().toString(36)}-${f.name.replace(/[^\w.-]+/g, '-')}`;
        try { const r = await apiPost<{ path: string }>('/api/kantor/catatan/unggah', { folder, nama, base64: b64 }); tambahDiAkhirAtauKursor(`![[${r.path.split('/').pop()}]]`); onBerubah(); }
        catch (e: any) { setStatus(`⚠️ ${e.message || e}`); }
    };
    const centang = (baris: number) => {
        if (isi === null) return;
        const ls = isi.split('\n');
        ls[baris] = ls[baris].replace(/\[( |x|X)\]/, (m) => (m === '[ ]' ? '[x]' : '[ ]'));
        ubah(ls.join('\n'));
    };
    const editGambar = async (p: string) => {
        try { const r = await apiGet<{ isi: string }>(`/api/kantor/catatan/baca?p=${encodeURIComponent(p)}`); setGambar({ path: p, awal: r.isi }); } catch (e: any) { setStatus(String(e.message || e)); }
    };

    if (isi === null) return <div className="fin-empty">{status || 'Memuat…'}</div>;
    const nama = path.split('/').pop()!.replace(/\.md$/, '');
    return (
        <div className="cat-editor">
            <div className="cat-ed-bar">
                <button className="cat-back" onClick={onBack}>‹</button>
                <div className="cat-ed-title"><b>{nama}</b><small>{path.split('/').slice(0, -1).join(' › ')}</small></div>
                <span className="cat-status">{status}</span>
                <div className="sb-seg"><button className={mode === 'baca' ? 'on' : ''} onClick={() => setMode('baca')}>Baca</button><button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}>Tulis</button></div>
                <details className="cat-more"><summary>⋯</summary><div>
                    <button onClick={async () => { const n = prompt('Ganti judul', nama); if (n && n !== nama) { const ke = [folder, `${n.replace(/[\\/:*?"<>|#^[\]]/g, '').trim()}.md`].filter(Boolean).join('/'); try { await apiPost('/api/kantor/catatan/pindah', { dari: path, ke }); onBerubah(); bukaHal(ke); } catch (e: any) { setStatus(String(e.message || e)); } } }}><Ikon e="✏" /> Ganti judul</button>
                    <button onClick={() => { muat(); }}><Ikon e="↻" /> Muat ulang</button>
                    <button onClick={async () => { if (confirm(`Pindahkan "${nama}" ke Sampah?`)) { await apiPost('/api/kantor/catatan/buang', { p: path }); onHapus(); } }}><Ikon e="🗑" /> Pindah ke Sampah</button>
                </div></details>
            </div>
            <div className="cat-tools">
                {mode === 'edit' && (
                    <>
                        <button onClick={() => sisip('**', '**', 'tebal')} title="Tebal"><b>B</b></button>
                        <button onClick={() => sisip('*', '*', 'miring')} title="Miring"><i>I</i></button>
                        <button onClick={() => sisip('==', '==', 'stabilo')} title="Stabilo"><mark>S</mark></button>
                        <button onClick={() => awalBaris('## ')} title="Judul">H</button>
                        <button onClick={() => awalBaris('- ')} title="Daftar">•</button>
                        <button onClick={() => awalBaris('- [ ] ')} title="Ceklis"><Ikon e="☑" /></button>
                        <button onClick={() => awalBaris('> ')} title="Kutipan">❝</button>
                        <button onClick={() => sisip('[[', ']]', 'Nama catatan')} title="Tautan ke catatan lain"><Ikon e="🔗" /></button>
                        <button onClick={() => sisip('\n| Kolom 1 | Kolom 2 |\n|---|---|\n| ', ' |  |\n', 'isi')} title="Tabel"><Ikon e="▦" /></button>
                    </>
                )}
                <button onClick={() => setGambar({})} title="Menggambar"><Ikon e="✏" /> Gambar</button>
                <label className="cat-upload" title="Sisipkan foto"><Ikon e="🖼" /> Foto<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) unggah(f); e.target.value = ''; }} /></label>
            </div>
            {mode === 'edit'
                ? <textarea ref={ta} className="cat-ta" value={isi} onChange={(e) => ubah(e.target.value)} spellCheck={false}
                    onPaste={(e) => { const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); unggah(f); } }} />
                : <div className="cat-read" onDoubleClick={() => setMode('edit')}><Markdown key={rev} teks={isi} folder={folder} cariFile={cariFile} bukaHalaman={bukaHal} centang={centang} editGambar={editGambar} /></div>}
            <div className="cat-foot mono">diubah {waktu(mtime)} · {isi.split(/\s+/).filter(Boolean).length} kata</div>
            {gambar && (
                <Gambar awal={gambar.awal} onTutup={() => setGambar(null)} onSimpan={async (svg) => {
                    const p = gambar.path || [folder, `gambar-${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 19).replace(/[-:T]/g, '')}.svg`].filter(Boolean).join('/');
                    await apiPost('/api/kantor/catatan/tulis', { p, isi: svg });
                    if (!gambar.path) tambahDiAkhirAtauKursor(`![[${p.split('/').pop()}]]`);
                    setGambar(null); onBerubah();
                    setRev((r) => r + 1); // segarkan gambar
                    setStatus('✓ Gambar tersimpan');
                }} />
            )}
        </div>
    );
}

interface ItemKr { id: string; postId: string; teks: string; at: number; berkas?: string; dari?: string; nama?: string; status?: string; post: (Pick<KPost, 'id' | 'kat' | 'judul' | 'desain' | 'slide' | 'tgl'> & { tema: KTema }) | null }
/** Catatan yang Bapak tulis di postingan Knowledge Reels, dengan sampul postingannya. Klik → kembali ke postingan itu. */
function CatatanKr({ kembali }: { kembali: () => void }) {
    const r = useApi<{ catatan: ItemKr[] }>('/api/kantor/kr/catatan', 60_000);
    const [q, setQ] = useState('');
    const list = (r.data?.catatan || []).filter((c) => !q.trim() || `${c.teks} ${c.post?.judul}`.toLowerCase().includes(q.toLowerCase()));
    const per = new Map<string, ItemKr[]>(); for (const c of list) per.set(c.postId, [...(per.get(c.postId) || []), c]);
    const buka = (id: string) => eventBus.dispatchEvent(new CustomEvent('open-kr', { detail: { id } }));
    return (
        <section className="cat-kr">
            <div className="cat-h"><button className="cat-back" onClick={kembali}>‹</button><b><Ikon e="🧠" /> Komentar di Knowledge Reels</b></div>
            <p className="cat-kr-ket">Semua catatan yang Bapak tulis di postingan Knowledge Reels. Tekan sampul untuk membuka postingannya lagi. Salinannya juga ada di buku “Knowledge Reels”.</p>
            <div className="sb-search cat-search"><span><Ikon e="⌕" /></span><input placeholder="Cari catatan" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {r.error && <div className="fin-empty"><Ikon e="⚠" /> {r.error}</div>}
            {r.data && !per.size && <div className="fin-empty">Belum ada catatan. Tekan <Ikon e="✎" /> Catatan di postingan Knowledge Reels untuk menulis.</div>}
            <div className="cat-kr-list">
                {[...per.entries()].map(([pid, cs]) => {
                    const p = cs[0].post!;
                    return (
                        <div key={pid} className="cat-kr-item">
                            <SampulKr p={{ ...p, sumber: [], oleh: [], dibuat: 0 } as KPost} tema={p.tema} onClick={() => buka(pid)} />
                            <div>
                                <button className="cat-kr-j" onClick={() => buka(pid)}>{p.judul}</button>
                                <small><Ikon e={p.tema.ikon} /> {p.tema.nama}</small>
                                {cs.filter((c) => c.status !== 'menunggu').map((c) => <p key={c.id} className={c.dari && c.dari !== 'rico' ? 'ai' : ''}>{c.dari && c.dari !== 'rico' ? <b>{c.nama}: </b> : null}{c.teks}<small>{waktu(c.at)}</small></p>)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
