export const createDisputeSchema = {
  body: {
    type: 'object',
    required: ['reason'],
    properties: {
      reason: { type: 'string', minLength: 10 },
      evidence: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          required: ['fileName', 'contentType', 'sizeBytes'],
          properties: {
            fileName: { type: 'string', minLength: 1 },
            contentType: { type: 'string', minLength: 1 },
            sizeBytes: { type: 'integer', minimum: 1, maximum: 10485760 },
            contentBase64: { type: 'string', minLength: 1 },
            description: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
}

export const vendorDisputeResponseSchema = {
  params: {
    type: 'object',
    required: ['disputeId'],
    properties: {
      disputeId: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['message'],
    properties: {
      message: { type: 'string', minLength: 10 },
      evidence: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          required: ['fileName', 'contentType', 'sizeBytes'],
          properties: {
            fileName: { type: 'string', minLength: 1 },
            contentType: { type: 'string', minLength: 1 },
            sizeBytes: { type: 'integer', minimum: 1, maximum: 10485760 },
            contentBase64: { type: 'string', minLength: 1 },
            description: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
}

export const resolveDisputeSchema = {
  params: {
    type: 'object',
    properties: {
      disputeId: { type: 'string', minLength: 1 },
      orderId: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['resolutionType'],
    properties: {
      status: { type: 'string', enum: ['RESOLVED'] },
      resolutionType: { type: 'string', enum: ['BUYER_FAVOR_FULL_REFUND', 'BUYER_FAVOR_PARTIAL_REFUND', 'VENDOR_FAVOR_RELEASE'] },
      refundAmountMinor: { type: 'integer', minimum: 1 },
    },
    additionalProperties: false,
  },
}

export const providerFailureReviewSchema = {
  body: {
    type: 'object',
    properties: {
      note: { type: 'string', minLength: 1, maxLength: 1000 },
    },
    additionalProperties: false,
  },
}
