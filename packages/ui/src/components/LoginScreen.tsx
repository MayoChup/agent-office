import React, { useState } from 'react';
import { login, currentServer, isSameOrigin } from '../kantor/connection';
import { useKantor } from '../kantor/store';

export function LoginScreen() {
    const error = useKantor((s) => s.error);
    const sameOrigin = isSameOrigin();
    const [server, setServer] = useState(() => (sameOrigin ? '' : currentServer()));
    const [showServer, setShowServer] = useState(!sameOrigin && !currentServer());
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setMsg('');
        const res = await login(showServer ? server : '', password);
        setBusy(false);
        if (!res.ok) setMsg(res.error || 'Gagal masuk.');
    };

    return (
        <div className="login-wrap interactive">
            <form className="login" onSubmit={submit}>
                <div className="brand-logo" style={{ width: 48, height: 48, fontSize: 26, borderRadius: 14 }}>🏢</div>
                <h1>Kantor Virtual</h1>
                <p>Masuk untuk melihat tim AI kamu bekerja secara langsung.</p>

                {showServer ? (
                    <>
                        <label>Alamat server kantor</label>
                        <input className="input" placeholder="https://nama-vps.tailxxxx.ts.net" value={server} onChange={(e) => setServer(e.target.value)} autoComplete="url" />
                    </>
                ) : (
                    <button type="button" className="back" onClick={() => setShowServer(true)}>Ganti alamat server…</button>
                )}

                <label>Kata sandi</label>
                <input className="input" type="password" placeholder="Kata sandi kantor" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />

                <button className="btn primary" type="submit" disabled={busy || !password} style={{ width: '100%', marginTop: 16, padding: '11px 12px', fontSize: 14 }}>
                    {busy ? 'Masuk…' : 'Masuk'}
                </button>
                {(msg || error) && <div className="error">{msg || error}</div>}
                <div className="hint">
                    Kata sandi diatur di VPS: <code>KANTOR_PASSWORD</code> di file <code>~/kantor-virtual/.env</code>
                    (atau lihat <code>~/kantor-virtual/data/kantor-password.txt</code>).
                </div>
            </form>
        </div>
    );
}
