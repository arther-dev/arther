import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import {
  AiNotProvisionedError,
  AiOutputError,
  createAiGateway,
  type MessagesClient,
} from './index';

const schema = z.strictObject({ answer: z.number() });

function fakeClient(final: {
  stop_reason?: string | null;
  text?: string;
  usage?: { input_tokens: number; output_tokens: number };
}): MessagesClient {
  return {
    messages: {
      stream: () => ({
        finalMessage: async () => ({
          model: 'claude-test',
          stop_reason: final.stop_reason ?? 'end_turn',
          content: final.text === undefined ? [] : [{ type: 'text', text: final.text }],
          usage: final.usage ?? { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    },
  };
}

describe('createAiGateway', () => {
  it('throws the typed not-provisioned error without a key (env-gated)', async () => {
    const gateway = createAiGateway({ apiKey: undefined });
    expect(gateway.provisioned).toBe(false);
    await expect(
      gateway.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(AiNotProvisionedError);
  });

  it('parses valid structured output through the caller schema', async () => {
    const usages: Array<{ model: string }> = [];
    const gateway = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ text: '{"answer": 42}' }),
      onUsage: (u) => usages.push(u),
    });
    const result = await gateway.structured({
      schema,
      system: 's',
      user: 'u',
    });
    expect(result).toEqual({ answer: 42 });
    expect(usages).toEqual([{ model: 'claude-test', inputTokens: 10, outputTokens: 5 }]);
  });

  it('rejects schema-invalid output with a typed, retryable error', async () => {
    const gateway = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ text: '{"answer": "not a number"}' }),
    });
    await expect(
      gateway.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(AiOutputError);
  });

  it('surfaces refusals and truncation as typed errors', async () => {
    for (const stop of ['refusal', 'max_tokens']) {
      const gateway = createAiGateway({
        apiKey: 'test',
        client: fakeClient({ stop_reason: stop, text: '{}' }),
      });
      await expect(
        gateway.structured({ schema, system: 's', user: 'u' }),
      ).rejects.toBeInstanceOf(AiOutputError);
    }
  });

  it('rejects non-JSON output', async () => {
    const gateway = createAiGateway({
      apiKey: 'test',
      client: fakeClient({ text: 'here is your answer: 42' }),
    });
    await expect(
      gateway.structured({ schema, system: 's', user: 'u' }),
    ).rejects.toBeInstanceOf(AiOutputError);
  });
});
