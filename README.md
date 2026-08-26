HOW TO RUN:

Install Docker Desktop — docker.com/products/docker-desktop. 

Install Node.js

Check for a native Postgres install on the new machine

Get-Service | Where-Object {$_.Name -like "*postgres*"}

Get your project files there — git clone if you're using version control

----------------------------------------------

Recreate .env in the project root (next to manage.py/compose.yaml) — copy from .env.example and fill in real values:

DB_NAME=fareback

DB_USER=fareback_user

DB_PASSWORD=password

DB_HOST=db

DB_PORT=5432

----------------------------------------------

Start backend + database:

docker compose up --build

(docker compose down/docker compose stop server)

----------------------------------------------

In a second terminal, migrate and seed test data:

docker compose exec server python manage.py migrate

docker compose exec server python manage.py seed_demo_data

----------------------------------------------

Frontend, run natively:

cd cashier-app

npm install

npm run dev

----------------------------------------------

In another terminal, start up the Python script for RFID:

python rfid_relay.py

To access the public facing live tap feed, add /display to the localhost URL.