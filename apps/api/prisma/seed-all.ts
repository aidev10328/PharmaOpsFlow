import { PrismaClient, InvoiceStatus, EntryMethod, DocumentType, RequirementFrequency } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'child_process';
import * as path from 'path';

/**
 * PharmaOpsFlow — Unified Seed (Schema + Data + Requirements)
 *
 * This single script does EVERYTHING needed to set up a new environment:
 *
 *   STEP 1: Schema — runs `prisma generate` + `prisma migrate deploy`
 *   STEP 2: Data   — clears all existing data and creates:
 *     - 1 Organization
 *     - 10 Pharmacies
 *     - 12 Users (admin, manager, 10 pharmacy users)
 *     - Manager ↔ Pharmacy assignments
 *     - Reference data (frequencies, categories, invoice types, vendors)
 *     - 50+ Sample invoices in various statuses
 *     - Monthly invoice requirements (SLA data)
 *     - SLA events, notification logs, support tickets
 *   STEP 3: Requirements — creates real invoice requirements for 4 pharmacies:
 *     - Branch Brook Pharmacy (15 requirements)
 *     - Hill Pharmacy (13 requirements)
 *     - Mason Pharmacy (16 requirements)
 *     - VIM Drugs (18 requirements)
 *     - 19 invoice types, 29 vendors from the real spreadsheet
 *     - Requirement instances for current month + next 2 months
 *
 * Usage:
 *   cd apps/api
 *   npx ts-node --transpile-only prisma/seed-all.ts
 *
 * Prerequisites:
 *   - DATABASE_URL set in .env
 *   - PostgreSQL running and accessible
 *
 * Credentials after seed:
 *   ADMIN:            admin@local / admin123
 *   COMPANY_MANAGER:  manager@local / password123
 *   PHARMACY_USERS:   info@{domain}.com / password123
 */

const prisma = new PrismaClient();

// ─── Utilities ───────────────────────────────────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDecimal(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ─── STEP 1: Schema ─────────────────────────────────────────

async function runSchema() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  STEP 1: Schema (Prisma Generate + Migrate)  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const apiDir = path.resolve(__dirname, '..');

  try {
    console.log('Running: npx prisma generate');
    execSync('npx prisma generate', { cwd: apiDir, stdio: 'inherit' });
    console.log('  ✓ Prisma client generated\n');
  } catch (e) {
    console.error('  ✗ prisma generate failed:', e);
    throw e;
  }

  try {
    console.log('Running: npx prisma migrate deploy');
    execSync('npx prisma migrate deploy', { cwd: apiDir, stdio: 'inherit' });
    console.log('  ✓ All migrations applied (existing ones skipped)\n');
  } catch (e) {
    console.error('  ✗ prisma migrate deploy failed:', e);
    throw e;
  }
}

// ─── STEP 2: Demo Data ──────────────────────────────────────

async function seedDemoData() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  STEP 2: Demo Data (Users, Invoices, etc.)   ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Hash passwords
  const password = await bcrypt.hash('password123', 10);
  const adminPassword = await bcrypt.hash('admin123', 10);

  // ── Clean up ALL existing data ──
  console.log('Cleaning up existing data...');
  await prisma.supportTicketAssignment.deleteMany({});
  await prisma.supportTicketStatusHistory.deleteMany({});
  await prisma.supportTicketComment.deleteMany({});
  await prisma.supportTicketAttachment.deleteMany({});
  await prisma.supportTicket.deleteMany({});
  await prisma.requirementInstance.deleteMany({});
  await prisma.invoiceRequirement.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.invoiceExtraction.deleteMany({});
  await prisma.invoiceEvent.deleteMany({});
  await prisma.invoiceFile.deleteMany({});
  await prisma.slaEvent.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.notificationPreference.deleteMany({});
  await prisma.monthlyInvoiceRequirement.deleteMany({});
  await prisma.requiredInvoiceType.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.invoiceCategory.deleteMany({});
  await prisma.frequency.deleteMany({});
  await prisma.invoiceType.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.managerPharmacy.deleteMany({});
  await prisma.pharmacyMember.deleteMany({});
  await prisma.pharmacy.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.org.deleteMany({});
  console.log('  ✓ All existing data cleared.\n');

  // ── 1. Organization ──
  console.log('Creating organization...');
  const org = await prisma.org.create({
    data: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Main Company',
      timezone: 'America/New_York',
      phone: '(212) 555-0000',
      email: 'admin@maincompany.com',
    },
  });
  console.log(`  ✓ ${org.name}\n`);

  // ── 2. Pharmacies ──
  console.log('Creating pharmacies...');
  const pharmacyData = [
    { code: 'ELM', name: 'Elmhurst Pharmacy', street: '75-23 Broadway', city: 'Elmhurst', state: 'NY', zip: '11373', phone: '(718) 424-5500', website: 'https://www.elmhurstpharmacy.com' },
    { code: 'TCP', name: 'Thriftcare Pharmacy', street: '759 Washington Ave', city: 'Brooklyn', state: 'NY', zip: '11238', phone: '(718) 783-1010', website: 'https://www.thriftcarepharmacy.com' },
    { code: 'HDP', name: 'Heidi Pharmacy', street: '522 West 181st Street', city: 'New York', state: 'NY', zip: '10033', phone: '(212) 927-2800', website: 'https://www.heidipharmacy.com' },
    { code: 'CWP', name: 'Care Well Pharmacy', street: '826 East Tremont Ave', city: 'Bronx', state: 'NY', zip: '10460', phone: '(718) 842-1600', website: 'https://www.carewellpharmacy.com' },
    { code: 'BTD', name: 'Batish Drugs', street: '378 Lafayette Avenue', city: 'Brooklyn', state: 'NY', zip: '11238', phone: '(718) 636-0202', website: 'https://www.batishdrugs.com' },
    { code: 'TCR', name: 'Thrift Care Pharmacy', street: '524 Nostrand Avenue', city: 'Brooklyn', state: 'NY', zip: '11216', phone: '(718) 622-3050', website: 'https://www.thriftcarerx.com' },
    { code: 'BBP', name: 'Branch Brook Pharmacy', street: '917 Franklin Avenue', city: 'Newark', state: 'NJ', zip: '07102', phone: '(973) 481-8800', website: 'https://www.branchbrookpharmacy.com' },
    { code: 'MSN', name: 'Mason Pharmacy', street: '1255 Castle Hill Avenue', city: 'Bronx', state: 'NY', zip: '10462', phone: '(718) 828-7400', website: 'https://www.masonpharmacy.com' },
    { code: 'VIM', name: 'VIM Drugs', street: '3835 Broadway', city: 'New York', state: 'NY', zip: '10032', phone: '(212) 781-9500', website: 'https://www.vimdrugs.com' },
    { code: 'HLP', name: 'Hill Pharmacy', street: '2197 Westchester Avenue', city: 'Bronx', state: 'NY', zip: '10462', phone: '(718) 792-3100', website: 'https://www.hillpharmacy.com' },
  ];

  const pharmacies: any[] = [];
  for (const data of pharmacyData) {
    const pharmacy = await prisma.pharmacy.create({
      data: { orgId: org.id, ...data, timezone: 'America/New_York' },
    });
    pharmacies.push(pharmacy);
    console.log(`  ✓ ${pharmacy.name} (${pharmacy.code})`);
  }

  // ── 3. Users ──
  console.log('\nCreating users...');

  const admin = await prisma.user.create({
    data: {
      email: 'admin@local',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Admin',
      phone: '(212) 555-0001',
      role: 'ADMIN',
      orgId: null,
    },
  });
  console.log(`  ✓ ADMIN: ${admin.email} / admin123`);

  const manager = await prisma.user.create({
    data: {
      email: 'manager@local',
      passwordHash: password,
      firstName: 'Sarah',
      lastName: 'Johnson',
      phone: '(212) 555-0002',
      role: 'COMPANY_MANAGER',
      orgId: org.id,
    },
  });
  console.log(`  ✓ COMPANY_MANAGER: ${manager.email} / password123`);

  const pharmacyUserData = [
    { email: 'info@elmrx.com', firstName: 'Elmhurst', lastName: 'Pharmacy', phone: '(718) 424-5501' },
    { email: 'info@thriftcarepharmacy.com', firstName: 'Thriftcare', lastName: 'Pharmacy', phone: '(718) 783-1011' },
    { email: 'info@heidirx.com', firstName: 'Heidi', lastName: 'Pharmacy', phone: '(212) 927-2801' },
    { email: 'info@carewellphcy.com', firstName: 'CareWell', lastName: 'Pharmacy', phone: '(718) 842-1601' },
    { email: 'info@batishdrugs.com', firstName: 'Batish', lastName: 'Drugs', phone: '(718) 636-0203' },
    { email: 'info@thriftcarerx.com', firstName: 'ThriftCare', lastName: 'Pharmacy', phone: '(718) 622-3051' },
    { email: 'info@branchbrookpharmacy.com', firstName: 'BranchBrook', lastName: 'Pharmacy', phone: '(973) 481-8801' },
    { email: 'info@masonrx.com', firstName: 'Mason', lastName: 'Pharmacy', phone: '(718) 828-7401' },
    { email: 'info@vimdrugs.com', firstName: 'VIM', lastName: 'Drugs', phone: '(212) 781-9501' },
    { email: 'info@hillphcy.com', firstName: 'Hill', lastName: 'Pharmacy', phone: '(718) 792-3101' },
  ];

  const pharmacyUsers: any[] = [];
  for (const data of pharmacyUserData) {
    const user = await prisma.user.create({
      data: { ...data, passwordHash: password, role: 'PHARMACY_USER', orgId: org.id },
    });
    pharmacyUsers.push(user);
    console.log(`  ✓ PHARMACY_USER: ${user.email} / password123`);
  }

  // ── 4. Pharmacy Memberships ──
  console.log('\nCreating pharmacy memberships...');
  for (let i = 0; i < pharmacies.length; i++) {
    await prisma.pharmacyMember.create({
      data: { userId: pharmacyUsers[i].id, pharmacyId: pharmacies[i].id, memberRole: 'PHARMACY_USER' },
    });
  }
  console.log(`  ✓ ${pharmacies.length} memberships created`);

  console.log('\nAssigning manager to pharmacies...');
  for (const pharmacy of pharmacies) {
    await prisma.managerPharmacy.create({
      data: { userId: manager.id, pharmacyId: pharmacy.id },
    });
  }
  console.log(`  ✓ Manager assigned to all ${pharmacies.length} pharmacies`);

  // ── 5. Reference Data ──
  console.log('\nCreating reference data...');

  // Frequencies (including ONE_TIME for requirements)
  const frequencyData = [
    { code: 'WEEKLY', name: 'Weekly', description: 'Every week', sortOrder: 1 },
    { code: 'BI_WEEKLY', name: 'Bi-Weekly', description: 'Every two weeks', sortOrder: 2 },
    { code: 'MONTHLY', name: 'Monthly', description: 'Once a month', sortOrder: 3 },
    { code: 'QUARTERLY', name: 'Quarterly', description: 'Every three months', sortOrder: 4 },
    { code: 'SEMI_ANNUALLY', name: 'Semi-Annually', description: 'Twice a year', sortOrder: 5 },
    { code: 'ANNUALLY', name: 'Annually', description: 'Once a year', sortOrder: 6 },
    { code: 'ONE_TIME', name: 'One-Time', description: 'One-time only', sortOrder: 7 },
  ];
  for (const data of frequencyData) {
    await prisma.frequency.create({ data: { orgId: org.id, ...data } });
  }
  console.log(`  ✓ ${frequencyData.length} frequencies`);

  // Invoice Categories
  const categoryData = [
    { code: 'INVOICE', name: 'Invoice', description: 'Standard vendor invoice', sortOrder: 1 },
    { code: 'STATEMENT', name: 'Statement', description: 'Account statement', sortOrder: 2 },
    { code: 'CREDIT_MEMO', name: 'Credit Memo', description: 'Credit memo or refund', sortOrder: 3 },
    { code: 'RECEIPT', name: 'Receipt', description: 'Payment receipt', sortOrder: 4 },
  ];
  for (const data of categoryData) {
    await prisma.invoiceCategory.create({ data: { orgId: org.id, ...data } });
  }
  console.log(`  ✓ ${categoryData.length} invoice categories`);

  // ── All Invoice Types (merged: 5 base + 19 from requirements spreadsheet) ──
  const allInvoiceTypeDefs = [
    // Base types
    { code: 'RENT', name: 'Rent', description: 'Rent and lease payments', isRequired: true },
    { code: 'ELECTRICITY', name: 'Electricity', description: 'Electricity utility bills', isRequired: true },
    { code: 'VENDOR_INVOICE', name: 'Vendor Invoice', description: 'Drug purchases from wholesalers', isRequired: false },
    { code: 'INTERNET', name: 'Internet', description: 'Internet and telecom services', isRequired: false },
    { code: 'INSURANCE', name: 'Insurance', description: 'Insurance premiums', isRequired: false },
    // Requirements spreadsheet types
    { code: 'PHARMACY_SOFTWARE', name: 'Pharmacy Software Payment Bill', description: 'Pharmacy software fees', isRequired: false },
    { code: 'COPY_MACHINE', name: 'Copy Machine Payment', description: 'Copy machine lease/service', isRequired: false },
    { code: 'GARBAGE_RECYCLING', name: 'Garbage Removal - Recycling', description: 'Waste removal services', isRequired: false },
    { code: 'CARE_CLAIM', name: 'Care Claim Monthly Fee', description: 'Care claim processing fees', isRequired: false },
    { code: 'ELECTRICAL_GAS', name: 'Electrical & Gas', description: 'Electric and gas utilities', isRequired: false },
    { code: 'GOVT_TAXES', name: 'Govt Taxes', description: 'Government tax payments', isRequired: false },
    { code: 'FIRE_ALARM', name: 'Fire Alarm', description: 'Fire alarm monitoring service', isRequired: false },
    { code: 'LABELS_VIALS', name: 'Labels & Vials', description: 'Pharmacy labels and vials supply', isRequired: false },
    { code: 'WHOLESALE_1', name: 'Whole Sale Supplier - 1', description: 'Primary wholesale supplier', isRequired: false },
    { code: 'WHOLESALE_2', name: 'Whole Sale Supplier - 2', description: 'Secondary wholesale supplier', isRequired: false },
    { code: 'WHOLESALE_3', name: 'Whole Sale Supplier - 3', description: 'Tertiary wholesale supplier', isRequired: false },
    { code: 'WHOLESALE_4', name: 'Whole Sale Supplier - 4', description: 'Wholesale supplier 4', isRequired: false },
    { code: 'WHOLESALE_5', name: 'Whole Sale Supplier - 5', description: 'Wholesale supplier 5', isRequired: false },
    { code: 'WHOLESALE_6', name: 'Whole Sale Supplier - 6', description: 'Wholesale supplier 6', isRequired: false },
    { code: 'WHOLESALE_7', name: 'Whole Sale Supplier - 7', description: 'Wholesale supplier 7', isRequired: false },
    { code: 'WHOLESALE_8', name: 'Whole Sale Supplier - 8', description: 'Wholesale supplier 8', isRequired: false },
    { code: 'PASSPORT_PHOTOS', name: 'Passport Photos', description: 'Passport photo services', isRequired: false },
  ];

  const invoiceTypeMap: Record<string, any> = {};
  for (const data of allInvoiceTypeDefs) {
    const it = await prisma.invoiceType.create({
      data: { orgId: org.id, code: data.code, name: data.name, description: data.description, isRequired: data.isRequired },
    });
    invoiceTypeMap[data.code] = it;
  }
  console.log(`  ✓ ${allInvoiceTypeDefs.length} invoice types`);

  // ── All Vendors (merged: 4 base + 29 from requirements spreadsheet) ──
  const allVendorDefs = [
    // Base vendors
    { code: 'MCKESSON_CORP', name: 'McKesson Corporation', paymentTerms: 'Net 30', email: 'ar@mckesson.com', phone: '1-800-555-0101', pharmacyId: null as string | null },
    { code: 'CARDINAL_HEALTH', name: 'Cardinal Health', paymentTerms: 'Net 30', email: 'payments@cardinalhealth.com', phone: '1-800-555-0102', pharmacyId: null as string | null },
    { code: 'NAT_GRID', name: 'National Grid Electric', paymentTerms: 'Net 21', email: 'business@nationalgrid.com', phone: '1-800-555-0109', pharmacyId: null as string | null },
    { code: 'ELM_LOCAL', name: 'Elmhurst Local Supply Co.', paymentTerms: 'Net 15', email: 'orders@elmhurstlocal.com', phone: '(718) 424-9900', pharmacyId: pharmacies[0].id },
    // Requirements spreadsheet vendors
    { code: 'BEST_RX', name: 'Best RX', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'BLUEBIRD_COPIER', name: 'Bluebird Copier', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'CALI_CARTING', name: 'Cali Carting', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'OMNISYS', name: 'Omnisys', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'OPTIMUM', name: 'Optimum', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'PSEG', name: 'PSE&G', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'MILAN_PROPERTIES', name: 'Milan Properties', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'NJ_TAX_DEPT', name: 'NJ Div of Tax Department', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'PROTEK_SECURITY', name: 'Pro-Tek Security', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'MC_CRACKEN', name: 'MC Cracken', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'KINRAY', name: 'Kinray', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'MCKESSON', name: 'McKesson', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'AMERISOURCE', name: 'Amerisource', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'ANDA', name: 'ANDA', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'TOP_RX', name: 'Top RX', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'CON_ED', name: 'Con Ed', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'LANGSAM_PROPERTIES', name: 'Langsam Properties', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: '5_BOROUGH_WASTE', name: '5 Borough Waste Removal', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'WORLD_COPIER', name: 'World Copier', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'AAA_ID_PASSPORT', name: 'AAA ID Passport', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'TOP_ALARM', name: 'Top Alarm Systems', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'SOPHER_MGMT', name: 'Sopher Management', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'JLC_COPY', name: 'JLC Copy Inc.', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'CITY_MED_RX', name: 'City Med Rx', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'SPECTRUM', name: 'Spectrum', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'FRIEDLAND_PROPERTIES', name: 'Friedland Properties', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'ACTION_ENV', name: 'Action Env. Services', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'BOB_BILA', name: 'Bob-Bila', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
    { code: 'JJJ_DISTRIBUTROS', name: 'JJJ Distributros', paymentTerms: null, email: null, phone: null, pharmacyId: null as string | null },
  ];

  const vendorMap: Record<string, any> = {};
  for (const data of allVendorDefs) {
    const v = await prisma.vendor.create({
      data: {
        orgId: org.id,
        name: data.name,
        paymentTerms: data.paymentTerms,
        email: data.email,
        phone: data.phone,
        pharmacyId: data.pharmacyId,
      },
    });
    vendorMap[data.code] = v;
  }
  console.log(`  ✓ ${allVendorDefs.length} vendors`);

  // Required Invoice Types
  for (const it of Object.values(invoiceTypeMap).filter((t: any) => t.isRequired)) {
    await prisma.requiredInvoiceType.create({
      data: { orgId: org.id, invoiceTypeId: it.id },
    });
  }
  console.log(`  ✓ Required invoice types configured`);

  // ── 6. Sample Invoices ──
  console.log('\nCreating sample invoices...');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const statuses: InvoiceStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED', 'NEEDS_INFO'];
  const statusWeights = [5, 10, 10, 5, 40, 5, 5];
  let invoiceCount = 0;

  // Use only the base invoice types for sample invoices
  const baseInvoiceTypes = ['RENT', 'ELECTRICITY', 'VENDOR_INVOICE', 'INTERNET', 'INSURANCE'].map(c => invoiceTypeMap[c]);
  const baseVendors = ['MCKESSON_CORP', 'CARDINAL_HEALTH', 'NAT_GRID', 'ELM_LOCAL'].map(c => vendorMap[c]);

  function weightedStatus(): InvoiceStatus {
    const total = statusWeights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < statuses.length; i++) {
      r -= statusWeights[i];
      if (r <= 0) return statuses[i];
    }
    return 'PAID';
  }

  for (const pharmacy of pharmacies) {
    const count = randomInt(5, 8);
    for (let j = 0; j < count; j++) {
      const monthOffset = randomInt(0, 2);
      const invoiceMonth = new Date(currentYear, currentMonth - monthOffset, 1);
      const invDate = new Date(currentYear, currentMonth - monthOffset, randomInt(1, 28));
      const dueDate = addDays(invDate, randomInt(15, 45));
      const status = weightedStatus();
      const vendor = randomElement(baseVendors.filter(v => !v.pharmacyId || v.pharmacyId === pharmacy.id));
      const invoiceType = randomElement(baseInvoiceTypes);
      const amount = randomDecimal(200, 15000);
      const invNumber = `INV-${pharmacy.code}-${invoiceMonth.getFullYear()}${String(invoiceMonth.getMonth() + 1).padStart(2, '0')}-${String(j + 1).padStart(3, '0')}`;

      const invoiceData: any = {
        pharmacyId: pharmacy.id,
        vendorId: vendor.id,
        invoiceTypeId: invoiceType.id,
        invoiceNumber: invNumber,
        documentType: 'INVOICE' as DocumentType,
        invoiceDate: invDate,
        dueDate: dueDate,
        amount: amount,
        currency: 'USD',
        description: `${invoiceType.name} - ${vendor.name}`,
        status: status,
        entryMethod: 'MANUAL' as EntryMethod,
        needsReview: status === 'NEEDS_INFO',
      };

      if (['SUBMITTED', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED', 'NEEDS_INFO'].includes(status)) {
        invoiceData.submittedAt = addDays(invDate, randomInt(1, 5));
      }
      if (['APPROVED', 'SCHEDULED', 'PAID'].includes(status)) {
        invoiceData.approvedAt = addDays(invoiceData.submittedAt || invDate, randomInt(1, 3));
        invoiceData.approvedById = admin.id;
      }
      if (['SCHEDULED', 'PAID'].includes(status)) {
        invoiceData.scheduledPaymentDate = addDays(invoiceData.approvedAt || invDate, randomInt(3, 14));
      }
      if (status === 'PAID') {
        invoiceData.paidAt = addDays(invoiceData.scheduledPaymentDate || invDate, randomInt(0, 5));
      }

      const invoice = await prisma.invoice.create({ data: invoiceData });

      // Invoice events
      const events: any[] = [
        { invoiceId: invoice.id, eventType: 'CREATED', userId: randomElement(pharmacyUsers).id, createdAt: invDate },
      ];
      if (invoiceData.submittedAt) {
        events.push({ invoiceId: invoice.id, eventType: 'SUBMITTED', userId: randomElement(pharmacyUsers).id, createdAt: invoiceData.submittedAt });
      }
      if (invoiceData.approvedAt) {
        events.push({ invoiceId: invoice.id, eventType: 'APPROVED', userId: admin.id, createdAt: invoiceData.approvedAt });
      }
      if (status === 'REJECTED') {
        events.push({ invoiceId: invoice.id, eventType: 'REJECTED', userId: admin.id, notes: 'Duplicate or incorrect amount', createdAt: addDays(invoiceData.submittedAt || invDate, 2) });
      }
      if (status === 'NEEDS_INFO') {
        events.push({ invoiceId: invoice.id, eventType: 'NEEDS_INFO', userId: admin.id, notes: 'Missing supporting documentation', createdAt: addDays(invoiceData.submittedAt || invDate, 1) });
      }
      if (invoiceData.paidAt) {
        events.push({ invoiceId: invoice.id, eventType: 'PAID', userId: admin.id, createdAt: invoiceData.paidAt });
      }

      for (const event of events) {
        await prisma.invoiceEvent.create({ data: event });
      }
      invoiceCount++;
    }
  }
  console.log(`  ✓ ${invoiceCount} invoices created with events`);

  // ── 7. Monthly Invoice Requirements (SLA) ──
  console.log('\nCreating SLA requirements...');
  const months: string[] = [];
  for (let m = 0; m < 3; m++) {
    const d = new Date(currentYear, currentMonth - m, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  for (const pharmacy of pharmacies) {
    for (let i = 0; i < months.length; i++) {
      const yearMonth = months[i];
      const isCurrentMonth = i === 0;
      const isCompliant = isCurrentMonth ? Math.random() > 0.5 : Math.random() > 0.3;
      const expectedCount = randomInt(1, 3);
      const submittedCount = isCompliant ? expectedCount : randomInt(0, expectedCount - 1);
      const processedCount = isCompliant ? submittedCount : Math.max(0, submittedCount - randomInt(0, 1));

      await prisma.monthlyInvoiceRequirement.create({
        data: {
          pharmacyId: pharmacy.id,
          yearMonth,
          expectedCount,
          submittedCount,
          processedCount,
          isMet: submittedCount >= expectedCount && processedCount >= expectedCount,
        },
      });
    }
  }
  console.log(`  ✓ ${pharmacies.length * months.length} monthly requirements`);

  // ── 8. SLA Events ──
  console.log('\nCreating SLA events...');
  let slaEventCount = 0;
  for (const pharmacy of pharmacies) {
    for (let i = 1; i < months.length; i++) {
      if (Math.random() > 0.6) {
        await prisma.slaEvent.create({
          data: { pharmacyId: pharmacy.id, yearMonth: months[i], eventType: 'SUBMISSION_MISSED', notes: `${pharmacy.name} missed submission deadline` },
        });
        slaEventCount++;
      }
      if (Math.random() > 0.7) {
        await prisma.slaEvent.create({
          data: { pharmacyId: pharmacy.id, yearMonth: months[i], eventType: 'PROCESSING_MISSED', notes: `${pharmacy.name} processing overdue` },
        });
        slaEventCount++;
      }
    }
    if (Math.random() > 0.4) {
      await prisma.slaEvent.create({
        data: { pharmacyId: pharmacy.id, yearMonth: months[0], eventType: 'SUBMISSION_REMINDER_SENT', notes: 'Automated submission reminder' },
      });
      slaEventCount++;
    }
  }
  console.log(`  ✓ ${slaEventCount} SLA events`);

  // ── 9. Notification Logs ──
  console.log('\nCreating notification logs...');
  let notifCount = 0;
  for (const pharmacy of pharmacies.slice(0, 5)) {
    await prisma.notificationLog.create({
      data: {
        pharmacyId: pharmacy.id,
        type: 'sla_reminder',
        channel: 'in_app',
        subject: 'Invoice Submission Reminder',
        body: `Reminder: ${pharmacy.name} has invoices due for submission.`,
        sentAt: addDays(now, -randomInt(1, 10)),
      },
    });
    notifCount++;
  }
  console.log(`  ✓ ${notifCount} notification logs`);

  // ── 10. Support Tickets ──
  console.log('\nCreating support tickets...');
  const ticketData = [
    {
      reportedByUserId: pharmacyUsers[0].id,
      reportedByName: `${pharmacyUsers[0].firstName} ${pharmacyUsers[0].lastName}`,
      reportedByEmail: pharmacyUsers[0].email,
      issueType: 'BUG' as const,
      userTitle: 'Invoice upload fails for large PDFs',
      userDescription: 'When I try to upload a PDF invoice larger than 10MB, the upload fails with no error message.',
      businessImpact: 'MAJOR' as const,
      severity: 'HIGH' as const,
      category: 'Invoice Management',
      currentStatus: 'IN_PROGRESS' as const,
      tenantId: org.id,
    },
    {
      reportedByUserId: pharmacyUsers[2].id,
      reportedByName: `${pharmacyUsers[2].firstName} ${pharmacyUsers[2].lastName}`,
      reportedByEmail: pharmacyUsers[2].email,
      issueType: 'FEATURE_REQUEST' as const,
      userTitle: 'Add bulk invoice download',
      userDescription: 'It would be helpful to download all invoices for a month as a ZIP file.',
      businessImpact: 'MINOR' as const,
      severity: 'LOW' as const,
      category: 'Invoice Management',
      currentStatus: 'SUBMITTED' as const,
      tenantId: org.id,
    },
    {
      reportedByUserId: pharmacyUsers[4].id,
      reportedByName: `${pharmacyUsers[4].firstName} ${pharmacyUsers[4].lastName}`,
      reportedByEmail: pharmacyUsers[4].email,
      issueType: 'QUESTION' as const,
      userTitle: 'How to change pharmacy contact info?',
      userDescription: 'Our pharmacy phone number has changed. Where can I update this?',
      businessImpact: 'COSMETIC' as const,
      severity: 'LOW' as const,
      category: 'Account Management',
      currentStatus: 'CLOSED' as const,
      tenantId: org.id,
    },
  ];

  for (let i = 0; i < ticketData.length; i++) {
    await prisma.supportTicket.create({
      data: { ticketNumber: `SUP-${String(i + 1).padStart(5, '0')}`, ...ticketData[i] },
    });
  }
  console.log(`  ✓ ${ticketData.length} support tickets`);

  // Return data needed by Step 3
  return { org, pharmacies, invoiceTypeMap, vendorMap, allInvoiceTypeDefs, allVendorDefs };
}

// ─── STEP 3: Real Requirements for 4 Pharmacies ─────────────

async function seedRequirements(ctx: {
  org: any;
  pharmacies: any[];
  invoiceTypeMap: Record<string, any>;
  vendorMap: Record<string, any>;
  allInvoiceTypeDefs: any[];
  allVendorDefs: any[];
}) {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  STEP 3: Real Requirements (4 Pharmacies)    ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const { pharmacies, invoiceTypeMap, vendorMap, allInvoiceTypeDefs, allVendorDefs } = ctx;

  // Map pharmacies by name
  const pharmacyByName: Record<string, any> = {};
  for (const p of pharmacies) {
    pharmacyByName[p.name] = p;
  }

  const branchBrook = pharmacyByName['Branch Brook Pharmacy'];
  const hillPharmacy = pharmacyByName['Hill Pharmacy'];
  const masonRx = pharmacyByName['Mason Pharmacy'];
  const vimDrugs = pharmacyByName['VIM Drugs'];

  if (!branchBrook || !hillPharmacy || !masonRx || !vimDrugs) {
    console.error('Missing pharmacies:', {
      branchBrook: !!branchBrook,
      hillPharmacy: !!hillPharmacy,
      masonRx: !!masonRx,
      vimDrugs: !!vimDrugs,
    });
    throw new Error('One or more target pharmacies not found');
  }

  function parseSubmissionDay(text: string): number {
    if (!text || text === '') return 5;
    const t = text.toLowerCase().trim();
    if (t.includes('18')) return 18;
    if (t.includes('10')) return 10;
    if (t.includes('8')) return 8;
    if (t.includes('5')) return 5;
    if (t.includes('1st') || t === '1st') return 1;
    if (t.includes('1 and 15')) return 1;
    return 5;
  }

  type ReqDef = {
    invoiceTypeCode: string;
    vendorCode: string;
    frequency: RequirementFrequency;
    submissionDay: string;
    processingDueDay: number;
  };

  // ── Branch Brook Pharmacy (15 requirements) ──
  const branchBrookReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY', submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'BLUEBIRD_COPIER', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: 'CALI_CARTING', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'CARE_CLAIM', vendorCode: 'OMNISYS', frequency: 'MONTHLY', submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'OPTIMUM', frequency: 'MONTHLY', submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'PSEG', frequency: 'MONTHLY', submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'MILAN_PROPERTIES', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GOVT_TAXES', vendorCode: 'NJ_TAX_DEPT', frequency: 'MONTHLY', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'PROTEK_SECURITY', frequency: 'QUARTERLY', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'MCKESSON', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'ANDA', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_5', vendorCode: 'TOP_RX', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
  ];

  // ── Hill Pharmacy (13 requirements) ──
  const hillReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY', submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'CON_ED', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'OPTIMUM', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'LANGSAM_PROPERTIES', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: '5_BOROUGH_WASTE', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'WORLD_COPIER', frequency: 'MONTHLY', submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'PASSPORT_PHOTOS', vendorCode: 'AAA_ID_PASSPORT', frequency: 'MONTHLY', submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'TOP_ALARM', frequency: 'QUARTERLY', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'ANDA', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'TOP_RX', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
  ];

  // ── Mason Pharmacy (16 requirements) ──
  const masonReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY', submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'CON_ED', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'OPTIMUM', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'SOPHER_MGMT', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: '5_BOROUGH_WASTE', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'JLC_COPY', frequency: 'MONTHLY', submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'PASSPORT_PHOTOS', vendorCode: 'AAA_ID_PASSPORT', frequency: 'MONTHLY', submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'TOP_ALARM', frequency: 'QUARTERLY', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'MCKESSON', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'ANDA', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_5', vendorCode: 'TOP_RX', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_6', vendorCode: 'CITY_MED_RX', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
  ];

  // ── VIM Drugs (18 requirements) ──
  const vimReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY', submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'CON_ED', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'SPECTRUM', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'FRIEDLAND_PROPERTIES', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: 'ACTION_ENV', frequency: 'MONTHLY', submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'BLUEBIRD_COPIER', frequency: 'MONTHLY', submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'PASSPORT_PHOTOS', vendorCode: 'AAA_ID_PASSPORT', frequency: 'MONTHLY', submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'TOP_ALARM', frequency: 'QUARTERLY', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'MCKESSON', frequency: 'BI_WEEKLY', submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'ANDA', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_5', vendorCode: 'TOP_RX', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_6', vendorCode: 'CITY_MED_RX', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_7', vendorCode: 'BOB_BILA', frequency: 'QUARTERLY', submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_8', vendorCode: 'JJJ_DISTRIBUTROS', frequency: 'MONTHLY', submissionDay: '1st', processingDueDay: 5 },
  ];

  // ── Create requirements for each pharmacy ──
  async function createRequirements(pharmacyId: string, pharmacyName: string, reqs: ReqDef[]) {
    console.log(`\nCreating requirements for ${pharmacyName}...`);
    let created = 0;

    for (const req of reqs) {
      const typeObj = invoiceTypeMap[req.invoiceTypeCode];
      const vendObj = vendorMap[req.vendorCode];

      if (!typeObj) { console.error(`  ✗ Missing invoice type: ${req.invoiceTypeCode}`); continue; }
      if (!vendObj) { console.error(`  ✗ Missing vendor: ${req.vendorCode}`); continue; }

      const typeName = allInvoiceTypeDefs.find(t => t.code === req.invoiceTypeCode)?.name || req.invoiceTypeCode;
      const vendorName = allVendorDefs.find(v => v.code === req.vendorCode)?.name || req.vendorCode;
      const subDay = parseSubmissionDay(req.submissionDay);

      await prisma.invoiceRequirement.create({
        data: {
          pharmacyId,
          invoiceTypeId: typeObj.id,
          vendorId: vendObj.id,
          name: `${typeName} - ${vendorName}`,
          frequency: req.frequency,
          submissionDueDay: subDay,
          processingDueDay: subDay + req.processingDueDay,
          applicableMonths: req.frequency === 'QUARTERLY' ? '3,6,9,12' : undefined,
          isActive: true,
        },
      });
      created++;
    }
    console.log(`  ✓ ${created} requirements created`);
  }

  // Delete any generic requirements created in Step 2 for these 4 pharmacies
  // (Step 2 creates basic Rent/Electricity requirements for all pharmacies)
  await prisma.invoiceRequirement.deleteMany({
    where: { pharmacyId: { in: [branchBrook.id, hillPharmacy.id, masonRx.id, vimDrugs.id] } },
  });

  await createRequirements(branchBrook.id, 'Branch Brook Pharmacy', branchBrookReqs);
  await createRequirements(hillPharmacy.id, 'Hill Pharmacy', hillReqs);
  await createRequirements(masonRx.id, 'Mason Pharmacy', masonReqs);
  await createRequirements(vimDrugs.id, 'VIM Drugs', vimReqs);

  // ── Generate requirement instances for current month + next 2 months ──
  console.log('\nGenerating requirement instances...');

  const targetPharmacyIds = [branchBrook.id, hillPharmacy.id, masonRx.id, vimDrugs.id];
  const allRequirements = await prisma.invoiceRequirement.findMany({
    where: { pharmacyId: { in: targetPharmacyIds }, isActive: true },
    include: { pharmacy: true },
  });

  const now = new Date();
  const months: { start: Date; end: Date; label: string }[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    months.push({ start, end, label });
  }

  let instancesCreated = 0;

  for (const req of allRequirements) {
    // ONE_TIME: just one instance
    if (req.frequency === 'ONE_TIME') {
      const m = months[0];
      await prisma.requirementInstance.create({
        data: {
          requirementId: req.id,
          periodStart: m.start,
          periodEnd: m.end,
          periodLabel: m.label,
          submissionDeadline: new Date(m.start.getFullYear(), m.start.getMonth(), Math.min(req.submissionDueDay, 28)),
          processingDeadline: new Date(m.start.getFullYear(), m.start.getMonth(), Math.min(req.processingDueDay, 28)),
          status: 'PENDING',
        },
      });
      instancesCreated++;
      continue;
    }

    for (const month of months) {
      // QUARTERLY: check if month applies
      if (req.frequency === 'QUARTERLY') {
        const monthNum = month.start.getMonth() + 1;
        const applicable = (req.applicableMonths || '3,6,9,12').split(',').map(Number);
        if (!applicable.includes(monthNum)) continue;
      }

      // BI_WEEKLY: 2 instances per month
      if (req.frequency === 'BI_WEEKLY') {
        for (const biWeekDay of [1, 15]) {
          const periodStart = new Date(month.start.getFullYear(), month.start.getMonth(), biWeekDay);
          const periodEnd = biWeekDay === 1
            ? new Date(month.start.getFullYear(), month.start.getMonth(), 14, 23, 59, 59)
            : new Date(month.start.getFullYear(), month.start.getMonth() + 1, 0, 23, 59, 59);
          const periodLabel = `${month.label} (${biWeekDay === 1 ? '1st-14th' : '15th-end'})`;

          await prisma.requirementInstance.create({
            data: {
              requirementId: req.id,
              periodStart,
              periodEnd,
              periodLabel,
              submissionDeadline: new Date(month.start.getFullYear(), month.start.getMonth(), biWeekDay + 4),
              processingDeadline: new Date(month.start.getFullYear(), month.start.getMonth(), biWeekDay + 9),
              status: 'PENDING',
            },
          });
          instancesCreated++;
        }
        continue;
      }

      // MONTHLY (and others)
      await prisma.requirementInstance.create({
        data: {
          requirementId: req.id,
          periodStart: month.start,
          periodEnd: month.end,
          periodLabel: month.label,
          submissionDeadline: new Date(month.start.getFullYear(), month.start.getMonth(), Math.min(req.submissionDueDay, 28)),
          processingDeadline: new Date(month.start.getFullYear(), month.start.getMonth(), Math.min(req.processingDueDay, 28)),
          status: 'PENDING',
        },
      });
      instancesCreated++;
    }
  }

  console.log(`  ✓ ${instancesCreated} requirement instances created`);

  // Final counts
  const totalReqs = await prisma.invoiceRequirement.count();
  const totalInstances = await prisma.requirementInstance.count();
  console.log(`\n  Total requirements (all pharmacies): ${totalReqs}`);
  console.log(`  Total instances: ${totalInstances}`);
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   PharmaOpsFlow — Unified Seed               ║');
  console.log('║   Schema + Data + Requirements               ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // STEP 1: Schema
  await runSchema();

  // STEP 2: Demo Data
  const ctx = await seedDemoData();

  // STEP 3: Requirements
  await seedRequirements(ctx);

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║          ALL DONE — SEED COMPLETE             ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║                                               ║');
  console.log('║  What was set up:                             ║');
  console.log('║  ─────────────────                            ║');
  console.log('║  ✓ Schema migrations applied                  ║');
  console.log('║  ✓ 1 Organization                             ║');
  console.log('║  ✓ 10 Pharmacies                              ║');
  console.log('║  ✓ 12 Users (admin + manager + 10 pharmacy)   ║');
  console.log('║  ✓ 22 Invoice types, 33 Vendors               ║');
  console.log('║  ✓ 50+ Sample invoices with events             ║');
  console.log('║  ✓ SLA requirements, events, notifications    ║');
  console.log('║  ✓ 3 Support tickets                          ║');
  console.log('║  ✓ Real requirements for 4 pharmacies:        ║');
  console.log('║    - Branch Brook (15), Hill (13)             ║');
  console.log('║    - Mason (16), VIM Drugs (18)               ║');
  console.log('║  ✓ Requirement instances (3 months)           ║');
  console.log('║                                               ║');
  console.log('║  Login Credentials:                           ║');
  console.log('║  ─────────────────                            ║');
  console.log('║  ADMIN:            admin@local / admin123     ║');
  console.log('║  COMPANY MANAGER:  manager@local / password123║');
  console.log('║  PHARMACY USERS:   info@{...}.com / password123║');
  console.log('║                                               ║');
  console.log('╚══════════════════════════════════════════════╝\n');
}

main()
  .catch((e) => {
    console.error('\n✗ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
