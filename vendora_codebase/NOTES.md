# Vendora — Dev Notes

## npm workspaces

**Hoisting:** зависимости из `apps/*` и `packages/*` поднимаются в корневой `node_modules`. В `apps/api/node_modules` попадают только пакеты с конфликтующими версиями.

**В Docker:** чтобы в контейнер попали только нужные пакеты — использовать `npm install --workspace=apps/api`, а не `npm install` в корне.
