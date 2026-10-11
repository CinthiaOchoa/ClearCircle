import type { TaskStatus } from './types.ts';

const allowed: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['EXPLAINED', 'NEEDS_REVIEW', 'CANCELLED'],
  NEEDS_REVIEW: ['EXPLAINED', 'CANCELLED'],
  EXPLAINED: ['OFFERED', 'CANCELLED'],
  OFFERED: ['CLAIMED', 'ESCALATED', 'CANCELLED'],
  ESCALATED: ['CLAIMED', 'CANCELLED'],
  CLAIMED: ['REMINDED', 'DONE', 'CANCELLED'],
  REMINDED: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: []
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return allowed[from].includes(to);
}
export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) throw new Error(`Invalid task transition: ${from} → ${to}`);
}
