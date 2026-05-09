import 'dotenv/config'
import { prisma } from '../../shared/db.js'
import { reindexCatalogSearch } from './catalog.search.js'

async function main() {
  const result = await reindexCatalogSearch()
  console.log(JSON.stringify({ ok: true, ...result }, null, 2))
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
