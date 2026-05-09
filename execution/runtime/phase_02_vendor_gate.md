# Phase 02 — Vendor Gate

## Goal

Realize and verify the supply-side trust gate:

- vendor onboarding
- KYC submission
- admin approve/reject
- selling access only after approval

## Prerequisites

- runtime entry gate passed
- phase 01 auth sufficiently verified
- `source/planning/access_matrix.md` available
- `source/planning/state_machines.md` available
- `source/planning/api_contracts.md` available
- `source/planning/schema_drafts.md` available

## `R1` Scope

- vendor owner can create and submit onboarding data
- KYC document metadata flow works
- admin can approve or reject
- approved vendor becomes sell-eligible
- rejected vendor stays outside selling flow
- raw KYC documents remain admin-only

## `R2` Expansion

- reject/resubmit loop
- `REQUEST_MORE_INFO`
- richer audit trail
- blocked/revoked vendor handling

## `R3` Expansion

- compliance automation overlays
- sanctions/risk enrichment
- deeper ops queueing and review tooling

## Verification Shape

- `R1-KYC-*`
- admin vs non-admin access checks
- approval/rejection evidence
- audit evidence for sensitive actions

## Exit Criteria

- approved vendor can move into listing creation
- rejected or unapproved vendor cannot enter selling path
- chosen runtime depth is recorded in implementation tracking
