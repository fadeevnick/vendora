import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { authRoutes } from './modules/auth/auth.routes.js'
import { vendorRoutes } from './modules/vendor/vendor.routes.js'
import { catalogRoutes } from './modules/catalog/catalog.routes.js'
import { orderRoutes } from './modules/orders/orders.routes.js'
import { disputeRoutes } from './modules/disputes/disputes.routes.js'
import { adminOpsRoutes } from './modules/admin/ops.routes.js'
import { authenticate } from './plugins/authenticate.js'

const app = Fastify({ logger: true })

app.register(cors, {
  origin: ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})
app.register(jwt, { secret: process.env['JWT_SECRET'] ?? 'dev-secret' })

app.get('/health', async () => {
  return { status: 'ok' }
})

app.register(authRoutes)
app.register(vendorRoutes)
app.register(catalogRoutes)
app.register(orderRoutes)
app.register(disputeRoutes)
app.register(adminOpsRoutes)

app.get('/me', { preHandler: authenticate }, async (request) => {
  return request.user
})

const start = async () => {
  try {
    const port = Number(process.env['PORT'] ?? 3001)
    await app.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
