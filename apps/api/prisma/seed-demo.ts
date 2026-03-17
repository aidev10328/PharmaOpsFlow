import { PrismaClient, InvoiceStatus, EntryMethod, DocumentType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * PharmaOpsFlow — Full Demo Seed
 *
 * This seed creates ALL data needed for a realistic demo:
 *   - 1 Organization
 *   - 10 Pharmacies
 *   - 12 Users (admin, manager, 10 pharmacy users)
 *   - Manager ↔ Pharmacy assignments
 *   - 4 Vendors, 5 Invoice Types, 6 Frequencies, 4 Categories
 *   - Required invoice configs
 *   - 50+ Sample Invoices in various statuses
 *   - Monthly invoice requirements (SLA data)
 *   - SLA events (violations and reminders)
 *   - Support tickets
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/seed-demo.ts
 *
 * Credentials:
 *   ADMIN:            admin@local / admin123
 *   COMPANY_MANAGER:  manager@local / password123
 *   PHARMACY_USERS:   info@{domain}.com / password123
 */

const prisma = new PrismaClient();

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

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   PharmaOpsFlow — Full Demo Seed             ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Hash passwords
  const password = await bcrypt.hash('password123', 10);
  const adminPassword = await bcrypt.hash('admin123', 10);

  // ============================================
  // 0. Clean up ALL existing data
  // ============================================
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

  // ============================================
  // 1. Organization
  // ============================================
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

  // ============================================
  // 2. Pharmacies
  // ============================================
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

  // ============================================
  // 3. Users
  // ============================================
  console.log('\nCreating users...');

  // Admin
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

  // Company Manager
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

  // Pharmacy Users
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

  // ============================================
  // 4. Pharmacy Memberships
  // ============================================
  console.log('\nCreating pharmacy memberships...');
  for (let i = 0; i < pharmacies.length; i++) {
    await prisma.pharmacyMember.create({
      data: { userId: pharmacyUsers[i].id, pharmacyId: pharmacies[i].id, memberRole: 'PHARMACY_USER' },
    });
  }
  console.log(`  ✓ ${pharmacies.length} memberships created`);

  // Manager ↔ Pharmacy assignments (all pharmacies)
  console.log('\nAssigning manager to pharmacies...');
  for (const pharmacy of pharmacies) {
    await prisma.managerPharmacy.create({
      data: { userId: manager.id, pharmacyId: pharmacy.id },
    });
  }
  console.log(`  ✓ Manager assigned to all ${pharmacies.length} pharmacies`);

  // ============================================
  // 5. Reference Data
  // ============================================
  console.log('\nCreating reference data...');

  // Frequencies
  const frequencyData = [
    { code: 'WEEKLY', name: 'Weekly', description: 'Every week', sortOrder: 1 },
    { code: 'BI_WEEKLY', name: 'Bi-Weekly', description: 'Every two weeks', sortOrder: 2 },
    { code: 'MONTHLY', name: 'Monthly', description: 'Once a month', sortOrder: 3 },
    { code: 'QUARTERLY', name: 'Quarterly', description: 'Every three months', sortOrder: 4 },
    { code: 'SEMI_ANNUALLY', name: 'Semi-Annually', description: 'Twice a year', sortOrder: 5 },
    { code: 'ANNUALLY', name: 'Annually', description: 'Once a year', sortOrder: 6 },
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

  // Invoice Types
  const invoiceTypesData = [
    { code: 'RENT', name: 'Rent', description: 'Rent and lease payments', isRequired: true },
    { code: 'ELECTRICITY', name: 'Electricity', description: 'Electricity utility bills', isRequired: true },
    { code: 'VENDOR_INVOICE', name: 'Vendor Invoice', description: 'Drug purchases from wholesalers', isRequired: false },
    { code: 'INTERNET', name: 'Internet', description: 'Internet and telecom services', isRequired: false },
    { code: 'INSURANCE', name: 'Insurance', description: 'Insurance premiums', isRequired: false },
  ];
  const invoiceTypes: any[] = [];
  for (const data of invoiceTypesData) {
    const it = await prisma.invoiceType.create({ data: { orgId: org.id, ...data } });
    invoiceTypes.push(it);
  }
  console.log(`  ✓ ${invoiceTypes.length} invoice types`);

  // Vendors
  const vendorData = [
    { name: 'McKesson Corporation', paymentTerms: 'Net 30', email: 'ar@mckesson.com', phone: '1-800-555-0101' },
    { name: 'Cardinal Health', paymentTerms: 'Net 30', email: 'payments@cardinalhealth.com', phone: '1-800-555-0102' },
    { name: 'National Grid Electric', paymentTerms: 'Net 21', email: 'business@nationalgrid.com', phone: '1-800-555-0109' },
    { name: 'Elmhurst Local Supply Co.', paymentTerms: 'Net 15', email: 'orders@elmhurstlocal.com', phone: '(718) 424-9900', pharmacyId: pharmacies[0].id },
  ];
  const vendors: any[] = [];
  for (const data of vendorData) {
    const v = await prisma.vendor.create({
      data: { orgId: org.id, name: data.name, paymentTerms: data.paymentTerms, email: data.email, phone: data.phone, pharmacyId: (data as any).pharmacyId || null },
    });
    vendors.push(v);
  }
  console.log(`  ✓ ${vendors.length} vendors`);

  // Required Invoice Types (Rent and Electricity required for all pharmacies)
  for (const it of invoiceTypes.filter(t => t.isRequired)) {
    await prisma.requiredInvoiceType.create({
      data: { orgId: org.id, invoiceTypeId: it.id },
    });
  }
  console.log(`  ✓ Required invoice types configured`);

  // ============================================
  // 6. Sample Invoices (50+ across all pharmacies)
  // ============================================
  console.log('\nCreating sample invoices...');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  const statuses: InvoiceStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'SCHEDULED', 'PAID', 'REJECTED', 'NEEDS_INFO'];
  const statusWeights = [5, 10, 10, 5, 40, 5, 5]; // Weighted distribution
  const invoiceNumbers: string[] = [];
  let invoiceCount = 0;

  function weightedStatus(): InvoiceStatus {
    const total = statusWeights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < statuses.length; i++) {
      r -= statusWeights[i];
      if (r <= 0) return statuses[i];
    }
    return 'PAID';
  }

  // Create 5-8 invoices per pharmacy across last 3 months
  for (const pharmacy of pharmacies) {
    const count = randomInt(5, 8);
    for (let j = 0; j < count; j++) {
      const monthOffset = randomInt(0, 2); // 0 = current, 1 = last, 2 = two months ago
      const invoiceMonth = new Date(currentYear, currentMonth - monthOffset, 1);
      const invDate = new Date(currentYear, currentMonth - monthOffset, randomInt(1, 28));
      const dueDate = addDays(invDate, randomInt(15, 45));
      const status = weightedStatus();
      const vendor = randomElement(vendors.filter(v => !v.pharmacyId || v.pharmacyId === pharmacy.id));
      const invoiceType = randomElement(invoiceTypes);
      const amount = randomDecimal(200, 15000);
      const invNumber = `INV-${pharmacy.code}-${invoiceMonth.getFullYear()}${String(invoiceMonth.getMonth() + 1).padStart(2, '0')}-${String(j + 1).padStart(3, '0')}`;
      invoiceNumbers.push(invNumber);

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

      // Set timestamps based on status
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

      // Create invoice events for the lifecycle
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

  // ============================================
  // 7. Monthly Invoice Requirements (SLA)
  // ============================================
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

  // ============================================
  // 8. SLA Events (violations and reminders)
  // ============================================
  console.log('\nCreating SLA events...');
  let slaEventCount = 0;
  for (const pharmacy of pharmacies) {
    // Add some violations for past months
    for (let i = 1; i < months.length; i++) {
      if (Math.random() > 0.6) {
        await prisma.slaEvent.create({
          data: {
            pharmacyId: pharmacy.id,
            yearMonth: months[i],
            eventType: 'SUBMISSION_MISSED',
            notes: `${pharmacy.name} missed submission deadline`,
          },
        });
        slaEventCount++;
      }
      if (Math.random() > 0.7) {
        await prisma.slaEvent.create({
          data: {
            pharmacyId: pharmacy.id,
            yearMonth: months[i],
            eventType: 'PROCESSING_MISSED',
            notes: `${pharmacy.name} processing overdue`,
          },
        });
        slaEventCount++;
      }
    }
    // Add reminders for current month
    if (Math.random() > 0.4) {
      await prisma.slaEvent.create({
        data: {
          pharmacyId: pharmacy.id,
          yearMonth: months[0],
          eventType: 'SUBMISSION_REMINDER_SENT',
          notes: 'Automated submission reminder',
        },
      });
      slaEventCount++;
    }
  }
  console.log(`  ✓ ${slaEventCount} SLA events`);

  // ============================================
  // 9. Notification Logs
  // ============================================
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

  // ============================================
  // 10. Support Tickets
  // ============================================
  console.log('\nCreating support tickets...');
  const ticketData = [
    {
      reportedByUserId: pharmacyUsers[0].id,
      reportedByName: `${pharmacyUsers[0].firstName} ${pharmacyUsers[0].lastName}`,
      reportedByEmail: pharmacyUsers[0].email,
      issueType: 'BUG' as const,
      userTitle: 'Invoice upload fails for large PDFs',
      userDescription: 'When I try to upload a PDF invoice larger than 10MB, the upload fails with no error message. The page just shows a spinner indefinitely.',
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
      userDescription: 'It would be very helpful to download all invoices for a month as a ZIP file for our records.',
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
      userDescription: 'Our pharmacy phone number has changed. Where can I update this in the system?',
      businessImpact: 'COSMETIC' as const,
      severity: 'LOW' as const,
      category: 'Account Management',
      currentStatus: 'CLOSED' as const,
      tenantId: org.id,
    },
  ];

  for (let i = 0; i < ticketData.length; i++) {
    const ticketNumber = `SUP-${String(i + 1).padStart(5, '0')}`;
    await prisma.supportTicket.create({
      data: { ticketNumber, ...ticketData[i] },
    });
  }
  console.log(`  ✓ ${ticketData.length} support tickets`);

  // ============================================
  // 11. Invoice Requirements (for requirements system)
  // ============================================
  console.log('\nCreating invoice requirements...');
  let reqCount = 0;
  const rentType = invoiceTypes.find(t => t.code === 'RENT')!;
  const elecType = invoiceTypes.find(t => t.code === 'ELECTRICITY')!;

  for (const pharmacy of pharmacies) {
    // Rent requirement (monthly)
    await prisma.invoiceRequirement.create({
      data: {
        pharmacyId: pharmacy.id,
        invoiceTypeId: rentType.id,
        name: `${pharmacy.name} Monthly Rent`,
        description: 'Monthly rent payment',
        frequency: 'MONTHLY',
        submissionDueDay: 5,
        processingDueDay: 10,
      },
    });
    reqCount++;

    // Electricity requirement (monthly)
    await prisma.invoiceRequirement.create({
      data: {
        pharmacyId: pharmacy.id,
        invoiceTypeId: elecType.id,
        name: `${pharmacy.name} Monthly Electricity`,
        description: 'Monthly electricity bill',
        frequency: 'MONTHLY',
        submissionDueDay: 5,
        processingDueDay: 10,
      },
    });
    reqCount++;
  }
  console.log(`  ✓ ${reqCount} invoice requirements`);

  // ============================================
  // Summary
  // ============================================
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║          DEMO SEED COMPLETE                   ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║                                               ║');
  console.log('║  Login Credentials:                           ║');
  console.log('║  ─────────────────                            ║');
  console.log('║  ADMIN:                                       ║');
  console.log('║    Email:    admin@local                       ║');
  console.log('║    Password: admin123                          ║');
  console.log('║                                               ║');
  console.log('║  COMPANY MANAGER:                             ║');
  console.log('║    Email:    manager@local                    ║');
  console.log('║    Password: password123                      ║');
  console.log('║                                               ║');
  console.log('║  PHARMACY USERS (password: password123):      ║');
  for (let i = 0; i < pharmacyUserData.length; i++) {
    const line = `║    ${pharmacyData[i].code}: ${pharmacyUserData[i].email}`;
    console.log(line.padEnd(49) + '║');
  }
  console.log('║                                               ║');
  console.log('╚══════════════════════════════════════════════╝\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
