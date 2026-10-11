'use client';
import { useState } from 'react';
import { ArrowUpRight, ArrowRight, Bell, Check, CheckCheck, CircleHelp,
  FileText, HeartHandshake, Languages, LockKeyhole, MessageCircle, MoreHorizontal,
  Play, ShieldCheck, Sparkles, UsersRound, Volume2 } from 'lucide-react';

type Stage = 0|1|2|3;
const stages=[
  {badge:'Needs a helping hand',title:'A letter, made clear.',subtitle:'We found the important parts so María doesn’t have to figure it out alone.'},
  {badge:'Waiting on Sam',title:'Help is on the way.',subtitle:'María asked Sam to take responsibility. We’ll keep everyone in the loop.'},
  {badge:'Being handled',title:'Someone has her back.',subtitle:'Sam accepted the task. A reminder is scheduled so nothing gets overlooked.'},
  {badge:'Reported complete',title:'The circle is closed.',subtitle:'Sam reported completing the follow-up. María has received an update.'}
] as const;
const actionLabels=['Ask Sam for help','Sam accepts task','Sam reports completion','Restart walkthrough'];
const flowTitles=['Letter understood','Help requested','Task claimed','Follow-up reported'];

function Logo({compact=false}:{compact?:boolean}){
  return <span className="brand"><span className="brand-mark"><HeartHandshake size={compact?19:22} strokeWidth={2.2}/></span><span className="brand-name">clearcircle<span className="brand-dot">.</span></span></span>;
}
function Avatar({name,size='normal'}:{name:'M'|'S'|'C';size?:'normal'|'small'}){
  return <span className={`avatar avatar-${name.toLowerCase()} ${size==='small'?'avatar-sm':''}`}>{name==='C'?<HeartHandshake size={size==='small'?14:18}/>:name}</span>;
}
function Tag({children,positive=false}:{children:React.ReactNode;positive?:boolean}){
  return <span className={`tag ${positive?'tag-positive':''}`}>{children}</span>;
}

export default function Home(){
  const [stage,setStage]=useState<Stage>(0);
  const [spanish,setSpanish]=useState(false);
  const [showDetails,setShowDetails]=useState(false);
  const update=()=>setStage(v=>((v+1)%4) as Stage);
  const active=stages[stage];
  return <div className="site-shell">
    <div className="noise" aria-hidden="true"/>
    <header className="topbar wrap">
      <Logo/>
      <nav aria-label="Primary navigation"><a href="#how-it-works">How it works</a><a href="#family-view">Family view</a><a href="https://github.com/CinthiaOchoa/ClearCircle" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13}/></a></nav>
      <span className="hackathon-pill"><span className="live-dot"/> Hacklanta 2026</span>
    </header>

    <main id="main-content">
      <section className="hero wrap">
        <div className="hero-left">
          <div className="eyebrow"><Sparkles size={14}/> GOOD THINGS HAPPEN TOGETHER</div>
          <h1>Life gets complicated.<br/><em>Family makes it clearer.</em></h1>
          <p className="hero-copy">Important letters can be overwhelming. ClearCircle helps you understand what matters, ask someone you trust for help, and know when it’s handled — all through iMessage.</p>
          <div className="hero-actions"><a className="button button-primary" href="#family-view">Explore the experience <ArrowRight size={17}/></a><a className="button button-secondary" href="#how-it-works"><Play size={15}/> See how it works</a></div>
          <div className="trust-row"><span><ShieldCheck size={16}/> Your family, your choice</span><i/><span><MessageCircle size={16}/> Designed for iMessage</span></div>
        </div>
        <div className="hero-right">
          <div className="hero-glow" aria-hidden="true"/>
          <div className="letter-preview" aria-label="Fictional letter preview"><span className="tiny-label">NEW DOCUMENT</span><div className="letter-head"><div className="letter-symbol">P<span>✳</span></div><div><strong>Peach State Utilities</strong><span>Account notice</span></div></div><span className="letter-line wide"/><span className="letter-line med"/><span className="letter-line short"/><div className="highlight-line">Please contact us by October 15, 2026.</div><span className="letter-line wide"/></div>
          <div className="floating-clarity"><span className="clarity-icon"><Sparkles size={19}/></span><div><strong>We found what matters.</strong><span>1 action · 1 deadline</span></div><Check size={18}/></div>
          <div className="floating-person"><Avatar name="S" size="small"/><div><strong>Sam is here to help</strong><span>Family makes the difference</span></div><span className="status-pip"/></div>
        </div>
      </section>

      <section id="how-it-works" className="steps-section">
        <div className="wrap"><div className="section-heading"><span className="eyebrow small">SIMPLE BY DESIGN</span><h2>From “what does this mean?”<br/>to <em>“we’ve got this.”</em></h2><p>Clear explanations are just the beginning. ClearCircle helps someone actually follow through.</p></div>
          <div className="steps-grid">
            <div className="step"><span className="step-number">01</span><div className="step-icon lavender"><FileText size={23}/></div><h3>Send a photo</h3><p>Snap a confusing letter and text it to ClearCircle. No new app for parents to learn.</p></div>
            <div className="step"><span className="step-number">02</span><div className="step-icon peach"><Languages size={23}/></div><h3>Understand clearly</h3><p>Get key details explained in your language, with exact supporting words from the letter.</p></div>
            <div className="step"><span className="step-number">03</span><div className="step-icon mint"><UsersRound size={23}/></div><h3>Ask your circle</h3><p>With your permission, invite a trusted family member to take ownership.</p></div>
            <div className="step"><span className="step-number">04</span><div className="step-icon yellow"><CheckCheck size={23}/></div><h3>Stay in the loop</h3><p>Reminders and updates mean you know who’s helping and what they report completing.</p></div>
          </div>
        </div>
      </section>

      <section id="family-view" className="demo-section wrap">
        <div className="demo-top"><div><span className="eyebrow small"><span className="live-dot"/> INTERACTIVE PRODUCT PREVIEW</span><h2>A little clarity.<br/><em>A lot of peace of mind.</em></h2><p>Explore one fictional family’s journey. This preview simulates the flow; real iMessage delivery requires Photon configuration.</p></div><Tag>Demo data · Not connected to live accounts</Tag></div>
        <div className="workspace">
          <aside className="sidebar">
            <Logo compact/>
            <div className="sidebar-label">YOUR CIRCLE</div>
            <div className="circle-name"><span className="circle-icon"><UsersRound size={18}/></span><div><strong>The Rodríguez family</strong><small>2 connected members</small></div><MoreHorizontal size={17}/></div>
            <div className="sidebar-label">YOUR SPACE</div>
            <div className="sidebar-item selected" aria-current="page"><FileText size={18}/> My letters <span className="item-count">1</span></div>
            <div className="sidebar-item"><CheckCheck size={18}/> Family tasks <span className="item-count">1</span></div>
            <div className="sidebar-item"><Bell size={18}/> Reminders</div>
            <div className="sidebar-bottom"><span className="shield"><LockKeyhole size={18}/></span><div><strong>Made for your peace of mind</strong><small>Nothing shared without permission.</small></div></div>
          </aside>
          <section className="dashboard">
            <div className="dashboard-toolbar"><div className="breadcrumbs">Your circle <span>/</span> Letters <span>/</span> Utility notice</div><span className="demo-mode"><span/> PREVIEW MODE</span></div>
            <div className="welcome" aria-live="polite"><div><p>Good afternoon, María <span>✳</span></p><h3>{active.title}</h3><span>{active.subtitle}</span></div><span className="welcome-decoration">✳</span></div>
            <div className="dashboard-grid">
              <div className="main-col">
                <div className="section-label">YOUR LETTER</div>
                <article className="notice-card"><div className="notice-top"><span className="doc-icon"><FileText size={22}/></span><div><h4>Utility service notice</h4><p>Peach State Utilities · Received today</p></div><button aria-label="More document details" aria-expanded={showDetails} onClick={()=>setShowDetails(v=>!v)}><MoreHorizontal size={20}/></button></div>
                  <div className="notice-divider"/>
                  <div className="notice-facts"><div><span>AMOUNT MENTIONED</span><strong>$86.40</strong></div><div><span>DATE ON LETTER</span><strong>Oct 15, 2026</strong></div></div>
                  <div className="next-step"><span><Sparkles size={18}/></span><div><small>WHAT THIS LETTER IS ASKING</small><p>{spanish?'Comunícate con la compañía sobre el saldo pendiente.':'Contact the utility company about the past-due balance.'}</p></div></div>
                  {showDetails&&<div className="evidence"><strong>Exact line from the fictional letter</strong><p>“Please contact us by October 15, 2026.”</p><small>Quotes are shown as evidence, not as independent verification.</small></div>}
                  <div className="notice-footer"><button className="link-button" aria-expanded={showDetails} onClick={()=>setShowDetails(v=>!v)}>{showDetails?'Hide':'Show'} original evidence <ArrowUpRight size={15}/></button><button className="icon-label" aria-pressed={spanish} onClick={()=>setSpanish(v=>!v)}><Languages size={17}/>{spanish?'English':'Español'}</button></div>
                </article>
                <div className="section-label section-split"><span>FAMILY FOLLOW-THROUGH</span><span className="muted-label">Task CC-DEMO</span></div>
                <article className="task-card"><div className="task-top"><span className="task-icon"><UsersRound size={19}/></span><div><h4>Get help with this letter</h4><p>Small steps. Shared responsibility.</p></div><span className={`stage-badge stage-${stage}`}>{active.badge}</span></div>
                  <div className="task-timeline">{flowTitles.map((title,i)=><div className={`timeline-row ${i<=stage?'finished':''}`} key={title}><span className="timeline-node">{i<=stage?<Check size={12}/>:<span/>}</span><div><strong>{title}</strong><small>{['Document explanation ready','María asks Sam for help','Sam confirms responsibility','Sam reports the follow-up'][i]}</small></div></div>)}</div>
                  <button className="button button-primary task-cta" onClick={update}>{actionLabels[stage]} <ArrowRight size={17}/></button>
                </article>
              </div>
              <aside className="detail-col">
                <div className="section-label">YOUR PEOPLE</div>
                <div className="people-card"><div className="person"><Avatar name="M"/><div><strong>María Rodríguez</strong><small>Parent · Español</small></div><span className="self-tag">YOU</span></div><div className="person"><Avatar name="S"/><div><strong>Sam Rodríguez</strong><small>Family helper</small></div><Check size={16} className="green"/></div><div className="privacy-tip"><ShieldCheck size={16}/><span>Only approved family members can help with your tasks.</span></div></div>
                <div className="section-label side-margin">PRIVATE + FAMILY MESSAGES</div>
                <div className="chat-card"><div className="chat-header"><span><MessageCircle size={17}/> Conversation timeline</span><MoreHorizontal size={18}/></div><div className="bubble-stack"><div className="bubble incoming"><small>ClearCircle · Private to María</small>{spanish?'María, tienes una carta con un saldo pendiente de $86.40.':'María, this letter mentions a past-due balance of $86.40.'}</div>{stage>=1&&<div className="bubble outgoing">Sam, can you help with this?</div>}{stage>=2&&<div className="bubble incoming"><small>Sam</small>CLAIM CC-DEMO</div>}{stage>=3&&<div className="bubble incoming"><small>ClearCircle</small>Sam reported completing the follow-up. María has been updated.</div>}</div><div className="chat-input">iMessage conversation preview <ArrowUpRight size={14}/></div></div>
                <div className="accessible-card"><Volume2 size={18}/><div><strong>Made to be understood</strong><p>Voice explanations and rich chat cards are next on our roadmap.</p></div></div>
              </aside>
            </div>
          </section>
        </div>
        <div className="preview-disclaimer"><CircleHelp size={16}/> This interactive preview uses fictional information and simulates task events. It never sends actual iMessages or processes real documents.</div>
      </section>
      <section className="closing wrap"><span className="closing-icon"><HeartHandshake size={26}/></span><h2>No one should have to<br/><em>figure it out alone.</em></h2><p>Less confusion. More connection. A little more peace of mind.</p><a href="https://github.com/CinthiaOchoa/ClearCircle" target="_blank" rel="noreferrer" className="button button-primary">See the project on GitHub <ArrowUpRight size={17}/></a></section>
    </main>
    <footer className="footer wrap"><Logo compact/><span>Made with care for Hacklanta 2026.</span><a href="/family">Open private family dashboard <ArrowUpRight size={13}/></a></footer>
  </div>;
}
