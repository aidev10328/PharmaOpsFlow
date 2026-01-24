# PharmaOpsFlow

Multi-pharmacy invoice intake and processing system with role-based access, AI-assisted invoice capture, deadline tracking (5th/10th), centralized approvals/payments, dashboards by pharmacy, and a manager chatbot for search and insights.

## Tech Stack

- **Frontend**: Next.js 14+ (App Router) with React 18
- **Backend**: NestJS with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT with Bearer tokens + RBAC
- **Styling**: Tailwind CSS

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+ (or Docker)
- npm

### Setup

```bash
# 1. Start PostgreSQL (via Docker)
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your database URL and JWT secret

# 4. Generate Prisma client
npm run db:generate

# 5. Run database migration
npx prisma migrate dev --name add_pharmacy_tenancy

# 6. Seed the database
npm run db:seed

# 7. Start development servers
npm run dev
```

**Ports:**
- API: http://localhost:4000
- Web: http://localhost:3000

## Test Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| ADMIN | admin@local | admin123 | Full system access |
| COMPANY_MANAGER | manager@local | password123 | All 10 pharmacies in org |
| PHARMACY_USER | pharmacy1@local | password123 | P01 (Downtown Pharmacy) |
| PHARMACY_ADMIN | pharmacy2@local | password123 | P02 (Uptown Pharmacy) |

## Role-Based Access Control (RBAC)

### Global Roles (User.role)

| Role | Description |
|------|-------------|
| `ADMIN` | Full system access - bypasses all guards |
| `COMPANY_MANAGER` | Access to all pharmacies within their organization |
| `PHARMACY_ADMIN` | Admin access to assigned pharmacies only |
| `PHARMACY_USER` | User access to assigned pharmacies only |
| `READ_ONLY` | Read-only access to assigned pharmacies |

### Authorization Flow

1. **ADMIN** - Bypasses all guards
2. **COMPANY_MANAGER** - Checked against `user.orgId === pharmacy.orgId`
3. **PHARMACY_*** - Checked via `PharmacyMember` table

## Project Structure

```
pharmaopsflow/
├── apps/
│   ├── api/                          # NestJS Backend
│   │   ├── src/
│   │   │   ├── auth/                 # JWT authentication
│   │   │   │   ├── auth.service.ts   # Login, register, JWT
│   │   │   │   └── jwt.strategy.ts   # JWT validation
│   │   │   ├── common/
│   │   │   │   ├── decorators/       # @Roles, @PharmacyScope
│   │   │   │   ├── enums/            # Role, MemberRole enums
│   │   │   │   └── guards/           # JwtAuthGuard, RolesGuard, PharmacyScopeGuard
│   │   │   ├── pharmacy/             # Pharmacy module
│   │   │   │   ├── pharmacy.service.ts
│   │   │   │   └── pharmacy.controller.ts
│   │   │   └── prisma.service.ts
│   │   └── prisma/
│   │       ├── schema.prisma         # Database models
│   │       └── seed.ts               # Test data
│   └── web/                          # Next.js Frontend
│       ├── app/
│       │   ├── login/
│       │   └── (dashboard)/
│       │       └── dashboard/
│       │           ├── admin/        # Admin dashboard
│       │           ├── manager/      # Manager dashboard
│       │           └── pharmacy/     # Pharmacy user dashboard
│       └── components/
│           └── AuthProvider.tsx      # Auth context + types
├── .env.example
└── docker-compose.yml
```

## API Endpoints

### Authentication
- `POST /auth/login` - Login with email/password
- `POST /auth/register` - Register new user
- `GET /auth/me` - Get current user with org + memberships

### Pharmacies
- `GET /pharmacies` - List accessible pharmacies (role-filtered)
- `GET /pharmacies/:pharmacyId` - Get pharmacy details (guarded)
- `GET /pharmacies/:pharmacyId/members` - List pharmacy members (PHARMACY_ADMIN+)

## Guards & Decorators

### RolesGuard
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.COMPANY_MANAGER)
@Get('admin-only')
async adminEndpoint() { ... }
```

### PharmacyScopeGuard
```typescript
@UseGuards(JwtAuthGuard, PharmacyScopeGuard)
@PharmacyScope({ paramName: 'pharmacyId' })
@Get(':pharmacyId/invoices')
async getInvoices(@Param('pharmacyId') pharmacyId: string) { ... }
```

## Database Models

### Core Models
- **Org** - Organization (multi-tenant root)
- **Pharmacy** - Individual pharmacy location
- **PharmacyMember** - User-to-pharmacy assignments with role
- **User** - Extended with `orgId` and global `role`

### Seeded Data
- 1 Organization: "Main Company"
- 10 Pharmacies: P01 through P10
- 4 Users with different roles

## Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/pharmaopsflow
JWT_SECRET=your-secret-key-min-32-chars
API_PORT=4000
CORS_ORIGIN=http://localhost:3000
```

## Testing the Implementation

1. **Login as different users** to see role-based dashboards
2. **Call `GET /pharmacies`** to see filtered pharmacy lists
3. **Try accessing** `/pharmacies/:id` with different users

```bash
# Get token
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"pharmacy1@local","password":"password123"}'

# List accessible pharmacies
curl http://localhost:4000/pharmacies \
  -H "Authorization: Bearer <token>"
```

## License

Private - PharmaOpsFlow
