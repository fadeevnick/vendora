# Phase 04 — Checkout

## Goal

Turn buyer intent into paid vendor-specific orders without money or atomicity errors.

## Prerequisites

- runtime entry gate passed
- phase 03 catalog sufficiently verified
- buyer test actor exists
- payment provider integration path is locally runnable or equivalent sandboxed
- checkout contracts and order-fund schema are fixed

## `R1` Scope

- buyer adds published item to cart
- checkout session validates stock and price
- successful payment finalization creates vendor-specific orders atomically
- funds enter hold state
- replay or duplicate submit does not duplicate orders

## `R2` Expansion

- stock/price race conditions
- guest or cart-merge expansion if enabled
- interrupted checkout recovery
- stronger provider failure handling

## `R3` Expansion

- richer payment method surface
- advanced resilience under retries and partial failures
- deeper checkout recovery tooling

## Verification Shape

- `R1-CHK-*`
- provider webhook replay checks
- DB/ledger evidence for atomic order creation
- notification evidence for successful checkout

## Exit Criteria

- buyer can complete a launch-valid checkout
- created orders and hold state are consistent and non-duplicated
- chosen runtime depth is recorded in implementation tracking
