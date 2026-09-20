import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_lib/supabase.js'
import { allowCors, backendError, handleOptions, methodNotAllowed } from './_lib/http.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  allowCors(response)
  if (handleOptions(request, response)) return

  if (request.method === 'GET') {
    const { data, error } = await supabase
      .from('sightings')
      .select('*, locations(*)')
      .order('created_at', { ascending: false })
    if (error) return backendError(response, 'Unable to fetch sightings', error)
    return response.status(200).json({ sightings: data ?? [] })
  }

  if (request.method === 'POST') {
    const body = request.body ?? {}
    if (typeof body.location_id !== 'string' || !body.location_id) {
      return response.status(400).json({ error: 'location_id is required' })
    }

    const { data, error } = await supabase
      .from('sightings')
      .insert({ ...body, verification_status: 'unverified' })
      .select('*, locations(*)')
      .single()

    if (error) return backendError(response, 'Unable to create sighting', error)
    return response.status(201).json({ sighting: data })
  }

  return methodNotAllowed(response, ['GET', 'POST', 'OPTIONS'])
}
