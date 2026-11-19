import React, { useState } from 'react';
import { TasksPanel } from '../components/TasksPanel';
import { PapanPanel } from '../components/PapanPanel';
import { Hidup } from '../components/Hidup';

/** Tugas & Papan kerja disatukan: satu halaman, dua bagian (dulu terpisah dan membingungkan). */
export function TugasPage() {
    const [v, setVRaw] = useState<'tugas' | 'papan'>(() => { try { return localStorage.getItem('kantor:tugas-v') === 'papan' ? 'papan' : 'tugas'; } catch { return 'tugas'; } });
    const setV = (x: 'tugas' | 'papan') => { setVRaw(x); try { localStorage.setItem('kantor:tugas-v', x); } catch { /* */ } };
    return (
        <div className="tugas-hal">
            <div className="tugas-kepala">
                <h2>Tugas</h2>
                <div className="tr-sub" role="tablist">
                    <button role="tab" aria-selected={v === 'tugas'} className={v === 'tugas' ? 'on' : ''} onClick={() => setV('tugas')}>Tugas dari Bapak</button>
                    <button role="tab" aria-selected={v === 'papan'} className={v === 'papan' ? 'on' : ''} onClick={() => setV('papan')}>Papan kerja AI & rutin</button>
                </div>
            </div>
            <Hidup aktif={v === 'tugas'}><TasksPanel onClose={() => undefined} /></Hidup>
            <Hidup aktif={v === 'papan'}><PapanPanel onClose={() => undefined} /></Hidup>
        </div>
    );
}
