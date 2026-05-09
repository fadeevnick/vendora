# Vendora

Vendora is the active product project inside `/home/nickf/Documents/product_development`.

This project uses a staged workflow:

1. `Artifact Completion`
2. `Runtime Realization`

## Current Structure

```text
vendora/
├── README.md
├── CURRENT.md
├── source/
│   ├── context/
│   ├── design/
│   └── planning/
├── execution/
│   ├── README.md
│   └── runtime/
├── tracking/
├── prototypes/
└── vendora_codebase/
```

The existing codebase:

- `vendora_codebase/`

is treated as an imported execution asset, not as the source of truth for product decisions.

Canonical project artifacts now live here:

- `source/design/business_requirements.md`
- `source/design/user_journeys.md`
- `source/design/functional_requirements.md`
- `source/design/architecture.md`
- `source/design/tech_stack.md`
- `source/planning/launch_roadmap.md`
- `source/planning/implementation_guide.md`
- `tracking/design_status.md`
- `tracking/implementation_status.md`

## Workflow

### Stage 1. Artifact Completion

In this stage we work on:

- `source/context/`
- `source/design/`
- `source/planning/`

Rules:

- artifacts are completed deeply before runtime starts;
- no runtime claims are written to implementation tracking unless they were actually verified;
- codebase structure does not define product truth.

### Stage 2. Runtime Realization

After artifact completion, runtime work begins.

Runtime depth can be:

- `R1` — launch runtime
- `R2` — strong runtime
- `R3` — full runtime

Runtime specs live in:

- `execution/runtime/`
