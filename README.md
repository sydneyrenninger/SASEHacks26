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


To rank database sightings for an existing person, send:

```json
{
	"missing_person_id": "person-uuid",
	"limit": 20
}
```

Match scores are information overlap scores, not identification probabilities.

## Vercel deployment

The repository is configured as one Vercel project. Vercel builds the React app from `reunite-react` and deploys the TypeScript API functions from `api/` under the same domain.

1. Push the repository to GitHub.
2. In Vercel, import the repository with the repository root as the project root.
3. Add these production environment variables:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Deploy. The frontend calls `/api/people`, `/api/locations`, `/api/sightings`, and `/api/matches` on the same Vercel domain.

`vercel.json` runs the `reunite-react` Vite build and publishes `reunite-react/dist`. The TypeScript API functions reuse `src/lib/matching.ts`, so the production demo no longer needs the Python service.

For local development, leave `VITE_API_BASE_URL` unset in `reunite-react` and run the existing Express server on `http://localhost:3000`. Set it only when the frontend and local API run on different hosts.

