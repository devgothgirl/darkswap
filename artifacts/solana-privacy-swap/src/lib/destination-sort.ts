export function destinationOrder(chain: string): number {
  const name = chain.toLowerCase();
  if (name === 'near' || name === 'near protocol' || name === 'near mainnet') return 0;
  if (name === 'sol' || name === 'solana' || name === 'solana mainnet') return 1;
  return 2;
}

export function compareDestinations(a: { id: string; name: string }, b: { id: string; name: string }): number {
  return destinationOrder(a.id) - destinationOrder(b.id) || a.name.localeCompare(b.name);
}