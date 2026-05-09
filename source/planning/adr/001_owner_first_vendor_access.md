# ADR 001 — Owner-First Vendor Access

## Status

Accepted for launch.

## Context

Vendora хочет сохранить target role model:

- `OWNER`
- `ADMIN`
- `MANAGER`
- `VIEWER`

Но launch-first scope не требует полноценного team-management UX.

При этом:

- access boundaries уже должны быть честными;
- tenant isolation нельзя отложить;
- ранний код не должен открывать слишком широкие mutation rights.

## Decision

Для `R1` Vendora использует owner-first execution model:

- vendor mutations по умолчанию проходят через `OWNER`;
- richer roles сохраняются в модели доступа и схеме данных, но не обязаны быть полноценно productized;
- admin-assisted access для non-owner operators допустим только как controlled manual path;
- расширение mutation rights beyond owner происходит не раньше `R2`.

## Consequences

Плюсы:

- launch scope сильно проще;
- меньше риска случайно открыть опасные vendor mutations;
- future role model сохраняется без data model rewrite.

Минусы:

- ранний runtime не покрывает real team collaboration depth;
- некоторые operational cases могут остаться manual/admin-assisted.

## Impacted Artifacts

- `access_matrix.md`
- `schema_drafts.md`
- `api_contracts.md`
- `cut_register.md`
- runtime phases `02`, `03`, `05`, `06`
