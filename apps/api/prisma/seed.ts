import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PharmaOpsFlow database...\n');

  // Hash passwords
  const password = await bcrypt.hash('password123', 10);
  const adminPassword = await bcrypt.hash('admin123', 10);

  // ============================================
  // 0. Clean up existing data
  // ============================================
  console.log('Cleaning up existing data...');
  await prisma.auditLog.deleteMany({});
  await prisma.invoiceExtraction.deleteMany({});
  await prisma.invoiceEvent.deleteMany({});
  await prisma.invoiceFile.deleteMany({});
  await prisma.slaEvent.deleteMany({});
  await prisma.notificationLog.deleteMany({});
  await prisma.monthlyInvoiceRequirement.deleteMany({});
  await prisma.requiredInvoiceType.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.invoiceType.deleteMany({});
  await prisma.vendor.deleteMany({});
  await prisma.pharmacyMember.deleteMany({});
  await prisma.pharmacy.deleteMany({});
  // Delete old pharmacy users (keep admin and manager)
  await prisma.user.deleteMany({
    where: {
      role: { in: ['PHARMACY_USER', 'PHARMACY_ADMIN'] },
    },
  });
  console.log('  Cleaned up existing data.');

  // ============================================
  // 1. Create Organization
  // ============================================
  console.log('\nCreating organization...');
  const org = await prisma.org.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { name: 'Main Company' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Main Company',
      timezone: 'America/New_York',
    },
  });
  console.log(`  Created org: ${org.name}`);

  // ============================================
  // 2. Create 10 Pharmacies
  // ============================================
  console.log('\nCreating pharmacies...');
  const pharmacyData = [
    { code: 'ELM', name: 'Elmhurst Pharmacy', street: '75-23 Broadway', city: 'Elmhurst', state: 'NY', zip: '11373', phone: '(718) 424-5500', website: 'https://www.elmhurstpharmacy.com', timezone: 'America/New_York' },
    { code: 'TCP', name: 'Thriftcare Pharmacy', street: '759 Washington Ave', city: 'Brooklyn', state: 'NY', zip: '11238', phone: '(718) 783-1010', website: 'https://www.thriftcarepharmacy.com', timezone: 'America/New_York' },
    { code: 'HDP', name: 'Heidi Pharmacy', street: '522 West 181st Street', city: 'New York', state: 'NY', zip: '10033', phone: '(212) 927-2800', website: 'https://www.heidipharmacy.com', timezone: 'America/New_York' },
    { code: 'CWP', name: 'Care Well Pharmacy', street: '826 East Tremont Ave', city: 'Bronx', state: 'NY', zip: '10460', phone: '(718) 842-1600', website: 'https://www.carewellpharmacy.com', timezone: 'America/New_York' },
    { code: 'BTD', name: 'Batish Drugs', street: '378 Lafayette Avenue', city: 'Brooklyn', state: 'NY', zip: '11238', phone: '(718) 636-0202', website: 'https://www.batishdrugs.com', timezone: 'America/New_York' },
    { code: 'TCR', name: 'Thrift Care Pharmacy', street: '524 Nostrand Avenue', city: 'Brooklyn', state: 'NY', zip: '11216', phone: '(718) 622-3050', website: 'https://www.thriftcarerx.com', timezone: 'America/New_York' },
    { code: 'BBP', name: 'Branch Brook Pharmacy', street: '917 Franklin Avenue', city: 'Newark', state: 'NJ', zip: '07102', phone: '(973) 481-8800', website: 'https://www.branchbrookpharmacy.com', timezone: 'America/New_York' },
    { code: 'MSN', name: 'Mason Pharmacy', street: '1255 Castle Hill Avenue', city: 'Bronx', state: 'NY', zip: '10462', phone: '(718) 828-7400', website: 'https://www.masonpharmacy.com', timezone: 'America/New_York' },
    { code: 'VIM', name: 'VIM Drugs', street: '3835 Broadway', city: 'New York', state: 'NY', zip: '10032', phone: '(212) 781-9500', website: 'https://www.vimdrugs.com', timezone: 'America/New_York' },
    { code: 'HLP', name: 'Hill Pharmacy', street: '2197 Westchester Avenue', city: 'Bronx', state: 'NY', zip: '10462', phone: '(718) 792-3100', website: 'https://www.hillpharmacy.com', timezone: 'America/New_York' },
  ];

  const pharmacies: any[] = [];
  for (const data of pharmacyData) {
    const pharmacy = await prisma.pharmacy.upsert({
      where: { code: data.code },
      update: { name: data.name, street: data.street, city: data.city, state: data.state, zip: data.zip, phone: data.phone, website: data.website, timezone: data.timezone },
      create: {
        orgId: org.id,
        code: data.code,
        name: data.name,
        street: data.street,
        city: data.city,
        state: data.state,
        zip: data.zip,
        phone: data.phone,
        website: data.website,
        timezone: data.timezone,
      },
    });
    pharmacies.push(pharmacy);
    console.log(`  Created pharmacy: ${pharmacy.name} (${pharmacy.code})`);
  }

  // ============================================
  // 3. Create Users
  // ============================================
  console.log('\nCreating users...');

  // 3a. System Admin (no org - can access everything)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@local' },
    update: {},
    create: {
      email: 'admin@local',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Admin',
      phone: '(212) 555-0001',
      role: 'ADMIN',
      orgId: null,
    },
  });
  console.log(`  Created ADMIN: ${admin.email}`);

  // 3b. Company Manager (belongs to org, can access all pharmacies in org)
  const companyManager = await prisma.user.upsert({
    where: { email: 'manager@local' },
    update: {},
    create: {
      email: 'manager@local',
      passwordHash: password,
      firstName: 'Sarah',
      lastName: 'Johnson',
      phone: '(212) 555-0002',
      role: 'COMPANY_MANAGER',
      orgId: org.id,
    },
  });
  console.log(`  Created COMPANY_MANAGER: ${companyManager.email}`);

  // 3c. Pharmacy Users - one per pharmacy
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
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: { firstName: data.firstName, lastName: data.lastName, phone: data.phone },
      create: {
        email: data.email,
        passwordHash: password,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: 'PHARMACY_USER',
        orgId: org.id,
      },
    });
    pharmacyUsers.push(user);
    console.log(`  Created PHARMACY_USER: ${user.email}`);
  }

  // ============================================
  // 4. Create Pharmacy Memberships
  // ============================================
  console.log('\nCreating pharmacy memberships...');

  for (let i = 0; i < pharmacies.length; i++) {
    await prisma.pharmacyMember.upsert({
      where: {
        userId_pharmacyId: {
          userId: pharmacyUsers[i].id,
          pharmacyId: pharmacies[i].id,
        },
      },
      update: { memberRole: 'PHARMACY_USER' },
      create: {
        userId: pharmacyUsers[i].id,
        pharmacyId: pharmacies[i].id,
        memberRole: 'PHARMACY_USER',
      },
    });
    console.log(`  Added ${pharmacyUsers[i].email} as PHARMACY_USER to ${pharmacies[i].name}`);
  }

  // ============================================
  // 4b. Create Frequencies (admin-configurable)
  // ============================================
  console.log('\nCreating frequencies...');
  await prisma.frequency.deleteMany({});
  const frequencyData = [
    { code: 'WEEKLY', name: 'Weekly', description: 'Every week', sortOrder: 1 },
    { code: 'BI_WEEKLY', name: 'Bi-Weekly', description: 'Every two weeks', sortOrder: 2 },
    { code: 'MONTHLY', name: 'Monthly', description: 'Once a month', sortOrder: 3 },
    { code: 'QUARTERLY', name: 'Quarterly', description: 'Every three months', sortOrder: 4 },
    { code: 'SEMI_ANNUALLY', name: 'Semi-Annually', description: 'Twice a year', sortOrder: 5 },
    { code: 'ANNUALLY', name: 'Annually', description: 'Once a year', sortOrder: 6 },
  ];
  for (const data of frequencyData) {
    await prisma.frequency.create({
      data: { orgId: org.id, ...data },
    });
    console.log(`  Created frequency: ${data.name} (${data.code})`);
  }

  // ============================================
  // 4c. Create Invoice Categories (admin-configurable)
  // ============================================
  console.log('\nCreating invoice categories...');
  await prisma.invoiceCategory.deleteMany({});
  const categoryData = [
    { code: 'INVOICE', name: 'Invoice', description: 'Standard vendor invoice', sortOrder: 1 },
    { code: 'STATEMENT', name: 'Statement', description: 'Account statement', sortOrder: 2 },
    { code: 'CREDIT_MEMO', name: 'Credit Memo', description: 'Credit memo or refund', sortOrder: 3 },
    { code: 'RECEIPT', name: 'Receipt', description: 'Payment receipt', sortOrder: 4 },
  ];
  for (const data of categoryData) {
    await prisma.invoiceCategory.create({
      data: { orgId: org.id, ...data },
    });
    console.log(`  Created invoice category: ${data.name} (${data.code})`);
  }

  // ============================================
  // 5. Create Invoice Types (org-scoped with codes)
  // ============================================
  console.log('\nCreating invoice types...');
  const invoiceTypesData = [
    { code: 'RENT', name: 'Rent', description: 'Rent and lease payments', isRequired: true },
    { code: 'ELECTRICITY', name: 'Electricity', description: 'Electricity utility bills', isRequired: true },
    { code: 'VENDOR_INVOICE', name: 'Vendor Invoice', description: 'Drug purchases from wholesalers', isRequired: false },
    { code: 'INTERNET', name: 'Internet', description: 'Internet and telecom services', isRequired: false },
    { code: 'INSURANCE', name: 'Insurance', description: 'Insurance premiums', isRequired: false },
  ];

  const invoiceTypes: any[] = [];
  for (const data of invoiceTypesData) {
    const it = await prisma.invoiceType.create({
      data: {
        orgId: org.id,
        code: data.code,
        name: data.name,
        description: data.description,
        isRequired: data.isRequired,
      },
    });
    invoiceTypes.push(it);
    console.log(`  Created invoice type: ${it.name} (${it.code})${it.isRequired ? ' [REQUIRED]' : ''}`);
  }

  // ============================================
  // 6. Create Vendors (org-wide + 1 pharmacy-specific)
  // ============================================
  console.log('\nCreating vendors...');
  const orgWideVendors = [
    { name: 'McKesson Corporation', paymentTerms: 'Net 30', email: 'ar@mckesson.com', phone: '1-800-555-0101' },
    { name: 'Cardinal Health', paymentTerms: 'Net 30', email: 'payments@cardinalhealth.com', phone: '1-800-555-0102' },
    { name: 'National Grid Electric', paymentTerms: 'Net 21', email: 'business@nationalgrid.com', phone: '1-800-555-0109' },
  ];

  for (const data of orgWideVendors) {
    await prisma.vendor.create({
      data: {
        orgId: org.id,
        name: data.name,
        paymentTerms: data.paymentTerms,
        email: data.email,
        phone: data.phone,
      },
    });
    console.log(`  Created org-wide vendor: ${data.name}`);
  }

  // 1 pharmacy-specific vendor for the first pharmacy (ELM)
  await prisma.vendor.create({
    data: {
      orgId: org.id,
      pharmacyId: pharmacies[0].id,
      name: 'Elmhurst Local Supply Co.',
      paymentTerms: 'Net 15',
      email: 'orders@elmhurstlocal.com',
      phone: '(718) 424-9900',
    },
  });
  console.log(`  Created pharmacy-specific vendor: Elmhurst Local Supply Co. (for ${pharmacies[0].code})`);

  // ============================================
  // 7. Create Monthly Invoice Requirements (SLA)
  // ============================================
  console.log('\nCreating monthly invoice requirements...');
  const now = new Date();
  const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastYearMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;

  for (const pharmacy of pharmacies) {
    // Current month - in progress
    await prisma.monthlyInvoiceRequirement.upsert({
      where: {
        pharmacyId_yearMonth: {
          pharmacyId: pharmacy.id,
          yearMonth: currentYearMonth,
        },
      },
      update: {},
      create: {
        pharmacyId: pharmacy.id,
        yearMonth: currentYearMonth,
        expectedCount: 1,
        submittedCount: 0,
        processedCount: 0,
        isMet: false,
      },
    });

    // Last month - mark some as compliant for demo
    const isCompliant = Math.random() > 0.3; // 70% chance of being compliant
    await prisma.monthlyInvoiceRequirement.upsert({
      where: {
        pharmacyId_yearMonth: {
          pharmacyId: pharmacy.id,
          yearMonth: lastYearMonth,
        },
      },
      update: {},
      create: {
        pharmacyId: pharmacy.id,
        yearMonth: lastYearMonth,
        expectedCount: 1,
        submittedCount: isCompliant ? 1 : 0,
        processedCount: isCompliant ? 1 : 0,
        isMet: isCompliant,
      },
    });
  }
  console.log(`  Created requirements for ${pharmacies.length} pharmacies for ${currentYearMonth} and ${lastYearMonth}`);

  // ============================================
  // Summary
  // ============================================
  console.log('\n========================================');
  console.log('Seeding completed successfully!\n');
  console.log('Test Credentials:');
  console.log('----------------------------------------');
  console.log('ADMIN:');
  console.log('  Email: admin@local');
  console.log('  Password: admin123');
  console.log('');
  console.log('COMPANY_MANAGER (can access all 10 pharmacies):');
  console.log('  Email: manager@local');
  console.log('  Password: password123');
  console.log('');
  console.log('PHARMACY USERS (one per pharmacy, password: password123):');
  for (let i = 0; i < pharmacyUserData.length; i++) {
    console.log(`  ${pharmacyData[i].name} (${pharmacyData[i].code}): ${pharmacyUserData[i].email}`);
  }
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
