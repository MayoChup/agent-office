import React, { useEffect, useState } from 'react';
import { eventBus } from './events';
import { useKantor } from './kantor/store';
import { TopBar } from './components/TopBar';
import { Dock, PanelKey } from './components/Dock';
import { OrgPanel } from './components/OrgPanel';
import { TasksPanel } from './components/TasksPanel';
import { ChatPanel } from './components/ChatPanel';
import { ActivityPanel } from './components/ActivityPanel';
import { AgentCard } from './components/AgentCard';
import { Toasts } from './components/Toasts';
import { LoginScreen } from './components/LoginScreen';
import { FinancePage } from './components/FinancePage';

export function App() {
    const status = useKantor((s) => s.status);
    const error = useKantor((s) => s.error);
    const [panel, setPanel] = useState<PanelKey>(null);
    const [division, setDivision] = useState<string | null>(null);
    const [agentId, setAgentId] = useState<string | null>(null);
    const [prefill, setPrefill] = useState('');

    useEffect(() => {
        const onDivision = (e: Event) => {
            const id = (e as CustomEvent).detail?.id ?? null;
            setDivision(id);
            setPanel('org');
        };
        const onChat = (e: Event) => {
            setPrefill(String((e as CustomEvent).detail?.text || ''));
            setPanel('chat');
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

    const close = () => { setPanel(null); setPrefill(''); };
    const closeAgent = () => eventBus.dispatchEvent(new CustomEvent('agent-select', { detail: { id: null } }));

    return (
        <>
            <TopBar />
            {(status === 'disconnected' || status === 'connecting') && (
                <div className="banner interactive">{status === 'connecting' ? 'Menghubungkan ke kantor…' : error || 'Koneksi terputus.'}</div>
            )}
            {panel === 'org' && <OrgPanel selected={division} onSelect={setDivision} onClose={close} />}
            {panel === 'tasks' && <TasksPanel onClose={close} />}
            {panel === 'finance' && <FinancePage onClose={close} />}
            {panel === 'chat' && <ChatPanel onClose={close} prefill={prefill} />}
            {panel === 'activity' && <ActivityPanel onClose={close} />}
            {agentId && (
                <AgentCard
                    id={agentId}
                    onClose={closeAgent}
                    onOpenDivision={(id) => { setDivision(id); setPanel('org'); closeAgent(); }}
                />
            )}
            <Toasts />
            <Dock active={panel} onSelect={(k) => { if (k !== 'org') setDivision(null); setPanel(k); setPrefill(''); }} />
        </>
    );
}
