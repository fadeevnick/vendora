# Vendora — Functional Requirements

> Multi-tenant B2B Marketplace Platform

Этот артефакт теперь читается как bridge между journeys и будущей реализацией.

- `Scope` показывает, относится ли требование к `Launch` или к `Target`.
- `Launch Delivery` фиксирует, как это может существовать на запуске:
  - `product` — отдельная продуктовая реализация обязательна;
  - `manual` — допустим ручной ops/admin flow;
  - `hosted` — допустим hosted/provider flow;
  - `manual/hosted` — возможны оба упрощения.
- `Runtime` показывает, в какой глубине requirement должен быть реально проверен:
  - `R1` — launch-critical path;
  - `R2` — stronger runtime with alternatives and edge cases;
  - `R3` — full target and operational maturity.

Каждое требование трассируется к `user_journeys.md` и не должно silently расширять launch scope.

---

## 1. Authentication And Access

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-AUTH-001 | Launch | Система должна поддерживать регистрацию по email + пароль для `Vendor` и `Buyer`; email уникален, пароль min 8 символов и содержит букву и цифру | `V-1`, `B-1` | product | `R1` |
| FR-AUTH-002 | Target | Система должна поддерживать social login через Google и LinkedIn; LinkedIn допустим только для vendor-side | `V-1`, `B-1` | product | `R2` |
| FR-AUTH-003 | Launch | Система должна отправлять письмо подтверждения email после регистрации; доставка в течение 60 секунд, TTL ссылки 48 часов | `V-1`, `B-1` | product | `R1` |
| FR-AUTH-004 | Launch | Система должна временно блокировать вход после 5 неудачных попыток; блокировка 15 минут и уведомление на email | `V-1`, `B-1` | product | `R1` |
| FR-AUTH-005 | Target | Система должна поддерживать TOTP 2FA; для финансово чувствительных vendor/admin ролей 2FA обязателен | `V-1`, `A-1`, `A-2` | product | `R3` |
| FR-AUTH-006 | Target | Система должна поддерживать SSO / SAML для enterprise vendor; JIT provisioning и role mapping из IdP | `V-4` | product | `R3` |
| FR-AUTH-007 | Launch | Platform Admin должен иметь отдельный privileged sign-in path; на launch допустим ограниченный email-based access, в target допускается SSO + mandatory 2FA | `A-1`, `A-2` | product | `R1` |
| FR-AUTH-008 | Launch | Система должна инвалидировать vendor sessions при отзыве доступа или блокировке KYC; действие немедленное | `V-1`, `A-1` | product | `R2` |

---

## 2. Vendor Onboarding And KYC

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-KYC-001 | Launch | Система должна собирать бизнес-профиль vendor: название, юрлицо, ИНН/VAT, страна, адрес; поля обязательны | `V-1` | product | `R1` |
| FR-KYC-002 | Launch | Система должна принимать загрузку KYC-документов; форматы PDF/JPEG/PNG, max 10MB на файл | `V-1` | product | `R1` |
| FR-KYC-003 | Launch | Система должна хранить KYC-документы в защищённом storage с доступом только для Platform Admin; presigned URL TTL 15 минут, encryption at rest | `V-1`, `A-1` | product | `R1` |
| FR-KYC-004 | Target | Система должна автоматически проверять vendor по sanctions/blacklist signals после подачи заявки; check завершается в течение 5 минут | `V-1`, `A-1` | manual/product | `R3` |
| FR-KYC-005 | Launch | После подачи заявки система должна переводить vendor в `PENDING_REVIEW` и отправлять подтверждение получения | `V-1`, `A-1` | product | `R1` |
| FR-KYC-006 | Launch | Platform Admin должен уметь одобрить или отклонить заявку с комментарием; на launch допустима простая admin queue или manual ops surface | `V-1`, `A-1` | manual | `R1` |
| FR-KYC-007 | Launch | Система должна уведомлять vendor об одобрении или отклонении; минимум email, in-app можно добавить позже | `V-1`, `A-1` | manual/product | `R1` |
| FR-KYC-008 | Launch | При отклонении система должна позволять vendor исправить документы и подать повторно; на launch допустим ограниченный retry flow с ops escalation после нескольких неудач | `V-1` | product/manual | `R2` |
| FR-KYC-009 | Target | Система должна напоминать vendor о незавершённом onboarding через 24 и 72 часа | `V-1` | manual/product | `R2` |
| FR-KYC-010 | Target | Система должна повторно инициировать KYC при изменении payout-sensitive данных и приостанавливать payouts до повторного review | `V-1`, `V-6`, `A-1` | product/manual | `R2` |

---

## 3. Catalog Management

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-CAT-001 | Launch | Система должна позволять `APPROVED` vendor создавать листинг с названием, описанием, категорией, ценой и остатком | `V-2` | product | `R1` |
| FR-CAT-002 | Target | Система должна принимать до 10 фотографий на листинг; форматы JPEG/PNG/WebP, max 10MB каждая, min 800x600 | `V-2` | product | `R2` |
| FR-CAT-003 | Target | Система должна создавать thumbnail и оптимизированные image variants через CDN | `V-2`, `B-2` | product | `R2` |
| FR-CAT-004 | Target | Система должна поддерживать товарные варианты и SKU combinations; max 3 атрибута и max 100 SKU на листинг | `V-2`, `B-2` | product | `R3` |
| FR-CAT-005 | Target | Система должна блокировать создание новых листингов при превышении лимита плана и показывать upgrade path | `V-2`, `V-5` | product/hosted | `R2` |
| FR-CAT-006 | Launch | Система должна индексировать опубликованный листинг в buyer-visible catalog/search; задержка индексации допустима, но опубликованный товар не должен оставаться невидимым indefinitely | `V-2`, `B-2` | product | `R1` |
| FR-CAT-007 | Target | Система должна поддерживать bulk import листингов через CSV; max 500 записей, preview ошибок до импорта | `V-2` | product | `R3` |
| FR-CAT-008 | Launch | При блокировке vendor-аккаунта система должна снимать его листинги с публичной выдачи | `V-2`, `B-2`, `A-1` | product | `R1` |
| FR-CAT-009 | Launch | Система должна отражать out-of-stock состояние при остатке = 0; листинг не удаляется, но не обещает наличие | `V-2`, `B-2` | product | `R1` |

---

## 4. Search And Discovery

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-SEARCH-001 | Launch | Система должна возвращать buyer-facing полнотекстовый поиск по опубликованным товарам vendors; целевой p95 ответа до 300мс | `B-2` | product | `R1` |
| FR-SEARCH-002 | Target | Система должна поддерживать autocomplete после ввода 2+ символов; debounce 200мс, max 8 подсказок | `B-2` | product | `R2` |
| FR-SEARCH-003 | Launch | Система должна поддерживать минимум полезной фильтрации для launch; полная facet set может расширяться позже | `B-2` | product | `R1` |
| FR-SEARCH-004 | Launch | Система должна исключать товары заблокированных vendors из результатов поиска без отдельного ручного вмешательства | `B-2`, `A-1` | product | `R1` |
| FR-SEARCH-005 | Target | Система должна поддерживать fuzzy search с tolerance к опечаткам | `B-2` | product | `R2` |
| FR-SEARCH-006 | Target | Система должна сохранять состояние поиска и фильтров в URL | `B-2` | product | `R2` |

---

## 5. Cart And Checkout

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-CART-001 | Launch | Система должна группировать товары в корзине по vendors и показывать subtotal по vendor и общий total | `B-3` | product | `R1` |
| FR-CART-002 | Launch | Система должна сохранять корзину незарегистрированного пользователя; cookie/localStorage TTL 30 дней | `B-2`, `B-3` | product | `R1` |
| FR-CART-003 | Target | Система должна объединять анонимную и авторизованную корзины при login; при конфликте приоритет у авторизованной корзины | `B-1`, `B-3` | product | `R2` |
| FR-CART-004 | Launch | Система должна перепроверять цены и наличие при переходе к checkout и объяснять buyer изменения | `B-3` | product | `R1` |
| FR-CHECKOUT-001 | Launch | При успешной оплате система должна создавать отдельный заказ на каждого vendor; операция атомарная, либо создаются все заказы, либо ни один | `B-3`, `V-3` | product | `R1` |
| FR-CHECKOUT-002 | Launch | Система должна обеспечивать idempotent payment/order creation flow; повторный callback или submit не должен создавать дубликаты | `B-3` | product | `R1` |
| FR-CHECKOUT-003 | Launch | После успешного платежа система должна поместить сумму каждого vendor-order в escrow-like hold до completion/dispute decision | `B-3`, `V-3`, `V-6` | product | `R1` |
| FR-CHECKOUT-004 | Launch | Система должна отправлять order confirmation после успешного checkout; минимум email в течение 60 секунд | `B-3`, `V-3` | product | `R1` |
| FR-CHECKOUT-005 | Target | Система должна поддерживать guest checkout без регистрации, если launch slice выбирает этот путь | `B-1`, `B-3` | product | `R2` |
| FR-CHECKOUT-006 | Target | Система должна поддерживать promo code application и корректный recalculation итогов | `B-3` | product | `R2` |

---

## 6. Order Management

### Order State Shape

```text
CREATED -> PAYMENT_HELD -> CONFIRMED -> SHIPPED -> DELIVERED -> COMPLETED
                    |            |
              PAYMENT_FAILED  CANCELLED
                                          \
                                           DISPUTED
```

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-ORDER-001 | Launch | Система должна уведомлять vendor о новом заказе; на launch достаточно email, richer real-time delivery может быть позже | `V-3` | product | `R1` |
| FR-ORDER-002 | Launch | Система должна позволять vendor подтвердить или отменить заказ из `PAYMENT_HELD`; на launch допустимо фиксированное confirmation window | `V-3` | product | `R1` |
| FR-ORDER-003 | Target | Система должна позволять vendor указывать tracking number и carrier при переходе в `SHIPPED` | `V-3`, `B-4` | product | `R2` |
| FR-ORDER-004 | Target | Система должна автоматически переводить заказ в `COMPLETED`, если buyer не подтвердил получение после заданного окна | `V-3`, `B-4` | product | `R2` |
| FR-ORDER-005 | Launch | Система должна позволять buyer открыть спор из допустимых post-delivery состояний в ограниченное окно времени | `B-4`, `B-5` | product | `R1` |
| FR-ORDER-006 | Launch | Система должна замораживать спорную сумму escrow при переходе заказа в `DISPUTED` | `B-5`, `V-3`, `V-6` | product | `R1` |
| FR-ORDER-007 | Launch | При vendor cancellation система должна автоматически инициировать refund через payment provider | `V-3`, `B-3` | product | `R1` |

---

## 7. Escrow And Payouts

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-ESC-001 | Launch | Система должна держать средства в escrow-like hold до `COMPLETED` или platform dispute decision | `B-3`, `V-3`, `B-5` | product | `R1` |
| FR-ESC-002 | Launch | Система должна рассчитывать platform commission при release of funds; комиссия может зависеть от vendor plan | `V-6`, `V-5` | product | `R1` |
| FR-ESC-003 | Launch | После завершения заказа система должна переводить net amount в vendor releasable balance в контролируемые сроки | `V-3`, `V-6` | product | `R1` |
| FR-PAY-001 | Launch | Система должна поддерживать payout execution для vendor balance; на launch допускается scheduled или manual provider/admin initiation | `V-6` | manual/hosted | `R2` |
| FR-PAY-002 | Launch | При открытом споре система должна держать на hold спорную сумму, не блокируя весь остальной vendor balance | `V-6`, `B-5`, `A-2` | product | `R1` |
| FR-PAY-003 | Launch | Vendor должен получать уведомление о payout initiation с суммой и периодом; минимум email | `V-6` | manual/product | `R1` |
| FR-PAY-004 | Target | При payout failure из-за invalid payout details система должна повторно инициировать KYC-sensitive review и приостанавливать дальнейшие payouts | `V-6`, `A-1` | manual/product | `R2` |

---

## 8. Dispute Resolution

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-DISP-001 | Launch | Система должна принимать dispute description и evidence attachments от buyer; max 10 файлов, PDF/JPEG/PNG | `B-5` | product | `R1` |
| FR-DISP-002 | Launch | Система должна уведомлять vendor об открытом споре немедленно; минимум email, richer push later | `B-5`, `V-3` | product | `R1` |
| FR-DISP-003 | Launch | Система должна ожидать vendor response в течение заданного SLA и уметь эскалировать неотвеченные кейсы; на launch допустим manual timer tracking | `B-5`, `A-2` | manual | `R2` |
| FR-DISP-004 | Launch | Если buyer и vendor не договорились, система должна переводить спор в `PLATFORM_REVIEW` | `B-5`, `A-2` | manual/product | `R1` |
| FR-DISP-005 | Launch | Platform Admin должен уметь принять решение с reason; на launch допустим manual-heavy admin flow | `A-2` | manual | `R1` |
| FR-DISP-006 | Launch | После admin decision система должна выполнить refund, partial refund или release of funds согласно решению | `A-2`, `V-6`, `B-5` | manual/product | `R1` |
| FR-DISP-007 | Launch | Система должна логировать все dispute actions в immutable audit trail; launch может начать с простого durable event log, target усиливает retention and tooling | `B-5`, `A-2` | product | `R2` |

---

## 9. Reviews And Ratings

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-REV-001 | Target | Система должна предлагать buyer оставить отзыв после `COMPLETED`; email через 24 часа и/или in-app prompt | `B-6` | product | `R2` |
| FR-REV-002 | Target | Система должна принимать review только от buyer с подтверждённой покупкой; один review на один order | `B-6` | product | `R2` |
| FR-REV-003 | Target | Система должна пересчитывать vendor rating после каждого нового review в разумный SLA | `B-6`, `B-2` | product | `R3` |
| FR-REV-004 | Target | Система должна позволять vendor один раз публично ответить на review | `B-6` | product | `R3` |
| FR-REV-005 | Target | Система должна уметь скрывать review при жалобе до завершения moderation | `B-6` | manual/product | `R3` |

---

## 10. Vendor Subscription

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-SUB-001 | Launch | Платформа должна уметь назначить vendor стартовый plan or trial; на launch это может быть manual assignment или hosted billing configuration | `V-5` | manual/hosted | `R1` |
| FR-SUB-002 | Launch | При смене vendor plan лимиты и feature entitlements должны меняться согласованно; downgrade может применяться в конце периода | `V-5`, `V-2` | manual/hosted | `R2` |
| FR-SUB-003 | Target | Система должна предупреждать vendor о скором окончании trial | `V-5` | product | `R2` |
| FR-SUB-004 | Target | При payment failure система должна переводить vendor в grace period с контролируемым ограничением функциональности | `V-5` | product/hosted | `R3` |
| FR-SUB-005 | Target | По истечении grace period система должна downgrade vendor до lower plan и приостанавливать лишние listings без удаления данных | `V-5`, `V-2` | product/hosted | `R3` |

---

## 11. Notifications

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-NOTIF-001 | Launch | Система должна уведомлять vendor о новом заказе; минимум email, richer channels optional | `V-3` | product | `R1` |
| FR-NOTIF-002 | Launch | Система должна уведомлять buyer об изменении статуса заказа; минимум email | `B-4`, `B-5` | product | `R1` |
| FR-NOTIF-003 | Launch | Система должна уведомлять vendor о новом споре немедленно | `B-5`, `V-3` | product | `R1` |
| FR-NOTIF-004 | Launch | Система должна уведомлять vendor о payout initiation или payout hold | `V-6` | manual/product | `R1` |
| FR-NOTIF-005 | Target | Система должна поддерживать notification preferences per type and channel, не отключая обязательные transactional events | `V-3`, `B-4`, `V-6` | product | `R2` |

---

## 12. API Platform

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-API-001 | Target | Система должна позволять vendor создавать API keys с ограниченными scopes; max 10 keys per account | `V-4` | product | `R3` |
| FR-API-002 | Target | Система должна хранить только hash API key и показывать plaintext значение один раз | `V-4` | product | `R3` |
| FR-API-003 | Target | Система должна применять rate limiting per API key в зависимости от vendor plan | `V-4`, `V-5` | product | `R3` |
| FR-API-004 | Target | Система должна поддерживать signed webhooks для `new_order`, `order_status_changed`, `payout_sent` с retries | `V-4`, `V-6` | product | `R3` |
| FR-API-005 | Target | Система должна предоставлять inventory update API для SKU и bulk updates | `V-2`, `V-4` | product | `R3` |

---

## 13. Security And Tenant Isolation

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-SEC-001 | Launch | Все соединения должны использовать TLS 1.2+ | all | product | `R1` |
| FR-SEC-002 | Launch | Система никогда не хранит raw card data; только provider-side payment references | `B-3`, `V-6` | product | `R1` |
| FR-SEC-003 | Launch | Все финансовые операции должны попадать в durable audit log с retention policy, достаточной для money-sensitive review | `B-3`, `V-6`, `A-2` | product | `R2` |
| FR-SEC-004 | Launch | RBAC и actor boundary должны проверяться на каждом защищённом API request, а не только в UI | `V-3`, `V-4`, `A-1`, `A-2` | product | `R1` |
| FR-SEC-005 | Launch | Данные vendor A никогда не должны быть доступны vendor B; tenant isolation обязательна на каждом data path | `V-2`, `V-3`, `V-4` | product | `R1` |
| FR-SEC-006 | Launch | KYC documents доступны только Platform Admin, и каждый доступ к ним должен быть отслеживаем | `V-1`, `A-1` | product | `R1` |

---

## 14. Performance And Async Work

| ID | Scope | Requirement | Journeys | Launch Delivery | Runtime |
|---|---|---|---|---|---|
| FR-PERF-001 | Launch | Buyer search должен отвечать с целевым p95 не хуже 300мс при нормальной launch нагрузке | `B-2` | product | `R1` |
| FR-PERF-002 | Launch | Product page должна загружаться в пределах launch usability bar; target LCP около 2.5 сек | `B-2` | product | `R1` |
| FR-PERF-003 | Launch | Checkout должен завершаться в пределах launch-ready latency budget, включая payment provider roundtrip | `B-3` | product | `R1` |
| FR-PERF-004 | Launch | Уведомление о новом заказе должно доходить до vendor в пределах 30 секунд | `V-3` | product | `R1` |
| FR-PERF-005 | Launch | Тяжёлые операции вроде email jobs, bulk import, payout runs и media processing должны быть вынесены в async execution model | `V-2`, `V-6`, `B-3` | product | `R2` |

---

## 15. Traceability By Journey

| Journey | Key FR Domains |
|---|---|
| `V-1` Vendor Onboarding | `FR-AUTH-*`, `FR-KYC-*`, `FR-SEC-006` |
| `V-2` Listing Creation | `FR-CAT-*`, `FR-SEARCH-004`, `FR-SUB-002` |
| `V-3` Incoming Order Handling | `FR-CHECKOUT-*`, `FR-ORDER-*`, `FR-ESC-*`, `FR-NOTIF-001` |
| `V-4` Team Management | `FR-AUTH-006`, `FR-API-*`, `FR-SEC-004`, `FR-SEC-005` |
| `V-5` Subscription Management | `FR-SUB-*`, `FR-CAT-005`, `FR-PAY-001` |
| `V-6` Payout Receipt | `FR-ESC-*`, `FR-PAY-*`, `FR-NOTIF-004`, `FR-SEC-003` |
| `B-1` Registration | `FR-AUTH-*` |
| `B-2` Search And Selection | `FR-SEARCH-*`, `FR-CAT-006`, `FR-CAT-009`, `FR-PERF-001` |
| `B-3` Checkout | `FR-CART-*`, `FR-CHECKOUT-*`, `FR-ESC-001`, `FR-PERF-003` |
| `B-4` Order Tracking | `FR-ORDER-*`, `FR-NOTIF-002` |
| `B-5` Dispute Opening | `FR-ORDER-005..007`, `FR-DISP-*`, `FR-PAY-002` |
| `B-6` Reviews | `FR-REV-*` |
| `A-1` KYC Review | `FR-KYC-003..010`, `FR-AUTH-007`, `FR-SEC-006` |
| `A-2` Dispute Resolution | `FR-DISP-003..007`, `FR-SEC-003` |

---

## 16. Scope Summary

- `Launch` requirements define the first working marketplace and money flow.
- `Target` requirements preserve the full training depth but must not silently enter `R1`.
- `manual` and `hosted` delivery are valid for launch where product truth requires the capability but not yet a dedicated polished UI.
