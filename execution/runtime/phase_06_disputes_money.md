# Phase 06 — Disputes And Money

## Goal

Realize and verify the trust-recovery path:

- dispute creation
- fund freeze
- admin resolution
- correct refund or release outcome

## Prerequisites

- runtime entry gate passed
- phase 05 orders sufficiently verified
- at least one delivered or dispute-eligible order exists
- dispute, fund-state and balance artifacts are fixed

## `R1` Scope

- buyer opens dispute from allowed state
- disputed amount freezes immediately
- vendor can respond only within own tenant context
- admin resolves in buyer-favor or vendor-favor path
- balance and audit evidence reflect the result

## `R2` Expansion

- partial refunds
- vendor-response SLA escalation
- payout initiation/recovery integration
- stronger reconciliation evidence

## `R3` Expansion

- deeper compliance/audit workflows
- richer dispute tooling and reporting
- broader money-operations maturity

## Verification Shape

- `R1-DISP-*`
- `R1-MONEY-*`
- `R1-AUDIT-*`
- provider/manual ops evidence where payout or refund path is hosted/admin-assisted

## Exit Criteria

- dispute path can be executed without losing money-state integrity
- admin-only resolution boundary is verified
- chosen runtime depth is recorded in implementation tracking
