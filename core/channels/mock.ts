import { randomUUID } from "crypto";
import type { ChannelAdapter, OutgoingMessage, ProviderResult } from "./types";

// Always "succeeds" so the rest of the pipeline can be built/demoed before real credentials exist.
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
