import React from 'react';

export function Sparkline({ data, w = 140, h = 44 }: { data: number[]; w?: number; h?: number }) {
    if (!data || data.length < 2) return <svg width={w} height={h} />;
    const lo = Math.min(...data), hi = Math.max(...data);
    const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - lo) / Math.max(1e-9, hi - lo)) * (h - 6)).toFixed(1)}`).join(' ');
    const up = data[data.length - 1] >= data[0];
    return (
        <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
            <polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

export function Mom({ label, v }: { label: string; v: number }) {
    const c = v > 1 ? 'up' : v < -1 ? 'down' : 'flat';
    return <span className={`mom ${c}`}>{label} {c === 'up' ? '▲' : c === 'down' ? '▼' : '–'}</span>;
}
