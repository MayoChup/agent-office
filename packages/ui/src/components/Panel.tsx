import React from 'react';

export function Panel({ title, sub, onClose, children, footer }: {
    title: string; sub?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
    return (
        <div className="panel interactive">
            <div className="panel-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="panel-title">{title}</div>
                    {sub && <div className="panel-sub">{sub}</div>}
                </div>
                <button className="icon-btn" onClick={onClose} title="Tutup">✕</button>
            </div>
            <div className="panel-body">{children}</div>
            {footer && <div className="panel-foot">{footer}</div>}
        </div>
    );
}
