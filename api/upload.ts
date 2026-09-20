import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { supabase } from './_lib/supabase.js'
import { allowCors, backendError, handleOptions, methodNotAllowed } from './_lib/http.js'

export const config = {
  api: {
    bodyParser: { sizeLimit: '4.5mb' },
  },
}

// Vercel serverless functions hard-cap the request body around ~4.5MB
// regardless of this config, and base64 inflates the raw file by ~33% —
// keep enough headroom that a valid upload never gets 413'd by the platform.
const MAX_BYTES = 3 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default async function handler(request: VercelRequest, response: VercelResponse) {
  allowCors(response)
  if (handleOptions(request, response)) return

  if (request.method !== 'POST') return methodNotAllowed(response, ['POST', 'OPTIONS'])

  const body = request.body ?? {}
  const { data, contentType, fileName } = body

  if (typeof data !== 'string' || !data) {
    return response.status(400).json({ error: 'data (base64) is required' })
  }
  if (typeof contentType !== 'string' || !ALLOWED_TYPES.has(contentType)) {
    return response.status(400).json({ error: 'contentType must be one of: ' + [...ALLOWED_TYPES].join(', ') })
  }

  const buffer = Buffer.from(data, 'base64')
  if (buffer.length > MAX_BYTES) {
    return response.status(400).json({ error: 'Photo is too large (max 3MB).' })
  }

  const extension = (typeof fileName === 'string' ? fileName.split('.').pop() : '') || contentType.split('/')[1] || 'jpg'
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${randomUUID()}.${safeExtension}`

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, buffer, { contentType, upsert: false })

  if (uploadError) return backendError(response, 'Unable to upload photo', uploadError)

  const { data: publicUrlData } = supabase.storage.from('photos').getPublicUrl(path)
  return response.status(201).json({ url: publicUrlData.publicUrl })
}
