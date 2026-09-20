import { supabase } from './supabase'

export async function searchPeople(name: string) {
  const { data, error } = await supabase
    .from('people')
    .select('*')
    .ilike('name', `%${name}%`)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function submitMissingPerson(person: {
  name: string
  age?: number
  gender?: string
  description?: string
  clothing?: string
  last_seen_date?: string
  last_seen_location?: string
}) {
  const { data, error } = await supabase
    .from('people')
    .insert({ ...person, status: 'missing' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function submitSighting(sighting: {
  name?: string
  age?: number
  description?: string
  sighting_date?: string
  location_id: string
}) {
  const { data, error } = await supabase
    .from('sightings')
    .insert({ ...sighting, verification_status: 'unverified' })
    .select('*, locations(*)')
    .single()

  if (error) throw error
  return data
}

export async function getSightings() {
  const { data, error } = await supabase
    .from('sightings')
    .select('*, locations(*)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createLocation(location: {
  name?: string
  latitude?: number
  longitude?: number
  address?: string
  location_type?: string
}) {
  const { data, error } = await supabase
    .from('locations')
    .insert(location)
    .select()
    .single()

  if (error) throw error
  return data
}
