import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleHelp, Plus, Search, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { findSupportFaq } from './support-faq';

export function HelpWidget() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [location] = useLocation();
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { setOpen(false); }, [location]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  const results = findSupportFaq(query).slice(0, query.trim() ? 8 : 4);
  return <aside className="help-widget" aria-label="DarkSwap help">
    {open && <section className="help-widget-panel" id="instant-help-panel" aria-label="Reviewed instant answers">
      <div className="help-widget-top"><div><span>SUPPORT / REVIEWED ANSWERS</span><h2>How can we help?</h2></div><button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }} aria-label="Close help" data-testid="button-close-help"><X size={18}/></button></div>
      <div className="help-widget-content">
        <p>Search the reviewed FAQ. These answers are not a live conversation.</p>
        <div className="help-widget-input"><Search size={16} aria-hidden="true"/><input ref={search} type="search" aria-label="Search instant answers" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ask about deposits, status, refunds…" data-testid="input-widget-help-search"/></div>
        <div className="help-widget-label">{query.trim() ? `${results.length} MATCHING ANSWERS` : 'COMMON QUESTIONS'}</div>
        {results.length ? results.map(item => <details className="help-widget-item" key={item.id}><summary data-testid={`button-widget-faq-${item.id}`}>{item.question}<Plus size={15} aria-hidden="true"/></summary><p>{item.answer}</p></details>) : <div className="help-widget-empty" role="status">No reviewed answer matches that question. You can report the issue below.</div>}
      </div>
      <div className="help-widget-bottom"><Link href="/help" onClick={() => { setOpen(false); setTimeout(() => document.getElementById('contact-support')?.scrollIntoView({ behavior: 'smooth' }), 80); }} data-testid="link-widget-report-issue">Still need help? Report an issue <ArrowRight size={16}/></Link><Link href="/help" onClick={() => setOpen(false)} data-testid="link-widget-all-faq">Read all reviewed answers <ArrowRight size={16}/></Link></div>
    </section>}
    <button ref={trigger} type="button" className="help-widget-trigger" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="instant-help-panel" data-testid="button-open-help">{open ? <X size={18}/> : <CircleHelp size={19}/>}<span>{open ? 'Close help' : 'Help & answers'}</span></button>
  </aside>;
}