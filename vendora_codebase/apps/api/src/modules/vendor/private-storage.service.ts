import crypto from 'node:crypto'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const STORAGE_PROVIDER = 'local_private'

function storageRoot() {
  return path.resolve(process.env['KYC_PRIVATE_STORAGE_DIR'] ?? path.join(process.cwd(), '.local', 'private-storage'))
}

function resolveStoragePath(storageKey: string) {
  const root = storageRoot()
  const resolved = path.resolve(root, storageKey)
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('VALIDATION_ERROR: invalid storage key')
  }
  return resolved
}

export function privateStorageProvider() {
  return STORAGE_PROVIDER
}

export async function putPrivateObject(storageKey: string, content: Buffer) {
  const target = resolveStoragePath(storageKey)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, { flag: 'wx' })
  return {
    provider: STORAGE_PROVIDER,
    sizeBytes: content.byteLength,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  }
}

export async function getPrivateObject(storageKey: string) {
  const content = await readFile(resolveStoragePath(storageKey))
  return {
    provider: STORAGE_PROVIDER,
    sizeBytes: content.byteLength,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    content,
  }
}
