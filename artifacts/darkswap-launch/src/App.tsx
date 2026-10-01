import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Shell } from '@/components/layout';
import { WalletProvider } from '@/lib/wallet';
import { BASE_PATH } from '@/lib/api';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Explore from '@/pages/explore';
import TokenPage from '@/pages/token';
import Create from '@/pages/create';
import Creator from '@/pages/creator';
import Admin from '@/pages/admin';
import { Docs, Terms, Privacy, Risk } from '@/pages/legal';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

function ScrollTop() {
  const [loc] = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc]);
  return null;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/explore" component={Explore} />
        <Route path="/token/:mint" component={TokenPage} />
        <Route path="/create" component={Create} />
        <Route path="/creator" component={Creator} />
        <Route path="/admin" component={Admin} />
        <Route path="/docs" component={Docs} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/risk" component={Risk} />
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
      <TooltipProvider>
        <WouterRouter base={BASE_PATH}>
          <WalletProvider>
            <ScrollTop />
            <Shell>
              <Router />
            </Shell>
          </WalletProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
