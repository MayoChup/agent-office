import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiGet, apiPost } from '../../kantor/connection';
import { RichText } from '../../components/common/RichText';
import { NAMA_MODE } from './Preset';

interface Pesan { id: string; dari: string; nama: string; teks: string; at: number; status?: 'gagal' }
interface Anggota { id: string; nama: string; peran: string }
const LS_AI = 'kantor:trading-chat-ai';
const jam = (t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const CONTOH = ['Saham mana yang paling layak dipantau untuk rencana posisi ini?', 'Preset apa yang terbukti di uji data?', 'Bagaimana kondisi watchlist saya?'];

/** Tombol chat mengambang di halaman Trading: konsultasi dengan AI tim trading, jawabannya HANYA dari data di halaman ini. */
export function TradingChat({ q, saham, mode }: { q: string; saham: string | null; mode: string }) {
    const [buka, setBuka] = useState(false);
    const [anggota, setAnggota] = useState<Anggota[]>([]);
    const [ai, setAiS] = useState<string>(() => { try { return localStorage.getItem(LS_AI) || ''; } catch { return ''; } });
    const setAi = (id: string) => { setAiS(id); try { localStorage.setItem(LS_AI, id); } catch { /* */ } };
    const [pesan, setPesan] = useState<Pesan[]>([]);
    const [menulis, setMenulis] = useState(false);
    const [teks, setTeks] = useState('');
    const [err, setErr] = useState('');
    const [kirim, setKirim] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const [belumDibaca, setBelum] = useState(0);
    const terakhir = useRef(0);

    useEffect(() => { apiGet<{ anggota: Anggota[] }>('/api/kantor/trading-chat/anggota').then((r) => { setAnggota(r.anggota); if (!r.anggota.some((a) => a.id === ai) && r.anggota[0]) setAi(r.anggota[0].id); }).catch(() => undefined); }, []);
    const muat = async () => {
        if (!ai) return;
        try {
            const d = await apiGet<{ pesan: Pesan[]; menulis: string[] }>(`/api/kantor/trading-chat/${encodeURIComponent(ai)}`);
            setPesan(d.pesan); setMenulis(d.menulis.length > 0); setErr('');
            const last = d.pesan[d.pesan.length - 1];
            if (last && last.dari !== 'owner' && last.at > terakhir.current && terakhir.current && !buka) setBelum((n) => n + 1);
            if (last) terakhir.current = Math.max(terakhir.current, last.at);
        } catch (e: any) { setErr(String(e.message || e)); }
    };
    useEffect(() => { terakhir.current = 0; muat(); }, [ai]);
    // Saat panel terbuka / AI sedang menulis: cek tiap 2,5 dtk; selain itu tiap 20 dtk (supaya tanda balasan baru muncul).
    useEffect(() => { const t = setInterval(muat, buka || menulis ? 2500 : 20_000); return () => clearInterval(t); }, [ai, buka, menulis]);
    useEffect(() => { if (buka) { setBelum(0); endRef.current?.scrollIntoView({ block: 'end' }); } }, [buka, pesan.length, menulis]);

    const kirimPesan = async (t = teks) => {
        const isi = t.trim(); if (!isi || !ai || kirim) return;
        setKirim(true); setErr('');
        try {
            const r = await apiPost<{ pesan: Pesan }>(`/api/kantor/trading-chat/${encodeURIComponent(ai)}?${q}${saham ? `&s=${encodeURIComponent(saham)}` : ''}`, { teks: isi });
            setPesan((p) => [...p, r.pesan]); setTeks(''); setMenulis(true);
        } catch (e: any) { setErr(String(e.message || e)); } finally { setKirim(false); }
    };
    // Dibuka dari tombol lain (mis. "Tanya tim trading" di halaman saham) dengan pertanyaan siap kirim.
    useEffect(() => { const f = (e: Event) => { setBuka(true); const t = (e as CustomEvent).detail; if (typeof t === 'string') setTeks(t); }; window.addEventListener('kantor:tanya-trading', f); return () => window.removeEventListener('kantor:tanya-trading', f); }, []);
    const a = anggota.find((x) => x.id === ai);

    return createPortal(
        <>
            {!buka && (
                <button className="tc-fab" onClick={() => setBuka(true)} aria-label="Konsultasi dengan tim trading">
                    <span aria-hidden>💬</span><b>Tanya {a?.nama || 'tim trading'}</b>
                    {belumDibaca > 0 && <i>{belumDibaca}</i>}
                </button>
            )}
            {buka && (
                <section className="tc-panel" role="dialog" aria-label="Chat konsultasi trading">
                    <header className="tc-h">
                        <div>
                            {!anggota.length ? <b>Tim trading</b> : <select value={ai} onChange={(e) => setAi(e.target.value)} aria-label="Pilih AI">
                                {anggota.map((x) => <option key={x.id} value={x.id}>{x.nama}{x.peran ? ` · ${x.peran}` : ''}</option>)}
                            </select>}
                            <small>{menulis ? 'sedang menulis…' : 'menjawab hanya dari data halaman Trading'}</small>
                        </div>
                        <button className="tc-x" onClick={() => setBuka(false)} aria-label="Tutup">✕</button>
                    </header>
                    <div className="tc-konteks">📎 Data terlampir: {NAMA_MODE[mode] || mode}{saham ? ` · ${saham}` : ''} · skor & sinyal · uji mundur · watchlist & posisi</div>
                    <div className="tc-isi">
                        {!anggota.length && <div className="tc-kosong"><p>AI tim trading belum terdeteksi di kantor (profil Hermes tidak terbaca). Coba lagi sebentar lagi.</p></div>}
                        {!!anggota.length && !pesan.length && (
                            <div className="tc-kosong">
                                <p>Tanya apa saja tentang data di halaman ini. {a?.nama || 'AI'} hanya menjawab dari skor, alasan, berita, uji mundur, preset, dan watchlist Bapak — kalau datanya tidak ada, dia akan bilang tidak ada.</p>
                                {CONTOH.map((c) => <button key={c} onClick={() => kirimPesan(saham && c.startsWith('Saham') ? `Bagaimana ${saham} menurut data untuk rencana posisi ini?` : c)}>{saham && c.startsWith('Saham') ? `Bagaimana ${saham} menurut data?` : c}</button>)}
                            </div>
                        )}
                        {pesan.map((m) => (
                            <div key={m.id} className={`wa-bubble ${m.dari === 'owner' ? 'me' : 'them'} ${m.status === 'gagal' ? 'fail' : ''}`}>
                                <div className="wa-text">{m.dari === 'owner' ? m.teks : <RichText text={m.teks} />}</div>
                                <div className="wa-time">{jam(m.at)}</div>
                            </div>
                        ))}
                        {menulis && <div className="wa-bubble them typing"><span className="dots"><i /><i /><i /></span></div>}
                        <div ref={endRef} />
                    </div>
                    {err && <div className="error tc-err">{err}</div>}
                    <form className="tc-form" onSubmit={(e) => { e.preventDefault(); kirimPesan(); }}>
                        <textarea value={teks} rows={1} placeholder={saham ? `Tanya soal ${saham} atau data lain…` : 'Tulis pertanyaan…'} onChange={(e) => setTeks(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirimPesan(); } }} />
                        <button className="btn primary" disabled={!teks.trim() || kirim}>Kirim</button>
                    </form>
                </section>
            )}
        </>,
        document.body
    );
}
