import React, { useEffect, useRef, useState } from 'react';
import { useKantor, setChatOpen } from '../kantor/store';
import { getRoom } from '../kantor/connection';
import { Avatar } from './Avatar';
import { Panel } from './Panel';

export function ChatPanel({ onClose, prefill }: { onClose: () => void; prefill: string }) {
    const chat = useKantor((s) => s.chat);
    const agents = useKantor((s) => s.agents);
    const owner = useKantor((s) => s.owner);
    const [text, setText] = useState(prefill);
    const endRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { setChatOpen(true); return () => setChatOpen(false); }, []);
    useEffect(() => { if (prefill) { setText(prefill); inputRef.current?.focus(); } }, [prefill]);
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length]);

    const send = (e: React.FormEvent) => {
        e.preventDefault();
        const room = getRoom();
        if (!text.trim() || !room) return;
        room.send('chat', { text: text.trim() });
        setText('');
    };

    const isSystem = (sender: string) => /Kantor|Kanban|Papan/.test(sender);
    const skinOf = (name: string) => agents.find((a) => a.name === name)?.skin;

    return (
        <Panel
            title="💬 Obrolan Kantor"
            sub="Ngobrol santai (AI gratis) — bukan perintah kerja"
            onClose={onClose}
            footer={
                <form onSubmit={send}>
                    <div className="mentions">
                        {agents.map((a) => (
                            <button type="button" key={a.id} className="mention" onClick={() => { setText(`@${a.name} `); inputRef.current?.focus(); }}>
                                <Avatar skin={a.skin} size={20} />{a.name}
                            </button>
                        ))}
                    </div>
                    <div className="row">
                        <input ref={inputRef} className="input" placeholder="Ketik pesan… (@Nama untuk divisi tertentu)" value={text} onChange={(e) => setText(e.target.value)} />
                        <button className="btn primary" type="submit" disabled={!text.trim()}>Kirim</button>
                    </div>
                </form>
            }
        >
            <div className="chat-list">
                <div className="msg sys">Tanpa @, pesan diterima Kepala Kantor. Untuk perintah kerja, pakai Papan Tugas atau Telegram.</div>
                {chat.map((m) => {
                    const me = m.sender === owner;
                    if (isSystem(m.sender)) return <div key={m.id} className="msg sys">{m.sender}: {m.text}</div>;
                    const skin = skinOf(m.sender);
                    return (
                        <div key={m.id} className="row" style={{ alignItems: 'flex-end', justifyContent: me ? 'flex-end' : 'flex-start' }}>
                            {!me && skin !== undefined && <Avatar skin={skin} size={26} />}
                            <div className={`msg ${me ? 'me' : ''}`}>
                                {!me && <div className="msg-sender">{m.sender}</div>}
                                {m.text}
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>
        </Panel>
    );
}
