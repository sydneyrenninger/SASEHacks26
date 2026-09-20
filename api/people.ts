import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'
import { allowCors, backendError, handleOptions, methodNotAllowed } from './_lib/http'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  allowCors(response)
  if (handleOptions(request, response)) return

  if (request.method === 'GET') {
    const name = typeof request.query.name === 'string' ? request.query.name : ''
    const parsedLimit = Number(request.query.limit)
    const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50, 100)

    let query = supabase.from('people').select('*').order('created_at', { ascending: false }).limit(limit)
    if (name) query = query.ilike('name', `%${name}%`)

    const { data, error } = await query
    if (error) return backendError(response, 'Unable to fetch people', error)
    return response.status(200).json({ people: data ?? [] })
  }

  if (request.method === 'POST') {
    const body = request.body ?? {}
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return response.status(400).json({ error: 'name is required' })
    }

    const { data, error } = await supabase
      .from('people')
      .insert({ ...body, name: body.name.trim(), status: 'missing' })
      .select()
      .single()

    if (error) return backendError(response, 'Unable to create person', error)
    return response.status(201).json({ person: data })
  }

  return methodNotAllowed(response, ['GET', 'POST', 'OPTIONS'])
}
