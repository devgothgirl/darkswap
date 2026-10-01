type ProviderLane = "houdini-read" | "houdini-write" | "near-read" | "near-write";

const capacity: Record<ProviderLane, number> = {
  "houdini-read": 24,
  "houdini-write": 8,
  "near-read": 20,
  "near-write": 8,
};

const active: Record<ProviderLane, number> = {
  "houdini-read": 0,
  "houdini-write": 0,
  "near-read": 0,
  "near-write": 0,
};

// Do not build an unbounded queue when an upstream slows down. Reserve
// separate lanes for order creation so token searches cannot starve it.
export async function withProviderCapacity<T>(
  lane: ProviderLane,
  overloaded: () => Error,
  operation: () => Promise<T>,
): Promise<T> {
  if (active[lane] >= capacity[lane]) throw overloaded();
  active[lane]++;
  try {
    return await operation();
  } finally {
    active[lane]--;
  }
}