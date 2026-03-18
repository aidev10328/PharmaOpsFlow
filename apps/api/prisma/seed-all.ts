import { PrismaClient, RequirementFrequency } from '@prisma/client';
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
 *     - Reference data (frequencies, categories)
 *     - SLA monthly requirements, events, notifications
 *     - Support tickets
 *   STEP 3: Requirements — creates real data for 4 pharmacies:
 *     - 19 Invoice types, 29 Vendors (from real spreadsheet)
 *     - Branch Brook (15), Hill (13), Mason (16), VIM Drugs (18) requirements
 *     - Requirement instances for current month + next 2 months
 *
 * Usage:
 *   cd apps/api
 *   npx ts-node --transpile-only prisma/seed-all.ts
 *
 * Credentials after seed:
 *   ADMIN:            admin@local / admin123
 *   COMPANY_MANAGER:  manager@local / password123
 *   PHARMACY_USERS:   info@{domain}.com / password123
 */

const prisma = new PrismaClient();

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

// ─── STEP 2: Base Data ──────────────────────────────────────

async function seedBaseData() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  STEP 2: Base Data (Org, Users, Pharmacies)  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

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

  // ── 5. Frequencies & Categories (reference data) ──
  console.log('\nCreating reference data...');

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

  // ── 6. SLA Monthly Requirements ──
  console.log('\nCreating SLA monthly requirements...');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
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

  // ── 7. SLA Events ──
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

  // ── 8. Notification Logs ──
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

  // ── 9. Support Tickets ──
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

  return { org, pharmacies, pharmacyUsers, admin };
}

// ─── STEP 3: Real Invoice Types, Vendors & Requirements ─────

async function seedRequirements(ctx: { org: any; pharmacies: any[] }) {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  STEP 3: Invoice Types, Vendors & Requirements║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const { org, pharmacies } = ctx;

  // ── Invoice Types (real, from spreadsheet) ──
  console.log('Creating invoice types...');
  const invoiceTypeDefs = [
    { code: 'PHARMACY_SOFTWARE', name: 'Pharmacy Software Payment Bill', description: 'Pharmacy software fees' },
    { code: 'COPY_MACHINE', name: 'Copy Machine Payment', description: 'Copy machine lease/service' },
    { code: 'GARBAGE_RECYCLING', name: 'Garbage Removal - Recycling', description: 'Waste removal services' },
    { code: 'CARE_CLAIM', name: 'Care Claim Monthly Fee', description: 'Care claim processing fees' },
    { code: 'INTERNET', name: 'Internet', description: 'Internet and telecom services' },
    { code: 'ELECTRICAL_GAS', name: 'Electrical & Gas', description: 'Electric and gas utilities' },
    { code: 'RENT', name: 'Rent', description: 'Rent and lease payments' },
    { code: 'GOVT_TAXES', name: 'Govt Taxes', description: 'Government tax payments' },
    { code: 'FIRE_ALARM', name: 'Fire Alarm', description: 'Fire alarm monitoring service' },
    { code: 'LABELS_VIALS', name: 'Labels & Vials', description: 'Pharmacy labels and vials supply' },
    { code: 'WHOLESALE_1', name: 'Whole Sale Supplier - 1', description: 'Primary wholesale supplier' },
    { code: 'WHOLESALE_2', name: 'Whole Sale Supplier - 2', description: 'Secondary wholesale supplier' },
    { code: 'WHOLESALE_3', name: 'Whole Sale Supplier - 3', description: 'Tertiary wholesale supplier' },
    { code: 'WHOLESALE_4', name: 'Whole Sale Supplier - 4', description: 'Wholesale supplier 4' },
    { code: 'WHOLESALE_5', name: 'Whole Sale Supplier - 5', description: 'Wholesale supplier 5' },
    { code: 'WHOLESALE_6', name: 'Whole Sale Supplier - 6', description: 'Wholesale supplier 6' },
    { code: 'WHOLESALE_7', name: 'Whole Sale Supplier - 7', description: 'Wholesale supplier 7' },
    { code: 'WHOLESALE_8', name: 'Whole Sale Supplier - 8', description: 'Wholesale supplier 8' },
    { code: 'PASSPORT_PHOTOS', name: 'Passport Photos', description: 'Passport photo services' },
  ];

  const invoiceTypeMap: Record<string, any> = {};
  for (const data of invoiceTypeDefs) {
    const it = await prisma.invoiceType.create({
      data: { orgId: org.id, code: data.code, name: data.name, description: data.description, isRequired: false },
    });
    invoiceTypeMap[data.code] = it;
  }
  console.log(`  ✓ ${invoiceTypeDefs.length} invoice types`);

  // ── Vendors (real, from spreadsheet) ──
  console.log('\nCreating vendors...');
  const vendorDefs = [
    { code: 'BEST_RX', name: 'Best RX' },
    { code: 'BLUEBIRD_COPIER', name: 'Bluebird Copier' },
    { code: 'CALI_CARTING', name: 'Cali Carting' },
    { code: 'OMNISYS', name: 'Omnisys' },
    { code: 'OPTIMUM', name: 'Optimum' },
    { code: 'PSEG', name: 'PSE&G' },
    { code: 'MILAN_PROPERTIES', name: 'Milan Properties' },
    { code: 'NJ_TAX_DEPT', name: 'NJ Div of Tax Department' },
    { code: 'PROTEK_SECURITY', name: 'Pro-Tek Security' },
    { code: 'MC_CRACKEN', name: 'MC Cracken' },
    { code: 'KINRAY', name: 'Kinray' },
    { code: 'MCKESSON', name: 'McKesson' },
    { code: 'AMERISOURCE', name: 'Amerisource' },
    { code: 'ANDA', name: 'ANDA' },
    { code: 'TOP_RX', name: 'Top RX' },
    { code: 'CON_ED', name: 'Con Ed' },
    { code: 'LANGSAM_PROPERTIES', name: 'Langsam Properties' },
    { code: '5_BOROUGH_WASTE', name: '5 Borough Waste Removal' },
    { code: 'WORLD_COPIER', name: 'World Copier' },
    { code: 'AAA_ID_PASSPORT', name: 'AAA ID Passport' },
    { code: 'TOP_ALARM', name: 'Top Alarm Systems' },
    { code: 'SOPHER_MGMT', name: 'Sopher Management' },
    { code: 'JLC_COPY', name: 'JLC Copy Inc.' },
    { code: 'CITY_MED_RX', name: 'City Med Rx' },
    { code: 'SPECTRUM', name: 'Spectrum' },
    { code: 'FRIEDLAND_PROPERTIES', name: 'Friedland Properties' },
    { code: 'ACTION_ENV', name: 'Action Env. Services' },
    { code: 'BOB_BILA', name: 'Bob-Bila' },
    { code: 'JJJ_DISTRIBUTROS', name: 'JJJ Distributros' },
  ];

  const vendorMap: Record<string, any> = {};
  for (const data of vendorDefs) {
    const v = await prisma.vendor.create({
      data: { orgId: org.id, name: data.name, isActive: true },
    });
    vendorMap[data.code] = v;
  }
  console.log(`  ✓ ${vendorDefs.length} vendors`);

  // ── Map pharmacies by name ──
  const pharmacyByName: Record<string, any> = {};
  for (const p of pharmacies) {
    pharmacyByName[p.name] = p;
  }

  const branchBrook = pharmacyByName['Branch Brook Pharmacy'];
  const hillPharmacy = pharmacyByName['Hill Pharmacy'];
  const masonRx = pharmacyByName['Mason Pharmacy'];
  const vimDrugs = pharmacyByName['VIM Drugs'];

  if (!branchBrook || !hillPharmacy || !masonRx || !vimDrugs) {
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

  // ── Create requirements ──
  async function createRequirements(pharmacyId: string, pharmacyName: string, reqs: ReqDef[]) {
    console.log(`\nCreating requirements for ${pharmacyName}...`);
    let created = 0;

    for (const req of reqs) {
      const typeObj = invoiceTypeMap[req.invoiceTypeCode];
      const vendObj = vendorMap[req.vendorCode];

      if (!typeObj) { console.error(`  ✗ Missing invoice type: ${req.invoiceTypeCode}`); continue; }
      if (!vendObj) { console.error(`  ✗ Missing vendor: ${req.vendorCode}`); continue; }

      const typeName = invoiceTypeDefs.find(t => t.code === req.invoiceTypeCode)?.name || req.invoiceTypeCode;
      const vendorName = vendorDefs.find(v => v.code === req.vendorCode)?.name || req.vendorCode;
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

  await createRequirements(branchBrook.id, 'Branch Brook Pharmacy', branchBrookReqs);
  await createRequirements(hillPharmacy.id, 'Hill Pharmacy', hillReqs);
  await createRequirements(masonRx.id, 'Mason Pharmacy', masonReqs);
  await createRequirements(vimDrugs.id, 'VIM Drugs', vimReqs);

  // ── Generate requirement instances for current month + next 2 months ──
  console.log('\nGenerating requirement instances...');

  const targetPharmacyIds = [branchBrook.id, hillPharmacy.id, masonRx.id, vimDrugs.id];
  const allRequirements = await prisma.invoiceRequirement.findMany({
    where: { pharmacyId: { in: targetPharmacyIds }, isActive: true },
  });

  const now = new Date();
  const instanceMonths: { year: number; month: number; start: Date; end: Date; label: string }[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const y = now.getFullYear();
    const m = now.getMonth() + offset;
    const d = new Date(Date.UTC(y, m, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const label = `${monthNames[month]} ${year}`;
    instanceMonths.push({ year, month, start, end, label });
  }

  let instancesCreated = 0;

  for (const req of allRequirements) {
    if (req.frequency === 'ONE_TIME') {
      const m = instanceMonths[0];
      await prisma.requirementInstance.create({
        data: {
          requirementId: req.id,
          periodStart: m.start,
          periodEnd: m.end,
          periodLabel: m.label,
          submissionDeadline: new Date(Date.UTC(m.year, m.month, Math.min(req.submissionDueDay, 28))),
          processingDeadline: new Date(Date.UTC(m.year, m.month, Math.min(req.processingDueDay, 28))),
          status: 'PENDING',
        },
      });
      instancesCreated++;
      continue;
    }

    for (const month of instanceMonths) {
      if (req.frequency === 'QUARTERLY') {
        const monthNum = month.month + 1;
        const applicable = (req.applicableMonths || '3,6,9,12').split(',').map(Number);
        if (!applicable.includes(monthNum)) continue;
      }

      if (req.frequency === 'BI_WEEKLY') {
        for (const biWeekDay of [1, 15]) {
          const periodStart = new Date(Date.UTC(month.year, month.month, biWeekDay));
          const periodEnd = biWeekDay === 1
            ? new Date(Date.UTC(month.year, month.month, 14, 23, 59, 59))
            : new Date(Date.UTC(month.year, month.month + 1, 0, 23, 59, 59));
          const periodLabel = `${month.label} (${biWeekDay === 1 ? '1st-14th' : '15th-end'})`;

          await prisma.requirementInstance.create({
            data: {
              requirementId: req.id,
              periodStart,
              periodEnd,
              periodLabel,
              submissionDeadline: new Date(Date.UTC(month.year, month.month, biWeekDay + 4)),
              processingDeadline: new Date(Date.UTC(month.year, month.month, biWeekDay + 9)),
              status: 'PENDING',
            },
          });
          instancesCreated++;
        }
        continue;
      }

      // MONTHLY
      await prisma.requirementInstance.create({
        data: {
          requirementId: req.id,
          periodStart: month.start,
          periodEnd: month.end,
          periodLabel: month.label,
          submissionDeadline: new Date(Date.UTC(month.year, month.month, Math.min(req.submissionDueDay, 28))),
          processingDeadline: new Date(Date.UTC(month.year, month.month, Math.min(req.processingDueDay, 28))),
          status: 'PENDING',
        },
      });
      instancesCreated++;
    }
  }

  console.log(`  ✓ ${instancesCreated} requirement instances created`);

  const totalReqs = await prisma.invoiceRequirement.count();
  const totalInstances = await prisma.requirementInstance.count();
  console.log(`\n  Total requirements: ${totalReqs}`);
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

  // STEP 2: Base Data
  const ctx = await seedBaseData();

  // STEP 3: Invoice Types, Vendors & Requirements
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
  console.log('║  ✓ 19 Invoice types, 29 Vendors (real data)   ║');
  console.log('║  ✓ SLA requirements, events, notifications    ║');
  console.log('║  ✓ 3 Support tickets                          ║');
  console.log('║  ✓ Requirements for 4 pharmacies:             ║');
  console.log('║    - Branch Brook (15), Hill (13)             ║');
  console.log('║    - Mason (16), VIM Drugs (18)               ║');
  console.log('║  ✓ Requirement instances (3 months)           ║');
  console.log('║                                               ║');
  console.log('║  NO demo invoices, NO demo vendors/types      ║');
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
