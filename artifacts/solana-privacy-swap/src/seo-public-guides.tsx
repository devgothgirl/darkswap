import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import Docs from './pages/docs';
import ConfidentialRoutingDocs from './pages/docs-confidential-routing';
import Whitepaper from './pages/whitepaper';
import DarkPoolDocs from './pages/docs-dark-pool';
import { PoolPublicGuide } from './pool/public-guide';
import poolPaths from './pool/routes.json';
import { supportFaq } from './components/support-faq';
import { HelpRecoveryGuidance } from './pages/help-recovery-guidance';

// Render only public reference material. Never mount HelpPage's contact form,
// account providers, order trackers, or components that fetch personal data.
export function renderPublicGuides(): Record<string, string> {
  return {
    '/docs/whitepaper': renderToStaticMarkup(<Router ssrPath="/docs/whitepaper"><Whitepaper /></Router>),
    '/docs/dark-pool': renderToStaticMarkup(<Router ssrPath="/docs/dark-pool"><DarkPoolDocs /></Router>),
    ...Object.fromEntries(poolPaths.map(path => [path, renderToStaticMarkup(
      <Router ssrPath={path}><PoolPublicGuide explanation={path === '/pool/what-stays-public'} /></Router>
    )])),
    '/docs': renderToStaticMarkup(<Router ssrPath="/docs"><Docs /></Router>),
    '/docs/confidential-routing': renderToStaticMarkup(<Router ssrPath="/docs/confidential-routing"><ConfidentialRoutingDocs /></Router>),
    '/help': renderToStaticMarkup(<Router ssrPath="/help">
      <main>
        <h1>Know what to do. And what not to.</h1>
        <p>Clear guidance for deposits, order status, and recovery. Search reviewed answers first; report what’s unresolved.</p>
        <section aria-labelledby="faq-title">
          <h2 id="faq-title">Reviewed FAQ</h2>
          {supportFaq.map(item => <section key={item.id} id={item.id}>
            <h3>{item.question}</h3><p>{item.answer}</p>
          </section>)}
        </section>
        <HelpRecoveryGuidance />
        <section id="contact-support">
          <h2>Contact support</h2>
          <p>Enable JavaScript to submit a private support report, or email support@darkswap.app. Never share a seed phrase or private key. Recovery and response times are not guaranteed.</p>
        </section>
        <p><a href="/docs">Read the route guide</a></p>
      </main>
    </Router>),
  };
}