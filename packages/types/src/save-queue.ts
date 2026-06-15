/**
 * G5 — the auto-save queue's pure core (connectivity model). A latest-wins,
 * per-key queue of edits awaiting persistence: rapid edits to one block coalesce
 * (only the newest value is saved), saves stay in first-edit order, a failed or
 * offline save keeps its item queued for the next drain, and a value re-edited
 * mid-save is kept rather than dropped. No timers or I/O here — the React hook
 * supplies the debounce, the online/offline signal, and the save fn; this is
 * exhaustively unit-testable.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'offline' | 'error';

export class SaveQueue<T> {
  private pending = new Map<string, T>();
  private inflight = new Set<string>();
  private online = true;
  private errored = false;

  /** Queue (or re-queue) the latest value for a key. Clears the error flag. */
  enqueue(id: string, value: T): void {
    this.pending.set(id, value);
    this.errored = false;
  }

  setOnline(online: boolean): void {
    this.online = online;
  }
  isOnline(): boolean {
    return this.online;
  }

  /** Pending items not already saving, in first-edit order. */
  batch(): Array<{ id: string; value: T }> {
    const out: Array<{ id: string; value: T }> = [];
    for (const [id, value] of this.pending) {
      if (!this.inflight.has(id)) out.push({ id, value });
    }
    return out;
  }

  beginSave(id: string): void {
    this.inflight.add(id);
  }

  /** A save succeeded — drop the item only if it wasn't re-edited meanwhile. */
  completeSave(id: string, savedValue: T): void {
    this.inflight.delete(id);
    if (this.pending.get(id) === savedValue) this.pending.delete(id);
  }

  /** A save failed — keep the item queued and flag the error. */
  failSave(id: string): void {
    this.inflight.delete(id);
    this.errored = true;
  }

  pendingCount(): number {
    return this.pending.size;
  }

  status(): SaveStatus {
    if (!this.online) return 'offline';
    if (this.inflight.size > 0) return 'saving';
    if (this.errored) return 'error';
    if (this.pending.size > 0) return 'pending';
    return 'idle';
  }
}
