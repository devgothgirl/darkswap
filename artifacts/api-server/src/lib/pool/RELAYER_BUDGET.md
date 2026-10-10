# Testnet free-send budget

`POOL_RELAY_FREE_PER_10_MIN` limits free private sends **per chain across the
service**, not per process. The default is 30 in a rolling ten-minute window.
Zero disables free sends; malformed or unsafe numeric limits return 503.
Charged unshields retain their existing fee checks and do not reserve free slots.

All replicas using the same relayer funds must use the same PostgreSQL database.
The `pool_relay_budget` schema is applied through the normal development
schema / publish flow, not application startup. Missing or unavailable storage
returns a sanitized 503 and prevents free broadcasts; exhaustion returns 429.
There is no local fallback. During a rolling deployment, retire replicas running
the old in-memory limiter before relying on the shared budget.

Each chain has one row containing only reservation timestamps. A row lock
serializes reservation, pruning expired timestamps with the database clock
after acquiring the lock. Reservations commit after successful simulation and
before broadcast on both EVM and Solana. Reservations are not refunded for a
failed or ambiguous broadcast: gas may already have been spent. Thus crashes
can temporarily consume capacity but cannot restore it or multiply the budget.
Lowering the configured limit does not delete existing reservations.

Run `pnpm --filter @workspace/api-server run test:pool-relay-quota` for the
isolated PostgreSQL regressions, including concurrent separate processes and
restart persistence. Tests do not use funded relayer keys or submit chain
transactions.
