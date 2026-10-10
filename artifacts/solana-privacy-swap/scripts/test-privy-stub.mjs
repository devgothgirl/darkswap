// Stand-in for the Privy SDK in UI tests; components see the signed-out rewards context.
export const PrivyProvider = ({ children }) => children;
export const usePrivy = () => ({ ready: false, authenticated: false, getAccessToken: async () => null, logout: async () => {} });
export const useLoginWithEmail = () => ({ sendCode: async () => {}, loginWithCode: async () => {} });
