import { randomUUID } from "crypto";
import type { ChannelAdapter, OutgoingMessage, ProviderResult } from "./types";

// Stands in for a real provider until Meta/Brevo credentials exist.
// Always "succeeds" so the rest of the pipeline (Message rows, Events,
// the Activity timeline) can be built and demoed before any external
// account is set up. Never used once a real adapter is configured.
export class MockAdapter implements ChannelAdapter {
  readonly name = "mock";

  async send(message: OutgoingMessage): Promise<ProviderResult> {
    console.log(`[mock ${this.name}] would send to ${message.to}:`, message.body);
    return {
      ok: true,
      providerMessageId: `mock_${randomUUID()}`,
      costPaise: 0,
    };
  }
}
