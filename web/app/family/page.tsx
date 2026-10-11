'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Bell, CheckCheck, FileText, HeartHandshake, LockKeyhole, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import type { Family } from '../../lib/family';
const labels = { NEW: 'Preparing explanation', NEEDS_REVIEW: 'Needs a clearer photo', EXPLAINED: 'Waiting for your permission', OFFERED: 'Waiting for Sam', CLAIMED: 'Sam is helping', REMINDED: 'Reminder queued', ESCALATED: 'No helper response yet', DONE: 'Reported complete', CANCELLED: 'Cancelled' };
export default function FamilyPage() {
  const [family,setFamily] = useState<Family | null>(null);
  const [signedIn,setSignedIn] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [password,setPassword] = useState('');
  const [spanish,setSpanish] = useState(false);
  const [filter,setFilter] = useState<'all'|'active'|'done'>('all');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/dashboard',{ cache: 'no-store' });
      if (response.status === 401) { setSignedIn(false); setFamily(null); return; }
      setSignedIn(true);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFamily(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your family.'); }
    finally { setLoading(false); }
  },[]);
  useEffect(() => { void load(); },[load]);
  async function login(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch('/api/session',{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPassword(''); setSignedIn(true); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); setLoading(false); }
  }
  async function logout() {
    try { const response = await fetch('/api/session',{ method: 'DELETE' }); if (!response.ok) throw new Error(); setFamily(null); setSignedIn(false); setError(''); }
    catch { setError('Could not sign out. Please try again.'); }
  }
  const visible = family?.tasks.filter(task => filter === 'all' || (filter === 'done' ? task.status === 'DONE' : !['DONE','CANCELLED'].includes(task.status))) ?? [];
  return <main className="family-shell wrap">
    <header className="family-top"><a className="brand" href="/"><span className="brand-mark"><HeartHandshake size={22}/></span><span className="brand-name">clearcircle<span className="brand-dot">.</span></span></a><a className="icon-label" href="/"><ArrowLeft size={16}/> Public walkthrough</a></header>
    {!signedIn ? <section className="signin-card"><span className="signin-icon"><LockKeyhole size={28}/></span><span className="eyebrow">YOUR PRIVATE CIRCLE</span><h1>A little peace of mind.</h1><p>Sign in to see your family’s letters and follow-ups. Your family’s password is provided by the person who set up ClearCircle.</p><form onSubmit={login}><label htmlFor="password">Family password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={256}/><button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Please wait…' : 'Open my circle'}<ArrowRight size={17}/></button></form>{error&&<p className="family-error" role="alert">{error}</p>}<small><ShieldCheck size={15}/> Your letters stay behind this sign-in.</small></section> : <>
      <div className="family-heading"><div><span className="eyebrow">YOUR FAMILY, CONNECTED</span><h1>Small steps.<br/><em>Shared responsibility.</em></h1><p>See what needs attention, who’s helping, and what they report completing.</p></div><div className="family-controls"><button className="button button-secondary" onClick={load} disabled={loading}><RefreshCw size={16}/>{loading ? 'Refreshing…' : 'Refresh'}</button><button className="link-button" onClick={logout}>Sign out</button></div></div>
      {error&&<div className="family-error" role="alert">{error}{family&&' Previously loaded information is shown below.'}</div>}
      {family&&<><div className="family-summary"><article><FileText size={20}/><strong>{family.tasks.length}</strong><span>Letters</span></article><article><UsersRound size={20}/><strong>{family.participants.filter(p=>p.consented).length}/2</strong><span>Members opted in</span></article><article><Bell size={20}/><strong>{family.pendingDeliveries}</strong><span>Messages pending</span></article><article><CheckCheck size={20}/><strong>{family.tasks.filter(t=>t.status==='DONE').length}</strong><span>Reported complete</span></article></div>
      <div className="family-note"><ShieldCheck size={18}/><p>{family.groupMode ? 'Family group configured. Membership is checked before each handoff.' : 'Direct-message fallback: Sam receives approved handoffs privately. No family group is configured.'} Actions and permissions happen in iMessage.</p></div>
      <div className="family-tabs" aria-label="Filter letters">{(['all','active','done'] as const).map(value=><button key={value} aria-pressed={filter===value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{value==='all'?'All letters':value==='active'?'Needs attention':'Reported complete'}</button>)}<button className="language-toggle" aria-pressed={spanish} onClick={()=>setSpanish(v=>!v)}>{spanish?'English actions':'Acciones en español'}</button></div>
      <div className="family-letters">{visible.map(task=><article className="live-letter" key={task.id}><div className="live-letter-top"><span className="doc-icon"><FileText size={22}/></span><div><small>{task.id}</small><h2>{task.sender||'Sender not confirmed'}</h2></div><span className={`stage-badge ${task.status==='DONE'?'stage-3':'stage-0'}`}>{task.status==='REMINDED'&&task.reminderSentAt?'Reminder sent':labels[task.status]}</span></div><p className="live-action" lang={spanish?'es':'en'}>{spanish?task.actionEs:task.action}</p><dl><div><dt>Date on letter</dt><dd>{task.deadline||'Not confirmed'}</dd></div><div><dt>Amount mentioned</dt><dd>{task.amount===null?'Not mentioned':task.currency?new Intl.NumberFormat('en-US',{ style: 'currency',currency: task.currency }).format(task.amount):`${task.amount} · Currency unconfirmed`}</dd></div></dl><details><summary>Supporting words from the letter</summary>{task.evidence.map((e,i)=><blockquote key={i}><small>{e.field}</small>“{e.quote}”</blockquote>)}</details><div className="live-letter-footer">{task.status==='DONE'?'Completion is helper reported; payment or resolution is not independently verified.':task.status==='EXPLAINED'?`Parent: reply SÍ ${task.id} in your private iMessage chat to approve a handoff.`:['OFFERED','ESCALATED'].includes(task.status)?`Sam: reply CLAIM ${task.id} in iMessage.`:['CLAIMED','REMINDED'].includes(task.status)?`Sam: reply DONE ${task.id} — followed by what you did.`:task.status==='NEEDS_REVIEW'?'Parent: send a clearer photo privately.':'No further follow-up is scheduled.'}</div></article>)}</div>
      {!visible.length&&<div className="family-empty"><FileText size={32}/><h2>{family.tasks.length?'No letters in this view.':'Your circle is ready.'}</h2><p>{family.tasks.length?'Try another filter.':'Send START in your private iMessage chat, then send a clear photo of a letter. Sam can opt in with JOIN.'}</p></div>}
      <p className="family-updated">Last snapshot: {new Date(family.generatedAt).toLocaleString()} · Refresh to see new iMessage events.</p></>}
    </>}
    <footer className="family-footer">A prototype for one configured family. Voice explanations and rich iMessage cards are on the roadmap.</footer>
  </main>;
}
