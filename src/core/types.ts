export type TaskStatus =
  | 'NEW' | 'NEEDS_REVIEW' | 'EXPLAINED' | 'OFFERED'
  | 'CLAIMED' | 'REMINDED' | 'ESCALATED' | 'DONE' | 'CANCELLED';

export type Role = 'parent' | 'helper';
export type Evidence = { field: string; quote: string };
export type Extraction = {
  documentType: 'utility' | 'school' | 'insurance' | 'housing' | 'appointment' | 'other';
  sender: string | null;
  purpose: string;
  purposeEs: string;
  requiredAction: string | null;
  requiredActionEs: string | null;
  deadline: string | null;
  amount: number | null;
  currency: string | null;
  contactPhone: string | null;
  referenceNumber: string | null;
  evidence: Evidence[];
  needsReview: boolean;
};

export type Task = {
  id: string;
  parentId: string;
  ownerId: string | null;
  status: TaskStatus;
  sender: string | null;
  action: string;
  actionEs: string;
  deadline: string | null;
  amount: number | null;
  currency: string | null;
  evidence: Evidence[];
  reminderAt: number | null;
  reminderSentAt: number | null;
  createdAt: number;
  completedAt: number | null;
  completionNote: string | null;
};
export type Participant = { id: string; role: Role; consented: boolean; dmSpaceId: string | null };
export type ImageInput = { data: Uint8Array; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' };
export type Inbound = { messageId: string; actorId: string; spaceId: string; isDirect: boolean; readImage?: () => Promise<ImageInput>; mediaError?: string; text?: string; image?: ImageInput; reaction?: { emoji: string; target: string } };
export interface Messenger {
  sendToParticipant(id: string, text: string): Promise<void>;
  sendToFamily(text: string): Promise<void>;
}
export interface Extractor {
  extract(image: ImageInput): Promise<Extraction>;
}
export interface TaskStore {
  participant(id: string): Participant | null;
  optIn(id: string, dmSpaceId: string): void;
  seen(messageId: string): boolean;
  recordEvent(messageId: string, actorId: string, name: string, taskId?: string): void;
  insert(task: Omit<Task, 'id'>): Task;
  latestForParent(parentId: string): Task | null;
  currentForHelper(helperId: string): Task | null;
  byId(id: string): Task | null;
  transition(id: string, from: TaskStatus[], to: TaskStatus, patch?: Partial<Task>): Task | null;
  claim(id: string, helperId: string, at: number): Task | null;
  dueReminders(now: number): Task[];
  dueOffers(now: number, timeoutMs: number): Task[];
}
