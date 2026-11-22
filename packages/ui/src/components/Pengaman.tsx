import React from 'react';

/**
 * Pengaman tampilan: kalau satu halaman error saat ditampilkan, hanya halaman itu yang diganti pesan
 * (bukan seluruh aplikasi jadi layar putih). Pesan galat ditampilkan supaya bisa difoto & dilaporkan.
 */
export class Pengaman extends React.Component<{ nama: string; children: React.ReactNode }, { galat: Error | null }> {
    state = { galat: null as Error | null };
    static getDerivedStateFromError(galat: Error) { return { galat }; }
    componentDidCatch(galat: Error, info: React.ErrorInfo) { console.error(`[Pengaman ${this.props.nama}]`, galat, info?.componentStack); }
    render() {
        const g = this.state.galat;
        if (!g) return this.props.children;
        return (
            <div className="pengaman" role="alert">
                <b>Bagian {this.props.nama} gagal ditampilkan</b>
                <p>Bagian lain kantor tetap bisa dipakai. Kirim foto layar ini ke Claude supaya bisa diperbaiki.</p>
                <code>{String(g?.message || g).slice(0, 300)}</code>
                <div className="pengaman-aksi">
                    <button className="btn small" onClick={() => this.setState({ galat: null })}>Coba lagi</button>
                    <button className="btn small" onClick={() => { try { Object.keys(localStorage).filter((k) => k.startsWith('kantor:api:')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } location.reload(); }}>Bersihkan simpanan & muat ulang</button>
                </div>
            </div>
        );
    }
}
