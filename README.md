HOW TO RUN:

Full checklist for a new machine:

Install Docker Desktop — docker.com/products/docker-desktop. On Windows it needs WSL2 enabled; the installer handles that or prompts you if it's missing.

Get your project files there — git clone if you're using version control, or copy the folder over.

Recreate .env in the project root (next to manage.py/compose.yaml) — copy from .env.example and fill in real values:

DB_NAME=fareback
DB_USER=fareback_user
DB_PASSWORD=password
DB_HOST=db
DB_PORT=5432
Start backend + database:
powershell
docker compose up --build

In a second terminal, migrate and create your superuser:
powershell
docker compose exec server python manage.py migrate
docker compose exec server python manage.py createsuperuser

Frontend, run natively:
powershell
cd cashier-app
npm install
npm run dev

Confirm http://localhost:5173 loads and can reach http://localhost:8000/api/