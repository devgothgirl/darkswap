#!/bin/bash
set -e

active_pid=
cancel_signal=
cancel_code=
record_cancel() {
  # Keep the first interruption and never extend its cleanup grace period.
  if [[ -z "$cancel_signal" ]]; then
    cancel_signal=$1
    cancel_code=$2
  fi
}
trap 'record_cancel SIGTERM 143' TERM
trap 'record_cancel SIGINT 130' INT

finish_cancel() {
  [[ -n "$cancel_signal" ]] || return 0
  trap '' TERM INT
  echo "Setup shell received $cancel_signal; stopping active work and skipping later phases." >&2
  if [[ -n "$active_pid" ]]; then
    # Phase runners handle detached pnpm groups themselves. The phase group
    # also covers synchronous compatibility consumers that cannot handle a
    # signal while Node is blocked. Allow the runners' one-second escalation
    # to finish before imposing a shell-level two-second bound.
    kill -s "$cancel_signal" -- "-$active_pid" 2>/dev/null || true
    sleep 2
    kill -KILL -- "-$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
  fi
  exit "$cancel_code"
}

run_phase() {
  finish_cancel
  # Job control gives this phase its own group and avoids inheriting ignored
  # SIGINT, as ordinary non-interactive background commands otherwise do.
  set -m
  "$@" &
  active_pid=$!
  set +m
  # A trap can run between launching the child and recording its PID.
  finish_cancel
  local status=0
  wait "$active_pid" || status=$?
  finish_cancel
  active_pid=
  return "$status"
}

run_phase node scripts/check-post-merge-budget.mjs
run_phase node scripts/run-dependency-install.mjs
# Verify installed consumers before migrations and workflow reconciliation.
# Do not hide a broken patch with an automatic forced reinstall.
run_phase node scripts/run-dependency-check.mjs wallet
run_phase node scripts/run-dependency-check.mjs pool
run_phase node scripts/run-database-migration.mjs
