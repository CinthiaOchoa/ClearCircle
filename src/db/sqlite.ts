import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { assertTransition } from '../core/state-machine.ts';
import type { Delivery, Participant, Task, TaskStatus, TaskStore } from '../core/types.ts';
const schema = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS participants(id TEXT PRIMARY KEY,role TEXT NOT NULL CHECK(role IN ('parent','helper')),consented INTEGER NOT NULL DEFAULT 0,dm_space_id TEXT);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,parent_id TEXT NOT NULL REFERENCES participants(id),owner_id TEXT REFERENCES participants(id),status TEXT NOT NULL,sender TEXT,action TEXT NOT NULL,action_es TEXT NOT NULL,deadline TEXT,amount REAL,currency TEXT,evidence TEXT NOT NULL DEFAULT '[]',reminder_at INTEGER,reminder_sent_at INTEGER,created_at INTEGER NOT NULL,completed_at INTEGER,completion_note TEXT,offered_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_reminders ON tasks(status,reminder_at);
CREATE TABLE IF NOT EXISTS events(message_id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,event_type TEXT NOT NULL,task_id TEXT,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,recipient TEXT NOT NULL,body TEXT NOT NULL,task_id TEXT REFERENCES tasks(id),allowed_status TEXT,require_consent INTEGER NOT NULL DEFAULT 1,attempts INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,next_attempt_at INTEGER NOT NULL DEFAULT 0,delivered_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox(delivered_at,next_attempt_at,lease_until);
`;
type Row = Record<string, unknown>;
const nullable = (v: unknown) => v == null ? null : String(v);
const num = (v: unknown) => v == null ? null : Number(v);
const asTask = (r: Row | undefined): Task | null => r ? {
  id: String(r.id), parentId: String(r.parent_id), ownerId: nullable(r.owner_id), status: r.status as TaskStatus,
  sender: nullable(r.sender), action: String(r.action), actionEs: String(r.action_es), deadline: nullable(r.deadline),
  amount: num(r.amount), currency: nullable(r.currency), evidence: JSON.parse(String(r.evidence)),
  reminderAt: num(r.reminder_at), reminderSentAt: num(r.reminder_sent_at), createdAt: Number(r.created_at),
  offeredAt: num(r.offered_at), completedAt: num(r.completed_at), completionNote: nullable(r.completion_note)
} : null;
export class SqliteStore implements TaskStore {
  private db: DatabaseSync;
  constructor(path: string, parentId: string, helperId: string) {
    if (!parentId || !helperId || parentId === helperId) throw new Error('Configure distinct parent and helper addresses');
    this.db = new DatabaseSync(path); this.db.exec(schema);
    // Compatible with the original ZIP's tasks table.
    const columns = this.db.prepare('PRAGMA table_info(tasks)').all() as Row[];
    if (!columns.some(c => c.name === 'offered_at')) this.db.exec('ALTER TABLE tasks ADD COLUMN offered_at INTEGER');
    if (!columns.some(c => c.name === 'offered_at')) this.db.prepare("UPDATE tasks SET offered_at=created_at WHERE status IN ('OFFERED','ESCALATED')").run();
    const existing = this.db.prepare('SELECT id,role FROM participants').all() as Row[];
    if (existing.some(r => !((r.id === parentId && r.role === 'parent') || (r.id === helperId && r.role === 'helper')))) {
      this.db.close(); throw new Error('Existing database belongs to a different configured family');
    }
    const seed = this.db.prepare('INSERT OR IGNORE INTO participants(id,role) VALUES (?,?)');
    seed.run(parentId,'parent'); seed.run(helperId,'helper');
  }
  close(): void { this.db.close(); }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = work(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  participant(id: string): Participant | null {
    const r = this.db.prepare('SELECT * FROM participants WHERE id=?').get(id) as Row | undefined;
    return r ? { id: String(r.id), role: r.role as Participant['role'], consented: !!r.consented, dmSpaceId: nullable(r.dm_space_id) } : null;
  }
  optIn(id: string, dmSpaceId: string): void { this.db.prepare('UPDATE participants SET consented=1,dm_space_id=? WHERE id=?').run(dmSpaceId,id); }
  optOut(id: string): void { this.db.prepare('UPDATE participants SET consented=0 WHERE id=?').run(id); }
  seen(id: string): boolean { return !!this.db.prepare('SELECT 1 FROM events WHERE message_id=?').get(id); }
  recordEvent(id: string, actor: string, event: string, taskId?: string): void {
    this.db.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run(id,actor,event,taskId ?? null,Date.now());
  }
  insert(t: Omit<Task,'id'>): Task {
    const id = `CC-${randomBytes(4).toString('hex').toUpperCase()}`;
    this.db.prepare('INSERT INTO tasks(id,parent_id,owner_id,status,sender,action,action_es,deadline,amount,currency,evidence,reminder_at,reminder_sent_at,created_at,completed_at,completion_note,offered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,t.parentId,t.ownerId,t.status,t.sender,t.action,t.actionEs,t.deadline,t.amount,t.currency,JSON.stringify(t.evidence),t.reminderAt,t.reminderSentAt,t.createdAt,t.completedAt,t.completionNote,t.offeredAt);
    return { ...t, id };
  }
  listTasks(id: string): Task[] { return (this.db.prepare('SELECT * FROM tasks WHERE parent_id=? ORDER BY created_at DESC,rowid DESC').all(id) as Row[]).map(r => asTask(r)!); }
  byId(id: string): Task | null { return asTask(this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as Row | undefined); }
  latestForParent(id: string): Task | null { return this.listTasks(id)[0] ?? null; }
  currentForHelper(id: string): Task | null { return asTask(this.db.prepare("SELECT * FROM tasks WHERE owner_id=? AND status IN ('CLAIMED','REMINDED') ORDER BY created_at DESC,rowid DESC LIMIT 1").get(id) as Row | undefined); }
  transition(id: string, from: TaskStatus[], to: TaskStatus, patch: Partial<Task> = {}): Task | null {
    if (!from.length) return null;
    from.forEach(f => assertTransition(f,to));
    const map: Partial<Record<keyof Task,string>> = { ownerId: 'owner_id', reminderAt: 'reminder_at', reminderSentAt: 'reminder_sent_at', completedAt: 'completed_at', completionNote: 'completion_note', offeredAt: 'offered_at' };
    const extra = Object.entries(patch).filter(([k]) => k in map);
    const fields = ['status=?', ...extra.map(([k]) => `${map[k as keyof Task]}=?`)];
    const result = this.db.prepare(`UPDATE tasks SET ${fields.join(',')} WHERE id=? AND status IN (${from.map(() => '?').join(',')})`).run(to,...extra.map(([,v]) => { if (v == null || typeof v === 'string' || typeof v === 'number') return v ?? null; throw new Error('Invalid task patch'); }),id,...from);
    return result.changes ? this.byId(id) : null;
  }
  claim(id: string, helper: string, remindAt: number): Task | null {
    const actor = this.participant(helper);
    if (actor?.role !== 'helper' || !actor.consented) return null;
    const result = this.db.prepare("UPDATE tasks SET status='CLAIMED',owner_id=?,reminder_at=? WHERE id=? AND owner_id IS NULL AND status IN ('OFFERED','ESCALATED')").run(helper,remindAt,id);
    return result.changes ? this.byId(id) : null;
  }
  dueReminders(now: number): Task[] { return (this.db.prepare("SELECT * FROM tasks WHERE status='CLAIMED' AND reminder_at<=? AND reminder_sent_at IS NULL").all(now) as Row[]).map(r => asTask(r)!); }
  dueOffers(now: number, timeoutMs: number): Task[] { return (this.db.prepare("SELECT * FROM tasks WHERE status='OFFERED' AND offered_at<=?").all(now-timeoutMs) as Row[]).map(r => asTask(r)!); }
  enqueue(d: Omit<Delivery,'attempts'|'leaseUntil'|'nextAttemptAt'|'deliveredAt'>): void {
    this.db.prepare('INSERT OR IGNORE INTO outbox(id,recipient,body,task_id,allowed_status,require_consent) VALUES (?,?,?,?,?,?)').run(d.id,d.recipient,d.body,d.taskId,d.allowedStatus,d.requireConsent ? 1 : 0);
  }
  dueDeliveries(now: number): Delivery[] {
    return (this.db.prepare('SELECT * FROM outbox WHERE delivered_at IS NULL AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?) ORDER BY rowid LIMIT 100').all(now,now) as Row[]).map(r => ({ id: String(r.id), recipient: String(r.recipient), body: String(r.body), taskId: nullable(r.task_id), allowedStatus: r.allowed_status as TaskStatus | null, requireConsent: !!r.require_consent, attempts: Number(r.attempts), leaseUntil: num(r.lease_until), nextAttemptAt: Number(r.next_attempt_at), deliveredAt: num(r.delivered_at) }));
  }
  leaseDelivery(id: string, now: number): boolean { return !!this.db.prepare('UPDATE outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND delivered_at IS NULL AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?)').run(now+60_000,id,now,now).changes; }
  finishDelivery(id: string, now: number): void {
    this.db.prepare('UPDATE outbox SET delivered_at=?,lease_until=NULL WHERE id=?').run(now,id);
  }
  confirmDelivery(id: string, now: number): void {
    this.transaction(() => {
      this.finishDelivery(id,now);
      const row = this.db.prepare('SELECT * FROM outbox WHERE id=?').get(id) as Row;
      if (row.recipient === 'family') this.db.prepare("UPDATE tasks SET offered_at=? WHERE id=? AND status='OFFERED' AND offered_at IS NULL").run(now,row.task_id as string);
      if (id.startsWith('reminder:')) this.db.prepare("UPDATE tasks SET reminder_sent_at=? WHERE id=? AND status='REMINDED'").run(now,row.task_id as string);
    });
  }
  retryDelivery(id: string, now: number): void {
    const r = this.db.prepare('SELECT attempts FROM outbox WHERE id=?').get(id) as Row;
    const delay = Math.min(300_000,1_000 * 2 ** Math.min(Number(r.attempts),8));
    this.db.prepare('UPDATE outbox SET lease_until=NULL,next_attempt_at=? WHERE id=?').run(now+delay,id);
  }
  pendingCount(): number { return Number((this.db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE delivered_at IS NULL').get() as Row).n); }
}
