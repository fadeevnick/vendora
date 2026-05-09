# Runtime Entry Gate

Vendora can move from `Artifact Completion` to `Runtime Realization` only when the following are true.

## Required Before Runtime

- concrete product wedge is fixed
- business requirements are deeply written
- user journeys are deeply written, including more than happy path
- functional requirements are deeply written
- architecture is written strongly enough to drive implementation
- tech stack is selected from architecture, not before it
- launch roadmap exists
- implementation guide exists
- implementation-near planning pack exists at least for launch:
  - access matrix
  - state machines
  - API contracts
  - schema drafts
  - runtime checklists
  - cut register
  - test matrix
  - ADR pack for the highest-cost launch decisions
- launch runtime phase docs exist for the core loop
- design status reflects completion of the design/planning layer
- there is one exact next runtime phase

## Required Interpretation

- existing code does not cancel artifact work
- existing code does not redefine product truth
- runtime depth cannot be chosen before this gate is passed

## Allowed Outcome After Gate

Once this gate is passed, the project may enter:

- `R1` launch runtime
- `R2` strong runtime
- `R3` full runtime

The chosen depth must then be reflected in runtime docs and implementation tracking.
