import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import Home from './pages/home';
import Launch from './pages/launch';
import OrderPage from './pages/order';
import NearSwap from './pages/near-swap';
import NearTrends from './pages/near-trends';
import NearDiscovery from './pages/near-discovery';
import NearOrder from './pages/near-order';
import ClosedBetaPage from './pages/closed-beta';
import ScreenerBeta from './pages/screener-beta';
import Previews from './pages/previews';
import SplitMixerPreview from './pages/splitwise-preview';
import PrivacyBundlePreview from './pages/privacy-bundle-preview';
import Docs from './pages/docs';
import RewardsPage from './pages/rewards';
import { RewardsProvider } from './hooks/use-rewards';
import HelpPage from './pages/help';
import { HelpWidget } from './components/help-widget';
import { TokenLaunchPopup } from './components/token-launch-popup';
import './pages/help.css';
import { Footer, Header } from './components/swap-ui';
import { Link } from 'wouter';
import { applyPageMetadata } from '../seo-html.mjs';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import TerminalPreview from './pages/terminal-preview';
import Tokenomics, { TokenomicsLeaderboard } from './pages/tokenomics';

const queryClient = new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:true}}});

function NotFound() {
  return <div className="app-shell"><Header/><main className="order-layout page-enter"><span className="eyebrow">DARKSWAP / ROUTE NOT FOUND / 404</span><h1 className="order-heading">Nothing at<br/><span style={{color:'#c7a7ff'}}>this address.</span></h1><p className="hero-copy">This page does not exist. Return to the exchange or track an order using its ID.</p><Link href="/" className="secondary-button" style={{textDecoration:'none',marginTop:20}} data-testid="link-return-home">Back to exchange</Link></main><Footer/></div>;
}

function AliasRedirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, [navigate, to]);
  return null;
}

function Router() {
  const [location] = useLocation();
  useEffect(() => {
    const frame = requestAnimationFrame(() => applyPageMetadata(location));
    return () => cancelAnimationFrame(frame);
  }, [location]);
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Launch} />
        <Route path="/swap" component={Home} />
        <Route path="/near-swap" component={NearSwap} />
        <Route path="/near-trends" component={NearTrends} />
        <Route path="/near-discovery" component={NearDiscovery} />
        <Route path="/near-order" component={NearOrder} />
        <Route path="/docs" component={Docs} />
        <Route path="/tokenomics" component={Tokenomics} />
        <Route path="/tokenomics/leaderboard" component={TokenomicsLeaderboard} />
        <Route path="/rewards" component={RewardsPage} />
        <Route path="/help" component={HelpPage} />
        <Route path="/founder" component={Previews} />
        <Route path="/previews" component={Previews} />
        <Route path="/terminal-preview" component={TerminalPreview} />
        <Route path="/split-mixer-preview" component={SplitMixerPreview} />
        <Route path="/splitwise-preview"><AliasRedirect to="/split-mixer-preview" /></Route>
        <Route path="/privacy-bundle-preview" component={PrivacyBundlePreview} />
        <Route path="/explore"><ClosedBetaPage areaName="Token research" /></Route>
        <Route path="/screener-beta" component={ScreenerBeta} />
        <Route path="/screener-preview"><AliasRedirect to="/screener-beta" /></Route>
        <Route path="/privacy-terminal"><ClosedBetaPage areaName="Privacy Trading Terminal" /></Route>
        <Route path="/public-swap"><ClosedBetaPage areaName="Privacy Trading Terminal" /></Route>
        <Route path="/order/:id" component={OrderPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <RewardsProvider>
          <Router />
          <HelpWidget />
          <TokenLaunchPopup />
        </RewardsProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
