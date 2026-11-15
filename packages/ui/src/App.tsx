import React, { useEffect, useState } from 'react';
import { eventBus } from './events';
import { useKantor } from './kantor/store';
import { TopBar } from './components/TopBar';
import { Nav, PageKey, SidePanel } from './components/Nav';
import { OrgPanel } from './components/OrgPanel';
import { TasksPanel } from './components/TasksPanel';
import { ChatPanel } from './components/ChatPanel';
import { ActivityPanel } from './components/ActivityPanel';
import { AgentCard } from './components/AgentCard';
import { Toasts } from './components/Toasts';
import { LoginScreen } from './components/LoginScreen';
import { FinancePage } from './components/FinancePage';
import { HomePage } from './pages/HomePage';
import { TradingPage } from './pages/TradingPage';
import { SchedulePage } from './pages/SchedulePage';

const LS_PAGE = 'kantor:page';
const PAGES: PageKey[] = ['home', 'kantor', 'keuangan', 'trading', 'tugas', 'jadwal', 'obrolan'];

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

    const go = (k: PageKey | 'org' | 'activity') => {
        if (k === 'org' || k === 'activity') {
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
        if (location.hash !== `#${page}`) history.replaceState(null, '', `#${page}`);
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
            setPanel(null);
            setPage('obrolan');
        };
        const onAgent = (e: Event) => setAgentId((e as CustomEvent).detail?.id ?? null);
        eventBus.addEventListener('open-division', onDivision);
        eventBus.addEventListener('open-chat', onChat);
        eventBus.addEventListener('agent-select', onAgent);
        return () => {
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

            {page !== 'kantor' && (
                <main className={`page interactive page-${page}`}>
                    {page === 'home' && <HomePage go={(p) => go(p)} />}
                    {page === 'keuangan' && <FinancePage />}
                    {page === 'trading' && <TradingPage />}
                    {page === 'jadwal' && <SchedulePage />}
                    {page === 'tugas' && <TasksPanel onClose={back} />}
                    {page === 'obrolan' && <ChatPanel onClose={back} prefill={prefill} />}
                </main>
            )}

            {page === 'kantor' && panel === 'org' && <OrgPanel selected={division} onSelect={setDivision} onClose={() => setPanel(null)} />}
            {page === 'kantor' && panel === 'activity' && <ActivityPanel onClose={() => setPanel(null)} />}
            {page === 'kantor' && agentId && (
                <AgentCard
                    id={agentId}
                    onClose={closeAgent}
                    onOpenDivision={(id) => { setDivision(id); setPanel('org'); closeAgent(); }}
                />
            )}
            <Toasts />
            <Nav page={page} panel={panel} onGo={go} />
        </>
    );
}
