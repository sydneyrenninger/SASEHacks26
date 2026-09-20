import express from 'express'
import 'dotenv/config'
import cors from 'cors'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const app = express()
const port = process.env.PORT || 3000
const pythonBin = process.env.PYTHON_BIN || 'python3'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY.')
}

const supabase = createClient(supabaseUrl, supabaseKey)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(express.json())
app.use(cors())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'missing-person-match-api' })
})

app.get('/api/people', async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name : ''
  const limit = Math.min(Number(req.query.limit) || 50, 100)
  let query = supabase.from('people').select('*').order('created_at', { ascending: false }).limit(limit)

  if (name) query = query.ilike('name', `%${name}%`)

  const { data, error } = await query
  if (error) return res.status(502).json({ error: 'Unable to fetch people', detail: error.message })
  return res.json({ people: data ?? [] })
})

app.post('/api/people', async (req, res) => {
  const { name } = req.body || {}
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' })
  }

  const { data, error } = await supabase
    .from('people')
    .insert({ ...req.body, name: name.trim(), status: 'missing' })
    .select()
    .single()

  if (error) return res.status(502).json({ error: 'Unable to create person', detail: error.message })
  return res.status(201).json({ person: data })
})

app.get('/api/locations', async (_req, res) => {
  const { data, error } = await supabase.from('locations').select('*').order('name')
  if (error) return res.status(502).json({ error: 'Unable to fetch locations', detail: error.message })
  return res.json({ locations: data ?? [] })
})

app.post('/api/locations', async (req, res) => {
  const { data, error } = await supabase.from('locations').insert(req.body || {}).select().single()
  if (error) return res.status(502).json({ error: 'Unable to create location', detail: error.message })
  return res.status(201).json({ location: data })
})

app.get('/api/sightings', async (_req, res) => {
  const { data, error } = await supabase.from('sightings').select('*, locations(*)').order('created_at', { ascending: false })
  if (error) return res.status(502).json({ error: 'Unable to fetch sightings', detail: error.message })
  return res.json({ sightings: data ?? [] })
})

app.post('/api/sightings', async (req, res) => {
  const { location_id: locationId } = req.body || {}
  if (typeof locationId !== 'string' || !locationId) {
    return res.status(400).json({ error: 'location_id is required' })
  }

  const { data, error } = await supabase
    .from('sightings')
    .insert({ ...req.body, location_id: locationId, verification_status: 'unverified' })
    .select('*, locations(*)')
    .single()

  if (error) return res.status(502).json({ error: 'Unable to create sighting', detail: error.message })
  return res.status(201).json({ sighting: data })
})

const fetchMissingPerson = async (id) => {
  const { data, error } = await supabase.from('people').select('*').eq('id', id).single()
  if (error) throw new Error(`Unable to fetch missing person: ${error.message}`)

  if (data.last_seen_location) {
    const { data: locations, error: locationsError } = await supabase.from('locations').select('*')
    if (locationsError) throw new Error(`Unable to resolve missing person's location: ${locationsError.message}`)

    const normalizedLastSeen = data.last_seen_location.trim().toLowerCase()
    data.location = (locations ?? []).find((location) =>
      location.name?.trim().toLowerCase() === normalizedLastSeen,
    ) ?? null
  }

  return data
}

const fetchSightings = async (limit) => {
  const { data, error } = await supabase
    .from('sightings')
    .select('*, locations(*)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Unable to fetch candidate sightings: ${error.message}`)
  return data ?? []
}

app.post('/api/matches', async (req, res) => {
  const { missing_person: suppliedPerson, missing_person_id: personId, candidates: suppliedCandidates } = req.body || {}

  let missingPerson = suppliedPerson
  let candidates = suppliedCandidates

  try {
    if (!missingPerson && personId) missingPerson = await fetchMissingPerson(personId)
    if (!missingPerson) return res.status(400).json({ error: 'missing_person or missing_person_id is required' })
    if (!candidates) candidates = await fetchSightings(Math.min(Number(req.body.limit) || 50, 100))
  } catch (error) {
    return res.status(502).json({ error: 'Unable to load match inputs', detail: error.message })
  }

  if (!Array.isArray(candidates)) {
    return res.status(400).json({
      error: 'candidates must be an array when supplied',
    })
  }

  const python = spawn(
    pythonBin,
    ['matching_service.py', JSON.stringify({ missing_person: missingPerson, candidates })],
    {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''

  python.stdout.on('data', (chunk) => {
    stdout += chunk.toString()
  })

  python.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  python.on('close', (code) => {
    if (code !== 0) {
      return res.status(500).json({
        error: 'Python matching service failed',
        detail: stderr || 'Unknown Python error',
      })
    }

    try {
      const payload = JSON.parse(stdout)
      return res.json(payload)
    } catch (error) {
      return res.status(500).json({
        error: 'Invalid JSON from matching service',
        detail: stdout || String(error),
      })
    }
  })
})

app.listen(port, () => {
  console.log(`Match API listening on http://localhost:${port}`)
})
