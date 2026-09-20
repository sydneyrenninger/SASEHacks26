import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase'
import { allowCors, backendError, handleOptions, methodNotAllowed } from './_lib/http'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  allowCors(response)
  if (handleOptions(request, response)) return

  if (request.method === 'GET') {
    const { data, error } = await supabase.from('locations').select('*').order('name')
    if (error) return backendError(response, 'Unable to fetch locations', error)
    return response.status(200).json({ locations: data ?? [] })
  }

  if (request.method === 'POST') {
    const { data, error } = await supabase.from('locations').insert(request.body ?? {}).select().single()
    if (error) return backendError(response, 'Unable to create location', error)
    return response.status(201).json({ location: data })
  }

  return methodNotAllowed(response, ['GET', 'POST', 'OPTIONS'])
}
