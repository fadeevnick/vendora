# Vendora — ADR Pack

Этот каталог хранит архитектурные решения, которые слишком дороги, чтобы оставлять их только в разрозненных артефактах.

ADR здесь нужен, когда решение:

- влияет на несколько фаз runtime;
- задаёт storage/API/runtime shape;
- будет дорогим для пересборки после начала кода.

## Current ADRs

- `001_owner_first_vendor_access.md`
- `002_payment_webhook_finalization.md`
- `003_order_funds_and_vendor_balance_ledger.md`

## Rule

Если решение уже влияет на `access_matrix`, `api_contracts`, `schema_drafts` и runtime phases одновременно, его лучше закрепить как ADR, а не оставлять только “распылённым знанием”.
