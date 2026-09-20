import type { VercelRequest, VercelResponse } from '@vercel/node'
import { scoreMatch } from '../src/lib/matching'
import { supabase } from './_lib/supabase'
import { allowCors, backendError, handleOptions, methodNotAllowed } from './_lib/http'

type LocationRow = {
  name?: string | null
  latitude?: number | null
  longitude?: number | null
}

type RecordWithLocation = Record<string, unknown> & {
  locations?: LocationRow | null
  location?: LocationRow | null
}

const withLocation = (record: RecordWithLocation, location?: LocationRow | null) => ({
  ...record,
  location: location ?? record.location ?? record.locations ?? null,
})

async function loadPerson(id: string) {
  const { data: person, error: personError } = await supabase.from('people').select('*').eq('id', id).single()
  if (personError) throw personError

  if (!person.last_seen_location) return person

  const { data: locations, error: locationError } = await supabase.from('locations').select('*')
  if (locationError) throw locationError

  const target = person.last_seen_location.trim().toLowerCase()
  const location = (locations ?? []).find((row) => row.name?.trim().toLowerCase() === target)
  return withLocation(person, location)
}

async function loadSightings(limit: number) {
  const { data, error } = await supabase
    .from('sightings')
    .select('*, locations(*)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((sighting) => withLocation(sighting, sighting.locations))
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  allowCors(response)
  if (handleOptions(request, response)) return
  if (request.method !== 'POST') return methodNotAllowed(response, ['POST', 'OPTIONS'])

  const body = request.body ?? {}
  let missingPerson = body.missing_person
  let candidates = body.candidates

  try {
    if (!missingPerson && typeof body.missing_person_id === 'string') {
      missingPerson = await loadPerson(body.missing_person_id)
    }
    if (!missingPerson) {
      return response.status(400).json({ error: 'missing_person or missing_person_id is required' })
    }

    if (!candidates) {
      const parsedLimit = Number(body.limit)
      const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50, 100)
      candidates = await loadSightings(limit)
    }
  } catch (error) {
    return backendError(response, 'Unable to load match inputs', error)
  }

  if (!Array.isArray(candidates)) {
    return response.status(400).json({ error: 'candidates must be an array when supplied' })
  }

  const matches = candidates
    .map((candidate: RecordWithLocation) => {
      const normalizedCandidate = withLocation(candidate, candidate.locations ?? candidate.location)
      const result = scoreMatch(missingPerson, normalizedCandidate)
      return { candidate, score: result.score, result }
    })
    .sort((left, right) => right.score - left.score)

  return response.status(200).json({ matches, input_count: candidates.length })
}
