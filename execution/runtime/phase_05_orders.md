# Phase 05 — Orders

## Goal

Realize and verify post-checkout operational order progression for both vendor and buyer.

## Prerequisites

- runtime entry gate passed
- phase 04 checkout sufficiently verified
- at least one paid order exists
- order state machine and order APIs are fixed

## `R1` Scope

- vendor sees only own tenant order queue
- vendor can confirm or cancel from valid launch state
- vendor can mark order as shipped
- buyer can read own order details
- buyer can confirm receipt and move order toward completion

## `R2` Expansion

- shipment metadata
- confirmation timeout logic
- auto-complete behavior
- stronger invalid-transition coverage

## `R3` Expansion

- richer operational timeline
- deeper order history/reporting
- more complete vendor operations tooling

## Verification Shape

- `R1-ORD-*`
- tenant isolation checks
- valid and invalid state transition checks
- refund evidence for vendor cancellation path

## Exit Criteria

- a paid order can move through the launch fulfillment path without violating state rules
- buyer and vendor see only their permitted operational views
- chosen runtime depth is recorded in implementation tracking
