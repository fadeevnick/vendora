# Phase 03 — Catalog

## Goal

Realize and verify that an approved vendor can create sellable supply and expose it correctly to buyers.

## Prerequisites

- runtime entry gate passed
- phase 02 vendor gate sufficiently verified
- approved vendor test actor exists
- listing and public catalog contracts are fixed

## `R1` Scope

- approved vendor creates draft listing
- approved vendor publishes listing
- public catalog/search exposes only eligible listings
- blocked vendor listings disappear from public side
- stock visibility is truthful enough for launch

## `R2` Expansion

- richer media validation
- stronger plan-limit checks
- better search filters and indexing confidence

## `R3` Expansion

- variants
- bulk import
- moderation lifecycle
- advanced discovery depth

## Verification Shape

- `R1-CAT-*`
- publish/unpublish visibility checks
- approved vs non-approved vendor behavior
- public search/catalog evidence

## Exit Criteria

- a real approved vendor can publish a listing
- a buyer can discover that listing through launch search/catalog paths
- chosen runtime depth is recorded in implementation tracking
