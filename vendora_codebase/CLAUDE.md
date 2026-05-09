# Vendora — Project Context для новой сессии

## Цель проекта

Учебный/практический проект для отработки полного цикла — от продуктового дизайна до реализации. Выбрана тема B2B маркетплейса как достаточно сложного продукта с несколькими акторами, платёжной логикой и многоуровневыми флоу.

## Откуда всё началось

Проект начинался из общих product/design standards, но текущий source of truth теперь полностью локализован внутри `/home/nickf/Documents/product_development/vendora/`.

Рабочие документы проекта:
- `source/design/business_requirements.md` — бизнес-цели Vendora
- `source/design/user_journeys.md` — все флоу (Vendor V-1..V-6, Buyer B-1..B-6, Admin A-1..A-2)
- `source/design/functional_requirements.md` — что каждый экран должен уметь
- `source/design/architecture.md` — архитектурные решения и ADR
- `source/design/tech_stack.md` — выбранный стек с обоснованием
- `source/planning/access_matrix.md` — actor/resource/action boundaries
- `source/planning/implementation_guide.md` — гайд по реализации

## Что такое Vendora

B2B маркетплейс (аналог Shopify + Faire). Три актора:
- **Buyer** — компания, которая покупает товары у нескольких vendor'ов за один checkout
- **Vendor** — компания-продавец, проходит KYC, выставляет товары, обрабатывает заказы
- **Platform Admin** — модерирует KYC, разрешает споры

Ключевая фича: мультивендорный checkout — один платёж, деньги в эскроу, несколько субзаказов.

## Дизайн (HTML-прототипы)

Сделаны в Claude Design, лежат в `/home/nickf/Documents/product_development/vendora/prototypes/`:
- `Vendora Checkout.html` — B-3 мультивендорный checkout (корзина → оформление → успех)
- `Vendora Vendor Onboarding.html` — V-1 регистрация vendor (4-шаговый wizard)
- `Vendora Vendor Dashboard.html` — V-3 обработка входящих заказов
- `Vendora Dispute Flow.html` — B-5 открытие и разрешение спора
- `Vendora Search.html` — B-2 поиск и каталог товаров
- `tweaks-panel.jsx` — переиспользуемый UI компонент для всех прототипов
- `../tracking/design_status.md` — статус покрытия дизайном всех флоу

Дизайн служит визуальным ТЗ при разработке фронтенда. Стиль: синий акцент `#2455e8`, карточки `rounded-xl border border-slate-200`, шрифт Inter.

## Формат работы

1. Claude реализует фичу (пишет код напрямую в файлы проекта)
2. Claude описывает проверку: какой URL открыть, какие действия сделать, что должно произойти
3. User проверяет самостоятельно и сообщает результат

## Implementation workflow

- `../source/planning/implementation_guide.md` — roadmap/checklist: что строить и как проверять.
- `../tracking/implementation_status.md` — текущий статус реализации: active phase, done/gaps/next.
- Перед началом новой implementation-сессии прочитать:
  1. этот файл;
  2. `../source/planning/implementation_guide.md`;
  3. `../tracking/implementation_status.md`.
- Не перепроходить завершённые фазы без причины.
- Обновлять `../tracking/implementation_status.md` после завершения фазы/подфазы, изменения next step, обнаружения важного расхождения или в конце meaningful session.
- Не записывать в status временные ошибки, обучающие вопросы и промежуточный debug, если они не влияют на дальнейшую работу.
