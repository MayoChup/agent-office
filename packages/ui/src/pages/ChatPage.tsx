import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useKembali } from '../kantor/kembali';
import { apiGet, apiPost, getRoom, serverBase, tokenLogin } from '../kantor/connection';
import { eventBus } from '../events';
import { statusNotif, aktifkanNotif, matikanNotif, laporLihat, iosBrowser } from '../kantor/notif';
import { useAktif } from '../kantor/aktif';
import { useKantor, setChatOpen } from '../kantor/store';
import { Avatar } from '../components/Avatar';
import { RichText, pecahBalasan } from '../components/common/RichText';

import { Ikon } from '../components/Ikon';
import { konfirmasi } from '../components/Konfirmasi';
interface ThreadInfo { id: string; nama: string; peran: string; terakhir: { nama: string; teks: string; at: number } | null; menulis: string[]; grup?: boolean; ikon?: string; anggota?: string[] }
interface Lampiran { rel: string; nama: string; ukuran: number; jenis: 'gambar' | 'berkas' }
interface Pesan { id: string; dari: string; nama: string; teks: string; at: number; status?: 'gagal'; berat?: boolean; lampiran?: Lampiran[] }
const isGrup = (t?: ThreadInfo) => !!t && (t.grup || t.id === 'grup');

const LS_SEEN = 'kantor:chat-seen';
const KANTOR = '__kantor';
const jam = (at: number) => new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const tanggal = (at: number) => {
    const d = new Date(at + 7 * 3600_000).toISOString().slice(0, 10), now = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    return d === now ? jam(at) : `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;
};
const COLORS = ['#f59e0b', '#ec4899', '#22c55e', '#38bdf8', '#a78bfa', '#fb7185', '#2dd4bf', '#facc15'];
const warna = (id: string) => COLORS[Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % COLORS.length];

function readSeen(): Record<string, number> { try { return JSON.parse(localStorage.getItem(LS_SEEN) || '{}'); } catch { return {}; } }

export function ChatPage({ prefill }: { prefill?: string }) {
    const agents = useKantor((s) => s.agents);
    const [threads, setThreads] = useState<ThreadInfo[]>([]);
    const [open, setOpen] = useState<string | null>(() => { try { const c = sessionStorage.getItem('kantor:buka-chat'); if (c) { sessionStorage.removeItem('kantor:buka-chat'); return c; } } catch { /* */ } return window.innerWidth >= 768 ? 'grup' : null; });
    useKembali(!!open && window.innerWidth < 768, () => setOpen(null));
    const [grupForm, setGrupForm] = useState<ThreadInfo | 'baru' | null>(null);
    useEffect(() => { const f = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (id) { setOpen(id); try { sessionStorage.removeItem('kantor:buka-chat'); } catch { /* */ } } }; eventBus.addEventListener('buka-chat', f); return () => eventBus.removeEventListener('buka-chat', f); }, []);
    const [seen, setSeen] = useState<Record<string, number>>(readSeen);
    const [q, setQ] = useState('');
    const [err, setErr] = useState('');

    const aktif = useAktif();
    useEffect(() => {
        if (!aktif) return;
        let alive = true;
        const load = () => apiGet<{ thread: ThreadInfo[] }>('/api/kantor/chat').then((d) => { if (alive) { setThreads(d.thread); setErr(''); } }).catch((e) => alive && setErr(String(e.message || e)));
        load();
        const t = setInterval(load, 5000);
        return () => { alive = false; clearInterval(t); };
    }, [aktif]);

    const markSeen = (id: string, at: number) => setSeen((s) => {
        if ((s[id] || 0) >= at) return s;
        const n = { ...s, [id]: at };
        try { localStorage.setItem(LS_SEEN, JSON.stringify(n)); } catch { /* */ }
        return n;
    });
    const skin = (id: string) => agents.find((a) => a.id === id)?.skin;
    // Seperti WA: obrolan dengan pesan terbaru naik ke atas.
    const list = threads.filter((t) => !q || `${t.nama} ${t.peran}`.toLowerCase().includes(q.toLowerCase()))
        .map((t, i) => ({ t, i })).sort((a, b) => (b.t.terakhir?.at || 0) - (a.t.terakhir?.at || 0) || a.i - b.i).map((x) => x.t);
    const cur = threads.find((t) => t.id === open);

    return (
        <div className={`wa ${open ? 'has-open' : ''}`}>
            <aside className="wa-list">
                <div className="wa-list-head">
                    <div className="wa-list-top"><h2><Ikon e="💬" /> Chat</h2><TombolNotif /><button className="btn small" onClick={() => setGrupForm('baru')}>＋ Grup baru</button></div>
                    <input className="input" placeholder="Cari nama atau peran…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {err && <div className="error" style={{ margin: 10 }}>{err}</div>}
                <div className="wa-items">
                    {list.map((t) => {
                        const unread = t.terakhir && t.terakhir.nama !== 'Pak Rico' && t.terakhir.at > (seen[t.id] || 0) && open !== t.id;
                        const s = skin(t.id);
                        return (
                            <button key={t.id} className={`wa-item ${open === t.id ? 'active' : ''}`} onClick={() => setOpen(t.id)}>
                                <div className="wa-ava">{isGrup(t) ? <span className="wa-group-ico">{t.ikon || <Ikon e="👥" />}</span> : s !== undefined ? <Avatar skin={s} size={42} /> : <span className="wa-group-ico"><Ikon e="🤖" /></span>}</div>
                                <div className="wa-item-main">
                                    <div className="wa-item-top"><b>{t.nama}{t.peran && !isGrup(t) ? <span className="wa-jabatan"> - {t.peran}</span> : null}</b>{t.terakhir && <span className={unread ? 'unread' : ''}>{tanggal(t.terakhir.at)}</span>}</div>
                                    <div className="wa-item-sub">
                                        {t.menulis.length ? <em>{isGrup(t) ? `${t.menulis.map((id) => threads.find((x) => x.id === id)?.nama || id).join(', ')} mengetik…` : 'mengetik…'}</em>
                                            : t.terakhir ? <span>{isGrup(t) || t.terakhir.nama === 'Pak Rico' ? `${t.terakhir.nama === 'Pak Rico' ? 'Anda' : namaPeran(threads, t.terakhir.nama)}: ` : ''}{polos(t.terakhir.teks)}</span>
                                                : <span className="wa-role">{t.peran}</span>}
                                        {unread && <i className="wa-dot" />}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    <button className={`wa-item ${open === KANTOR ? 'active' : ''}`} onClick={() => setOpen(KANTOR)}>
                        <div className="wa-ava"><span className="wa-group-ico"><Ikon e="🏢" /></span></div>
                        <div className="wa-item-main">
                            <div className="wa-item-top"><b>Obrolan kantor</b></div>
                            <div className="wa-item-sub"><span className="wa-role">Celoteh tokoh kantor 2D & kabar papan tugas</span></div>
                        </div>
                    </button>
                </div>
            </aside>
            <section className="wa-thread">
                {open === KANTOR ? <KantorThread onBack={() => setOpen(null)} prefill={prefill} />
                    : cur ? <Thread key={cur.id} info={cur} threads={threads} skin={skin} onBack={() => setOpen(null)} onSeen={(at) => markSeen(cur.id, at)} onInfo={() => setGrupForm(cur)} />
                        : <div className="wa-empty">Pilih chat di sebelah kiri.<br /><small>Chat pribadi langsung ke AI Hermes (pakai ingatan & skill masing-masing). Di Grup Kantor semua AI membaca; yang menjawab yang paling relevan atau yang di-@sebut.</small></div>}
            </section>
            {grupForm && <FormGrup awal={grupForm === 'baru' ? null : grupForm} threads={threads} tutup={() => setGrupForm(null)} selesai={(id) => { setGrupForm(null); if (id) setOpen(id); else setOpen(null); }} />}
        </div>
    );
}

function Thread({ info, threads, skin, onBack, onSeen, onInfo }: { info: ThreadInfo; threads: ThreadInfo[]; skin: (id: string) => number | undefined; onBack: () => void; onSeen: (at: number) => void; onInfo: () => void }) {
    const [pesan, setPesan] = useState<Pesan[]>([]);
    const [menulis, setMenulis] = useState<string[]>([]);
    // Draf per obrolan: pindah thread lalu kembali, tulisan tidak hilang.
    const kunciDraf = `kantor:draf:${info.id}`;
    const [text, setTextRaw] = useState(() => { try { return sessionStorage.getItem(kunciDraf) || ''; } catch { return ''; } });
    const setText = (v: string | ((t: string) => string)) => setTextRaw((t) => { const n = typeof v === 'function' ? v(t) : v; try { if (n) sessionStorage.setItem(kunciDraf, n); else sessionStorage.removeItem(kunciDraf); } catch { /* */ } return n; });
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    useEffect(() => { const f = (e: Event) => { const t = String((e as CustomEvent).detail?.teks || ''); setText((x) => (x.startsWith('>') ? x.replace(/^(>.*\n)+/, '') : x).replace(/^/, t)); inputRef.current?.focus(); }; eventBus.addEventListener('chat-balas', f); return () => eventBus.removeEventListener('chat-balas', f); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const diBawah = useRef(true);
    const [baru, setBaru] = useState(0);
    const keBawah = (halus = false) => { const b = bodyRef.current; if (b) b.scrollTo({ top: b.scrollHeight, behavior: halus ? 'smooth' : 'auto' }); setBaru(0); };
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const grup = isGrup(info), kustom = grup && info.id !== 'grup';
    const anggota = threads.filter((t) => !isGrup(t) && (!kustom || info.anggota?.includes(t.id)));
    const [lamp, setLamp] = useState<Lampiran[]>([]);
    const [unggah, setUnggah] = useState<Array<{ id: string; nama: string; persen: number; error?: string }>>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const pilihFile = (files: FileList | null) => {
        for (const f of Array.from<File>(files || [])) {
            if (f.size > 50e6) { setErr(`${f.name} lebih dari 50 MB.`); continue; }
            const id = `${Date.now()}-${Math.random()}`;
            setUnggah((u) => [...u, { id, nama: f.name, persen: 0 }]);
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${serverBase()}/api/kantor/chat/${encodeURIComponent(info.id)}/unggah?nama=${encodeURIComponent(f.name)}&ukuran=${f.size}`);
            xhr.setRequestHeader('Authorization', `Bearer ${tokenLogin()}`);
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUnggah((u) => u.map((x) => (x.id === id ? { ...x, persen: Math.round((e.loaded / e.total) * 100) } : x))); };
            xhr.onload = () => {
                let r: any = {}; try { r = JSON.parse(xhr.responseText); } catch { /* */ }
                if (xhr.status < 300 && r.path) { setLamp((l) => [...l, { rel: r.path, nama: r.path.split('/').pop(), ukuran: r.size || f.size, jenis: /^image\//.test(f.type) ? 'gambar' : 'berkas' }]); setUnggah((u) => u.filter((x) => x.id !== id)); }
                else setUnggah((u) => u.map((x) => (x.id === id ? { ...x, error: r.error || `HTTP ${xhr.status}` } : x)));
            };
            xhr.onerror = () => setUnggah((u) => u.map((x) => (x.id === id ? { ...x, error: 'Koneksi terputus' } : x)));
            xhr.send(f);
        }
    };
    // Beri tahu server chat ini sedang dibuka → tidak ada notifikasi dobel.
    useEffect(() => {
        const lapor = () => laporLihat(document.visibilityState === 'visible' ? info.id : null);
        lapor(); const t = setInterval(lapor, 15_000); document.addEventListener('visibilitychange', lapor);
        return () => { clearInterval(t); document.removeEventListener('visibilitychange', lapor); laporLihat(null); };
    }, [info.id]);

    const load = async () => {
        try {
            const d = await apiGet<{ pesan: Pesan[]; menulis: string[] }>(`/api/kantor/chat/${encodeURIComponent(info.id)}`);
            setPesan(d.pesan); setMenulis(d.menulis); setErr('');
            const last = d.pesan[d.pesan.length - 1];
            if (last) onSeen(last.at);
        } catch (e: any) { setErr(String(e.message || e)); }
    };
    const aktif = useAktif();
    useEffect(() => {
        if (!aktif) return;
        load();
        const t = setInterval(load, 2500);
        return () => clearInterval(t);
    }, [info.id, aktif]);
    // Seperti WA: pesan baru → turun otomatis kalau Bapak memang di bawah; kalau sedang membaca ke atas, muncul tombol "pesan baru".
    const jumlahLalu = useRef(0);
    useEffect(() => {
        const tambah = pesan.length - jumlahLalu.current; const pertama = jumlahLalu.current === 0;
        jumlahLalu.current = pesan.length;
        const terakhirSaya = pesan[pesan.length - 1]?.dari === 'owner';
        if (pertama || diBawah.current || terakhirSaya) requestAnimationFrame(() => keBawah(!pertama));
        else if (tambah > 0) setBaru((n) => n + tambah);
    }, [pesan.length]);
    useEffect(() => { if (diBawah.current) requestAnimationFrame(() => keBawah(true)); }, [menulis.length]);

    const send = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const t = text.trim();
        if ((!t && !lamp.length) || sending || unggah.some((u) => !u.error)) return;
        setSending(true);
        try {
            const d = await apiPost<{ pesan: Pesan }>(`/api/kantor/chat/${encodeURIComponent(info.id)}`, { teks: t, lampiran: lamp });
            setPesan((p) => [...p, d.pesan]);
            setText(''); setLamp([]); setUnggah([]);
            setTimeout(load, 800);
        } catch (e: any) { setErr(String(e.message || e)); }
        setSending(false);
        inputRef.current?.focus();
    };

    const items = useMemo(() => {
        const out: Array<{ day?: string; m?: Pesan }> = [];
        let prevDay = '';
        for (const m of pesan) {
            const day = new Date(m.at + 7 * 3600_000).toISOString().slice(0, 10);
            if (day !== prevDay) { out.push({ day }); prevDay = day; }
            out.push({ m });
        }
        return out;
    }, [pesan]);
    const s = skin(info.id);
    const nama = (id: string) => threads.find((x) => x.id === id)?.nama || id;

    return (
        <>
            <header className="wa-head">
                <button className="icon-btn wa-back" onClick={onBack} aria-label="Kembali">‹</button>
                <div className="wa-ava sm">{grup ? <span className="wa-group-ico">{info.ikon || <Ikon e="👥" />}</span> : s !== undefined ? <Avatar skin={s} size={36} /> : <span className="wa-group-ico"><Ikon e="🤖" /></span>}</div>
                <div className="wa-head-main">
                    <b>{info.nama}{!grup && info.peran ? ` - ${info.peran}` : ''}</b>
                    <span>{menulis.length ? <em>{grup ? `${menulis.map(nama).join(', ')} mengetik…` : 'mengetik…'}</em> : grup ? anggota.map((a) => a.nama).join(', ') : info.peran}</span>
                </div>
                {kustom && <button className="icon-btn" onClick={onInfo} aria-label="Info grup" title="Info grup">⋮</button>}
            </header>
            <div className="wa-body" ref={bodyRef} onScroll={(e) => { const b = e.currentTarget; diBawah.current = b.scrollHeight - b.scrollTop - b.clientHeight < 80; if (diBawah.current && baru) setBaru(0); }}>
                {pesan.length === 0 && (
                    <div className="wa-note">{kustom ? `Grup ini berisi ${anggota.map((a) => a.nama).join(', ')}. Tulis @Nama untuk memanggil orang tertentu; tanpa tag, yang paling relevan yang menjawab.` : grup ? 'Semua AI kantor ada di grup ini. Tulis @Nama untuk memanggil orang tertentu, atau @semua untuk para kepala divisi.' : `Chat langsung dengan ${info.nama}. Balasan bisa butuh 10–60 detik karena ${info.nama} benar-benar bekerja (pakai skill & ingatannya).`}</div>
                )}
                {items.map((it, i) => it.day ? <div key={`d${i}`} className="wa-day"><span>{dayLabel(it.day)}</span></div> : it.m!.dari === 'sistem' ? <div key={it.m!.id} className="wa-day wa-sistem"><span>{it.m!.teks}</span></div> : (
                    <Bubble key={it.m!.id} m={it.m!} grup={grup} peran={threads.find((x) => x.id === it.m!.dari)?.peran} />
                ))}
                {menulis.map((id) => <div key={`t-${id}`} className="wa-bubble them typing">{grup && <div className="wa-name" style={{ color: warna(id) }}>{nama(id)}</div>}<span className="dots"><i /><i /><i /></span></div>)}
                <div ref={endRef} />
            </div>
            {baru > 0 && <button type="button" className="wa-baru" onClick={() => keBawah(true)}>↓ {baru} pesan baru</button>}
            {err && <div className="error" style={{ margin: '0 12px 6px' }}>{err}</div>}
            {grup && (
                <div className="wa-mentions">
                    {[...(kustom ? [] : ['semua']), ...anggota.map((a) => a.nama)].map((n) => (
                        <button key={n} type="button" onClick={() => { setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${n} `); inputRef.current?.focus(); }}>@{n}</button>
                    ))}
                </div>
            )}
            {(lamp.length > 0 || unggah.length > 0) && (
                <div className="wa-lamp-antre">
                    {lamp.map((l) => <span key={l.rel} className="wa-lamp-chip">{l.jenis === 'gambar' ? <Ikon e="🖼" /> : <Ikon e="📄" />} {l.nama}<button type="button" onClick={() => setLamp((x) => x.filter((y) => y.rel !== l.rel))} aria-label="Hapus lampiran">×</button></span>)}
                    {unggah.map((u) => <span key={u.id} className={`wa-lamp-chip ${u.error ? 'gagal' : ''}`}><Ikon e="⏳" /> {u.nama} {u.error ? `· ${u.error}` : `${u.persen}%`}{u.error && <button type="button" onClick={() => setUnggah((x) => x.filter((y) => y.id !== u.id))}>×</button>}</span>)}
                </div>
            )}
            <form className="wa-input" onSubmit={send}>
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => { pilihFile(e.target.files); e.target.value = ''; }} />
                <button type="button" className="wa-klip" onClick={() => fileRef.current?.click()} aria-label="Lampirkan file atau gambar" title="Lampirkan file atau gambar"><Ikon e="📎" /></button>
                <textarea ref={inputRef} rows={1} placeholder={grup ? 'Tulis ke grup…' : `Tulis ke ${info.nama}…`} value={text}
                    onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) { e.preventDefault(); send(); } }} />
                <button className="wa-send" type="submit" disabled={(!text.trim() && !lamp.length) || sending || unggah.some((u) => !u.error)} aria-label="Kirim">➤</button>
            </form>
        </>
    );
}

/** "Joni" → "Joni - Kepala Kantor" (nama di pratinjau pesan terakhir). */
function namaPeran(threads: ThreadInfo[], nama: string) { const t = threads.find((x) => x.nama === nama || nama.startsWith(`${x.nama} `)); return t?.peran && t.id !== 'grup' ? `${nama} - ${t.peran}` : nama; }

function Bubble({ m, grup, peran }: { m: Pesan; grup: boolean; peran?: string }) {
    const me = m.dari === 'owner';
    const [salin, setSalin] = useState(false);
    // Tekan lama (HP) / klik kanan (laptop) = menu Balas & Salin, seperti WA.
    const [menu, setMenu] = useState(false);
    const tekan = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mulaiTekan = () => { tekan.current = setTimeout(() => { setMenu(true); try { navigator.vibrate?.(10); } catch { /* */ } }, 450); };
    const batalTekan = () => { if (tekan.current) clearTimeout(tekan.current); };
    const balas = () => { eventBus.dispatchEvent(new CustomEvent('chat-balas', { detail: { teks: `> ${me ? 'Saya' : m.nama}: ${(m.teks || '').replace(/\s+/g, ' ').slice(0, 140)}${(m.teks || '').length > 140 ? '…' : ''}\n` } })); setMenu(false); };
    const gagal = m.status === 'gagal' || (!me && /^\W*\S+ gagal membalas:/.test(m.teks || ''));
    if (gagal) {
        const sebab = (m.teks || '').replace(/^\W*\S+ gagal membalas:\s*/, '');
        return (
            <div className="wa-gagal" role="status">
                <Ikon e="⚠" /> <span><b>{m.nama} belum bisa membalas.</b> Kirim pesan lagi sebentar lagi.{sebab && <small title={sebab}>Detail teknis: {sebab.slice(0, 120)}</small>}</span>
                <span className="wa-time">{jam(m.at)}</span>
            </div>
        );
    }
    // Balasan AI yang panjang dipecah jadi beberapa gelembung (seperti orang mengetik beberapa pesan).
    const bagian = me || !m.teks ? [m.teks] : pecahBalasan(m.teks);
    const copy = () => { try { void navigator.clipboard.writeText(m.teks); setSalin(true); setTimeout(() => setSalin(false), 1500); } catch { /* */ } };
    return (
        <>
            {bagian.map((teks, i) => {
                const akhir = i === bagian.length - 1;
                return (
                    <div key={i} className={`wa-bubble ${me ? 'me' : 'them'} ${i ? 'lanjut' : ''}`} onTouchStart={mulaiTekan} onTouchEnd={batalTekan} onTouchMove={batalTekan} onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}>
                        {menu && akhir && <div className="wa-menu" onClick={(e) => e.stopPropagation()}><button onClick={balas}>Balas</button><button onClick={() => { copy(); setMenu(false); }}>Salin</button><button onClick={() => setMenu(false)}>Tutup</button></div>}
                        {i === 0 && grup && !me && <div className="wa-name" style={{ color: warna(m.dari) }}>{m.nama}{peran ? <span className="wa-jabatan"> - {peran}</span> : null}</div>}
                        {i === 0 && !!m.lampiran?.length && <div className="wa-lamp">{m.lampiran.map((l) => <LampiranView key={l.rel} l={l} />)}</div>}
                        {teks && <div className="wa-text">{me && !/^>/m.test(teks) ? teks : <RichText text={teks} />}</div>}
                        {akhir && (
                            <div className="wa-time">
                                {!me && m.teks && m.teks.length > 80 && <button type="button" className="wa-salin" onClick={copy} aria-label="Salin pesan">{salin ? 'Tersalin' : 'Salin'}</button>}
                                {m.berat && <span className="wa-berat" title="Dikerjakan dengan model berbayar (Claude) atas keputusan Joni"><Ikon e="⚡" /> Claude</span>}{jam(m.at)}{me && <span className="wa-ticks">✓✓</span>}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

/** Pratinjau pesan di daftar obrolan: tanpa tanda markdown. */
const polos = (s: string) => s.replace(/```[\s\S]*?```/g, ' [kode] ').replace(/^\s*#{1,4}\s+/gm, '').replace(/\*\*|__|`|^\s*>\s?|^\s*[-*•]\s+/gm, '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();

function dayLabel(d: string) {
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const yest = new Date(Date.now() + 7 * 3600_000 - 86400_000).toISOString().slice(0, 10);
    if (d === today) return 'Hari ini';
    if (d === yest) return 'Kemarin';
    const x = new Date(`${d}T00:00:00Z`);
    return x.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Obrolan kantor lama (tokoh 2D, AI gratis) + kabar papan tugas. */
function KantorThread({ onBack, prefill }: { onBack: () => void; prefill?: string }) {
    const chat = useKantor((s) => s.chat);
    const owner = useKantor((s) => s.owner);
    const [text, setText] = useState(prefill || '');
    const endRef = useRef<HTMLDivElement>(null);
    useEffect(() => { setChatOpen(true); return () => setChatOpen(false); }, []);
    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat.length]);
    const send = (e: React.FormEvent) => {
        e.preventDefault();
        const room = getRoom();
        if (!text.trim() || !room) return;
        room.send('chat', { text: text.trim() });
        setText('');
    };
    return (
        <>
            <header className="wa-head">
                <button className="icon-btn wa-back" onClick={onBack} aria-label="Kembali">‹</button>
                <div className="wa-ava sm"><span className="wa-group-ico"><Ikon e="🏢" /></span></div>
                <div className="wa-head-main"><b>Obrolan kantor</b><span>Tokoh 2D ngobrol santai (AI gratis) & kabar papan tugas</span></div>
            </header>
            <div className="wa-body">
                {chat.map((m) => {
                    const me = m.sender === owner;
                    if (/Kantor|Kanban|Papan/.test(m.sender)) return <div key={m.id} className="wa-sys">{m.sender}: {m.text}</div>;
                    return (
                        <div key={m.id} className={`wa-bubble ${me ? 'me' : 'them'}`}>
                            {!me && <div className="wa-name" style={{ color: warna(m.sender) }}>{m.sender}</div>}
                            <div className="wa-text">{m.text}</div>
                            <div className="wa-time">{jam(m.at)}</div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>
            <form className="wa-input" onSubmit={send}>
                <textarea rows={1} placeholder="Ngobrol santai dengan tokoh kantor…" value={text} onChange={(e) => setText(e.target.value)} />
                <button className="wa-send" type="submit" disabled={!text.trim()}>➤</button>
            </form>
        </>
    );
}

/* ── Lampiran: gambar tampil langsung, berkas bisa diunduh. Tautan sementara 10 menit dari Berkas. ── */
const tautanCache = new Map<string, { url: string; exp: number }>();
async function tautan(rel: string, unduh = false) {
    const k = `${rel}|${unduh}`; const c = tautanCache.get(k);
    if (c && c.exp > Date.now()) return c.url;
    const r = await apiPost<{ url: string }>('/api/kantor/berkas/tautan', { p: rel, unduh });
    const url = `${serverBase()}${r.url}`; tautanCache.set(k, { url, exp: Date.now() + 8 * 60_000 }); return url;
}
const ukuran = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
function LampiranView({ l }: { l: Lampiran }) {
    const [src, setSrc] = useState('');
    const [gagal, setGagal] = useState(false);
    useEffect(() => { if (l.jenis === 'gambar') tautan(l.rel).then(setSrc).catch(() => setGagal(true)); }, [l.rel, l.jenis]);
    const buka = async (unduh: boolean) => { try { window.open(await tautan(l.rel, unduh), '_blank', 'noopener'); } catch { setGagal(true); } };
    if (l.jenis === 'gambar' && !gagal) return <button type="button" className="wa-gambar" onClick={() => buka(false)} title={l.nama}>{src ? <img src={src} alt={l.nama} onError={() => { tautanCache.delete(`${l.rel}|false`); setGagal(true); }} /> : <span>Memuat gambar…</span>}</button>;
    return <button type="button" className="wa-berkas" onClick={() => buka(true)} title={`Unduh ${l.nama}`}><span><Ikon e="📄" /></span><span><b>{l.nama}</b><small>{ukuran(l.ukuran)} · ketuk untuk unduh</small></span></button>;
}

/* ── Tombol notifikasi HP ── */
function TombolNotif() {
    const [st, setSt] = useState<string>('');
    const [msg, setMsg] = useState('');
    useEffect(() => { statusNotif().then(setSt); }, []);
    if (!st || st === 'tidak-didukung') return iosBrowser() ? <button className="icon-btn" title="Notifikasi" onClick={() => setMsg('Di iPhone: buka situs ini di Safari → Bagikan → "Tambah ke Layar Utama", lalu buka dari ikon Kantor untuk menyalakan notifikasi.')}><Ikon e="🔕" /></button> : null;
    const klik = async () => {
        setMsg('');
        try {
            if (st === 'aktif') { await matikanNotif(); setSt('mati'); setMsg('Notifikasi chat dimatikan di perangkat ini.'); }
            else { await aktifkanNotif(); setSt('aktif'); setMsg('Notifikasi aktif — kami kirim satu notifikasi uji.'); }
        } catch (e: any) { setMsg(String(e.message || e)); statusNotif().then(setSt); }
    };
    return (
        <span className="wa-notif">
            <button className={`icon-btn ${st === 'aktif' ? 'on' : ''}`} onClick={klik} title={st === 'aktif' ? 'Notifikasi aktif — ketuk untuk mematikan' : st === 'ditolak' ? 'Izin notifikasi ditolak di browser' : 'Nyalakan notifikasi chat di perangkat ini'}>{st === 'aktif' ? <Ikon e="🔔" /> : <Ikon e="🔕" />}</button>
            {msg && <span className="wa-notif-msg" role="status" onClick={() => setMsg('')}>{msg}</span>}
        </span>
    );
}

/* ── Buat / ubah grup (nama, ikon emoji, anggota) ── */
const EMOJI = ['👥', '💼', '📈', '💰', '🎬', '🧠', '📚', '🏠', '🚀', '⚡', '🎯', '🌏', '🛒', '🏋️', '🍜', '✈️', '🎮', '📰', '🧾', '🗂️', '💡', '🔥', '🌱', '❤️', '⭐', '🤝', '🛠️', '📊', '🎨', '🧪'];
function FormGrup({ awal, threads, tutup, selesai }: { awal: ThreadInfo | null; threads: ThreadInfo[]; tutup: () => void; selesai: (id: string | null) => void }) {
    const ai = threads.filter((t) => !isGrup(t));
    const [nama, setNama] = useState(awal?.nama || '');
    const [ikon, setIkon] = useState(awal?.ikon || '👥');
    const [anggota, setAnggota] = useState<string[]>(awal?.anggota || []);
    const [q, setQ] = useState('');
    const [err, setErr] = useState('');
    const [kirim, setKirim] = useState(false);
    const simpan = async () => {
        setKirim(true); setErr('');
        try { const r = await apiPost<{ grup: { id: string } }>('/api/kantor/chat-grup', { id: awal?.id, nama, ikon, anggota }); selesai(r.grup.id); }
        catch (e: any) { setErr(String(e.message || e)); }
        setKirim(false);
    };
    const hapus = async () => { if (!awal || !(await konfirmasi(`Hapus grup "${awal.nama}" beserta isi chatnya?`))) return; await apiPost(`/api/kantor/chat-grup/${awal.id}/hapus`, {}); selesai(null); };
    const daftar = ai.filter((a) => !q || `${a.nama} ${a.peran}`.toLowerCase().includes(q.toLowerCase()));
    return (
        <div className="wa-modal-bg" onClick={tutup}>
            <div className="wa-modal" role="dialog" aria-label={awal ? 'Info grup' : 'Grup baru'} onClick={(e) => e.stopPropagation()}>
                <header><b>{awal ? 'Info grup' : 'Grup baru'}</b><button className="icon-btn" onClick={tutup} aria-label="Tutup">×</button></header>
                <div className="wa-grup-id">
                    <span className="wa-grup-ikon">{ikon}</span>
                    <input className="input" placeholder="Nama grup" value={nama} maxLength={50} onChange={(e) => setNama(e.target.value)} autoFocus />
                </div>
                <div className="wa-emoji">{EMOJI.map((e) => <button key={e} type="button" className={ikon === e ? 'on' : ''} onClick={() => setIkon(e)}>{e}</button>)}
                    <input className="input" aria-label="Emoji lain" placeholder="lain" value={EMOJI.includes(ikon) ? '' : ikon} onChange={(e) => setIkon(Array.from(e.target.value).slice(-1).join('') || '👥')} /></div>
                <div className="wa-anggota-h"><b>Anggota ({anggota.length})</b><input className="input" placeholder="Cari AI…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <div className="wa-anggota">
                    {daftar.map((a) => {
                        const on = anggota.includes(a.id);
                        return <label key={a.id} className={on ? 'on' : ''}><input type="checkbox" checked={on} onChange={() => setAnggota(on ? anggota.filter((x) => x !== a.id) : [...anggota, a.id])} /><span><b>{a.nama}</b><small>{a.peran}</small></span></label>;
                    })}
                </div>
                {err && <div className="error">{err}</div>}
                <footer>
                    {awal && <button className="btn danger" onClick={hapus}>Hapus grup</button>}
                    <button className="btn primary" disabled={kirim || !nama.trim() || !anggota.length} onClick={simpan}>{awal ? 'Simpan' : 'Buat grup'}</button>
                </footer>
            </div>
        </div>
    );
}
