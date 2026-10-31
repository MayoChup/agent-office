export const eventBus = new EventTarget();

// Simpan nilai terakhir tiap jenis event, supaya panel yang baru muncul
// tetap mendapat data terbaru (misalnya daftar tugas atau kuota AI).
const lastDetails: Record<string, any> = {};
const originalDispatch = eventBus.dispatchEvent.bind(eventBus);
eventBus.dispatchEvent = (event: Event) => {
    if (event instanceof CustomEvent) lastDetails[event.type] = event.detail;
    return originalDispatch(event);
};

export function lastDetail<T = any>(type: string): T | undefined {
    return lastDetails[type];
}
