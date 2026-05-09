# Vendora — Access Matrix

Этот артефакт фиксирует actor/resource/action boundaries до формального старта runtime.

Его задача:

- убрать двусмысленность в правах доступа;
- связать journeys, FR и launch/runtime expectations;
- задать основу для RBAC, tenant isolation и admin-only flows.

---

## 1. Access Principles

1. Backend is authoritative. UI visibility never replaces backend authorization.
2. Любой vendor-scoped доступ должен идти через current vendor context.
3. Platform Admin имеет global access only for operational workflows and every sensitive action must be auditable.
4. Launch может стартовать с owner-heavy vendor model, но target roles должны быть заранее определены.
5. Raw KYC documents are never public and never vendor-readable after upload.
6. Money-sensitive mutations требуют самой жёсткой проверки роли и состояния.

---

## 2. Actor Model

| Actor | Meaning | Launch Baseline |
|---|---|---|
| `Guest Buyer` | неавторизованный buyer-side visitor | optional, only where guest path is explicitly allowed |
| `Buyer` | авторизованный покупатель | required |
| `Vendor Owner` | главный владелец vendor workspace | required |
| `Vendor Admin` | target role with broad tenant management rights | optional at launch |
| `Vendor Manager` | target role for catalog/order operations | optional at launch |
| `Vendor Viewer` | target read-only tenant role | optional at launch |
| `Platform Admin` | оператор платформы для KYC/disputes/manual ops | required |
| `System Job` | background worker or scheduled process | required, but non-human and scope-limited |

Launch reminder:

- `R1` обязан работать хотя бы с `Buyer`, `Vendor Owner`, `Platform Admin`.
- `Vendor Admin / Manager / Viewer` могут сначала существовать как future role model или admin-assisted expansion.

---

## 3. Permission Legend

| Value | Meaning |
|---|---|
| `public` | доступ без аутентификации |
| `self` | только собственные данные/сессия |
| `owner` | только `Vendor Owner` текущего vendor |
| `tenant` | read/write внутри текущего vendor |
| `tenant-read` | read-only внутри текущего vendor |
| `admin` | global admin access, audit required |
| `manual` | доступ только через manual/admin-assisted launch path |
| `no` | доступ запрещён |

---

## 4. Human Access Matrix

| Resource | Action | Guest Buyer | Buyer | Vendor Owner | Vendor Admin | Vendor Manager | Vendor Viewer | Platform Admin | Scope | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Identity | register / login / logout | `public` | `self` | `self` | `self` | `self` | `self` | `self` | Launch | privileged admin path remains separate |
| Identity | view/update own profile and credentials | `no` | `self` | `self` | `self` | `self` | `self` | `self` | Launch | actor can only manage own user identity |
| Vendor application | create/update own onboarding draft | `no` | `no` | `owner` | `no` | `no` | `no` | `admin` | Launch | owner starts vendor-side entry |
| Vendor application | submit for review | `no` | `no` | `owner` | `no` | `no` | `no` | `admin` | Launch | submit moves application into review gate |
| KYC documents | upload/replace own vendor docs | `no` | `no` | `owner` | `no` | `no` | `no` | `admin` | Launch | vendor uploads, admin reviews |
| KYC documents | view raw stored documents | `no` | `no` | `no` | `no` | `no` | `no` | `admin` | Launch | raw document access is admin-only |
| KYC review queue | approve / reject / request more info | `no` | `no` | `no` | `no` | `no` | `no` | `admin` | Launch/Target | launch must support approve/reject; richer review later |
| Vendor workspace | view own vendor profile/settings | `no` | `no` | `tenant` | `tenant-read` | `tenant-read` | `tenant-read` | `admin` | Launch | launch may effectively map this to owner-only |
| Vendor workspace | mutate vendor profile/settings | `no` | `no` | `owner` | `tenant` | `no` | `no` | `admin` | Launch/Target | `Vendor Admin` is target expansion |
| Vendor listings | read private tenant catalog state | `no` | `no` | `tenant` | `tenant-read` | `tenant-read` | `tenant-read` | `admin` | Launch | viewer is read-only target role |
| Vendor listings | create/edit draft listing | `no` | `no` | `tenant` | `tenant` | `tenant` | `no` | `admin` | Launch/Target | launch can restrict to owner |
| Vendor listings | publish/unpublish listing | `no` | `no` | `owner` | `tenant` | `tenant` | `no` | `admin` | Launch/Target | publish is supply-side critical action |
| Public catalog | view public products and vendor pages | `public` | `public` | `public` | `public` | `public` | `public` | `public` | Launch | only public/eligible listings visible |
| Cart | read/update cart | `self` | `self` | `no` | `no` | `no` | `no` | `no` | Launch | guest cart exists only if guest path enabled |
| Checkout | place order from own cart | `self` | `self` | `no` | `no` | `no` | `no` | `no` | Launch | guest checkout is optional expansion inside launch scope |
| Buyer orders | view own orders | `no` | `self` | `no` | `no` | `no` | `no` | `admin` | Launch | buyer never sees another buyer order |
| Buyer orders | confirm receipt / open dispute | `no` | `self` | `no` | `no` | `no` | `no` | `admin` | Launch | money-sensitive post-order actions |
| Vendor orders | view vendor order queue | `no` | `no` | `tenant-read` | `tenant-read` | `tenant-read` | `tenant-read` | `admin` | Launch | launch may still run owner-only |
| Vendor orders | confirm / ship / cancel vendor order | `no` | `no` | `tenant` | `tenant` | `tenant` | `no` | `admin` | Launch/Target | viewer cannot mutate order state |
| Dispute thread | buyer create/respond with evidence | `no` | `self` | `no` | `no` | `no` | `no` | `admin` | Launch | buyer only for own order dispute |
| Dispute thread | vendor respond to dispute | `no` | `no` | `tenant` | `tenant` | `tenant` | `no` | `admin` | Launch/Target | viewer may read later but not respond |
| Dispute queue | review and resolve dispute | `no` | `no` | `no` | `no` | `no` | `no` | `admin` | Launch | admin-only, audit-sensitive |
| Vendor balance | view balance / payout status | `no` | `no` | `tenant-read` | `tenant-read` | `tenant-read` | `no` | `admin` | Launch/Target | launch may expose this via support/admin channel |
| Payout setup | change payout details | `no` | `no` | `owner` | `no` | `no` | `no` | `admin` | Launch | changing details is KYC-sensitive |
| Payout execution | initiate payout | `no` | `no` | `manual` | `manual` | `no` | `no` | `admin` | Launch | launch path may be hosted/admin-assisted |
| Subscription / plan | view plan, limits, entitlements | `no` | `no` | `tenant-read` | `tenant-read` | `tenant-read` | `tenant-read` | `admin` | Launch/Target | visibility can exist before self-serve billing |
| Subscription / plan | change plan | `no` | `no` | `owner` | `no` | `no` | `no` | `manual` | Launch | hosted/manual acceptable at launch |
| Team members | list current vendor members | `no` | `no` | `tenant-read` | `tenant-read` | `no` | `no` | `admin` | Target | launch may not expose team UI |
| Team members | invite / change role / revoke | `no` | `no` | `owner` | `no` | `no` | `no` | `manual` | Target | before self-serve team flow, admin-assisted only |
| Reviews | create review for completed order | `no` | `self` | `no` | `no` | `no` | `no` | `admin` | Target | one buyer, one completed order |
| Reviews | vendor public response | `no` | `no` | `tenant` | `tenant` | `no` | `no` | `admin` | Target | not required in launch |
| API keys / webhooks | manage vendor API surface | `no` | `no` | `tenant` | `tenant` | `no` | `no` | `admin` | Target | target-only domain |
| Audit-sensitive records | read audit/KYC/dispute operations data | `no` | `no` | `no` | `no` | `no` | `no` | `admin` | Launch | strict admin-only visibility |
| Notification preferences | manage own notification settings | `no` | `self` | `self` | `self` | `self` | `self` | `self` | Target | transactional notifications can remain non-optional |

---

## 5. Launch Role Baseline

For `R1`, the matrix should be interpreted with these simplifications:

- vendor-side mutations can be safely owner-only;
- `Vendor Admin`, `Vendor Manager`, `Vendor Viewer` may remain non-productized;
- payout initiation and subscription changes may remain `manual` or `hosted`;
- team management may remain absent as dedicated UI;
- buyer guest path is optional and must be explicitly chosen, not assumed.

---

## 6. Permission Helpers To Implement

Минимальный backend helper set:

- `requireAuth()`
- `requireBuyerSelf()`
- `requireVendorContext()`
- `requireVendorOwner()`
- `requireVendorRole(['OWNER', 'ADMIN', 'MANAGER'])`
- `requireVendorReadRole(['OWNER', 'ADMIN', 'MANAGER', 'VIEWER'])`
- `requirePlatformAdmin()`

Implementation note:

- launch can route many vendor mutations through `requireVendorOwner()`;
- later runtime can widen selected endpoints to richer role sets without changing domain rules.

---

## 7. Non-Human Access Rules

`System Job` access is not generic admin access.

Allowed examples:

- send transactional emails;
- sync search index;
- process payout jobs;
- evaluate timeout-driven transitions;
- publish internal domain events.

Restrictions:

- system jobs must operate from explicit event payload or job input, not open-ended tenant browsing;
- jobs touching money, disputes or KYC must leave an audit trail;
- service-level bypass of tenant boundaries must be minimal and purpose-scoped.

---

## 8. Runtime-Critical Checks

These checks must later appear in runtime verification:

1. buyer cannot read another buyer order;
2. vendor cannot read another vendor tenant data;
3. viewer-like role cannot mutate orders or money state;
4. raw KYC documents are admin-only;
5. dispute resolution is admin-only;
6. payout-sensitive actions are restricted to owner/manual-admin paths;
7. blocked vendor loses effective access to selling flows.

---

## 9. Next Planning Dependency

This matrix should feed directly into:

- `state_machines.md`
- `api_contracts.md`
- `schema_drafts.md`
- runtime authorization checks for `R1`
