import { catatHalaman, daftarHalaman, useKembali } from './kantor/kembali';
import { createPortal } from 'react-dom';
import { Ikon } from './components/Ikon';
import { TugasPage } from './pages/TugasPage';
import { KonfirmasiHost } from './components/Konfirmasi';
import { useLuring } from './kantor/antrean';
import React, { useEffect, useRef, useState } from 'react';
import { eventBus } from './events';
import { apiGet } from './kantor/connection';
import { useKantor } from './kantor/store';
import { useSubNav } from './kantor/subnav';
import { TopBar } from './components/TopBar';
import { Nav, PageKey, SidePanel, KunciPanel } from './components/Nav';
import { PapanPanel } from './components/PapanPanel';
import { OrgPanel } from './components/OrgPanel';
import { ChatPage } from './pages/ChatPage';
import { ActivityPanel } from './components/ActivityPanel';
import { AgentCard } from './components/AgentCard';
import { Toasts } from './components/Toasts';
import { LoginScreen } from './components/LoginScreen';
import { KeuanganApp } from './pages/keuangan/KeuanganApp';
import { CatatanPage } from './pages/catatan/CatatanPage';
import { BerkasPage } from './pages/BerkasPage';
import { HomePage, StatusTim } from './pages/HomePage';
import { TradingPage } from './pages/TradingPage';
import { SchedulePage } from './pages/SchedulePage';
import { SosmedPage } from './pages/SosmedPage';
import { KnowledgeReelsPage } from './pages/kr/KnowledgeReels';
import { AktifCtx } from './kantor/aktif';

const LS_PAGE = 'kantor:page';
const MAKS_HIDUP = 4; // halaman yang tetap hidup di belakang layar (paling lama tidak dibuka ditutup otomatis)
const JUDUL_HAL: Partial<Record<PageKey, string>> = { home: 'Beranda', keuangan: 'Keuangan', trading: 'Trading', sosmed: 'Konten', tugas: 'Tugas', jadwal: 'Jadwal', obrolan: 'Chat', catatan: 'Catatan', berkas: 'Berkas', kr: 'Knowledge Reels' };
const PAGES: PageKey[] = ['home', 'kantor', 'keuangan', 'trading', 'sosmed', 'tugas', 'jadwal', 'obrolan', 'catatan', 'berkas', 'kr'];

function initialPage(): PageKey {
    const h = location.hash.replace('#', '') as PageKey;
    if (PAGES.includes(h)) return h;
    try { const v = localStorage.getItem(LS_PAGE) as PageKey; if (PAGES.includes(v)) return v; } catch { /* */ }
    return 'home';
}

export function App() {
    const status = useKantor((s) => s.status);
    const error = useKantor((s) => s.error);
    const [page, setPage] = useState<PageKey>(initialPage);
    const [panel, setPanel] = useState<SidePanel>(null);
    const [division, setDivision] = useState<string | null>(null);
    const [agentId, setAgentId] = useState<string | null>(null);
    const [prefill, setPrefill] = useState('');
    const [prefillKe, setPrefillKe] = useState(0);
    const [hidup, setHidup] = useState<PageKey[]>(() => (initialPage() === 'kantor' ? [] : [initialPage()]));
    useEffect(() => { if (page !== 'kantor') setHidup((h) => [page, ...h.filter((x) => x !== page)].slice(0, MAKS_HIDUP)); }, [page]);

    // HP: geser dari tepi kiri layar = Back (berguna di iPhone/PWA yang tidak punya tombol Back).
    useEffect(() => {
        let x0 = -1, y0 = 0;
        const mulai = (e: TouchEvent) => { const t = e.touches[0]; x0 = t.clientX <= 20 && window.innerWidth < 768 ? t.clientX : -1; y0 = t.clientY; };
        const akhir = (e: TouchEvent) => { if (x0 < 0) return; const t = e.changedTouches[0]; if (t.clientX - x0 > 90 && Math.abs(t.clientY - y0) < 60) history.back(); x0 = -1; };
        window.addEventListener('touchstart', mulai, { passive: true }); window.addEventListener('touchend', akhir, { passive: true });
        return () => { window.removeEventListener('touchstart', mulai); window.removeEventListener('touchend', akhir); };
    }, []);
    // Tombol Back: kembali ke halaman sebelumnya (bukan menutup aplikasi).
    const sedangKembali = useRef(false), halPertama = useRef(true);
    useEffect(() => { daftarHalaman((p) => { if (PAGES.includes(p as PageKey) || p === 'kantor') { setPanel(null); setPage((cur) => { if (cur !== p) sedangKembali.current = true; return p as PageKey; }); } }); }, []);
    const go = (k: PageKey | KunciPanel) => {
        if (k === 'org' || k === 'activity' || k === 'papan') {
            setPage('kantor');
            setPanel(panel === k ? null : k);
            if (k !== 'org') setDivision(null);
            return;
        }
        setPanel(null);
        setPrefill('');
        setPage(k);
    };

    useEffect(() => {
        try { localStorage.setItem(LS_PAGE, page); } catch { /* */ }
        if (sedangKembali.current) sedangKembali.current = false;
        else { catatHalaman(page, halPertama.current); halPertama.current = false; }
        document.body.classList.toggle('no-office', page !== 'kantor');
        eventBus.dispatchEvent(new CustomEvent('page-change', { detail: { page } }));
        if (page !== 'kantor') setAgentId(null);
    }, [page]);

    useEffect(() => {
        const onDivision = (e: Event) => {
            setDivision((e as CustomEvent).detail?.id ?? null);
            setPage('kantor');
            setPanel('org');
        };
        const onChat = (e: Event) => {
            setPrefill(String((e as CustomEvent).detail?.text || ''));
            setPrefillKe((n) => n + 1);
            setPanel(null);
            setPage('obrolan');
        };
        const onAgent = (e: Event) => setAgentId((e as CustomEvent).detail?.id ?? null);
        // Dari Catatan → buka postingan Knowledge Reels (halaman KR membaca id ini saat terpasang / lewat event yang sama).
        const onKr = (e: Event) => { try { sessionStorage.setItem('kantor:kr-buka', String((e as CustomEvent).detail?.id || '')); } catch { /* */ } setPanel(null); setPage('kr'); };
        // Notifikasi chat diketuk → buka chat itu (dari URL ?chat= atau pesan service worker).
        const bukaChat = (id: string | null) => { if (!id) return; try { sessionStorage.setItem('kantor:buka-chat', id); } catch { /* */ } setPanel(null); setPage('obrolan'); eventBus.dispatchEvent(new CustomEvent('buka-chat', { detail: { id } })); };
        try { const u = new URL(location.href); const c = u.searchParams.get('chat'); if (c) { u.searchParams.delete('chat'); history.replaceState(null, '', u.pathname + u.search + u.hash); setTimeout(() => bukaChat(c), 0); } } catch { /* */ }
        const onSw = (e: MessageEvent) => { if (e.data?.bukaChat) bukaChat(String(e.data.bukaChat)); };
        navigator.serviceWorker?.addEventListener('message', onSw);
        eventBus.addEventListener('open-kr', onKr);
        eventBus.addEventListener('open-division', onDivision);
        eventBus.addEventListener('open-chat', onChat);
        const onGo = (e: Event) => { const pg = (e as CustomEvent).detail?.page; if (PAGES.includes(pg)) { setPanel(null); setPage(pg); } };
        eventBus.addEventListener('go-page', onGo);
        const onBukaChat = (e: Event) => bukaChat(String((e as CustomEvent).detail?.id || ''));
        eventBus.addEventListener('buka-chat-global', onBukaChat);
        eventBus.addEventListener('agent-select', onAgent);
        return () => {
            navigator.serviceWorker?.removeEventListener('message', onSw);
            eventBus.removeEventListener('open-kr', onKr);
            eventBus.removeEventListener('open-division', onDivision);
            eventBus.removeEventListener('open-chat', onChat);
            eventBus.removeEventListener('go-page', onGo);
            eventBus.removeEventListener('buka-chat-global', onBukaChat);
            eventBus.removeEventListener('agent-select', onAgent);
        };
    }, []);

    if (status === 'login' || status === 'checking') {
        return status === 'login' ? <LoginScreen /> : <div className="login-wrap"><div className="login"><p>Memeriksa kantor…</p></div></div>;
    }

    const closeAgent = () => eventBus.dispatchEvent(new CustomEvent('agent-select', { detail: { id: null } }));

    return (
        <>
            <a href="#isi" className="lewati interactive" onClick={(e) => { e.preventDefault(); const m = document.querySelector<HTMLElement>('main.page:not([hidden])'); if (m) { m.tabIndex = -1; m.focus(); } }}>Lewati ke isi</a>
            <TopBar />
            <KonfirmasiHost />
            <PitaLuring />
            {(status === 'disconnected' || status === 'connecting') && (
                <div className="banner interactive">{status === 'connecting' ? 'Menghubungkan ke kantor…' : error || 'Koneksi terputus.'}</div>
            )}

            {/* Halaman yang pernah dibuka tetap hidup (maks. 4) → pindah menu tanpa memuat ulang; posisi gulir & isi tetap. */}
            {PAGES.filter((k) => k !== 'kantor' && (hidup.includes(k) || k === page)).map((k) => (
                <main key={k} className={`page interactive page-${k}`} hidden={k !== page} aria-label={JUDUL_HAL[k] || k}>
                    <AktifCtx.Provider value={k === page}>
                        {k === 'home' && <HomePage go={(p) => go(p)} />}
                        {k === 'keuangan' && <KeuanganApp />}
                        {k === 'trading' && <TradingPage />}
                        {k === 'sosmed' && <SosmedPage />}
                        {k === 'jadwal' && <SchedulePage />}
                        {k === 'catatan' && <CatatanPage />}
                        {k === 'berkas' && <BerkasPage />}
                        {k === 'kr' && <KnowledgeReelsPage />}
                        {k === 'tugas' && <TugasPage />}
                        {k === 'obrolan' && <ChatPage key={`chat-${prefillKe}`} prefill={prefill} />}
                    </AktifCtx.Provider>
                </main>
            ))}

            {page === 'kantor' && panel === 'org' && <OrgPanel selected={division} onSelect={setDivision} onClose={() => setPanel(null)} />}
            {page === 'kantor' && panel === 'activity' && <ActivityPanel onClose={() => setPanel(null)} />}
            {page === 'kantor' && panel === 'papan' && <PapanPanel onClose={() => setPanel(null)} />}
            {page === 'kantor' && agentId && (
                <AgentCard
                    id={agentId}
                    onClose={closeAgent}
                    onOpenDivision={(id) => { setDivision(id); setPanel('org'); closeAgent(); }}
                />
            )}
            {page === 'kantor' && <KantorSub panel={panel} go={go} />}
            {page === 'kantor' && !panel && !agentId && <KendaliPeta go={go} />}
            {page === 'kantor' && <PengamatAmplop />}
            <Toasts />
            <Nav page={page} panel={panel} onGo={go} hidup={hidup} />
        </>
    );
}

function KantorSub({ panel, go }: { panel: SidePanel; go: (k: PageKey | KunciPanel) => void }) {
    useSubNav([{ k: 'kantor', ico: '🏢', label: 'Kantor' }, { k: 'papan', ico: '🗂️', label: 'Papan kerja' }, { k: 'org', ico: '🧭', label: 'Bagan' }, { k: 'activity', ico: '⚡', label: 'Aktivitas' }], panel || 'kantor', (k) => { if (k !== (panel || 'kantor')) go(k === 'kantor' ? 'kantor' : (k as KunciPanel)); });
    return null;
}

function PitaLuring() {
    const { luring, antre } = useLuring();
    if (!luring && !antre) return null;
    return <div className="luring" role="status">{luring ? `Tidak ada sinyal${antre ? ` · ${antre} pesan menunggu dikirim` : '. Pesan yang Bapak tulis akan dikirim begitu tersambung.'}` : `Mengirim ${antre} pesan yang tertunda…`}</div>;
}

/** U21/U37 · peta kantor di HP: tombol "Pas layar" dan lembar daftar tim (ketuk nama = kamera menuju meja AI itu). */
function KendaliPeta({ go }: { go: (k: PageKey | KunciPanel) => void }) {
    const [buka, setBuka] = useState(false);
    useKembali(buka, () => setBuka(false));
    const pilih = (id: string) => { setBuka(false); eventBus.dispatchEvent(new CustomEvent('focus-agent', { detail: { id } })); };
    return (
        <>
            <div className="peta-kendali interactive">
                <button className="btn" onClick={() => eventBus.dispatchEvent(new CustomEvent('camera-fit'))} aria-label="Pas layar"><Ikon n="maximize" /> Pas layar</button>
                <button className="btn" onClick={() => setBuka(true)}><Ikon e="👥" /> Tim</button>
            </div>
            {buka && createPortal(
                <div className="peta-latar" onClick={() => setBuka(false)}>
                    <div className="peta-lembar" role="dialog" aria-label="Status tim" onClick={(e) => e.stopPropagation()}>
                        <div className="peta-pegangan" aria-hidden />
                        <StatusTim go={(p) => { setBuka(false); go(p); }} onPilih={pilih} />
                    </div>
                </div>, document.body)}
        </>
    );
}

/** R8 · amati status tim; tugas baru = amplop dari Kepala ke AI itu, tugas selesai = amplop laporan kembali ke Kepala. */
function PengamatAmplop() {
    const lalu = useRef<Record<string, string>>({});
    useEffect(() => {
        let hidup = true;
        const cek = () => apiGet<{ ai: Array<{ id: string; sedang: { judul: string } | null; terakhir: { status: string } | null }> }>('/api/kantor/tim-status').then((d) => {
            if (!hidup) return;
            const awal = !Object.keys(lalu.current).length;
            let jeda = 0;
            for (const a of d.ai) {
                const kini = a.sedang?.judul || '', dulu = lalu.current[a.id];
                lalu.current[a.id] = kini;
                if (awal || a.id === 'default' || dulu === undefined || kini === dulu) continue;
                const detail = kini ? { dari: 'default', ke: a.id } : a.terakhir?.status === 'selesai' ? { dari: a.id, ke: 'default' } : null;
                if (detail) { setTimeout(() => eventBus.dispatchEvent(new CustomEvent('amplop', { detail })), jeda); jeda += 350; }
            }
        }).catch(() => undefined);
        cek(); const t = setInterval(cek, 10_000);
        return () => { hidup = false; clearInterval(t); };
    }, []);
    return null;
}
