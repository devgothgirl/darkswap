import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, ClipboardCheck, Clock3, Copy, FileText, Info, Layers3, RotateCcw, ShieldAlert } from 'lucide-react';
import { Footer, Header } from '../../components/swap-ui';
import './privacy-bundle-preview.css';

type Priority = 'documentation' | 'coordination' | 'review';
type Draft = { name: string; window: number; priority: Priority };

const priorityOptions: { value: Priority; title: string; description: string }[] = [
  { value: 'documentation', title: 'Document decisions', description: 'Keep a clear internal record of ownership and approvals.' },
  { value: 'coordination', title: 'Align the team', description: 'Clarify who reviews, signs off, and communicates.' },
  { value: 'review', title: 'Review exposure', description: 'Make room to check assumptions and public visibility.' },
];

const priorityLabels: Record<Priority, string> = {
  documentation: 'Document decisions',
  coordination: 'Align the team',
  review: 'Review exposure',
};

const priorityGuidance: Record<Priority, string> = {
  documentation: 'Start with a shared decision record: rationale, ownership, and approval criteria.',
  coordination: 'Start with team handoffs: identify reviewers, decision owners, and communication responsibilities.',
  review: 'Start by questioning assumptions about what public on-chain activity can reveal.',
};

const horizonDescriptions = {
  short: 'A short coordination horizon. Confirm reviewers and decision owners before the window begins.',
  medium: 'A balanced coordination horizon. Keep approvals, communications, and records aligned as plans change.',
  long: 'An extended coordination horizon. Recheck assumptions and handoffs during the window; duration is not a privacy control.',
};

function describeHorizon(hours: number) {
  return hours <= 3 ? horizonDescriptions.short : hours <= 8 ? horizonDescriptions.medium : horizonDescriptions.long;
}

function formatHours(hours: number) {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

function buildSummary(draft: Draft) {
  return [
    `DarkSwap Privacy Bundle for Launchers — conceptual draft`,
    `Planning label: ${draft.name || 'Untitled launch'}`,
    `Funding coordination window: ${formatHours(draft.window)} (planning preference, not a transfer schedule)`,
    `Planning emphasis: ${priorityLabels[draft.priority]}`,
    `Recommended bundle: decision record, team responsibilities, on-chain visibility review.`,
    `Broad phases: Set the policy; align reviewers; document decisions; revisit assumptions.`,
    `Boundary: On-chain activity can remain linkable. This draft does not provide privacy guarantees, wallet addresses, transfers, execution, or a way to defeat chain analytics.`,
  ].join('\n');
}

export default function PrivacyBundlePreview() {
  const [name, setName] = useState('');
  const [windowInput, setWindowInput] = useState('4');
  const [priority, setPriority] = useState<Priority>('documentation');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Privacy Bundle for Launchers | DarkSwap';
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = meta?.content;
    if (meta) meta.content = 'A browser-only conceptual planning preview for Solana token launch teams. No transaction privacy guarantees, quotes, wallet connection, orders, or execution.';
    return () => {
      document.title = previousTitle;
      if (meta && previousDescription !== undefined) meta.content = previousDescription;
    };
  }, []);

  const parsedWindow = Number(windowInput);
  const validWindow = /^\d+$/.test(windowInput) && Number.isInteger(parsedWindow) && parsedWindow >= 1 && parsedWindow <= 12;
  const cleanName = name.trim();
  const validName = cleanName.length <= 40;
  const changed = draft !== null && (draft.name !== cleanName || draft.window !== parsedWindow || draft.priority !== priority);

  function updateWindow(value: string) {
    setWindowInput(value);
    setError('');
    setNotice('');
  }

  function generateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validWindow) {
      setError('Choose a whole number of hours from 1 to 12.');
      setNotice('');
      return;
    }
    if (!validName) {
      setError('Keep the planning label to 40 characters or fewer.');
      setNotice('');
      return;
    }
    setDraft({ name: cleanName, window: parsedWindow, priority });
    setError('');
    setNotice('Conceptual draft updated in your browser.');
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  function reset() {
    setName('');
    setWindowInput('4');
    setPriority('documentation');
    setDraft(null);
    setError('');
    setNotice('Planning inputs and draft cleared.');
  }

  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(buildSummary(draft));
      setNotice('Conceptual draft copied to clipboard.');
    } catch {
      setNotice('Clipboard unavailable. Select the draft details to copy them manually.');
    }
  }

  return (
    <div className="app-shell pb-page">
      <Header />
      <main className="pb-wrap" id="main-content">
        <section className="pb-hero" aria-labelledby="pb-title">
          <div className="pb-hero-copy">
            <div className="pb-eyebrow"><span className="pb-eyebrow-line" /> DARKSWAP / LAUNCH PLANNING / PREVIEW</div>
            <h1 id="pb-title">Privacy Bundle<br /><span>for Launchers.</span></h1>
            <p>A clearer desk for launch decisions. Set a coordination window, choose what needs attention, and leave with a conceptual plan—not a promise about what anyone can see on-chain.</p>
            <div className="pb-hero-actions">
              <a href="#pb-workbench" className="pb-hero-link" data-testid="link-open-planning-desk">Open planning desk <ArrowRight size={16} aria-hidden="true" /></a>
              <span>Browser-only preview · Solana launch teams</span>
            </div>
          </div>
          <aside className="pb-hero-plate" aria-label="Preview scope">
            <div className="pb-plate-top"><span>PRODUCT PREVIEW / 01</span><span className="pb-plate-dot" /></div>
            <div className="pb-plate-art" aria-hidden="true"><div className="pb-orbit pb-orbit-one" /><div className="pb-orbit pb-orbit-two" /><div className="pb-orbit pb-orbit-three" /><div className="pb-plate-core"><Layers3 size={30} strokeWidth={1.5} /></div></div>
            <div className="pb-plate-bottom"><strong>Plan with the limits in view.</strong><span>01 / Frame &nbsp;·&nbsp; 02 / Review &nbsp;·&nbsp; 03 / Record</span></div>
          </aside>
        </section>

        <section className="pb-boundary" aria-label="Important privacy boundary">
          <div className="pb-boundary-icon"><ShieldAlert size={22} aria-hidden="true" /></div>
          <div><strong>Privacy is not a checkbox.</strong><p>Solana transactions are public and on-chain linkability remains possible. A new or previously unused wallet does not make activity private. This preview cannot determine whether observers can connect activity, and does not claim to defeat Bubblemaps, InsightX, or any other analytics tool.</p></div>
          <span className="pb-boundary-tag">READ BEFORE PLANNING</span>
        </section>

        <section className="pb-workbench-section" id="pb-workbench" aria-labelledby="pb-workbench-title">
          <div className="pb-section-heading"><div><span className="pb-kicker">01 / THE PLANNING DESK</span><h2 id="pb-workbench-title">Shape a draft, not a transaction.</h2></div><p>No wallet connection. No quote. No order or execution API.</p></div>
          <div className="pb-workbench">
            <section className="pb-config-panel" aria-labelledby="pb-config-title">
              <div className="pb-panel-top"><div><span className="pb-panel-index">CONFIGURATION / LOCAL ONLY</span><h3 id="pb-config-title">Planning inputs</h3></div><span className="pb-panel-mark">01</span></div>
              <form onSubmit={generateDraft} noValidate>
                <div className="pb-field">
                  <label htmlFor="pb-label">Planning label <span>optional</span></label>
                  <input id="pb-label" type="text" value={name} onChange={event => { setName(event.target.value); setError(''); setNotice(''); }} placeholder="e.g. Spring launch review" aria-describedby="pb-label-help" aria-invalid={!validName} data-testid="input-planning-label" />
                  <small id="pb-label-help">For your draft only. Do not enter secrets or wallet details. {name.length}/40</small>
                </div>
                <div className="pb-field pb-window-field">
                  <div className="pb-label-row"><label htmlFor="pb-window">Funding coordination window</label><span className="pb-window-pill"><Clock3 size={13} aria-hidden="true" /> 1–12 HOURS</span></div>
                  <div className="pb-window-control">
                    <input id="pb-window" type="number" min="1" max="12" step="1" inputMode="numeric" value={windowInput} onChange={event => updateWindow(event.target.value)} aria-invalid={!validWindow} aria-describedby="pb-window-help" data-testid="input-funding-window" />
                    <span>hours</span>
                  </div>
                  <input className="pb-range" type="range" min="1" max="12" step="1" value={validWindow ? parsedWindow : 4} onChange={event => updateWindow(event.target.value)} aria-label="Adjust funding coordination window from one to twelve hours" data-testid="slider-funding-window" />
                  <div className="pb-range-ends"><span>1 hour</span><span>12 hours</span></div>
                  <small id="pb-window-help">An internal planning horizon only. It is not a transfer timetable or a privacy setting.</small>
                </div>
                <fieldset className="pb-priorities">
                  <legend>Where should the team focus?</legend>
                  {priorityOptions.map(option => (
                    <label className="pb-priority" key={option.value} data-active={priority === option.value}>
                      <input type="radio" name="priority" value={option.value} checked={priority === option.value} onChange={() => { setPriority(option.value); setNotice(''); }} data-testid={`radio-priority-${option.value}`} />
                      <span className="pb-radio-indicator" aria-hidden="true" />
                      <span><strong>{option.title}</strong><small>{option.description}</small></span>
                    </label>
                  ))}
                </fieldset>
                {error && <p className="pb-error" role="alert" data-testid="status-planning-error">{error}</p>}
                <div className="pb-form-actions"><button className="pb-primary" type="submit" data-testid="button-generate-draft">{draft ? 'Update conceptual draft' : 'Create conceptual draft'} <ArrowRight size={16} aria-hidden="true" /></button><button className="pb-reset" type="button" onClick={reset} data-testid="button-reset-draft"><RotateCcw size={14} aria-hidden="true" /> Reset</button></div>
                {notice && <p className="pb-notice" role="status" data-testid="status-draft-notice">{notice}</p>}
              </form>
            </section>

            <section className="pb-result-panel" ref={resultRef} aria-labelledby="pb-result-title">
              <div className="pb-panel-top pb-result-top"><div><span className="pb-panel-index">RECOMMENDED LAUNCH BUNDLE / CONCEPTUAL</span><h3 id="pb-result-title">Your draft plan</h3></div><span className="pb-status">{draft ? 'DRAFT READY' : 'AWAITING INPUT'}</span></div>
              {draft ? (
                <div className="pb-result-content" aria-live="polite" data-testid="section-draft-summary">
                  {changed && <div className="pb-stale"><Info size={15} aria-hidden="true" /> Inputs changed. Update the draft to reflect them.</div>}
                  <div className="pb-result-intro"><span>PLANNING BRIEF / {draft.name || 'UNTITLED LAUNCH'}</span><h4>A considered launch starts with shared decisions.</h4><p>{describeHorizon(draft.window)} {priorityGuidance[draft.priority]}</p></div>
                  <div className="pb-draft-metrics"><div><span>Coordination window</span><strong data-testid="text-selected-window">{formatHours(draft.window)}</strong></div><div><span>Primary focus</span><strong data-testid="text-selected-priority">{priorityLabels[draft.priority]}</strong></div></div>
                  <div className="pb-phase-heading"><span>BROAD PHASES</span><span>Not an execution schedule</span></div>
                  <ol className="pb-phases">
                    <li><span>01</span><div><strong>Set the policy</strong><p>Agree on responsibilities, approval standards, and what must be communicated publicly.</p></div></li>
                    <li><span>02</span><div><strong>Align reviewers</strong><p>Identify decision owners and ensure relevant legal, security, and treasury questions have a home.</p></div></li>
                    <li><span>03</span><div><strong>Document decisions</strong><p>Capture assumptions and sign-offs so the team has an accountable record.</p></div></li>
                    <li><span>04</span><div><strong>Revisit assumptions</strong><p>Review what is visible on-chain and update communications if circumstances change.</p></div></li>
                  </ol>
                  <div className="pb-result-end"><p><ShieldAlert size={16} aria-hidden="true" /> No privacy guarantee or claim of unlinkability. On-chain activity may still be associated.</p><button type="button" className="pb-copy" onClick={copyDraft} data-testid="button-copy-draft"><Copy size={15} aria-hidden="true" /> Copy draft</button></div>
                </div>
              ) : (
                <div className="pb-empty" data-testid="status-draft-empty"><div className="pb-empty-glyph" aria-hidden="true"><FileText size={30} strokeWidth={1.4} /></div><span>NOTHING GENERATED YET</span><h4>Your planning brief belongs here.</h4><p>Choose a 1–12 hour coordination window and a focus, then create a conceptual draft. The recommended bundle covers policy, team ownership, and visibility review—not transaction instructions.</p><div className="pb-empty-line"><span>LOCAL INPUTS</span><span>→</span><span>BROAD PHASES</span></div></div>
              )}
            </section>
          </div>
          <p className="pb-local-note"><Info size={14} aria-hidden="true" /> The configurator runs in this browser only. Inputs are not sent to a server or saved between visits.</p>
        </section>

        <section className="pb-bundle" aria-labelledby="pb-bundle-title">
          <div className="pb-bundle-lead"><span className="pb-kicker">02 / WHAT THE BUNDLE MEANS</span><h2 id="pb-bundle-title">Good preparation is visible in the decisions.</h2><p>These are planning lenses for a launch team, not tools to conceal funding paths or manufacture a privacy outcome.</p></div>
          <div className="pb-bundle-list">
            <article><span className="pb-bundle-icon"><FileText size={21} aria-hidden="true" /></span><div><span>01 / DECISION RECORD</span><h3>Know what was agreed.</h3><p>Keep rationale, ownership, and approval criteria together so the team can explain its choices.</p></div></article>
            <article><span className="pb-bundle-icon"><ClipboardCheck size={21} aria-hidden="true" /></span><div><span>02 / TEAM HANDOFFS</span><h3>Make responsibilities explicit.</h3><p>Coordinate reviewers and signers for accountability and operational safety, not anonymity.</p></div></article>
            <article><span className="pb-bundle-icon"><ShieldAlert size={21} aria-hidden="true" /></span><div><span>03 / VISIBILITY REVIEW</span><h3>Expect public scrutiny.</h3><p>Consider how publicly observable activity may be interpreted. Prior wallet history, including a lack of it, does not settle linkability.</p></div></article>
          </div>
        </section>
        <section className="pb-bottom-note" aria-label="Preview availability"><div><span className="pb-kicker">PREVIEW BOUNDARY</span><h2>This is a planning surface. Nothing moves.</h2><p>No quote, wallet connection, order, transaction, or execution API is available on this page. The draft is not financial, legal, security, or privacy advice.</p></div><div className="pb-bottom-check"><Check size={18} aria-hidden="true" /><span>Clear options.<br />No hidden promises.</span></div></section>
      </main>
      <Footer />
    </div>
  );
}