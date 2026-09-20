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

export function getSightings() {
  return request("/api/sightings");
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

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = () => reject(new Error("Unable to read the selected photo."));
    reader.readAsDataURL(file);
  });
}

export async function uploadPhoto(file) {
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error("Photo is too large (max 5MB).");
  }

  const data = await readFileAsBase64(file);
  const payload = await request("/api/upload", {
    method: "POST",
    body: JSON.stringify({
      data,
      contentType: file.type,
      fileName: file.name
    })
  });

  return payload.url;
}
