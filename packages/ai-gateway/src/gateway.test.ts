import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import {
  AiNotProvisionedError,
  AiOutputError,
  createAiGateway,
  type MessageBlock,
  type MessagesClient,
} from './index';

const schema = z.strictObject({ answer: z.number() });

/** A fake SDK client returning one final message (tool-use path). */
function fakeClient(final: {
  stop_reason?: string | null;
  content?: MessageBlock[];
  usage?: { input_tokens: number; output_tokens: number };
  throwOnStream?: Error;
}): MessagesClient {
  return {
    messages: {
      stream: () => {
        if (final.throwOnStream) throw final.throwOnStream;
        return {
          finalMessage: async () => ({
            model: 'claude-test',
            stop_reason: final.stop_reason ?? 'tool_use',
            content: final.content ?? [],
            usage: final.usage ?? { input_tokens: 10, output_tokens: 5 },
          }),
        };
      },
    },
  };
}

/** The model's structured answer arrives as a forced tool_use block. */
function toolUse(input: unknown): MessageBlock {
  return { type: 'tool_use', name: 'record_result', input };
}

describe('createAiGateway', () => {
  it('throws the typed not-provisioned error without a key (env-gated)', async () => {
    const gateway = createAiGateway({ apiKey: undefined });
    expect(gateway.provisioned).toBe(false);
    await expect(
      gateway.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(AiNotProvisionedError);
  });

  it('parses the forced tool call through the caller schema', async () => {
    const usages: Array<{ model: string }> = [];
    const gateway = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ content: [toolUse({ answer: 42 })] }),
      onUsage: (u) => usages.push(u),
    });
    const result = await gateway.structured({ schema, system: 's', user: 'u' });
    expect(result).toEqual({ answer: 42 });
    expect(usages).toEqual([{ model: 'claude-test', inputTokens: 10, outputTokens: 5 }]);
  });

  it('rejects schema-invalid tool input with a typed, retryable error', async () => {
    const gateway = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ content: [toolUse({ answer: 'not a number' })] }),
    });
    await expect(
      gateway.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(AiOutputError);
  });

  it('surfaces refusals and missing tool calls as typed errors', async () => {
    const refusal = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ stop_reason: 'refusal', content: [] }),
    });
    await expect(
      refusal.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(AiOutputError);

    const noTool = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] }),
    });
    await expect(
      noTool.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(AiOutputError);
  });

  it('wraps a thrown SDK/API error so the reason is never swallowed', async () => {
    const gateway = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ throwOnStream: new Error('400 output_config: bad schema') }),
    });
    await expect(
      gateway.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toThrow(/400 output_config/);
  });
});
