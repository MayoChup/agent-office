import React from 'react';
import { useKantor, dismissToast } from '../kantor/store';

export function Toasts() {
    const toasts = useKantor((s) => s.toasts);
    if (!toasts.length) return null;
    return (
        <div className="toasts">
            {toasts.map((t) => (
                <div key={t.id} className="toast interactive" style={{ ['--c' as any]: t.color || 'var(--accent)' }} onClick={() => dismissToast(t.id)}>
                    <div className="toast-ico">{t.icon}</div>
                    <div>
                        <div className="toast-title">{t.title}</div>
                        <div className="toast-body">{t.body}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}
