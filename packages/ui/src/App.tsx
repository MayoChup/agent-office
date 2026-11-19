import { catatHalaman, daftarHalaman } from './kantor/kembali';
import React, { useEffect, useRef, useState } from 'react';
import { eventBus } from './events';
import { useKantor } from './kantor/store';
import { useSubNav } from './kantor/subnav';
import { TopBar } from './components/TopBar';
import { Nav, PageKey, SidePanel, KunciPanel } from './components/Nav';
import { PapanPanel } from './components/PapanPanel';
import { OrgPanel } from './components/OrgPanel';
import { TasksPanel } from './components/TasksPanel';
import { ChatPage } from './pages/ChatPage';
import { ActivityPanel } from './components/ActivityPanel';
import { AgentCard } from './components/AgentCard';
import { Toasts } from './components/Toasts';
import { LoginScreen } from './components/LoginScreen';
import { KeuanganApp } from './pages/keuangan/KeuanganApp';
import { CatatanPage } from './pages/catatan/CatatanPage';
import { BerkasPage } from './pages/BerkasPage';
import { HomePage } from './pages/HomePage';
import { TradingPage } from './pages/TradingPage';
import { SchedulePage } from './pages/SchedulePage';
import { SosmedPage } from './pages/SosmedPage';
import { KnowledgeReelsPage } from './pages/kr/KnowledgeReels';
import { AktifCtx } from './kantor/aktif';

const LS_PAGE = 'kantor:page';
const MAKS_HIDUP = 4; // halaman yang tetap hidup di belakang layar (paling lama tidak dibuka ditutup otomatis)
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
        eventBus.addEventListener('agent-select', onAgent);
        return () => {
            navigator.serviceWorker?.removeEventListener('message', onSw);
            eventBus.removeEventListener('open-kr', onKr);
            eventBus.removeEventListener('open-division', onDivision);
            eventBus.removeEventListener('open-chat', onChat);
            eventBus.removeEventListener('agent-select', onAgent);
        };
    }, []);

    if (status === 'login' || status === 'checking') {
        return status === 'login' ? <LoginScreen /> : <div className="login-wrap"><div className="login"><p>Memeriksa kantor…</p></div></div>;
    }

    const closeAgent = () => eventBus.dispatchEvent(new CustomEvent('agent-select', { detail: { id: null } }));
    const back = () => go('home');

    return (
        <>
            <TopBar />
            {(status === 'disconnected' || status === 'connecting') && (
                <div className="banner interactive">{status === 'connecting' ? 'Menghubungkan ke kantor…' : error || 'Koneksi terputus.'}</div>
            )}

            {/* Halaman yang pernah dibuka tetap hidup (maks. 4) → pindah menu tanpa memuat ulang; posisi gulir & isi tetap. */}
            {PAGES.filter((k) => k !== 'kantor' && (hidup.includes(k) || k === page)).map((k) => (
                <main key={k} className={`page interactive page-${k}`} hidden={k !== page}>
                    <AktifCtx.Provider value={k === page}>
                        {k === 'home' && <HomePage go={(p) => go(p)} />}
                        {k === 'keuangan' && <KeuanganApp />}
                        {k === 'trading' && <TradingPage />}
                        {k === 'sosmed' && <SosmedPage />}
                        {k === 'jadwal' && <SchedulePage />}
                        {k === 'catatan' && <CatatanPage />}
                        {k === 'berkas' && <BerkasPage />}
                        {k === 'kr' && <KnowledgeReelsPage />}
                        {k === 'tugas' && <TasksPanel onClose={back} />}
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
            <Toasts />
            <Nav page={page} panel={panel} onGo={go} hidup={hidup} />
        </>
    );
}

function KantorSub({ panel, go }: { panel: SidePanel; go: (k: PageKey | KunciPanel) => void }) {
    useSubNav([{ k: 'kantor', ico: '🏢', label: 'Kantor' }, { k: 'papan', ico: '🗂️', label: 'Papan kerja' }, { k: 'org', ico: '🧭', label: 'Bagan' }, { k: 'activity', ico: '⚡', label: 'Aktivitas' }], panel || 'kantor', (k) => { if (k !== (panel || 'kantor')) go(k === 'kantor' ? 'kantor' : (k as KunciPanel)); });
    return null;
}
