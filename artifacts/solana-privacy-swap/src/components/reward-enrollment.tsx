import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useRewards } from '../hooks/use-rewards';
import { errorText } from './swap-ui';
import { trackEvent } from '../lib/analytics';

export function RewardEnrollment({ compact = false }: { compact?: boolean }) {
  const rewards = useRewards();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (!rewards.available) return <div className="rewards-panel"><h3>Email rewards are not available</h3><p>Swap as a guest. No email account is needed to create an order.</p></div>;
  // Only the step name and whether it succeeded; never the email or the one-time code.
  const run = async (action: () => Promise<void>, success: string, step?: string) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      setMessage(success);
      if (step) trackEvent('rewards_enrollment_step', { step, outcome: 'completed' });
    } catch (cause) {
      setError(errorText(cause));
      if (step) trackEvent('rewards_enrollment_step', { step, outcome: 'failed' });
    } finally { setBusy(false); }
  };
  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => { await rewards.sendCode(email.trim()); setSent(true); }, 'Check your inbox for the one-time code.', 'code_requested');
  };
  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => { await rewards.loginWithCode(code.trim()); }, 'Email verified. Enrollment is a separate choice below.', 'email_verified');
  };
  return <div className="rewards-panel">
    <div className="rewards-overline">OPTIONAL / EMAIL REWARDS</div>
    <h3 style={{ marginTop: 12 }}>{rewards.enrolled ? 'Your email is enrolled.' : rewards.authenticated ? 'Choose whether to enroll.' : 'An account, only if you want one.'}</h3>
    {!compact && <p>Keep your swap separate from an email account unless you explicitly choose to associate a new order. Signing in alone never links an order.</p>}
    {!rewards.ready ? <div className="rewards-loading" aria-label="Loading email sign in"/> : !rewards.authenticated ? <>
      <form onSubmit={submitEmail}>
        <label htmlFor="rewards-email">Email address</label>
        <input id="rewards-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/>
        <button className="rewards-action" type="submit" disabled={busy || !email.trim()}>Send one-time code <ArrowRight size={15}/></button>
      </form>
      {sent && <form onSubmit={submitCode}>
        <label htmlFor="rewards-code">One-time code</label>
        <input id="rewards-code" type="text" inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} placeholder="Enter the code from your email"/>
        <button className="rewards-action secondary" type="submit" disabled={busy || !code.trim()}>Verify email</button>
      </form>}
    </> : rewards.accountLoading ? <><div className="rewards-loading"/><div className="rewards-loading" style={{ width: '48%' }}/></> : rewards.enrolled ? <>
      <p className="rewards-ok">Enrollment confirmed. You still choose separately whether each new order is associated with your email account.</p>
      <button type="button" className="rewards-action secondary" onClick={() => void run(rewards.logout, 'Signed out. Future orders are guest orders unless you sign in and opt in again.')} disabled={busy}>Sign out</button>
    </> : <>
      {rewards.accountError && <p className="rewards-error" role="alert">{errorText(rewards.accountError)} <button type="button" className="rewards-action secondary" onClick={() => void rewards.refresh()}>Retry</button></p>}
      <p>Enrollment stores your verified email for your rewards account. If you opt in on a future order, that order is permanently associated with this account at creation. Guest and past orders cannot be credited later. This does not make on-chain deposits private.</p>
      <label className="rewards-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I understand the account and order-linking privacy trade-off and explicitly agree to enroll in email rewards. This is not consent to marketing email.</span></label>
      <button type="button" className="rewards-action" disabled={!consent || busy || !!rewards.accountError} onClick={() => void run(rewards.enroll, 'Enrollment confirmed. You can now choose rewards per new order.', 'enrolled')}>Enroll in rewards <ArrowRight size={15}/></button>
    </>}
    {error && <p className="rewards-error" role="alert">{error}</p>}
    {message && <p className="rewards-ok" role="status">{message}</p>}
    <p className="rewards-note"><LockKeyhole size={13} style={{ display: 'inline', verticalAlign: 'middle' }}/> Points are not cash, tokens, or a claim on swap proceeds; they have no cash value, are not transferable or redeemable, and do not guarantee a discount. <Link href="/docs#fees-rewards">Read the terms</Link>.</p>
  </div>;
}

export function RewardOrderChoice({ opted, onChange, disabled = false }: { opted: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  const rewards = useRewards();
  const [open, setOpen] = useState(false);
  if (!rewards.available) return <p className="rewards-note">This order will be created as a guest. Email rewards are unavailable; no account is linked.</p>;
  return <div className="rewards-optin">
    <div className="rewards-overline">ORDER PRIVACY / YOUR CHOICE</div>
    {rewards.enrolled ? <>
      <label className="rewards-check"><input type="checkbox" checked={opted} disabled={disabled} onChange={e => onChange(e.target.checked)}/><span>Associate this new order with my enrolled email rewards account.</span></label>
      <p>{opted ? 'This order will be linked to your account at creation. The link cannot be undone.' : 'Off by default. This order will be a guest order with no rewards account link.'}</p>
    </> : <>
      <p>Continue as a guest with no email link, or verify an email and explicitly enroll first. Past and guest orders cannot be added later.</p>
      <button type="button" className="rewards-action secondary" disabled={disabled} onClick={() => setOpen(value => !value)}>{open ? 'Hide email options' : 'Set up optional email rewards'}</button>
      {open && <div style={{ marginTop: 15 }}><RewardEnrollment compact/></div>}
    </>}
  </div>;
}