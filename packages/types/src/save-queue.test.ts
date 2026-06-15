import { describe, expect, it } from 'vitest';
import { SaveQueue } from './save-queue';

describe('SaveQueue', () => {
  it('coalesces rapid edits to one key (latest wins) and reports pending', () => {
    const q = new SaveQueue<string>();
    q.enqueue('b1', 'a');
    q.enqueue('b1', 'b');
    expect(q.pendingCount()).toBe(1);
    expect(q.batch()).toEqual([{ id: 'b1', value: 'b' }]);
    expect(q.status()).toBe('pending');
  });

  it('keeps first-edit order across keys and excludes in-flight items', () => {
    const q = new SaveQueue<string>();
    q.enqueue('b1', '1');
    q.enqueue('b2', '2');
    q.beginSave('b1');
    expect(q.status()).toBe('saving');
    expect(q.batch()).toEqual([{ id: 'b2', value: '2' }]);
  });

  it('drops a completed item only if it was not re-edited mid-save', () => {
    const q = new SaveQueue<string>();
    q.enqueue('b1', 'v1');
    q.beginSave('b1');
    q.enqueue('b1', 'v2'); // re-edited while saving v1
    q.completeSave('b1', 'v1');
    expect(q.pendingCount()).toBe(1);
    expect(q.batch()).toEqual([{ id: 'b1', value: 'v2' }]);
  });

  it('clears a key when its current value is the one that saved', () => {
    const q = new SaveQueue<string>();
    q.enqueue('b1', 'v1');
    q.beginSave('b1');
    q.completeSave('b1', 'v1');
    expect(q.pendingCount()).toBe(0);
    expect(q.status()).toBe('idle');
  });

  it('keeps the item and flags an error on failure', () => {
    const q = new SaveQueue<string>();
    q.enqueue('b1', 'v1');
    q.beginSave('b1');
    q.failSave('b1');
    expect(q.status()).toBe('error');
    expect(q.batch()).toEqual([{ id: 'b1', value: 'v1' }]);
  });

  it('reports offline regardless of pending work, then resumes when back online', () => {
    const q = new SaveQueue<string>();
    q.enqueue('b1', 'v1');
    q.setOnline(false);
    expect(q.status()).toBe('offline');
    q.setOnline(true);
    expect(q.status()).toBe('pending');
  });
});
