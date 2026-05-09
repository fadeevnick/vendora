export const registerSchema = {
  body: {
    type: 'object',
    required: ['accountType', 'email', 'password'],
    properties: {
      accountType: { type: 'string', enum: ['BUYER', 'VENDOR_OWNER'] },
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
    },
  },
}

export const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
    },
  },
}

export const verifyEmailSchema = {
  body: {
    type: 'object',
    required: ['token'],
    properties: {
      token: { type: 'string', minLength: 16 },
    },
  },
}
