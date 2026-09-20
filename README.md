# SASEHacks26

## Supabase setup

1. Copy `.env.example` to `.env`.
2. Add the project URL and publishable key from the Supabase dashboard.
3. Import the shared client with `import { supabase } from './lib/supabase'`.

Never put a Supabase secret or service-role key in frontend environment variables. The frontend should use only the publishable key.

## Backend API

Start the API with:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
npm run backend
```

The API runs at `http://localhost:3000`.

Endpoints:

- `GET /health`
- `GET /api/people?name=...`
- `POST /api/people`
- `GET /api/locations`
- `POST /api/locations`
- `GET /api/sightings`
- `POST /api/sightings`
- `POST /api/matches`

To rank database sightings for an existing person, send:

```json
{
	"missing_person_id": "person-uuid",
	"limit": 20
}
```

Match scores are information overlap scores, not identification probabilities.

## Render deployment

This repository includes `render.yaml` and `Dockerfile` for deploying both services on Render:

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint** and select the repository.
3. Create the backend environment variables on `reunite-api`:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_PUBLISHABLE_KEY`
4. After the API deploys, copy its public URL into `VITE_API_BASE_URL` on `reunite-web`.
5. Redeploy `reunite-web` after saving that variable.

The frontend is served as a Render Static Site from `reunite-react/dist`. The API uses the Docker image, which provides both Node.js and Python for the matching route. Render supplies `PORT` automatically; the API uses `PYTHON_BIN=/opt/venv/bin/python` in the image.

For local development, leave `VITE_API_BASE_URL` unset and the React app will use `http://localhost:3000`.