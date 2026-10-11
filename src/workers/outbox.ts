import type { Messenger, TaskStore } from '../core/types.ts';
// At-least-once delivery: a process crash after Photon accepts a send can repeat it.
// No provider idempotency key is exposed by the current space.send contract.
export async function flushOutbox(store: TaskStore, transport: Messenger, parentId: string, helperId: string, now = Date.now()): Promise<void> {
  for (const item of store.dueDeliveries(now)) {
    if (!store.leaseDelivery(item.id,now)) continue;
    const recipient = store.participant(item.recipient);
    const familyAllowed = store.participant(parentId)?.consented && store.participant(helperId)?.consented;
    const task = item.taskId ? store.byId(item.taskId) : null;
    if ((item.allowedStatus && task?.status !== item.allowedStatus) ||
        (item.requireConsent && !(item.recipient === 'family' ? familyAllowed : recipient?.consented)) ||
        (item.recipient !== 'family' && ![parentId,helperId].includes(item.recipient))) {
      store.finishDelivery(item.id,now); continue;
    }
    try {
      if (item.recipient === 'family') await transport.sendToFamily(item.body);
      else await transport.sendToParticipant(item.recipient,item.body);
      store.confirmDelivery(item.id,now);
    } catch { store.retryDelivery(item.id,now); }
  }
}
