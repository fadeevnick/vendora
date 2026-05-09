export const createVendorSchema = {
  body: {
    type: 'object',
    required: ['name', 'inn'],
    properties: {
      name: { type: 'string', minLength: 2 },
      inn: { type: 'string', minLength: 10, maxLength: 12 },
      country: { type: 'string' },
      address: { type: 'string' },
    },
  },
}

export const updateVendorApplicationSchema = {
  body: {
    type: 'object',
    required: ['businessName', 'legalEntityName', 'taxId', 'country', 'address', 'salesCategory'],
    properties: {
      businessName: { type: 'string', minLength: 2 },
      legalEntityName: { type: 'string', minLength: 2 },
      taxId: { type: 'string', minLength: 4 },
      country: { type: 'string', minLength: 2, maxLength: 2 },
      address: {
        type: 'object',
        required: ['line1', 'city', 'postalCode'],
        properties: {
          line1: { type: 'string', minLength: 2 },
          city: { type: 'string', minLength: 2 },
          postalCode: { type: 'string', minLength: 2 },
        },
        additionalProperties: false,
      },
      salesCategory: { type: 'string', minLength: 2 },
    },
    additionalProperties: false,
  },
}

export const presignKycDocumentSchema = {
  body: {
    type: 'object',
    required: ['documentType', 'fileName', 'contentType', 'sizeBytes'],
    properties: {
      documentType: { type: 'string', minLength: 2 },
      fileName: { type: 'string', minLength: 1 },
      contentType: { type: 'string', enum: ['application/pdf', 'image/jpeg', 'image/png'] },
      sizeBytes: { type: 'integer', minimum: 1, maximum: 10485760 },
    },
    additionalProperties: false,
  },
}

export const uploadKycDocumentContentSchema = {
  body: {
    type: 'object',
    required: ['contentBase64'],
    properties: {
      contentBase64: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
}

export const reviewKycApplicationSchema = {
  body: {
    type: 'object',
    properties: {
      note: { type: 'string' },
      reasonCode: { type: 'string' },
    },
    additionalProperties: false,
  },
}
