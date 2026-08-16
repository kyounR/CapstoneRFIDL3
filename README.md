HOW TO RUN:

Full checklist for a new machine:

Install Docker Desktop — docker.com/products/docker-desktop. On Windows it needs WSL2 enabled; the installer handles that or prompts you if it's missing.
Get your project files there — git clone if you're using version control (recommended at this point, given how much has changed today), or copy the folder over. Don't copy .venv, node_modules, or .env — leave those behind; you're recreating them fresh, same reasoning as the venv problem from earlier.
Recreate .env in the project root (next to manage.py/compose.yaml) — copy from .env.example and fill in real values:
DB_NAME=fareback
DB_USER=fareback_user
DB_PASSWORD=password
DB_HOST=db
DB_PORT=5432
Start backend + database:
powershell
docker compose up --build

First run on a new machine takes longer (downloading the Postgres image, installing Python deps) — that's normal, not stuck.

In a second terminal, migrate and create your superuser (fresh volume on this machine = empty database, same as before):
powershell
docker compose exec server python manage.py migrate
docker compose exec server python manage.py createsuperuser
Frontend, run natively (per the decision to not containerize it):
powershell
cd cashier-app
npm install
npm run dev
Confirm http://localhost:5173 loads and can reach http://localhost:8000/api/ — same CORS setup should already cover this since nothing about ports changed.