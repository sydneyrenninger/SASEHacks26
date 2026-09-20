import type { VercelRequest, VercelResponse } from '@vercel/node'

export function allowCors(response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export function handleOptions(request: VercelRequest, response: VercelResponse) {
  allowCors(response)
  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return true
  }
  return false
}

export function methodNotAllowed(response: VercelResponse, methods: string[]) {
  response.setHeader('Allow', methods.join(', '))
  return response.status(405).json({ error: `Allowed methods: ${methods.join(', ')}` })
}

export function backendError(response: VercelResponse, message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error)
  return response.status(502).json({ error: message, detail })
}
