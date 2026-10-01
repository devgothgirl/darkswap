export const MINIMUM_SWAP_USD = 3;

export function inputValueUsd(amount: string | number, price: unknown): number | null {
  const quantity = Number(amount);
  if (
    !Number.isFinite(quantity) || quantity <= 0 ||
    typeof price !== "number" || !Number.isFinite(price) || price <= 0
  ) return null;
  const value = quantity * price;
  return Number.isFinite(value) ? value : null;
}