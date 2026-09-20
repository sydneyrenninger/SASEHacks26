const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? "http://localhost:3000" : "")
).replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "The backend request failed.");
  }

  return payload;
}

export function getPeople() {
  return request("/api/people");
}

export function getLocations() {
  return request("/api/locations");
}

export function getMatches(missingPersonId, limit = 20) {
  return request("/api/matches", {
    method: "POST",
    body: JSON.stringify({
      missing_person_id: missingPersonId,
      limit
    })
  });
}

export function createMissingPerson(person) {
  return request("/api/people", {
    method: "POST",
    body: JSON.stringify(person)
  });
}

export function createSighting(sighting) {
  return request("/api/sightings", {
    method: "POST",
    body: JSON.stringify(sighting)
  });
}
