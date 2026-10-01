import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PrivyProvider, useLoginWithEmail, usePrivy } from '@privy-io/react-auth';
import { enrollRewards, getRewardsConfig, getRewardsMe, type RewardsMe } from '@workspace/api-client-react';

type RewardContext = {
  available: boolean;
  authenticated: boolean;
  ready: boolean;
  enrolled: boolean;
  account?: RewardsMe;
  accountLoading: boolean;
  accountError: unknown;
  refresh: () => Promise<void>;
  getEnrolledToken: () => Promise<string>;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (code: string) => Promise<void>;
  enroll: () => Promise<void>;
  logout: () => Promise<void>;
};
const unavailable: RewardContext = {
  available: false, authenticated: false, ready: true, enrolled: false, accountLoading: false, accountError: null,
  refresh: async () => {}, getEnrolledToken: async () => { throw new Error('Rewards are unavailable.'); },
  sendCode: async () => { throw new Error('Rewards are unavailable.'); },
  loginWithCode: async () => { throw new Error('Rewards are unavailable.'); },
  enroll: async () => { throw new Error('Rewards are unavailable.'); }, logout: async () => {},
};
const RewardsContext = createContext<RewardContext>(unavailable);
export const useRewards = () => useContext(RewardsContext);

function ActiveRewards({ children }: { children: ReactNode }) {
  const { ready, authenticated, getAccessToken, logout: privyLogout } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const client = useQueryClient();
  const [generation, setGeneration] = useState(0);
  const [providerTimedOut, setProviderTimedOut] = useState(false);
  useEffect(() => {
    if (ready) {
      setProviderTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setProviderTimedOut(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  const account = useQuery({
    queryKey: ['rewards-account', authenticated, generation],
    enabled: ready && authenticated,
    retry: false,
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) throw new Error('Your email session expired. Sign in again to see rewards.');
      return getRewardsMe({ limit: 12 }, { headers: { Authorization: `Bearer ${token}` } });
    },
  });
  const refresh = async () => {
    setGeneration(value => value + 1);
    await client.invalidateQueries({ queryKey: ['rewards-history'] });
  };
  const getEnrolledToken = async () => {
    if (!ready || !authenticated || account.data?.enrolled !== true) throw new Error('Enroll in rewards before associating an order.');
    const token = await getAccessToken();
    if (!token) throw new Error('Your email session expired. You can still create a guest order.');
    return token;
  };
  const enroll = async () => {
    if (!ready || !authenticated) throw new Error('Verify your email before enrolling.');
    const token = await getAccessToken();
    if (!token) throw new Error('Your email session expired. Please sign in again.');
    const result = await enrollRewards({ consent: true }, { headers: { Authorization: `Bearer ${token}` } });
    if (!result.enrolled) throw new Error('Enrollment could not be confirmed. No orders will be linked.');
    await client.invalidateQueries({ queryKey: ['rewards-account'] });
    setGeneration(value => value + 1);
  };
  const logout = async () => {
    await privyLogout();
    client.removeQueries({ queryKey: ['rewards-account'] });
    client.removeQueries({ queryKey: ['rewards-history'] });
    setGeneration(value => value + 1);
  };
  return <RewardsContext.Provider value={{
    available: !providerTimedOut, ready, authenticated, enrolled: account.data?.enrolled === true,
    account: account.data, accountLoading: account.isLoading || account.isFetching, accountError: account.error,
    refresh, getEnrolledToken, sendCode: async (email) => { await sendCode({ email }); },
    loginWithCode: async (code) => { await loginWithCode({ code }); },
    enroll, logout,
  }}>{children}</RewardsContext.Provider>;
}

export function RewardsProvider({ children }: { children: ReactNode }) {
  const config = useQuery({ queryKey: ['rewards-config'], queryFn: () => getRewardsConfig(), staleTime: 60_000, retry: 1 });
  if (!config.data?.enabled || !config.data.appId) return <RewardsContext.Provider value={unavailable}>{children}</RewardsContext.Provider>;
  return <PrivyProvider appId={config.data.appId} config={{
    loginMethods: ['email'],
    embeddedWallets: { ethereum: { createOnLogin: 'off' }, solana: { createOnLogin: 'off' } },
  }}><ActiveRewards>{children}</ActiveRewards></PrivyProvider>;
}