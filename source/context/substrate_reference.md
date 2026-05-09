# Substrate Reference

## Purpose

This file defines the current engineering baseline for Vendora before deeper runtime work.

## Current Baseline

- Existing execution asset: `../../vendora_codebase/`
- Current local runtime assumptions: Docker Compose, PostgreSQL, Redis, Meilisearch
- Current project style: standalone product project with project-local source of truth inside `vendora/`
- Runtime verification is expected locally first, phase by phase

## Execution Shape Assumption

- buyer/vendor product surface plus API backend
- modular product logic, not generic “demo app” work
- infra/runtime concerns are verified through phased runtime docs, not only through code completion

## Persistence And State Assumptions

- PostgreSQL is the main system of record
- Redis is treated as operational state/cache/queue substrate
- Meilisearch is a secondary search subsystem, not the source of truth

## Health And Verification Assumptions

- each implementation phase must have runtime verification
- implementation is not considered done without an explicit run outcome
- implementation tracking must reflect verified fact, not intention

## Bootstrap Non-Goals

- do not let the existing codebase define product truth
- do not use runtime depth before artifact completion is finished
- do not force a filesystem migration of `vendora_codebase/` yet

## Impact On Vendora

This baseline means:

- artifacts remain the primary source of truth;
- the codebase is an imported execution asset;
- runtime work should be organized by phases and depths.
