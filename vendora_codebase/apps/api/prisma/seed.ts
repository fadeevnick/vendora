import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
const prisma = new PrismaClient({ adapter })

async function main() {
  const hash = (p: string) => bcrypt.hash(p, 10)
  const verifiedNow = new Date()

  // Buyer
  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@vendora.com' },
    update: {
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'buyer@vendora.com',
      password: await hash('password123'),
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
    },
  })

  // Admin
  await prisma.user.upsert({
    where: { email: 'admin@vendora.com' },
    update: {
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'admin@vendora.com',
      password: await hash('password123'),
      accountType: 'BUYER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: true,
    },
  })

  // Vendor user
  const vendorUser = await prisma.user.upsert({
    where: { email: 'vendor@vendora.com' },
    update: {
      accountType: 'VENDOR_OWNER',
      emailVerifiedAt: verifiedNow,
      isPlatformAdmin: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'vendor@vendora.com',
      password: await hash('password123'),
      accountType: 'VENDOR_OWNER',
      emailVerifiedAt: verifiedNow,
    },
  })

  // Vendor (APPROVED)
  const vendor = await prisma.vendor.upsert({
    where: { inn: '7700000001' },
    update: {
      status: 'APPROVED',
      legalEntityName: 'TechPro Solutions LLC',
      country: 'RU',
      addressJson: { line1: '1 Vendor Street', city: 'Moscow', postalCode: '101000' },
      salesCategory: 'electronics',
      approvedAt: verifiedNow,
      reviewedAt: verifiedNow,
    },
    create: {
      name: 'TechPro Solutions',
      inn: '7700000001',
      status: 'APPROVED',
      legalEntityName: 'TechPro Solutions LLC',
      country: 'RU',
      addressJson: { line1: '1 Vendor Street', city: 'Moscow', postalCode: '101000' },
      salesCategory: 'electronics',
      approvedAt: verifiedNow,
      reviewedAt: verifiedNow,
      members: {
        create: { userId: vendorUser.id, role: 'OWNER' },
      },
    },
  })

  await prisma.vendorApplication.upsert({
    where: { vendorId: vendor.id },
    update: {
      status: 'APPROVED',
      businessName: 'TechPro Solutions',
      legalEntityName: 'TechPro Solutions LLC',
      taxId: '7700000001',
      country: 'RU',
      addressJson: { line1: '1 Vendor Street', city: 'Moscow', postalCode: '101000' },
      salesCategory: 'electronics',
      submittedByUserId: vendorUser.id,
      reviewedAt: verifiedNow,
      submittedAt: verifiedNow,
    },
    create: {
      vendorId: vendor.id,
      status: 'APPROVED',
      businessName: 'TechPro Solutions',
      legalEntityName: 'TechPro Solutions LLC',
      taxId: '7700000001',
      country: 'RU',
      addressJson: { line1: '1 Vendor Street', city: 'Moscow', postalCode: '101000' },
      salesCategory: 'electronics',
      submittedByUserId: vendorUser.id,
      reviewedAt: verifiedNow,
      submittedAt: verifiedNow,
    },
  })

  // Published products
  const products = [
    { name: 'Ноутбук Dell XPS 15', description: '15", i7, 16GB RAM, 512GB SSD', category: 'electronics', price: 120000, currency: 'RUB', stock: 10 },
    { name: 'Монитор LG 27"', description: '4K, IPS, 60Hz', category: 'electronics', price: 45000, currency: 'RUB', stock: 5 },
    { name: 'Клавиатура Logitech MX Keys', description: 'Беспроводная, подсветка', category: 'electronics', price: 12000, currency: 'RUB', stock: 20 },
  ]

  for (const p of products) {
    const existing = await prisma.product.findFirst({ where: { name: p.name, vendorId: vendor.id } })
    if (!existing) {
      await prisma.product.create({
        data: { ...p, vendorId: vendor.id, published: true, publishedAt: verifiedNow },
      })
    } else {
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          category: p.category,
          currency: p.currency,
          published: true,
          publishedAt: existing.publishedAt ?? verifiedNow,
        },
      })
    }
  }

  console.log('Seed complete:')
  console.log('  buyer@vendora.com / password123')
  console.log('  vendor@vendora.com / password123  →  TechPro Solutions (APPROVED)')
  console.log('  admin@vendora.com / password123  →  Platform Admin')
  console.log(`  3 published products for vendor`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
