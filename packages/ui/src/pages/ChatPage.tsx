import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, getRoom } from '../kantor/connection';
import { useAktif } from '../kantor/aktif';
import { useKantor, setChatOpen } from '../kantor/store';
import { Avatar } from '../components/Avatar';
import { RichText } from '../components/common/RichText';

interface ThreadInfo { id: string; nama: string; peran: string; terakhir: { nama: string; teks: string; at: number } | null; menulis: string[] }
interface Pesan { id: string; dari: string; nama: string; teks: string; at: number; status?: 'gagal'; berat?: boolean }

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
    const [open, setOpen] = useState<string | null>(() => (window.innerWidth >= 768 ? 'grup' : null));
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
    const list = threads.filter((t) => !q || `${t.nama} ${t.peran}`.toLowerCase().includes(q.toLowerCase()));
    const cur = threads.find((t) => t.id === open);

    return (
        <div className={`wa ${open ? 'has-open' : ''}`}>
            <aside className="wa-list">
                <div className="wa-list-head">
                    <h2>💬 Chat</h2>
                    <input className="input" placeholder="Cari nama atau peran…" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                {err && <div className="error" style={{ margin: 10 }}>{err}</div>}
                <div className="wa-items">
                    {list.map((t) => {
                        const unread = t.terakhir && t.terakhir.nama !== 'Pak Rico' && t.terakhir.at > (seen[t.id] || 0) && open !== t.id;
                        const s = skin(t.id);
                        return (
                            <button key={t.id} className={`wa-item ${open === t.id ? 'active' : ''}`} onClick={() => setOpen(t.id)}>
                                <div className="wa-ava">{t.id === 'grup' ? <span className="wa-group-ico">👥</span> : s !== undefined ? <Avatar skin={s} size={42} /> : <span className="wa-group-ico">🤖</span>}</div>
                                <div className="wa-item-main">
                                    <div className="wa-item-top"><b>{t.nama}{t.peran && t.id !== 'grup' ? <span className="wa-jabatan"> - {t.peran}</span> : null}</b>{t.terakhir && <span className={unread ? 'unread' : ''}>{tanggal(t.terakhir.at)}</span>}</div>
                                    <div className="wa-item-sub">
                                        {t.menulis.length ? <em>{t.id === 'grup' ? `${t.menulis.map((id) => threads.find((x) => x.id === id)?.nama || id).join(', ')} mengetik…` : 'mengetik…'}</em>
                                            : t.terakhir ? <span>{t.id === 'grup' || t.terakhir.nama === 'Pak Rico' ? `${t.terakhir.nama === 'Pak Rico' ? 'Anda' : namaPeran(threads, t.terakhir.nama)}: ` : ''}{t.terakhir.teks}</span>
                                                : <span className="wa-role">{t.peran}</span>}
                                        {unread && <i className="wa-dot" />}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                    <button className={`wa-item ${open === KANTOR ? 'active' : ''}`} onClick={() => setOpen(KANTOR)}>
                        <div className="wa-ava"><span className="wa-group-ico">🏢</span></div>
                        <div className="wa-item-main">
                            <div className="wa-item-top"><b>Obrolan kantor</b></div>
                            <div className="wa-item-sub"><span className="wa-role">Celoteh tokoh kantor 2D & kabar papan tugas</span></div>
                        </div>
                    </button>
                </div>
            </aside>
            <section className="wa-thread">
                {open === KANTOR ? <KantorThread onBack={() => setOpen(null)} prefill={prefill} />
                    : cur ? <Thread key={cur.id} info={cur} threads={threads} skin={skin} onBack={() => setOpen(null)} onSeen={(at) => markSeen(cur.id, at)} />
                        : <div className="wa-empty">Pilih chat di sebelah kiri.<br /><small>Chat pribadi langsung ke AI Hermes (pakai ingatan & skill masing-masing). Di Grup Kantor semua AI membaca; yang menjawab yang paling relevan atau yang di-@sebut.</small></div>}
            </section>
        </div>
    );
}

function Thread({ info, threads, skin, onBack, onSeen }: { info: ThreadInfo; threads: ThreadInfo[]; skin: (id: string) => number | undefined; onBack: () => void; onSeen: (at: number) => void }) {
    const [pesan, setPesan] = useState<Pesan[]>([]);
    const [menulis, setMenulis] = useState<string[]>([]);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [err, setErr] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const grup = info.id === 'grup';
    const anggota = threads.filter((t) => t.id !== 'grup');

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
    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [pesan.length, menulis.length]);

    const send = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const t = text.trim();
        if (!t || sending) return;
        setSending(true);
        try {
            const d = await apiPost<{ pesan: Pesan }>(`/api/kantor/chat/${encodeURIComponent(info.id)}`, { teks: t });
            setPesan((p) => [...p, d.pesan]);
            setText('');
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
                <div className="wa-ava sm">{grup ? <span className="wa-group-ico">👥</span> : s !== undefined ? <Avatar skin={s} size={36} /> : <span className="wa-group-ico">🤖</span>}</div>
                <div className="wa-head-main">
                    <b>{info.nama}{!grup && info.peran ? ` - ${info.peran}` : ''}</b>
                    <span>{menulis.length ? <em>{grup ? `${menulis.map(nama).join(', ')} mengetik…` : 'mengetik…'}</em> : grup ? anggota.map((a) => a.nama).join(', ') : info.peran}</span>
                </div>
            </header>
            <div className="wa-body">
                {pesan.length === 0 && (
                    <div className="wa-note">{grup ? 'Semua AI kantor ada di grup ini. Tulis @Nama untuk memanggil orang tertentu, atau @semua untuk para kepala divisi.' : `Chat langsung dengan ${info.nama}. Balasan bisa butuh 10–60 detik karena ${info.nama} benar-benar bekerja (pakai skill & ingatannya).`}</div>
                )}
                {items.map((it, i) => it.day ? <div key={`d${i}`} className="wa-day"><span>{dayLabel(it.day)}</span></div> : (
                    <Bubble key={it.m!.id} m={it.m!} grup={grup} peran={threads.find((x) => x.id === it.m!.dari)?.peran} />
                ))}
                {menulis.map((id) => <div key={`t-${id}`} className="wa-bubble them typing">{grup && <div className="wa-name" style={{ color: warna(id) }}>{nama(id)}</div>}<span className="dots"><i /><i /><i /></span></div>)}
                <div ref={endRef} />
            </div>
            {err && <div className="error" style={{ margin: '0 12px 6px' }}>{err}</div>}
            {grup && (
                <div className="wa-mentions">
                    {['semua', ...anggota.map((a) => a.nama)].map((n) => (
                        <button key={n} type="button" onClick={() => { setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${n} `); inputRef.current?.focus(); }}>@{n}</button>
                    ))}
                </div>
            )}
            <form className="wa-input" onSubmit={send}>
                <textarea ref={inputRef} rows={1} placeholder={grup ? 'Tulis ke grup…' : `Tulis ke ${info.nama}…`} value={text}
                    onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(120, e.target.scrollHeight)}px`; }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) { e.preventDefault(); send(); } }} />
                <button className="wa-send" type="submit" disabled={!text.trim() || sending} aria-label="Kirim">➤</button>
            </form>
        </>
    );
}

/** "Joni" → "Joni - Kepala Kantor" (nama di pratinjau pesan terakhir). */
function namaPeran(threads: ThreadInfo[], nama: string) { const t = threads.find((x) => x.nama === nama || nama.startsWith(`${x.nama} `)); return t?.peran && t.id !== 'grup' ? `${nama} - ${t.peran}` : nama; }

function Bubble({ m, grup, peran }: { m: Pesan; grup: boolean; peran?: string }) {
    const me = m.dari === 'owner';
    return (
        <div className={`wa-bubble ${me ? 'me' : 'them'} ${m.status === 'gagal' ? 'fail' : ''}`}>
            {grup && !me && <div className="wa-name" style={{ color: warna(m.dari) }}>{m.nama}{peran ? <span className="wa-jabatan"> - {peran}</span> : null}</div>}
            <div className="wa-text">{me ? m.teks : <RichText text={m.teks} />}</div>
            <div className="wa-time">{m.berat && <span className="wa-berat" title="Dikerjakan dengan model berbayar (Claude) atas keputusan Joni">⚡ Claude</span>}{jam(m.at)}{me && <span className="wa-ticks">✓✓</span>}</div>
        </div>
    );
}

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
                <div className="wa-ava sm"><span className="wa-group-ico">🏢</span></div>
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
