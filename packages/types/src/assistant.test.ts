import { describe, expect, it } from 'vitest';
import {
  ARTHER_ASSISTANT_KNOWLEDGE,
  ASSISTANT_PLANNER_SYSTEM,
  ASSISTANT_SPOTLIGHT_TARGETS,
  assistantActionSchema,
  assistantExecuteRequestSchema,
  assistantModuleForPath,
  assistantPlannerSystem,
  assistantPlanSchema,
  assistantReplySchema,
  assistantRequestSchema,
  buildAssistantSystemPrompt,
  describeAssistantAction,
  flattenAssistantConversation,
  isAssistantWriteAction,
  isInternalAssistantPath,
  spotlightTargetById,
  spotlightTargetsForPage,
  summarizeProposedActions,
  type AssistantAction,
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

  it('weaves a search summary into the answer when one is supplied (K.3/K.4)', () => {
    const plain = buildAssistantSystemPrompt({ context: { module: 'Arther', page: '/' } });
    // The capability paragraph is always present (the assistant can now act).
    expect(plain).toContain('create a product or component');
    expect(plain).toContain('confirm');
    const withResults = buildAssistantSystemPrompt({
      context: { module: 'Arther', page: '/' },
      searchSummary: '- Servo Datasheet (document): the servo drive…',
    });
    expect(withResults).toContain('Servo Datasheet');
    expect(withResults).toContain('cards');
  });

  it('weaves a proposal summary into the answer and asks to confirm (K.5)', () => {
    const withProposal = buildAssistantSystemPrompt({
      context: { module: 'Spec database', page: '/specs' },
      role: 'admin',
      proposalSummary: '- Create product “X200”',
    });
    expect(withProposal).toContain('X200');
    expect(withProposal).toContain('confirm');
    // A plain prompt carries no proposal paragraph.
    const plain = buildAssistantSystemPrompt({ context: { module: 'Arther', page: '/' } });
    expect(plain).not.toContain('proposed these actions');
  });
});

describe('assistant write actions (K.5)', () => {
  it('accepts each action kind and rejects malformed ones', () => {
    expect(
      assistantActionSchema.safeParse({ kind: 'navigate', path: '/specs', label: 'Spec database' })
        .success,
    ).toBe(true);
    expect(assistantActionSchema.safeParse({ kind: 'create_product', name: 'X200' }).success).toBe(
      true,
    );
    expect(
      assistantActionSchema.safeParse({ kind: 'create_component', name: 'Servo', componentType: 'module' })
        .success,
    ).toBe(true);
    expect(
      assistantActionSchema.safeParse({ kind: 'create_component', name: 'Servo', componentType: null })
        .success,
    ).toBe(true);
    // Bad: empty name, unknown kind, bad component type.
    expect(assistantActionSchema.safeParse({ kind: 'create_product', name: '' }).success).toBe(false);
    expect(assistantActionSchema.safeParse({ kind: 'delete_everything' }).success).toBe(false);
    expect(
      assistantActionSchema.safeParse({ kind: 'create_component', name: 'x', componentType: 'widget' })
        .success,
    ).toBe(false);
  });

  it('classifies navigate as a non-write and create_* as writes', () => {
    expect(isAssistantWriteAction({ kind: 'navigate', path: '/specs', label: 'Specs' })).toBe(false);
    expect(isAssistantWriteAction({ kind: 'create_product', name: 'X200' })).toBe(true);
    expect(
      isAssistantWriteAction({ kind: 'create_component', name: 'Servo', componentType: null }),
    ).toBe(true);
  });

  it('describes and summarizes proposed actions for line items', () => {
    const actions: AssistantAction[] = [
      { kind: 'create_product', name: 'X200' },
      { kind: 'create_component', name: 'Servo', componentType: 'module' },
      { kind: 'navigate', path: '/settings', label: 'Settings' },
    ];
    expect(describeAssistantAction(actions[0]!)).toBe('Create product “X200”');
    expect(describeAssistantAction(actions[1]!)).toBe('Create module “Servo”');
    expect(describeAssistantAction({ kind: 'create_component', name: 'Bolt', componentType: null })).toBe(
      'Create part “Bolt”',
    );
    expect(describeAssistantAction(actions[2]!)).toBe('Go to Settings');
    const summary = summarizeProposedActions(actions);
    expect(summary).toContain('- Create product “X200”');
    expect(summary.split('\n')).toHaveLength(3);
  });

  it('only accepts in-app relative navigation paths', () => {
    expect(isInternalAssistantPath('/specs')).toBe(true);
    expect(isInternalAssistantPath('/specs?product=abc&field=def')).toBe(true);
    expect(isInternalAssistantPath('//evil.com')).toBe(false);
    expect(isInternalAssistantPath('https://evil.com')).toBe(false);
    expect(isInternalAssistantPath('javascript:alert(1)')).toBe(false);
    expect(isInternalAssistantPath('specs')).toBe(false);
    expect(isInternalAssistantPath('/with space')).toBe(false);
  });

  it('validates the confirm-and-execute batch', () => {
    expect(
      assistantExecuteRequestSchema.safeParse({
        actions: [{ kind: 'create_product', name: 'X200' }],
      }).success,
    ).toBe(true);
    // An empty batch is rejected (nothing to confirm).
    expect(assistantExecuteRequestSchema.safeParse({ actions: [] }).success).toBe(false);
  });
});

describe('assistantPlanSchema / planner (K.3/K.5)', () => {
  it('accepts a search decision (a query or null)', () => {
    expect(assistantPlanSchema.safeParse({ search: { query: 'voltage fields' } }).success).toBe(true);
    expect(assistantPlanSchema.safeParse({ search: null }).success).toBe(true);
    expect(assistantPlanSchema.safeParse({ search: { query: '' } }).success).toBe(false);
    // The planner must always make a decision — `search` is required (not optional).
    expect(assistantPlanSchema.safeParse({}).success).toBe(false);
  });

  it('defaults actions + spotlight and accepts proposed actions (K.5/K.6)', () => {
    // Omitting `actions`/`spotlight` is fine — defaults keep old callers valid.
    const plain = assistantPlanSchema.parse({ search: null });
    expect(plain.actions).toEqual([]);
    expect(plain.spotlight).toBeNull();
    const full = assistantPlanSchema.safeParse({
      search: null,
      actions: [
        { kind: 'create_product', name: 'X200' },
        { kind: 'navigate', path: '/specs', label: 'Spec database' },
      ],
      spotlight: 'add-product',
    });
    expect(full.success).toBe(true);
  });

  it('the planner prompt instructs search + action + spotlight, not an answer', () => {
    expect(ASSISTANT_PLANNER_SYSTEM.toLowerCase()).toContain('search');
    expect(ASSISTANT_PLANNER_SYSTEM.toLowerCase()).toContain('do not answer');
    expect(ASSISTANT_PLANNER_SYSTEM.toLowerCase()).toContain('create_product');
    expect(ASSISTANT_PLANNER_SYSTEM.toLowerCase()).toContain('spotlight');
  });
});

describe('assistant spotlight (K.6)', () => {
  it('exposes a registry of uniquely-identified, page-scoped targets', () => {
    const ids = ASSISTANT_SPOTLIGHT_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length); // ids are unique
    for (const t of ASSISTANT_SPOTLIGHT_TARGETS) {
      expect(t.page.startsWith('/')).toBe(true);
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it('offers only the controls reachable from the current page', () => {
    const specs = spotlightTargetsForPage('/specs').map((t) => t.id);
    expect(specs).toContain('add-product');
    expect(specs).toContain('add-field');
    expect(specs).not.toContain('publish-document');
    // Dynamic document route matches the /documents prefix.
    const doc = spotlightTargetsForPage('/documents/abc-123').map((t) => t.id);
    expect(doc).toContain('submit-for-review');
    expect(doc).toContain('publish-document');
    // A page with no registered controls offers none.
    expect(spotlightTargetsForPage('/dashboard')).toHaveLength(0);
  });

  it('looks targets up by id', () => {
    expect(spotlightTargetById('add-product')?.page).toBe('/specs');
    expect(spotlightTargetById('nope')).toBeUndefined();
  });

  it('injects the page’s available controls into the planner system prompt', () => {
    const onSpecs = assistantPlannerSystem({ module: 'Spec database', page: '/specs' });
    expect(onSpecs).toContain('AVAILABLE CONTROLS');
    expect(onSpecs).toContain('add-product');
    expect(onSpecs).not.toContain('publish-document');
    const onDashboard = assistantPlannerSystem({ module: 'Dashboard', page: '/dashboard' });
    expect(onDashboard).toContain('none on this page');
  });
});

describe('assistantReplySchema (K.4)', () => {
  it('accepts a plain reply and a reply with a search directive', () => {
    expect(assistantReplySchema.safeParse({ reply: 'Here is how variants work…' }).success).toBe(true);
    const withSearch = assistantReplySchema.safeParse({
      reply: 'Here’s what I found:',
      search: { query: 'servo drive datasheet' },
    });
    expect(withSearch.success).toBe(true);
    expect(assistantReplySchema.safeParse({ reply: 'x', search: null }).success).toBe(true);
  });

  it('rejects an empty search query', () => {
    expect(assistantReplySchema.safeParse({ reply: 'x', search: { query: '' } }).success).toBe(false);
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
