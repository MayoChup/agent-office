import React, { useState } from 'react';

/** Tanda ⓘ kecil: ketuk/arahkan untuk penjelasan singkat. */
export function Info({ teks }: { teks: string }) {
    const [buka, setBuka] = useState(false);
    return (
        <span className="info-i" onMouseEnter={() => setBuka(true)} onMouseLeave={() => setBuka(false)}>
            <button type="button" aria-label="Penjelasan" aria-expanded={buka} onClick={(e) => { e.stopPropagation(); setBuka(!buka); }}>i</button>
            {buka && <span className="info-i-pop" role="tooltip">{teks}</span>}
        </span>
    );
}
