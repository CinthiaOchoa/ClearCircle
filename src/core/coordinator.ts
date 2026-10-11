import type { Extraction, Extractor, Inbound, Messenger, Task, TaskStatus, TaskStore } from './types.ts';
import { claimedParent, completedParent, extractCompletionNote, parentExplanation, taskOffer } from './messages.ts';
import { flushOutbox } from '../workers/outbox.ts';
export type Settings = { parentId: string; helperId: string; groupId: string | null; reminderSeconds: number };
const activeStates: TaskStatus[] = ['NEW','NEEDS_REVIEW','EXPLAINED','OFFERED','CLAIMED','REMINDED','ESCALATED'];
export class Coordinator {
  private store: TaskStore; private messenger: Messenger; private extractor: Extractor; private cfg: Settings;
  private serial: Promise<void> = Promise.resolve();
  constructor(store: TaskStore, messenger: Messenger, extractor: Extractor, cfg: Settings) {
    if (!Number.isFinite(cfg.reminderSeconds) || cfg.reminderSeconds < 0) throw new Error('Invalid reminder interval');
    this.store = store; this.messenger = messenger; this.extractor = extractor; this.cfg = cfg;
  }
  handle(msg: Inbound): Promise<void> {
    const pending = this.serial.then(() => this.process(msg));
    this.serial = pending.catch(() => {});
    return pending;
  }
  private async process(msg: Inbound): Promise<void> {
    const actor = this.store.participant(msg.actorId);
    if (!actor || this.store.seen(msg.messageId) || (!msg.isDirect && msg.spaceId !== this.cfg.groupId)) return;
    const raw = msg.text?.trim() ?? '';
    const cmd = raw.toUpperCase();
    const privateChat = msg.isDirect && (actor.dmSpaceId === null || actor.dmSpaceId === msg.spaceId);
    let extraction: Extraction | null = null;
    let extractionFailed = false;
    const hasImage = !!(msg.image || msg.readImage);
    const current = this.store.listTasks(this.cfg.parentId).filter(t => activeStates.includes(t.status));
    if (actor.role === 'parent' && actor.consented && privateChat && hasImage && !current.some(t => t.status !== 'NEEDS_REVIEW')) {
      try { extraction = await this.extractor.extract(msg.image ?? await msg.readImage!()); }
      catch { extractionFailed = true; }
    }
    this.store.transaction(() => {
      if (this.store.seen(msg.messageId)) return;
      let index = 0;
      const say = (recipient: string, body: string, task?: Task, allowedStatus?: TaskStatus, requireConsent = true) => {
        this.store.enqueue({ id: `${msg.messageId}:${index++}`, recipient, body, taskId: task?.id ?? null, allowedStatus: allowedStatus ?? null, requireConsent });
      };
      const reply = (body: string) => say(actor.id,body,undefined,undefined,actor.consented);
      const select = (states: TaskStatus[]): Task | null => {
        if (/\bCC-/i.test(raw) && !/\bCC-[A-F0-9]{8}\b/i.test(raw)) return null;
        const id = raw.match(/\bCC-[A-F0-9]{8}\b/i)?.[0].toUpperCase();
        if (id) { const t = this.store.byId(id); return t?.parentId === this.cfg.parentId && states.includes(t.status) ? t : null; }
        const candidates = this.store.listTasks(this.cfg.parentId).filter(t => states.includes(t.status));
        return candidates.length === 1 ? candidates[0] : null;
      };
      if (msg.isDirect && ((actor.role === 'parent' && cmd === 'START') || (actor.role === 'helper' && cmd === 'JOIN'))) {
        this.store.optIn(actor.id,msg.spaceId);
        say(actor.id,actor.role === 'parent' ? 'Bienvenida. Envíame una foto en este chat privado. No compartiré la carta sin tu permiso. Responde STOP para salir.' : 'You are an authorized family helper. Reply STOP to opt out. Wait for the parent to approve a handoff.');
      } else if (privateChat && /^(STOP|SALIR)$/.test(cmd)) {
        this.store.optOut(actor.id);
        for (const task of this.store.listTasks(this.cfg.parentId)) {
          if (activeStates.includes(task.status) && (actor.role === 'parent' || ['OFFERED','ESCALATED','CLAIMED','REMINDED'].includes(task.status)))
            this.store.transition(task.id,[task.status],'CANCELLED');
        }
        say(actor.id,actor.role === 'parent' ? 'Saliste de ClearCircle. Cancelé los seguimientos activos. Responde START para volver.' : 'You opted out. Shared follow-ups were cancelled. Reply JOIN to return.',undefined,undefined,false);
        const other = actor.role === 'parent' ? this.cfg.helperId : this.cfg.parentId;
        say(other,actor.role === 'parent' ? 'The parent opted out. Active follow-ups were cancelled.' : 'Sam salió de ClearCircle. Cancelé los seguimientos compartidos.');
      } else if (!actor.consented) {
        reply(actor.role === 'parent' ? 'Responde START en el chat privado para autorizar el análisis de tu foto.' : 'Reply JOIN privately to opt in to family help.');
      } else if (!privateChat && actor.role === 'parent') {
        reply('Por privacidad, envía fotos y confirma permisos en nuestro chat privado.');
      } else if (msg.isDirect && !privateChat) {
        reply('Use the private conversation where you enrolled, or send START/JOIN here to re-enroll.');
      } else if (actor.role === 'parent' && hasImage) {
        if (current.some(t => t.status !== 'NEEDS_REVIEW')) reply('Ya tienes una tarea activa. Responde STATUS o CANCELAR con su código antes de enviar otra carta.');
        else if (extractionFailed || !extraction) reply('No pude analizar la foto. Envía una imagen JPEG, PNG o WebP clara (hasta 6 MB) e inténtalo de nuevo.');
        else {
          for (const old of current) this.store.transition(old.id,['NEEDS_REVIEW'],'CANCELLED');
          const task = this.newTask(actor.id,extraction);
          if (extraction.needsReview || !extraction.requiredAction || !extraction.requiredActionEs || !extraction.evidence.length) {
            this.store.transition(task.id,['NEW'],'NEEDS_REVIEW');
            say(actor.id,'No puedo confirmar todos los datos. ¿Puedes enviar una foto más clara de todas las páginas? No pediré ayuda sin una acción clara.',task,'NEEDS_REVIEW');
          } else {
            this.store.transition(task.id,['NEW'],'EXPLAINED');
            say(actor.id,`${parentExplanation(extraction)}\nCódigo: ${task.id}`,task,'EXPLAINED');
          }
        }
      } else if (msg.mediaError) {
        reply(actor.role === 'parent' ? 'Envía una foto JPEG, PNG o WebP de hasta 6 MB; convierte HEIC antes de enviarla.' : msg.mediaError);
      } else if (/^(STATUS|ESTADO)$/.test(cmd)) {
        const tasks = this.store.listTasks(this.cfg.parentId).filter(t => actor.role === 'parent' || t.ownerId === actor.id || ['OFFERED','ESCALATED'].includes(t.status)).slice(0,5);
        reply(tasks.length ? tasks.map(t => `${t.id} · ${t.status} · ${actor.role === 'parent' ? t.actionEs : t.action}`).join('\n') : 'No active tasks / No hay tareas activas.');
      } else if (actor.role === 'parent' && /^(CANCEL|CANCELAR)(\s+CC-[A-F0-9]{8})?$/.test(cmd)) {
        const task = select(activeStates);
        if (!task) reply('No hay una tarea activa con ese código. Responde STATUS para ver los códigos.');
        else {
          this.store.transition(task.id,[task.status],'CANCELLED');
          say(actor.id,`Cancelé el seguimiento de ${task.id}.`,task,'CANCELLED');
          if (['OFFERED','ESCALATED','CLAIMED','REMINDED'].includes(task.status)) say(this.cfg.helperId,`${task.id} was cancelled. No further action is requested.`,task,'CANCELLED');
        }
      } else if (actor.role === 'parent' && /^(S[IÍ]|YES)(\s+CC-[A-F0-9]{8})?$/.test(cmd)) {
        const task = select(['EXPLAINED']);
        if (!task) reply('No hay una carta lista con ese código. Responde STATUS o envía una foto nueva.');
        else if (!this.store.participant(this.cfg.helperId)?.consented) reply('Sam debe responder JOIN en su chat privado antes de recibir tareas.');
        else {
          this.store.transition(task.id,['EXPLAINED'],'OFFERED',{ offeredAt: null });
          say('family',taskOffer(task),task,'OFFERED');
          // Only the delivery worker may confirm that a handoff was actually sent.
          say(actor.id,`Preparé la solicitud ${task.id} para Sam. Responde STATUS para ver si aceptó. Si falla el envío, lo reintentaré.`,task,'OFFERED');
        }
      } else if (actor.role === 'helper' && /^CLAIM(?:\s+CC-[A-F0-9]{8})?$/.test(cmd)) {
        const task = select(['OFFERED','ESCALATED']);
        if (!task || !this.store.participant(this.cfg.parentId)?.consented) reply('No available task matches. Reply STATUS and use CLAIM CC-<code>.');
        else {
          const now = Date.now();
          const reminder = this.cfg.reminderSeconds > 0 ? now + this.cfg.reminderSeconds * 1000
            : Math.max(now + 60_000, task.deadline ? Date.parse(`${task.deadline}T12:00:00Z`) - 86_400_000 : now + 86_400_000);
          const claimed = this.store.claim(task.id,actor.id,reminder);
          if (!claimed) reply('This task is already claimed or unavailable.');
          else {
            say(actor.id,`You're assigned ${claimed.id}. When finished, reply DONE ${claimed.id} — I contacted the company.`,claimed,'CLAIMED');
            say(this.cfg.parentId,claimedParent(),claimed,'CLAIMED');
          }
        }
      } else if (actor.role === 'helper' && /^DONE(?:\s|$)/.test(cmd)) {
        const task = select(['CLAIMED','REMINDED']);
        if (!task || task.ownerId !== actor.id) reply('No active assigned task matches this ID.');
        else {
          const note = extractCompletionNote(raw);
          if (!note) reply(`What did you do? Reply DONE ${task.id} — followed by what you did.`);
          else {
            const done = this.store.transition(task.id,[task.status],'DONE',{ completedAt: Date.now(), completionNote: note });
            if (done) {
              say(actor.id,`${done.id} marked complete based on your report.`,done,'DONE');
              say(this.cfg.parentId,completedParent(done),done,'DONE');
            }
          }
        }
      } else reply(actor.role === 'parent' ? 'Envía una foto, responde SÍ para pedir ayuda, STATUS, CANCELAR o STOP.' : 'Reply CLAIM CC-<code>, DONE CC-<code> — what you did, STATUS or STOP.');
      this.store.recordEvent(msg.messageId,actor.id,'handled');
    });
    await flushOutbox(this.store,this.messenger,this.cfg.parentId,this.cfg.helperId);
  }
  private newTask(parentId: string, d: Extraction): Task {
    return this.store.insert({ parentId, ownerId: null, status: 'NEW', sender: d.sender,
      action: d.requiredAction ?? 'Confirm action', actionEs: d.requiredActionEs ?? 'Confirmar la acción',
      deadline: d.deadline, amount: d.amount, currency: d.currency, evidence: d.evidence,
      reminderAt: null, reminderSentAt: null, createdAt: Date.now(), offeredAt: null, completedAt: null, completionNote: null });
  }
}
