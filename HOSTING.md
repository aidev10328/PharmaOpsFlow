# PharmaOpsFlow — Hosting & Deployment Guide

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Next.js Web   │────▶│   NestJS API     │────▶│  PostgreSQL   │
│   (Port 3005)   │     │   (Port 8005)    │     │  (Port 5432)  │
└─────────────────┘     └──────┬───────────┘     └───────────────┘
                               │
                        ┌──────┴───────────┐
                        │  Supabase Storage │
                        │  (File uploads)   │
                        └──────────────────┘
```

- **Frontend**: Next.js 14 (React 18, Tailwind CSS)
- **Backend**: NestJS (TypeScript, Prisma ORM)
- **Database**: PostgreSQL 15
- **File Storage**: Supabase Storage (or local Supabase)
- **AI Chat** (optional): Ollama (local), OpenAI, or Google Gemini

---

## Prerequisites

| Tool       | Version  | Purpose                   |
|------------|----------|---------------------------|
| Node.js    | >= 18    | Runtime                   |
| npm        | >= 9     | Package manager           |
| PostgreSQL | >= 15    | Database                  |
| Git        | >= 2     | Source control            |
| Docker     | >= 24    | Optional: local Postgres  |

---

## Quick Start (5 minutes)

```bash
# 1. Clone the repository
git clone <repo-url> PharmaOpsFlow
cd PharmaOpsFlow

# 2. Install dependencies
cd apps/api && npm install && cd ../..
cd apps/web && npm install && cd ../..

# 3. Start PostgreSQL (option A: Docker)
docker compose up -d postgres

# 3. Start PostgreSQL (option B: use an existing PostgreSQL instance)
# Just update DATABASE_URL in step 4

# 4. Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — see "Environment Variables" below

echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8005" > apps/web/.env

# 5. Run database migrations + seed
cd apps/api
npx prisma generate
npx prisma migrate deploy
npx ts-node --transpile-only prisma/seed-demo.ts
cd ../..

# 6. Start servers
cd apps/api && npm run dev &
cd apps/web && npm run dev &

# 7. Open browser
# http://localhost:3005
```

---

## Environment Variables

### Backend (`apps/api/.env`)

Create this file from the template below. **All values must be set before starting the API.**

```env
# ──────────────────────────────────────
# DATABASE (Required)
# ──────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/pharmaopsflow
DIRECT_URL=postgresql://USER:PASSWORD@HOST:5432/pharmaopsflow

# If using Supabase hosted Postgres with connection pooling:
# DATABASE_URL=postgresql://...@pooler.supabase.com:6543/postgres?pgbouncer=true
# DIRECT_URL=postgresql://...@supabase.com:5432/postgres

# ──────────────────────────────────────
# AUTHENTICATION (Required)
# ──────────────────────────────────────
JWT_SECRET=<generate-a-random-64-char-string>
# Generate with: openssl rand -base64 48

# ──────────────────────────────────────
# API SERVER
# ──────────────────────────────────────
API_PORT=8005
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com

# ──────────────────────────────────────
# SUPABASE STORAGE (Required for file uploads)
# ──────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=invoices

# ──────────────────────────────────────
# AI CHAT (Optional — app works without it)
# ──────────────────────────────────────
AI_ENABLED=true
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2

# OR use OpenAI instead:
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o-mini

# ──────────────────────────────────────
# AI INVOICE EXTRACTION (Optional)
# ──────────────────────────────────────
# AI_EXTRACTION_PROVIDER=google-document-ai
# GOOGLE_CLOUD_PROJECT_ID=your-project-id
# GOOGLE_DOCUMENT_AI_LOCATION=us
# GOOGLE_DOCUMENT_AI_PROCESSOR_ID=your-processor-id
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# OR use OpenAI for extraction:
# AI_EXTRACTION_PROVIDER=openai
# OPENAI_API_KEY=sk-...

# OR use local Ollama (slower but free):
# USE_LOCAL_EXTRACTION=true

CHAT_RATE_LIMIT_PER_MIN=20
```

### Frontend (`apps/web/.env`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8005
# For production, use your API domain:
# NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
```

---

## Database Setup

### Option A: Docker (Recommended for dev/demo)

```bash
docker compose up -d postgres
# This starts PostgreSQL 15 on port 5432
# Default: postgres/postgres
```

### Option B: Supabase (Recommended for production)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **Settings → Database** and copy the connection strings
3. Set `DATABASE_URL` (pooler, port 6543) and `DIRECT_URL` (direct, port 5432)
4. Create a storage bucket named `invoices` in **Storage**

### Option C: Any PostgreSQL instance

Any PostgreSQL 15+ instance works. Just set `DATABASE_URL` and `DIRECT_URL`.

### Run Migrations

```bash
cd apps/api

# Generate Prisma client
npx prisma generate

# Apply all migrations
npx prisma migrate deploy

# Seed demo data (users, pharmacies, invoices, etc.)
npx ts-node --transpile-only prisma/seed-demo.ts
```

---

## Running in Production

### Build

```bash
# Build API
cd apps/api
npm run build
# Output: apps/api/dist/

# Build Web
cd apps/web
npm run build
# Output: apps/web/.next/
```

### Start

```bash
# Start API (production)
cd apps/api
NODE_ENV=production node dist/main.js

# Start Web (production)
cd apps/web
npm run start
```

### Process Manager (PM2)

For production, use PM2 to keep processes alive:

```bash
npm install -g pm2

# Start API
cd apps/api
pm2 start dist/main.js --name pharmaops-api

# Start Web
cd apps/web
pm2 start npm --name pharmaops-web -- start

# Save and enable startup
pm2 save
pm2 startup
```

---

## Deployment Options

### Option 1: VPS / VM (DigitalOcean, AWS EC2, etc.)

```bash
# 1. SSH into server
ssh user@your-server

# 2. Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install PostgreSQL (or use managed DB)
sudo apt install -y postgresql-15

# 4. Clone, install, configure (follow Quick Start above)

# 5. Set up Nginx reverse proxy
sudo apt install -y nginx
```

**Nginx config** (`/etc/nginx/sites-available/pharmaopsflow`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api/ {
        rewrite ^/api/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/pharmaopsflow /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. (Optional) Add SSL with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Option 2: Vercel (Frontend) + Railway/Render (API)

**Frontend on Vercel:**
1. Push to GitHub
2. Import in Vercel → select `apps/web` as root
3. Set `NEXT_PUBLIC_API_BASE_URL` env var

**API on Railway/Render:**
1. Create new service → select `apps/api` as root
2. Set build command: `npm install && npx prisma generate && npm run build`
3. Set start command: `npx prisma migrate deploy && node dist/main.js`
4. Add all env vars from the template above
5. Add a PostgreSQL addon or connect to Supabase

### Option 3: Docker (Full Stack)

Create `Dockerfile.api`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm ci --production
COPY apps/api/ ./
RUN npx prisma generate && npm run build
EXPOSE 8005
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

Create `Dockerfile.web`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build
EXPOSE 3005
CMD ["npm", "start"]
```

```bash
docker build -f Dockerfile.api -t pharmaops-api .
docker build -f Dockerfile.web -t pharmaops-web .

docker run -d -p 8005:8005 --env-file apps/api/.env pharmaops-api
docker run -d -p 3005:3005 -e NEXT_PUBLIC_API_BASE_URL=http://your-api:8005 pharmaops-web
```

---

## AI Chat Setup (Optional)

AI Chat requires a running LLM. Three options:

### Ollama (Free, Local)

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model
ollama pull llama3.2

# Set in .env:
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

### OpenAI (Cloud, Paid)

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4o-mini
```

### Disable AI Chat

```env
AI_ENABLED=false
```

The rest of the application works fully without AI Chat.

---

## Test Credentials

After running the seed, these accounts are available:

| Role             | Email                          | Password    |
|------------------|-------------------------------|-------------|
| Admin            | admin@local                    | admin123    |
| Company Manager  | manager@local                  | password123 |
| Elmhurst Pharm.  | info@elmrx.com                 | password123 |
| Thriftcare Pharm. | info@thriftcarepharmacy.com   | password123 |
| Heidi Pharmacy   | info@heidirx.com               | password123 |
| Care Well Pharm. | info@carewellphcy.com          | password123 |
| Batish Drugs     | info@batishdrugs.com           | password123 |
| Thrift Care Rx   | info@thriftcarerx.com          | password123 |
| Branch Brook     | info@branchbrookpharmacy.com   | password123 |
| Mason Pharmacy   | info@masonrx.com               | password123 |
| VIM Drugs        | info@vimdrugs.com              | password123 |
| Hill Pharmacy    | info@hillphcy.com              | password123 |

---

## Running API Tests

An end-to-end test script is included:

```bash
# Make sure the API is running first
./scripts/test-api.sh

# Or test against a specific host:
./scripts/test-api.sh https://api.your-domain.com
```

This tests all 119 API endpoints including authentication, RBAC, invoice lifecycle, SLA, and more.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED :5432` | PostgreSQL not running. Start with `docker compose up -d postgres` |
| `ECONNREFUSED :8005` | API not running. Start with `cd apps/api && npm run dev` |
| Prisma migration fails | Check `DATABASE_URL` is correct and DB is accessible |
| CORS errors | Add your frontend URL to `CORS_ORIGIN` in API `.env` |
| AI Chat returns errors | Check `AI_ENABLED=true` and LLM is running (`ollama serve`) |
| File uploads fail | Check Supabase config and `invoices` bucket exists |
| Login fails after seed | Re-run seed: `npx ts-node --transpile-only prisma/seed-demo.ts` |

---

## Key Ports

| Service    | Default Port |
|------------|-------------|
| Web UI     | 3005        |
| API        | 8005        |
| PostgreSQL | 5432        |
| Ollama     | 11434       |
| Supabase   | 54331-54332 |

---

## Production Checklist

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Set `CORS_ORIGIN` to your actual frontend domain (not `*`)
- [ ] Use a managed PostgreSQL with backups (Supabase, RDS, etc.)
- [ ] Set up SSL/HTTPS (Let's Encrypt or cloud provider)
- [ ] Configure file storage (Supabase Storage bucket)
- [ ] Change default passwords after first login
- [ ] Set up PM2 or systemd for process management
- [ ] Configure log rotation
- [ ] Set up monitoring/health checks on `/health` and `/ready`
