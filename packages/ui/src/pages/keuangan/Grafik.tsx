import React from 'react';
import { rpk } from './util';

/** Batang per periode + garis rata-rata (seperti aplikasi keuangan). */
export function Batang({ data, rata, warna = 'var(--k-bar)', aktif }: { data: Array<{ label: string; v: number }>; rata?: number; warna?: string; aktif?: number }) {
    const max = Math.max(1, ...data.map((d) => d.v), rata || 0) * 1.1;
    const W = 320, H = 150, pad = 30, bw = (W - pad) / data.length;
    const ticks = [0, max / 2, max].map((v) => Math.round(v));
    return (
        <svg className="k-bar" viewBox={`0 -10 ${W} ${H + 32}`} role="img" aria-label="Grafik pengeluaran per periode">
            {ticks.map((t, i) => { const y = H - (t / max) * H; return <g key={i}><line x1={pad} x2={W} y1={y} y2={y} className="k-grid" /><text x={pad - 4} y={y + 3} textAnchor="end" className="k-axis">{rpk(t)}</text></g>; })}
            {data.map((d, i) => {
                const h = (d.v / max) * H;
                return <g key={d.label}>
                    <rect x={pad + i * bw + bw * 0.2} y={H - h} width={bw * 0.6} height={Math.max(0, h)} rx="4" fill={warna} className={aktif === i ? 'on' : ''} opacity={aktif === undefined || aktif === i ? 1 : 0.45} />
                    <text x={pad + i * bw + bw / 2} y={H + 15} textAnchor="middle" className={`k-axis ${aktif === i ? 'on' : ''}`}>{d.label}</text>
                </g>;
            })}
            {rata !== undefined && rata > 0 && <g><line x1={pad} x2={W} y1={H - (rata / max) * H} y2={H - (rata / max) * H} className="k-avg" /><text x={pad + 4} y={H - (rata / max) * H - 4} className="k-avg-t">Rata-rata {rpk(rata)}</text></g>}
        </svg>
    );
}

/** Donat komposisi. */
export function Donat({ data, tengah, sub }: { data: Array<{ k: string; v: number; c: string }>; tengah: string; sub: string }) {
    const total = data.reduce((a, d) => a + d.v, 0);
    const R = 80, r = 58, C = 100;
    let a0 = -Math.PI / 2;
    const arcs = total ? data.map((d) => {
        const a1 = a0 + (d.v / total) * Math.PI * 2 - 0.02;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
        const path = `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
        a0 = a1 + 0.02;
        return <path key={d.k} d={path} fill={d.c}><title>{d.k}</title></path>;
    }) : [<circle key="x" cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="var(--line)" strokeWidth={R - r} />];
    return (
        <svg className="k-donut" viewBox="0 0 200 200" role="img" aria-label="Komposisi">
            {arcs}
            <text x={C} y={C - 4} textAnchor="middle" className="k-donut-sub">{sub}</text>
            <text x={C} y={C + 16} textAnchor="middle" className="k-donut-t">{tengah}</text>
        </svg>
    );
}
