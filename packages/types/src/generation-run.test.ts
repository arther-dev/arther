import { describe, expect, it } from 'vitest';
import {
  GENERATION_RUN_STATUSES,
  GENERATION_SECTION_STATUSES,
  generationRunCreateSchema,
  isTerminalRunStatus,
  isTerminalSectionStatus,
  shouldOpenEditorOnCompletion,
  shouldPollRun,
  summarizeRunProgress,
  type GenerationSectionStatus,
} from './generation-run';

const UUID = '00000000-0000-4000-8000-000000000000';

describe('generation status enums', () => {
  it('mirror the migration 0005 CHECK constraints', () => {
    expect(GENERATION_RUN_STATUSES).toEqual([
      'queued',
      'running',
      'partial',
      'succeeded',
      'failed',
      'cancelled',
    ]);
    expect(GENERATION_SECTION_STATUSES).toEqual([
      'pending',
      'running',
      'succeeded',
      'failed',
      'skipped',
    ]);
  });

  it('classifies terminal states', () => {
    expect(isTerminalRunStatus('running')).toBe(false);
    expect(isTerminalRunStatus('queued')).toBe(false);
    expect(['partial', 'succeeded', 'failed', 'cancelled'].every(isTerminalRunStatus as never)).toBe(true);
    expect(isTerminalSectionStatus('pending')).toBe(false);
    expect(isTerminalSectionStatus('running')).toBe(false);
    expect(['succeeded', 'failed', 'skipped'].every(isTerminalSectionStatus as never)).toBe(true);
  });
});

describe('summarizeRunProgress', () => {
  const sections = (...statuses: GenerationSectionStatus[]) => statuses.map((status) => ({ status }));

  it('returns an all-zero, not-done summary for no sections', () => {
    const s = summarizeRunProgress([]);
    expect(s.total).toBe(0);
    expect(s.percentComplete).toBe(0);
    expect(s.done).toBe(false);
  });

  it('counts terminal sections and rounds percent complete', () => {
    const s = summarizeRunProgress(sections('succeeded', 'failed', 'running', 'pending'));
    expect(s.total).toBe(4);
    expect(s.completed).toBe(2);
    expect(s.byStatus.running).toBe(1);
    expect(s.percentComplete).toBe(50);
    expect(s.done).toBe(false);
  });

  it('is done only when every section is terminal (skipped counts)', () => {
    const s = summarizeRunProgress(sections('succeeded', 'skipped', 'failed'));
    expect(s.percentComplete).toBe(100);
    expect(s.done).toBe(true);
  });
});

describe('generationRunCreateSchema', () => {
  it('defaults kind to document and requires at least one section', () => {
    const parsed = generationRunCreateSchema.parse({
      productId: UUID,
      documentTypeId: UUID,
      sections: [{ name: 'Overview', displayOrder: 0 }],
    });
    expect(parsed.kind).toBe('document');
    expect(parsed.sections[0]!.documentTypeSectionId).toBeUndefined();
  });

  it('rejects a run with no sections', () => {
    expect(
      generationRunCreateSchema.safeParse({ productId: UUID, documentTypeId: UUID, sections: [] }).success,
    ).toBe(false);
  });
});

describe('shouldPollRun (G2.8 live surface)', () => {
  it('polls only a running run', () => {
    expect(shouldPollRun('running')).toBe(true);
  });

  it('does not poll a queued run (no worker under the inline model)', () => {
    expect(shouldPollRun('queued')).toBe(false);
  });

  it('does not poll a terminal run', () => {
    for (const s of ['succeeded', 'partial', 'failed', 'cancelled'] as const) {
      expect(shouldPollRun(s)).toBe(false);
    }
  });
});

describe('shouldOpenEditorOnCompletion (G2.8)', () => {
  it('opens the editor when a watched run succeeds with a document', () => {
    expect(shouldOpenEditorOnCompletion({ watched: true, status: 'succeeded', documentId: UUID })).toBe(true);
    expect(shouldOpenEditorOnCompletion({ watched: true, status: 'partial', documentId: UUID })).toBe(true);
  });

  it('does not open when the run was not being watched (revisiting a finished run)', () => {
    expect(shouldOpenEditorOnCompletion({ watched: false, status: 'succeeded', documentId: UUID })).toBe(false);
  });

  it('does not open without a committed document', () => {
    expect(shouldOpenEditorOnCompletion({ watched: true, status: 'succeeded', documentId: null })).toBe(false);
  });

  it('does not open on a failed or cancelled run', () => {
    expect(shouldOpenEditorOnCompletion({ watched: true, status: 'failed', documentId: UUID })).toBe(false);
    expect(shouldOpenEditorOnCompletion({ watched: true, status: 'cancelled', documentId: UUID })).toBe(false);
  });
});
