/**
 * Component tests for this package.
 *
 * Scope is deliberately narrow: behavioural contracts that a screenshot cannot
 * prove, such as a disabled option staying inert under keyboard activation.
 * Visual correctness is reviewed in the style guide, not asserted here.
 */
export default {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
  moduleFileExtensions: ["tsx", "ts", "jsx", "js", "json"],
};
