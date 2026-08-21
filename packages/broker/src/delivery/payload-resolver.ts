import { PrismaService } from '../prisma/prisma.service';
import { BrokerEventMessage } from '../transport/event-source.interface';

/**
 * Resolve the FULL original event payload for a broker message.
 *
 * Transport wrinkle: the outbox transport carries the full payload as
 * written by the backend (sync events: BaseEventPayload with id/type/...,
 * system webhooks: {event, timestamp, data}). The Pub/Sub transport however
 * carries envelope.data, which the backend's publisher normalizes to the
 * INNER `payload.data` — the wrapper fields are stripped.
 *
 * Since envelope.id === outbox row id in both transports, we can always
 * recover the full payload from the outbox row itself. requiredKeys tells
 * us whether the in-message payload is already the full shape.
 */
export async function resolveFullPayload(
  prisma: PrismaService,
  message: BrokerEventMessage,
  requiredKeys: string[],
): Promise<Record<string, unknown> | null> {
  const inMessage = message.payload;
  if (inMessage && requiredKeys.every((key) => inMessage[key] !== undefined)) {
    return inMessage;
  }

  const row = await prisma.pubSubOutboxEvent.findUnique({
    where: { id: message.id },
    select: { payload: true },
  });

  const fromRow = row?.payload as Record<string, unknown> | undefined;
  if (fromRow && requiredKeys.every((key) => fromRow[key] !== undefined)) {
    return fromRow;
  }

  return null;
}
