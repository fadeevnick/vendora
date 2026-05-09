import {
  autoCancelUnconfirmedOrders,
  autoCompleteDeliveredOrders,
  expireAbandonedCheckoutSessions,
} from './orders.service.js'

export async function runOrderMaintenanceJobs(input: {
  limit?: number
  now?: Date
  confirmationOlderThanHours?: number
  deliveryOlderThanHours?: number
} = {}) {
  const limit = input.limit ?? 50
  const checkoutExpiry = await expireAbandonedCheckoutSessions({ limit, now: input.now })
  const confirmationTimeout = await autoCancelUnconfirmedOrders({
    limit,
    now: input.now,
    olderThanHours: input.confirmationOlderThanHours ?? 48,
  })
  const deliveryTimeout = await autoCompleteDeliveredOrders({
    limit,
    now: input.now,
    olderThanHours: input.deliveryOlderThanHours ?? 72,
  })

  return {
    checkoutExpiry,
    confirmationTimeout,
    deliveryTimeout,
  }
}
