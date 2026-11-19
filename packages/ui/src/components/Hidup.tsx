import React, { useEffect, useState } from 'react';

/** Isi tab yang pernah dibuka tetap hidup (hanya disembunyikan): pindah tab tidak memuat ulang, isian & posisi tidak hilang. */
export function Hidup({ aktif, children }: { aktif: boolean; children: React.ReactNode }) {
    const [pernah, setPernah] = useState(aktif);
    useEffect(() => { if (aktif) setPernah(true); }, [aktif]);
    return pernah ? <div className="tab-hidup" hidden={!aktif}>{children}</div> : null;
}
