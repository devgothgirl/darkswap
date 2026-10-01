import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, CheckCircle2, ChevronRight, CircleHelp, LifeBuoy, Plus, Search, ShieldAlert, X } from 'lucide-react';
import { Link } from 'wouter';
import { useCreateSupportRequest, type SupportRequestInput, SupportRequestInputIssue, SupportRequestInputRoute } from '@workspace/api-client-react';
import { Form } from '@/components/ui/form';
import { Footer, Header } from '../components/swap-ui';
import { findSupportFaq, supportFaq } from '../components/support-faq';

type ReportFields = {
  email: string;
  issue: SupportRequestInput['issue'];
  route: '' | NonNullable<SupportRequestInput['route']>;
  orderReference: string;
  transactionHash: string;
  message: string;
  website: string;
};

const issueOptions = [
  { value: SupportRequestInputIssue.wrong_deposit, label: 'Wrong deposit details' },
  { value: SupportRequestInputIssue.delayed_swap, label: 'Swap taking too long' },
  { value: SupportRequestInputIssue.refund, label: 'Refund or recovery' },
  { value: SupportRequestInputIssue.order_status, label: 'Finding an order' },
  { value: SupportRequestInputIssue.other, label: 'Something else' }
];

function ContactForm() {
  const form = useForm<ReportFields>({ defaultValues: { email: '', issue: SupportRequestInputIssue.delayed_swap, route: '', orderReference: '', transactionHash: '', message: '', website: '' } });
  const create = useCreateSupportRequest();
  const [sentMessage, setSentMessage] = useState('');
  const [caseToken, setCaseToken] = useState(() => {
    try { return localStorage.getItem('darkswap-support-case-token') || ''; } catch { return ''; }
  });
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [sendError, setSendError] = useState('');
  useEffect(() => {
    if (!caseToken) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/support/requests/status?token=${encodeURIComponent(caseToken)}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Status unavailable');
        const result: { status: string; message: string } = await response.json();
        if (active) { setDeliveryStatus(result.status); setSentMessage(result.message); }
      } catch {
        if (active) {
          setDeliveryStatus(previous => previous || 'unconfirmed');
          setSentMessage(previous => previous || 'Delivery status is unavailable. Keep your report details; do not send another deposit.');
        }
      }
    };
    void check();
    const interval = window.setInterval(() => { void check(); }, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [caseToken]);
  const values = form.watch();
  const fallbackMailto = useMemo(() => {
    const subject = `DarkSwap support: ${issueOptions.find(item => item.value === values.issue)?.label || 'Order issue'}`;
    const body = `Route: ${values.route || 'Not provided'}\nOrder / deposit reference: ${values.orderReference || 'Not provided'}\nSending transaction hash: ${values.transactionHash || 'Not provided'}\n\n${values.message || 'Describe the issue here.'}\n\nNever include a seed phrase or private key.`;
    return `mailto:support@darkswap.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }, [values.issue, values.route, values.orderReference, values.transactionHash, values.message]);
  const submit = form.handleSubmit(async fields => {
    setSendError('');
    try {
      const response = await create.mutateAsync({ data: {
        email: fields.email.trim(),
        issue: fields.issue,
        ...(fields.route ? { route: fields.route } : {}),
        ...(fields.orderReference.trim() ? { orderReference: fields.orderReference.trim() } : {}),
        ...(fields.transactionHash.trim() ? { transactionHash: fields.transactionHash.trim() } : {}),
        message: fields.message.trim(),
        website: fields.website
      } });
      setSentMessage(response.message);
      setDeliveryStatus(response.status);
      setCaseToken(response.token);
      try { localStorage.setItem('darkswap-support-case-token', response.token); } catch { /* status remains available for this session */ }
      form.reset();
    } catch {
      setSendError('We could not confirm delivery of your report. It may have been saved; keep your order details and check the fallback below.');
    }
  });
  return <section className="help-contact" id="contact-support" aria-labelledby="contact-title">
    <div className="help-contact-top"><div><span className="help-kicker">02 / PERSONAL SUPPORT</span><h2 id="contact-title">Still unresolved?<br/>Tell us what happened.</h2></div><p>Send the details to DarkSwap support for review. An order reference and sending transaction hash help us understand a deposit issue; leave them blank if you do not have them.</p></div>
    {sentMessage ? <div className="help-success" role="status" data-testid="status-support-success"><CheckCircle2 size={32}/><h3>{deliveryStatus === 'failed' ? 'Email delivery failed.' : deliveryStatus === 'delivered' ? 'Delivery reported.' : 'Report saved; delivery unconfirmed.'}</h3><p>{sentMessage}</p><p>Keep your order details and transaction hash. Do not send another deposit while investigating. If email delivery failed, the case remains saved for operator recovery; emailing the same inbox is not a verified backup.</p><button type="button" onClick={() => { setSentMessage(''); setSendError(''); setCaseToken(''); setDeliveryStatus(''); try { localStorage.removeItem('darkswap-support-case-token'); } catch { /* storage unavailable */ } }} data-testid="button-new-support-report">Send another report</button></div> :
    <Form {...form}><form className="help-form" onSubmit={submit} noValidate data-testid="form-support-request">
      <div className="help-form-grid">
        <div className="help-field"><label htmlFor="help-email">Reply email <span aria-hidden="true">*</span></label><input id="help-email" type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={!!form.formState.errors.email} aria-describedby={form.formState.errors.email ? 'help-email-error' : undefined} {...form.register('email', { required: 'Enter a reply email.', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address.' }, maxLength: { value: 254, message: 'Email is too long.' } })} data-testid="input-support-email"/>{form.formState.errors.email && <small id="help-email-error" role="alert">{form.formState.errors.email.message}</small>}</div>
        <div className="help-field"><label htmlFor="help-issue">Issue type <span aria-hidden="true">*</span></label><select id="help-issue" {...form.register('issue', { required: true })} data-testid="select-support-issue">{issueOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        <div className="help-field"><label htmlFor="help-route">Route <span>(optional)</span></label><select id="help-route" {...form.register('route')} data-testid="select-support-route"><option value="">Choose if known</option><option value={SupportRequestInputRoute.private_route}>Private route</option><option value={SupportRequestInputRoute.privacy_swap}>Privacy swap</option><option value={SupportRequestInputRoute.unsure}>Not sure</option></select></div>
        <div className="help-field"><label htmlFor="help-reference">Order ID or deposit reference <span>(optional)</span></label><input id="help-reference" placeholder="The ID or deposit address from your order" maxLength={180} {...form.register('orderReference')} data-testid="input-support-reference"/></div>
      </div>
      <div className="help-field"><label htmlFor="help-hash">Sending transaction hash <span>(optional)</span></label><input id="help-hash" placeholder="The transaction you sent, if any" maxLength={180} {...form.register('transactionHash')} data-testid="input-support-hash"/></div>
      <div className="help-field"><label htmlFor="help-message">What happened? <span aria-hidden="true">*</span></label><textarea id="help-message" placeholder="Tell us what you expected, what you sent, and what the order page currently shows." maxLength={2000} aria-invalid={!!form.formState.errors.message} aria-describedby={form.formState.errors.message ? 'help-message-error' : 'help-message-hint'} {...form.register('message', { required: 'Describe what happened.', validate: value => value.trim().length >= 20 || 'Please write at least 20 characters.' })} data-testid="textarea-support-message"/><small id="help-message-hint">At least 20 characters. Do not include sensitive wallet credentials.</small>{form.formState.errors.message && <small id="help-message-error" role="alert">{form.formState.errors.message.message}</small>}</div>
      <div className="help-honeypot" aria-hidden="true"><label htmlFor="help-website">Website</label><input id="help-website" tabIndex={-1} autoComplete="off" {...form.register('website')}/></div>
      <div className="help-form-warning"><strong>Security note:</strong> Never submit a seed phrase or private key. DarkSwap support will not ask for either. Do not send a second deposit to resolve an issue. Your report may be shared with our support team's private Discord channel for review.</div>
      {sendError && <div className="help-form-error" role="alert" data-testid="status-support-error">{sendError}<br/><a href={fallbackMailto} data-testid="link-support-email-fallback">Try emailing support@darkswap.app (delivery is not verified) <ArrowRight size={13} style={{display:'inline',verticalAlign:'middle'}}/></a></div>}
      <div className="help-form-footer"><p>Reports are saved before email and/or private Discord notification is attempted. Email delivery is checked separately; no response time is promised.</p><button className="help-submit" type="submit" disabled={create.isPending} data-testid="button-submit-support">{create.isPending ? 'Saving report…' : 'Send report'} <ArrowRight size={16}/></button></div>
    </form></Form>}
  </section>;
}

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => findSupportFaq(query), [query]);
  useEffect(() => { const previous = document.title; document.title = 'Help & reviewed answers | DarkSwap'; return () => { document.title = previous; }; }, []);
  return <div className="help-shell"><Header/>
    <main className="help-main">
      <div className="help-crumb"><Link href="/" data-testid="link-help-home">DARKSWAP</Link><ChevronRight size={13}/><span>HELP CENTER</span></div>
      <header className="help-intro"><div><span className="help-kicker">ANSWERS BEFORE ACTION</span><h1>Know what to do.<br/><span>And what not to.</span></h1></div><div className="help-intro-aside"><strong>START HERE</strong><p>Clear guidance for deposits, order status, and recovery. Search reviewed answers first; report what’s unresolved.</p></div></header>
      <div className="help-grid">
        <section aria-labelledby="faq-title"><div className="help-section-head"><div><span className="help-overline">01 / INSTANT ANSWERS</span><h2 id="faq-title">Reviewed FAQ</h2></div><span>{supportFaq.length.toString().padStart(2,'0')} TOPICS</span></div>
          <div className="help-search"><Search size={19} aria-hidden="true"/><input type="search" aria-label="Search reviewed answers" placeholder="Search a question, e.g. wrong network or refund" value={query} onChange={event => setQuery(event.target.value)} data-testid="input-help-search"/>{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" data-testid="button-clear-help-search"><X size={18}/></button>}</div>
          {results.length ? <div className="help-faq-list" data-testid="list-help-faq">{results.map((item, index) => <details className="help-faq" key={item.id}><summary data-testid={`button-help-faq-${item.id}`}><span className="help-number">{String(index + 1).padStart(2,'0')}</span><span>{item.question}</span><Plus className="help-plus" size={20} aria-hidden="true"/></summary><div className="help-faq-answer"><p>{item.answer}</p></div></details>)}</div> : <div className="help-no-results" role="status"><CircleHelp size={23}/><h3>No reviewed answer found.</h3><p>Try “deposit”, “refund”, or “status”, or report the issue directly. We won’t invent an answer.</p><a href="#contact-support" className="help-submit" data-testid="link-help-no-results-report">Report an issue <ArrowRight size={16}/></a></div>}
        </section>
        <aside className="help-side"><div className="help-side-card"><LifeBuoy size={27}/><h3>Something went wrong with a deposit?</h3><p>Stop. Do not resend. Save your order reference and the hash of the transaction you sent. Recovery is not guaranteed.</p><a href="#contact-support" data-testid="link-help-report-issue">Report an issue <ArrowRight size={16}/></a></div><div className="help-side-note"><ShieldAlert size={17} style={{display:'block',marginBottom:10,color:'#d5baf4'}}/>Only send the exact specified asset on Solana before the deadline, including a memo if required. The active order page is the source of truth.</div></aside>
      </div>
      <ContactForm/>
    </main><Footer/></div>;
}