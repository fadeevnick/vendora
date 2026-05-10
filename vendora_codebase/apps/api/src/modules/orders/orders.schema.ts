export const createOrderSchema = {
  body: {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['productId', 'qty'],
          properties: {
            productId: { type: 'string' },
            qty: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
  },
}

export const addCartItemSchema = {
  body: {
    type: 'object',
    required: ['listingId', 'quantity'],
    properties: {
      listingId: { type: 'string' },
      quantity: { type: 'integer', minimum: 1 },
    },
    additionalProperties: false,
  },
}

export const updateCartItemSchema = {
  body: {
    type: 'object',
    required: ['quantity'],
    properties: {
      quantity: { type: 'integer', minimum: 1 },
    },
    additionalProperties: false,
  },
}

export const createCheckoutSessionSchema = {
  body: {
    type: 'object',
    required: ['cartVersion', 'shippingAddress'],
    properties: {
      cartVersion: { type: 'integer', minimum: 1 },
      shippingAddress: {
        type: 'object',
        required: ['fullName', 'line1', 'city', 'postalCode', 'country'],
        properties: {
          fullName: { type: 'string', minLength: 2 },
          line1: { type: 'string', minLength: 2 },
          city: { type: 'string', minLength: 2 },
          postalCode: { type: 'string', minLength: 2 },
          country: { type: 'string', minLength: 2, maxLength: 2 },
        },
        additionalProperties: false,
      },
      returnUrl: { type: 'string' },
      cancelUrl: { type: 'string' },
    },
    additionalProperties: false,
  },
}

export const paymentWebhookSchema = {
  body: {
    type: 'object',
    properties: {
      providerEventId: { type: 'string', minLength: 2 },
      checkoutSessionId: { type: 'string' },
      eventType: { type: 'string', enum: ['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED'] },
    },
    additionalProperties: true,
  },
}

export const vendorOrderTransitionSchema = {
  params: {
    type: 'object',
    required: ['orderId'],
    properties: {
      orderId: { type: 'string', minLength: 1 },
    },
  },
}

export const vendorShipOrderSchema = {
  params: vendorOrderTransitionSchema.params,
  body: {
    type: 'object',
    properties: {
      carrier: { type: 'string', minLength: 1, maxLength: 80 },
      trackingNumber: { type: 'string', minLength: 1, maxLength: 120 },
      metadata: { type: 'object', additionalProperties: true },
    },
    additionalProperties: false,
  },
}

export const buyerConfirmReceiptSchema = {
  params: {
    type: 'object',
    required: ['orderId'],
    properties: {
      orderId: { type: 'string', minLength: 1 },
    },
  },
}
