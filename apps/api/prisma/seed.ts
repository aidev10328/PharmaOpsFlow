import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PharmaOpsFlow database...\n');

  // Hash passwords
  const password = await bcrypt.hash('password123', 10);
  const adminPassword = await bcrypt.hash('admin123', 10);

  // ============================================
  // 1. Create Organization
  // ============================================
  console.log('Creating organization...');
  const org = await prisma.org.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { name: 'Main Company' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Main Company',
    },
  });
  console.log(`  Created org: ${org.name}`);

  // ============================================
  // 2. Create 10 Pharmacies
  // ============================================
  console.log('\nCreating pharmacies...');
  const pharmacyData = [
    { code: 'P01', name: 'Downtown Pharmacy', address: '123 Main St, New York, NY 10001', timezone: 'America/New_York' },
    { code: 'P02', name: 'Uptown Pharmacy', address: '456 Park Ave, New York, NY 10022', timezone: 'America/New_York' },
    { code: 'P03', name: 'Brooklyn Pharmacy', address: '789 Atlantic Ave, Brooklyn, NY 11217', timezone: 'America/New_York' },
    { code: 'P04', name: 'Queens Pharmacy', address: '321 Queens Blvd, Queens, NY 11375', timezone: 'America/New_York' },
    { code: 'P05', name: 'Bronx Pharmacy', address: '654 Grand Concourse, Bronx, NY 10451', timezone: 'America/New_York' },
    { code: 'P06', name: 'Staten Island Pharmacy', address: '987 Victory Blvd, Staten Island, NY 10314', timezone: 'America/New_York' },
    { code: 'P07', name: 'Westside Pharmacy', address: '147 West End Ave, New York, NY 10023', timezone: 'America/New_York' },
    { code: 'P08', name: 'Eastside Pharmacy', address: '258 East 86th St, New York, NY 10028', timezone: 'America/New_York' },
    { code: 'P09', name: 'Midtown Pharmacy', address: '369 Lexington Ave, New York, NY 10017', timezone: 'America/New_York' },
    { code: 'P10', name: 'Village Pharmacy', address: '741 Bleecker St, New York, NY 10014', timezone: 'America/New_York' },
  ];

  const pharmacies: any[] = [];
  for (const data of pharmacyData) {
    const pharmacy = await prisma.pharmacy.upsert({
      where: { code: data.code },
      update: { name: data.name, address: data.address, timezone: data.timezone },
      create: {
        orgId: org.id,
        code: data.code,
        name: data.name,
        address: data.address,
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
      role: 'ADMIN',
      orgId: null, // Admin doesn't belong to a specific org
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
      role: 'COMPANY_MANAGER',
      orgId: org.id,
    },
  });
  console.log(`  Created COMPANY_MANAGER: ${companyManager.email}`);

  // 3c. Pharmacy User (for Pharmacy 1 - Downtown)
  const pharmacy1User = await prisma.user.upsert({
    where: { email: 'pharmacy1@local' },
    update: {},
    create: {
      email: 'pharmacy1@local',
      passwordHash: password,
      firstName: 'Emily',
      lastName: 'Davis',
      role: 'PHARMACY_USER',
      orgId: org.id,
    },
  });
  console.log(`  Created PHARMACY_USER: ${pharmacy1User.email}`);

  // 3d. Pharmacy Admin (for Pharmacy 2 - Uptown)
  const pharmacy2Admin = await prisma.user.upsert({
    where: { email: 'pharmacy2@local' },
    update: {},
    create: {
      email: 'pharmacy2@local',
      passwordHash: password,
      firstName: 'Michael',
      lastName: 'Chen',
      role: 'PHARMACY_ADMIN',
      orgId: org.id,
    },
  });
  console.log(`  Created PHARMACY_ADMIN: ${pharmacy2Admin.email}`);

  // ============================================
  // 4. Create Pharmacy Memberships
  // ============================================
  console.log('\nCreating pharmacy memberships...');

  // pharmacy1@local -> Pharmacy 1 (P01 - Downtown) as PHARMACY_USER
  await prisma.pharmacyMember.upsert({
    where: {
      userId_pharmacyId: {
        userId: pharmacy1User.id,
        pharmacyId: pharmacies[0].id,
      },
    },
    update: { memberRole: 'PHARMACY_USER' },
    create: {
      userId: pharmacy1User.id,
      pharmacyId: pharmacies[0].id,
      memberRole: 'PHARMACY_USER',
    },
  });
  console.log(`  Added ${pharmacy1User.email} as PHARMACY_USER to ${pharmacies[0].name}`);

  // pharmacy2@local -> Pharmacy 2 (P02 - Uptown) as PHARMACY_ADMIN
  await prisma.pharmacyMember.upsert({
    where: {
      userId_pharmacyId: {
        userId: pharmacy2Admin.id,
        pharmacyId: pharmacies[1].id,
      },
    },
    update: { memberRole: 'PHARMACY_ADMIN' },
    create: {
      userId: pharmacy2Admin.id,
      pharmacyId: pharmacies[1].id,
      memberRole: 'PHARMACY_ADMIN',
    },
  });
  console.log(`  Added ${pharmacy2Admin.email} as PHARMACY_ADMIN to ${pharmacies[1].name}`);

  // ============================================
  // 5. Create Invoice Types
  // ============================================
  console.log('\nCreating invoice types...');
  const invoiceTypesData = [
    { name: 'Wholesale Drug', description: 'Drug purchases from wholesalers' },
    { name: 'Equipment', description: 'Pharmacy equipment and supplies' },
    { name: 'Services', description: 'Professional services and consulting' },
    { name: 'Utilities', description: 'Utility bills and services' },
    { name: 'Rent', description: 'Rent and lease payments' },
    { name: 'Insurance', description: 'Insurance premiums' },
    { name: 'Maintenance', description: 'Maintenance and repairs' },
    { name: 'Other', description: 'Miscellaneous expenses' },
  ];

  for (const data of invoiceTypesData) {
    await prisma.invoiceType.upsert({
      where: { name: data.name },
      update: { description: data.description },
      create: data,
    });
    console.log(`  Created invoice type: ${data.name}`);
  }

  // ============================================
  // 6. Create Vendors
  // ============================================
  console.log('\nCreating vendors...');
  const vendorsData = [
    { code: 'VND001', name: 'McKesson Corporation', paymentTerms: 'Net 30', email: 'ar@mckesson.com', phone: '1-800-555-0101' },
    { code: 'VND002', name: 'Cardinal Health', paymentTerms: 'Net 30', email: 'payments@cardinalhealth.com', phone: '1-800-555-0102' },
    { code: 'VND003', name: 'AmerisourceBergen', paymentTerms: 'Net 30', email: 'billing@amerisource.com', phone: '1-800-555-0103' },
    { code: 'VND004', name: 'Morris & Dickson', paymentTerms: 'Net 15', email: 'ar@morrisdickson.com', phone: '1-800-555-0104' },
    { code: 'VND005', name: 'HD Smith', paymentTerms: 'Net 30', email: 'accounts@hdsmith.com', phone: '1-800-555-0105' },
    { code: 'VND006', name: 'Kinray Medical', paymentTerms: 'Net 45', email: 'billing@kinray.com', phone: '1-800-555-0106' },
    { code: 'VND007', name: 'Valley Wholesale Drug', paymentTerms: 'Net 30', email: 'ap@valleywholesale.com', phone: '1-800-555-0107' },
    { code: 'VND008', name: 'Rochester Drug Co-op', paymentTerms: 'Net 30', email: 'ar@rdcoop.com', phone: '1-800-555-0108' },
    { code: 'VND009', name: 'National Grid Electric', paymentTerms: 'Net 21', email: 'business@nationalgrid.com', phone: '1-800-555-0109' },
    { code: 'VND010', name: 'ABC Property Management', paymentTerms: 'Net 1', email: 'rent@abcproperty.com', phone: '1-800-555-0110' },
  ];

  for (const data of vendorsData) {
    await prisma.vendor.upsert({
      where: { code: data.code },
      update: { name: data.name, paymentTerms: data.paymentTerms, email: data.email, phone: data.phone },
      create: data,
    });
    console.log(`  Created vendor: ${data.name} (${data.code})`);
  }

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
  console.log('PHARMACY_USER (P01 - Downtown):');
  console.log('  Email: pharmacy1@local');
  console.log('  Password: password123');
  console.log('');
  console.log('PHARMACY_ADMIN (P02 - Uptown):');
  console.log('  Email: pharmacy2@local');
  console.log('  Password: password123');
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
