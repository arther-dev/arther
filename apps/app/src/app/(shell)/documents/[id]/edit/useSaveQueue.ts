'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SaveQueue, type SaveStatus } from '@arther/types';

/**
 * G5 — the editor's auto-save: a debounced, offline-safe queue over the pure
 * `SaveQueue`. Edits enqueue (latest-wins per block) and flush after a debounce;
 * a flush drains in order and stops if the network drops, keeping unsent edits
 * queued; the `online` event resumes the drain. `status` drives the always-on
 * Connected/Saving/Offline indicator.
 *
 * G5.2 durability: with a `persistKey`, the pending queue is mirrored to
 * localStorage on every change and rehydrated on mount, so edits made offline
 * survive a reload or crash — they drain on the next mount, and `restored` lets
 * the editor show them immediately. The save action re-validates every value, so
 * a stale or tampered entry can never corrupt a block.
 */
export function useSaveQueue<T>(
  save: (id: string, value: T) => Promise<boolean>,
  options: { persistKey?: string; debounceMs?: number } = {},
) {
  const { persistKey, debounceMs = 600 } = options;
  const queue = useRef(new SaveQueue<T>());
  const flushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');

  // Rehydrate the persisted queue once, before first render, so `restored` is
  // ready for the editor's mount effect and the drain on reconnect.
  const restored = useRef<Array<{ id: string; value: T }>>([]);
  const inited = useRef(false);
  if (!inited.current) {
    inited.current = true;
    if (persistKey && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(persistKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) {
          restored.current = parsed as Array<{ id: string; value: T }>;
          queue.current.hydrate(restored.current);
        }
      } catch {
        // A corrupt entry is dropped — the action re-validates anyway.
      }
    }
  }

  const persist = useCallback(() => {
    if (!persistKey || typeof window === 'undefined') return;
    const items = queue.current.entries();
    try {
      if (items.length === 0) window.localStorage.removeItem(persistKey);
      else window.localStorage.setItem(persistKey, JSON.stringify(items));
    } catch {
      // Storage full or unavailable — the in-memory queue still drives saving.
    }
  }, [persistKey]);

  const sync = useCallback(() => {
    setStatus(queue.current.status());
    persist();
  }, [persist]);

  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.isOnline()) return;
    flushing.current = true;
    try {
      let batch = queue.current.batch();
      while (batch.length > 0 && queue.current.isOnline()) {
        for (const { id, value } of batch) {
          if (!queue.current.isOnline()) break;
          queue.current.beginSave(id);
          sync();
          let ok = false;
          try {
            ok = await save(id, value);
          } catch {
            ok = false;
          }
          if (ok) queue.current.completeSave(id, value);
          else queue.current.failSave(id);
          sync();
        }
        batch = queue.current.batch();
      }
    } finally {
      flushing.current = false;
    }
  }, [save, sync]);

  const enqueue = useCallback(
    (id: string, value: T) => {
      queue.current.enqueue(id, value);
      sync();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), debounceMs);
    },
    [flush, sync, debounceMs],
  );

  useEffect(() => {
    const onOnline = () => {
      queue.current.setOnline(true);
      sync();
      void flush();
    };
    const onOffline = () => {
      queue.current.setOnline(false);
      sync();
    };
    queue.current.setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    sync();
    // Drain anything rehydrated from a previous session (G5.2).
    if (queue.current.pendingCount() > 0) void flush();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flush, sync]);

  return { enqueue, status, offline: status === 'offline', restored: restored.current };
}
