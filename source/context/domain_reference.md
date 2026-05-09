# Domain Reference

## Purpose

This file defines the domain baseline for Vendora before and during artifact completion.

## Product Category

- multi-tenant B2B marketplace platform

## Concrete Product Direction

- a vendor/buyer marketplace with KYC, catalog, checkout, escrow, orders, disputes, payouts and subscriptions

## What Substrate Does Not Cover

- marketplace-specific business flows
- escrow, payout and dispute pressure
- multi-actor access and workflow complexity
- launch-vs-target product shaping

## Key Domain Entities

- Platform
- Platform Admin
- Vendor
- Vendor Member
- Buyer
- Product / Listing
- Order
- Dispute
- Payout / Subscription / KYC application

## Critical Workflows

- vendor onboarding and KYC
- listing creation and publication
- buyer search and checkout
- order processing and completion
- dispute opening and resolution
- payout and subscription lifecycle

## Policy / Compliance / Audit Pressure

- KYC before full vendor operations
- financial and role-sensitive auditability
- multi-tenant isolation
- payment and payout correctness

## Explicit Non-Goals For Early Runtime

- do not treat every target feature as launch-critical
- do not collapse product design truth into code comments or route names
- do not skip artifact completion because some code already exists

## Impact On Vendora

This domain baseline means:

- artifact completion must be deep;
- runtime can later be shallow or deep by chosen profile;
- launch and target need to stay explicit inside project decisions.
