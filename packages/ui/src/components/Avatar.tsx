import React from 'react';

/** Wajah karakter, diambil dari sprite yang sama dengan di kantor. */
export function Avatar({ skin, size = 32, title }: { skin: number; size?: number; title?: string }) {
    const s = size / 16;
    return (
        <div
            className="avatar"
            title={title}
            style={{
                width: size,
                height: size,
                backgroundImage: `url(/assets/characters/char_${Math.abs(skin || 0) % 6}.png)`,
                backgroundSize: `${112 * s}px ${96 * s}px`,
                backgroundPosition: `${-16 * s}px ${-3 * s}px`
            }}
        />
    );
}
