'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SaveQueue, type SaveStatus } from '@arther/types';

/**
 * G5 — the editor's auto-save: a debounced, offline-safe queue over the pure
 * `SaveQueue`. Edits enqueue (latest-wins per block) and flush after a debounce;
 * a flush drains in order and stops if the network drops, keeping unsent edits
 * queued; the `online` event resumes the drain. `status` drives the always-on
 * Connected/Saving/Offline indicator.
 */
export function useSaveQueue<T>(
  save: (id: string, value: T) => Promise<boolean>,
  debounceMs = 600,
) {
  const queue = useRef(new SaveQueue<T>());
  const flushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const sync = useCallback(() => setStatus(queue.current.status()), []);

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
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flush, sync]);

  return { enqueue, status, offline: status === 'offline' };
}
