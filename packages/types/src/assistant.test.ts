import { describe, expect, it } from 'vitest';
import {
  ARTHER_ASSISTANT_KNOWLEDGE,
  assistantModuleForPath,
  assistantRequestSchema,
  buildAssistantSystemPrompt,
  flattenAssistantConversation,
} from './assistant';

describe('assistantModuleForPath (K.2)', () => {
  it('maps route prefixes to module names, longest match first', () => {
    expect(assistantModuleForPath('/specs/variants/abc')).toBe('Product variants');
    expect(assistantModuleForPath('/specs?product=x')).toBe('Spec database');
    expect(assistantModuleForPath('/documents/123')).toBe('Document editor');
    expect(assistantModuleForPath('/snippets')).toBe('Block library');
    expect(assistantModuleForPath('/settings/notifications')).toBe('Settings');
    expect(assistantModuleForPath('/something-else')).toBe('Arther');
  });
});

describe('buildAssistantSystemPrompt (K.3/K.7)', () => {
  it('includes the identity, knowledge base, role, and live context', () => {
    const prompt = buildAssistantSystemPrompt({
      context: { module: 'Document editor', page: '/documents/9' },
      role: 'admin',
    });
    expect(prompt).toContain('You are Arther');
    expect(prompt).toContain(ARTHER_ASSISTANT_KNOWLEDGE);
    expect(prompt).toContain('admin');
    expect(prompt).toContain('Document editor');
    expect(prompt).toContain('/documents/9');
  });

  it('falls back to a generic role', () => {
    const prompt = buildAssistantSystemPrompt({ context: { module: 'Arther', page: '/' } });
    expect(prompt).toContain('a member');
  });
});

describe('flattenAssistantConversation (K.3)', () => {
  it('renders the transcript and ends prompting Arther', () => {
    const flat = flattenAssistantConversation([
      { role: 'user', content: 'how do variants work?' },
      { role: 'assistant', content: 'A variant is a delta on a base product.' },
      { role: 'user', content: 'and publishing?' },
    ]);
    expect(flat).toContain('User: how do variants work?');
    expect(flat).toContain('Arther: A variant is a delta on a base product.');
    expect(flat.endsWith('Arther:')).toBe(true);
  });
});

describe('assistantRequestSchema', () => {
  it('accepts a well-formed request and rejects an empty conversation', () => {
    expect(
      assistantRequestSchema.safeParse({
        messages: [{ role: 'user', content: 'hi' }],
        context: { module: 'Arther', page: '/' },
      }).success,
    ).toBe(true);
    expect(
      assistantRequestSchema.safeParse({ messages: [], context: { module: 'Arther', page: '/' } })
        .success,
    ).toBe(false);
    expect(
      assistantRequestSchema.safeParse({
        messages: [{ role: 'system', content: 'x' }],
        context: { module: 'Arther', page: '/' },
      }).success,
    ).toBe(false);
  });
});
