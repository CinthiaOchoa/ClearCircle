import type { Extraction, Task } from './types.ts';

const short = (value: string, max = 180) => value.replace(/\s+/g, ' ').trim().slice(0, max);
const deadlineEs = (value: string | null): string => value
  ? new Intl.DateTimeFormat('es-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  : 'una fecha que no se pudo confirmar';
const money = (amount: number | null, currency: string | null) => amount === null
  ? null : !currency ? `${amount.toFixed(2)} (moneda no confirmada)` : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export function parentExplanation(d: Extraction): string {
  const amount = money(d.amount, d.currency);
  const line = d.evidence.find(e => e.field === 'deadline')?.quote;
  return [
    `María, recibiste una carta de ${short(d.sender || 'un remitente no identificado')}.`,
    short(d.purposeEs),
    d.requiredActionEs ? `Pide lo siguiente: ${short(d.requiredActionEs)}.` : 'No pude confirmar qué acción se requiere.',
    amount ? `Monto mencionado: ${amount}.` : null,
    d.deadline ? `Fecha indicada: ${deadlineEs(d.deadline)}.` : 'No pude confirmar la fecha.',
    line ? `Texto original: “${short(line, 120)}”` : null,
    '¿Quieres que le pida ayuda a Sam? Responde SÍ o CANCELAR.'
  ].filter(Boolean).join('\n');
}

export function taskOffer(t: Task): string {
  const quote = t.evidence.find(e => e.field === 'deadline')?.quote;
  return [
    `ClearCircle · ${t.id}`,
    'María pidió ayuda con una carta.',
    `Tarea / Task: ${short(t.action)}`,
    t.deadline ? `Deadline: ${t.deadline}` : 'Deadline: not confirmed',
    quote ? `From the letter: “${short(quote, 120)}”` : null,
    `Sam: reply CLAIM ${t.id} to take responsibility.`
  ].filter(Boolean).join('\n');
}
export function claimedParent(): string {
  return 'Sam aceptó ayudarte con la carta. Te avisaré cuando confirme qué hizo.';
}
export function completedParent(t: Task): string {
  return `María, Sam confirmó que completó este paso: ${short(t.actionEs)}. Marcamos la tarea como completada según su mensaje; esto no confirma que el saldo esté pagado ni que el problema esté resuelto.`;
}
export function extractCompletionNote(input: string): string | null {
  const cleaned = input.replace(/^DONE(?:\s+CC-[A-F0-9]{8})?\s*[-:—]?\s*/i, '').trim();
  return cleaned.length >= 8 ? short(cleaned, 180) : null;
}
