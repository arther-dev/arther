import { describe, expect, it } from 'vitest';
import { countSeats, seatForRole } from './seats';

describe('seatForRole', () => {
  it('derives Editor (paid) seats for owner/admin/member and Viewer (free) for viewer', () => {
    expect(seatForRole('owner')).toBe('editor');
    expect(seatForRole('admin')).toBe('editor');
    expect(seatForRole('member')).toBe('editor');
    expect(seatForRole('viewer')).toBe('viewer');
  });
});

describe('countSeats', () => {
  it('counts seat tiers for a member list', () => {
    expect(countSeats(['owner', 'admin', 'member', 'member', 'viewer'])).toEqual({
      editor: 4,
      viewer: 1,
    });
    expect(countSeats([])).toEqual({ editor: 0, viewer: 0 });
  });
});
