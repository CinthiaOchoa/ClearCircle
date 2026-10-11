import type { Messenger, TaskStore } from '../core/types.ts';
import { flushOutbox } from './outbox.ts';
export async function processReminders(store: TaskStore, transport: Messenger, parentId: string, helperId: string, now = Date.now()): Promise<void> {
  store.transaction(() => {
    for (const task of store.dueReminders(now)) {
      if (!task.ownerId || !store.participant(task.ownerId)?.consented || !store.participant(task.parentId)?.consented) continue;
      if (!store.transition(task.id,['CLAIMED'],'REMINDED')) continue;
      store.enqueue({ id: `reminder:${task.id}`, recipient: task.ownerId, body: `ClearCircle reminder · ${task.id}\nHave you completed: ${task.action}?\nReply DONE ${task.id} — followed by what you did.`, taskId: task.id, allowedStatus: 'REMINDED', requireConsent: true });
    }
  });
  await flushOutbox(store,transport,parentId,helperId,now);
}
export async function processEscalations(store: TaskStore, transport: Messenger, parentId: string, helperId: string, timeoutMs: number, now = Date.now()): Promise<void> {
  store.transaction(() => {
    for (const task of store.dueOffers(now,timeoutMs)) {
      if (!store.transition(task.id,['OFFERED'],'ESCALATED')) continue;
      store.enqueue({ id: `escalation:${task.id}`, recipient: parentId, body: `Sam todavía no ha aceptado la tarea ${task.id}. Puedes escribirle directamente o responder CANCELAR ${task.id}.`, taskId: task.id, allowedStatus: 'ESCALATED', requireConsent: true });
    }
  });
  await flushOutbox(store,transport,parentId,helperId,now);
}
