import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';

/**
 * The one Claude call site (invariant 9, ADR-007). Not a provider
 * abstraction — a single well-instrumented module that owns the API key,
 * model selection (backend config, never a user setting), timeouts/retries
 * (SDK defaults), and token logging. Import gets structured interpretation
 * through it now (F7.2); Phase 2 generation adds its call shapes here, not a
 * second client.
 *
 * Structured output: the caller's Zod schema is the contract (ADR-012) —
 * sent to the API as a constrained output format AND re-validated locally on
 * the way out, so a malformed response can never cross the boundary. Schemas
 * passed here are authored against `zod/v4` (the SDK helper's engine); the
 * rest of the repo stays on zod classic until the repo-wide v4 move.
 */

export const DEFAULT_MODEL = 'claude-opus-4-8';

export class AiNotProvisionedError extends Error {
  constructor() {
    super(
      'ANTHROPIC_API_KEY (tier: phase2Plus) is not provisioned. ' +
        'See IMPLEMENTATION_PLAN.md §6 for when this provider comes online.',
    );
    this.name = 'AiNotProvisionedError';
  }
}

/** The model answered, but not with usable structured output. Retryable. */
export class AiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiOutputError';
  }
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredRequest<S extends z.ZodType> {
  schema: S;
  system: string;
  user: string;
  maxTokens?: number;
}

export interface AiGateway {
  readonly provisioned: boolean;
  structured<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.infer<S>>;
}

/** The slice of the SDK the gateway uses — injectable for tests. */
export interface MessagesClient {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      thinking: { type: 'adaptive' };
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
      output_config: { format: ReturnType<typeof zodOutputFormat> };
    }): {
      finalMessage(): Promise<{
        model: string;
        stop_reason: string | null;
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
      }>;
    };
  };
}

export interface AiGatewayOptions {
  apiKey: string | undefined | null;
  /** Backend config (architecture §7) — never surfaced to users. */
  model?: string;
  onUsage?: (usage: AiUsage) => void;
  /** Test seam; production always uses the real SDK client. */
  client?: MessagesClient;
}

export function createAiGateway(options: AiGatewayOptions): AiGateway {
  const model = options.model ?? DEFAULT_MODEL;
  const provisioned = Boolean(options.apiKey) || Boolean(options.client);
  return {
    provisioned,
    async structured(request) {
      if (!provisioned) throw new AiNotProvisionedError();
      const client: MessagesClient =
        options.client ?? (new Anthropic({ apiKey: options.apiKey! }) as MessagesClient);

      // Streaming keeps long interpretations clear of HTTP timeouts; the
      // helper collects the final message.
      const stream = client.messages.stream({
        model,
        max_tokens: request.maxTokens ?? 64000,
        thinking: { type: 'adaptive' },
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        output_config: { format: zodOutputFormat(request.schema) },
      });
      const message = await stream.finalMessage();

      options.onUsage?.({
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      });

      if (message.stop_reason === 'refusal') {
        throw new AiOutputError('The model declined this request.');
      }
      if (message.stop_reason === 'max_tokens') {
        throw new AiOutputError(
          'The structured output was truncated — the input may be too large for one pass.',
        );
      }
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      if (text.trim() === '') {
        throw new AiOutputError('The model returned no structured output.');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AiOutputError('The model returned output that is not valid JSON.');
      }
      const result = request.schema.safeParse(parsed);
      if (!result.success) {
        const issue = result.error.issues[0];
        throw new AiOutputError(
          `The model's output failed schema validation: ${issue?.path.join('.')}: ${issue?.message}`,
        );
      }
      return result.data as z.infer<typeof request.schema>;
    },
  };
}
