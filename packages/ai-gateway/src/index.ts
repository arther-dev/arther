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

/** One content block from the model — only the fields the gateway reads. */
export interface MessageBlock {
  type: string;
  text?: string;
  /** Present on tool_use blocks: the structured arguments, already parsed. */
  name?: string;
  input?: unknown;
}

/** A forced single-tool call — the input_schema is the caller's JSON schema. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * The slice of the SDK the gateway uses — injectable for tests. Structured
 * output goes through tool use (ADR-007/architecture §7: "Claude tool-use
 * with a Zod-derived JSON schema"), not output_config.format: a tool's
 * input_schema isn't run through the strict structured-output compiler, so it
 * tolerates the deep, union-heavy contracts the spec import needs. Forcing the
 * tool means no thinking blocks (forced tool_choice and extended thinking are
 * mutually exclusive) — fine for a rules-driven extraction.
 */
export interface MessagesClient {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: 'user'; content: string }>;
      tools: ToolSpec[];
      tool_choice: { type: 'tool'; name: string };
    }): {
      finalMessage(): Promise<{
        model: string;
        stop_reason: string | null;
        content: MessageBlock[];
        usage: { input_tokens: number; output_tokens: number };
      }>;
    };
  };
}

/** The one tool the model is forced to call to return its result. */
const RESULT_TOOL = 'record_result';

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

      // The caller's Zod schema becomes the tool's input_schema. zodOutputFormat
      // also does the SDK's JSON-schema cleanup (drops unsupported keywords);
      // we reuse it here just to derive the schema, then feed it to the tool.
      const inputSchema = zodOutputFormat(request.schema).schema as Record<string, unknown>;
      const tool: ToolSpec = {
        name: RESULT_TOOL,
        description: 'Return the structured result. Call this exactly once with the full result.',
        input_schema: inputSchema,
      };

      // Streaming keeps long interpretations clear of HTTP timeouts; the helper
      // collects the final message. A thrown SDK/API error (e.g. a 400) is
      // wrapped so the caller surfaces a real reason instead of swallowing it.
      let message: Awaited<ReturnType<ReturnType<MessagesClient['messages']['stream']>['finalMessage']>>;
      try {
        const stream = client.messages.stream({
          model,
          max_tokens: request.maxTokens ?? 16000,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          tools: [tool],
          tool_choice: { type: 'tool', name: RESULT_TOOL },
        });
        message = await stream.finalMessage();
      } catch (err) {
        throw new AiOutputError(
          `The model request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      options.onUsage?.({
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      });

      if (message.stop_reason === 'refusal') {
        throw new AiOutputError('The model declined this request.');
      }
      const toolUse = message.content.find(
        (block) => block.type === 'tool_use' && block.name === RESULT_TOOL,
      );
      if (!toolUse) {
        if (message.stop_reason === 'max_tokens') {
          throw new AiOutputError(
            'The structured output was truncated — the input may be too large for one pass.',
          );
        }
        throw new AiOutputError('The model returned no structured output.');
      }
      const result = request.schema.safeParse(toolUse.input);
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
