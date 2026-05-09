export const createProductSchema = {
  body: {
    type: 'object',
    required: ['name', 'price'],
    properties: {
      name: { type: 'string', minLength: 2 },
      description: { type: 'string' },
      category: { type: 'string', minLength: 2 },
      price: { type: 'number', minimum: 0 },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      stock: { type: 'integer', minimum: 0 },
    },
  },
}

export const createListingSchema = {
  body: {
    type: 'object',
    required: ['title', 'description', 'category', 'priceMinor', 'currency', 'stockQty'],
    properties: {
      title: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 2 },
      category: { type: 'string', minLength: 2 },
      priceMinor: { type: 'integer', minimum: 1 },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      stockQty: { type: 'integer', minimum: 0 },
      media: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
}

export const updateListingSchema = {
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 2 },
      description: { type: 'string', minLength: 2 },
      category: { type: 'string', minLength: 2 },
      priceMinor: { type: 'integer', minimum: 1 },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      stockQty: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
}

export const unpublishListingSchema = {
  body: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
    additionalProperties: false,
  },
}
