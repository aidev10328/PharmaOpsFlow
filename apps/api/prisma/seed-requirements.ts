import { PrismaClient, RequirementFrequency } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get the org
  const org = await prisma.org.findFirst();
  if (!org) throw new Error('No org found');
  const orgId = org.id;
  console.log(`Org: ${org.name} (${orgId})`);

  // ============================================================
  // 1. INVOICE TYPES (upsert by code)
  // ============================================================
  const invoiceTypeDefs = [
    { code: 'PHARMACY_SOFTWARE', name: 'Pharmacy Software Payment Bill' },
    { code: 'COPY_MACHINE', name: 'Copy Machine Payment' },
    { code: 'GARBAGE_RECYCLING', name: 'Garbage Removal - Recycling' },
    { code: 'CARE_CLAIM', name: 'Care Claim Monthly Fee' },
    { code: 'INTERNET', name: 'Internet' },
    { code: 'ELECTRICAL_GAS', name: 'Electrical & Gas' },
    { code: 'RENT', name: 'Rent' },
    { code: 'GOVT_TAXES', name: 'Govt Taxes' },
    { code: 'FIRE_ALARM', name: 'Fire Alarm' },
    { code: 'LABELS_VIALS', name: 'Labels & Vials' },
    { code: 'WHOLESALE_1', name: 'Whole Sale Supplier - 1' },
    { code: 'WHOLESALE_2', name: 'Whole Sale Supplier - 2' },
    { code: 'WHOLESALE_3', name: 'Whole Sale Supplier - 3' },
    { code: 'WHOLESALE_4', name: 'Whole Sale Supplier - 4' },
    { code: 'WHOLESALE_5', name: 'Whole Sale Supplier - 5' },
    { code: 'WHOLESALE_6', name: 'Whole Sale Supplier - 6' },
    { code: 'WHOLESALE_7', name: 'Whole Sale Supplier - 7' },
    { code: 'WHOLESALE_8', name: 'Whole Sale Supplier - 8' },
    { code: 'PASSPORT_PHOTOS', name: 'Passport Photos' },
  ];

  const invoiceTypes: Record<string, string> = {};
  for (const t of invoiceTypeDefs) {
    const existing = await prisma.invoiceType.findFirst({ where: { orgId, code: t.code } });
    if (existing) {
      invoiceTypes[t.code] = existing.id;
      console.log(`  InvoiceType exists: ${t.code}`);
    } else {
      const created = await prisma.invoiceType.create({
        data: { orgId, code: t.code, name: t.name, isActive: true, isRequired: false },
      });
      invoiceTypes[t.code] = created.id;
      console.log(`  InvoiceType created: ${t.code}`);
    }
  }
  // Also index existing types by code
  const allTypes = await prisma.invoiceType.findMany({ where: { orgId } });
  for (const t of allTypes) {
    invoiceTypes[t.code] = t.id;
  }
  console.log(`\nTotal invoice types: ${Object.keys(invoiceTypes).length}\n`);

  // ============================================================
  // 2. VENDORS (upsert by code)
  // ============================================================
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

  const vendors: Record<string, string> = {};
  for (const v of vendorDefs) {
    const existing = await prisma.vendor.findFirst({ where: { orgId, name: v.name } });
    if (existing) {
      vendors[v.code] = existing.id;
      console.log(`  Vendor exists: ${v.name}`);
    } else {
      const created = await prisma.vendor.create({
        data: { orgId, name: v.name, isActive: true },
      });
      vendors[v.code] = created.id;
      console.log(`  Vendor created: ${v.name}`);
    }
  }
  console.log(`\nTotal vendors: ${Object.keys(vendors).length}\n`);

  // ============================================================
  // 3. FREQUENCIES — add ONE_TIME if missing
  // ============================================================
  const oneTimeFreq = await prisma.frequency.findFirst({ where: { orgId, code: 'ONE_TIME' } });
  if (!oneTimeFreq) {
    await prisma.frequency.create({
      data: { orgId, code: 'ONE_TIME', name: 'One-Time', sortOrder: 7, isActive: true },
    });
    console.log('  Frequency created: ONE_TIME');
  } else {
    console.log('  Frequency exists: ONE_TIME');
  }

  // ============================================================
  // 4. PHARMACIES — map names to IDs
  // ============================================================
  const pharmacies = await prisma.pharmacy.findMany({ where: { orgId } });
  const pharmacyMap: Record<string, string> = {};
  for (const p of pharmacies) {
    pharmacyMap[p.name] = p.id;
  }

  const branchBrook = pharmacyMap['Branch Brook Pharmacy'];
  const hillPharmacy = pharmacyMap['Hill Pharmacy'];
  const masonRx = pharmacyMap['Mason Pharmacy'];
  const vimDrugs = pharmacyMap['VIM Drugs'];

  if (!branchBrook || !hillPharmacy || !masonRx || !vimDrugs) {
    console.error('Missing pharmacies:', { branchBrook, hillPharmacy, masonRx, vimDrugs });
    throw new Error('One or more pharmacies not found');
  }
  console.log(`\nPharmacies: Branch Brook=${branchBrook}, Hill=${hillPharmacy}, Mason=${masonRx}, VIM=${vimDrugs}\n`);

  // ============================================================
  // 5. REQUIREMENTS — per pharmacy from the spreadsheet
  // ============================================================

  // Helper: parse submission day text to number(s)
  function parseSubmissionDay(text: string): number {
    if (!text || text === '') return 5;
    const t = text.toLowerCase().trim();
    if (t.includes('18')) return 18;
    if (t.includes('5')) return 5;
    if (t.includes('1st') || t === '1st') return 1;
    if (t.includes('10')) return 10;
    if (t.includes('8')) return 8;
    if (t.includes('1 and 15')) return 1; // bi-weekly: 1st and 15th
    return 5; // default
  }

  type ReqDef = {
    invoiceTypeCode: string;
    vendorCode: string;
    frequency: RequirementFrequency;
    submissionDay: string;
    processingDueDay: number;
  };

  // Branch Brook requirements
  const branchBrookReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'BLUEBIRD_COPIER', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: 'CALI_CARTING', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'CARE_CLAIM', vendorCode: 'OMNISYS', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'OPTIMUM', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'PSEG', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'MILAN_PROPERTIES', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GOVT_TAXES', vendorCode: 'NJ_TAX_DEPT', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'PROTEK_SECURITY', frequency: 'QUARTERLY' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'MCKESSON', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'ANDA', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_5', vendorCode: 'TOP_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
  ];

  // Hill Pharmacy requirements
  const hillReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'CON_ED', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'OPTIMUM', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'LANGSAM_PROPERTIES', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: '5_BOROUGH_WASTE', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'WORLD_COPIER', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'PASSPORT_PHOTOS', vendorCode: 'AAA_ID_PASSPORT', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'TOP_ALARM', frequency: 'QUARTERLY' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'ANDA', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'TOP_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
  ];

  // Mason RX requirements
  const masonReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'CON_ED', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'OPTIMUM', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'SOPHER_MGMT', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: '5_BOROUGH_WASTE', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'JLC_COPY', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'PASSPORT_PHOTOS', vendorCode: 'AAA_ID_PASSPORT', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'TOP_ALARM', frequency: 'QUARTERLY' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'MCKESSON', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'ANDA', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_5', vendorCode: 'TOP_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_6', vendorCode: 'CITY_MED_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
  ];

  // VIM Drugs requirements
  const vimReqs: ReqDef[] = [
    { invoiceTypeCode: 'PHARMACY_SOFTWARE', vendorCode: 'BEST_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '18th day', processingDueDay: 5 },
    { invoiceTypeCode: 'ELECTRICAL_GAS', vendorCode: 'CON_ED', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'INTERNET', vendorCode: 'SPECTRUM', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'RENT', vendorCode: 'FRIEDLAND_PROPERTIES', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'GARBAGE_RECYCLING', vendorCode: 'ACTION_ENV', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '5th', processingDueDay: 5 },
    { invoiceTypeCode: 'COPY_MACHINE', vendorCode: 'BLUEBIRD_COPIER', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '8th', processingDueDay: 5 },
    { invoiceTypeCode: 'PASSPORT_PHOTOS', vendorCode: 'AAA_ID_PASSPORT', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '10th', processingDueDay: 5 },
    { invoiceTypeCode: 'FIRE_ALARM', vendorCode: 'TOP_ALARM', frequency: 'QUARTERLY' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'LABELS_VIALS', vendorCode: 'MC_CRACKEN', frequency: 'ONE_TIME' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_1', vendorCode: 'KINRAY', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_2', vendorCode: 'AMERISOURCE', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_3', vendorCode: 'MCKESSON', frequency: 'BI_WEEKLY' as RequirementFrequency, submissionDay: '1 and 15th', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_4', vendorCode: 'ANDA', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_5', vendorCode: 'TOP_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_6', vendorCode: 'CITY_MED_RX', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_7', vendorCode: 'BOB_BILA', frequency: 'QUARTERLY' as RequirementFrequency, submissionDay: '5', processingDueDay: 5 },
    { invoiceTypeCode: 'WHOLESALE_8', vendorCode: 'JJJ_DISTRIBUTROS', frequency: 'MONTHLY' as RequirementFrequency, submissionDay: '1st', processingDueDay: 5 },
  ];

  // Create requirements for each pharmacy
  async function createRequirements(pharmacyId: string, pharmacyName: string, reqs: ReqDef[]) {
    console.log(`\n--- Creating requirements for ${pharmacyName} ---`);
    let created = 0, skipped = 0;

    for (const req of reqs) {
      const typeId = invoiceTypes[req.invoiceTypeCode];
      const vendId = vendors[req.vendorCode];

      if (!typeId) { console.error(`  Missing invoice type: ${req.invoiceTypeCode}`); continue; }
      if (!vendId) { console.error(`  Missing vendor: ${req.vendorCode}`); continue; }

      // Check if requirement already exists for this pharmacy + type + vendor
      const existing = await prisma.invoiceRequirement.findFirst({
        where: { pharmacyId, invoiceTypeId: typeId, vendorId: vendId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const typeName = invoiceTypeDefs.find(t => t.code === req.invoiceTypeCode)?.name || req.invoiceTypeCode;
      const vendorName = vendorDefs.find(v => v.code === req.vendorCode)?.name || req.vendorCode;
      const subDay = parseSubmissionDay(req.submissionDay);

      await prisma.invoiceRequirement.create({
        data: {
          pharmacyId,
          invoiceTypeId: typeId,
          vendorId: vendId,
          name: `${typeName} - ${vendorName}`,
          frequency: req.frequency,
          submissionDueDay: subDay,
          processingDueDay: subDay + req.processingDueDay, // submission day + 5 days
          applicableMonths: req.frequency === 'QUARTERLY' ? '3,6,9,12' : undefined,
          isActive: true,
        },
      });
      created++;
    }
    console.log(`  Created: ${created}, Skipped (already exists): ${skipped}`);
  }

  await createRequirements(branchBrook, 'Branch Brook', branchBrookReqs);
  await createRequirements(hillPharmacy, 'Hill Pharmacy', hillReqs);
  await createRequirements(masonRx, 'Mason RX', masonReqs);
  await createRequirements(vimDrugs, 'VIM Drugs', vimReqs);

  // ============================================================
  // 6. GENERATE INSTANCES for current month + next 2 months
  // ============================================================
  console.log('\n\n--- Generating instances ---');

  const allRequirements = await prisma.invoiceRequirement.findMany({
    where: {
      pharmacyId: { in: [branchBrook, hillPharmacy, masonRx, vimDrugs] },
      isActive: true,
    },
    include: { pharmacy: true },
  });

  const now = new Date();
  const months: { start: Date; end: Date; label: string }[] = [];

  // Generate for current month and next 2 months
  for (let offset = 0; offset < 3; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    months.push({ start, end, label });
  }

  let instancesCreated = 0;
  let instancesSkipped = 0;

  for (const req of allRequirements) {
    // Skip ONE_TIME - create just one instance
    if (req.frequency === 'ONE_TIME') {
      const existing = await prisma.requirementInstance.findFirst({
        where: { requirementId: req.id },
      });
      if (!existing) {
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
      } else {
        instancesSkipped++;
      }
      continue;
    }

    for (const month of months) {
      // For QUARTERLY, check if this month applies
      if (req.frequency === 'QUARTERLY') {
        const monthNum = month.start.getMonth() + 1; // 1-indexed
        const applicable = (req.applicableMonths || '3,6,9,12').split(',').map(Number);
        if (!applicable.includes(monthNum)) continue;
      }

      // For BI_WEEKLY, create 2 instances per month (1st and 15th)
      if (req.frequency === 'BI_WEEKLY') {
        for (const biWeekDay of [1, 15]) {
          const periodStart = new Date(month.start.getFullYear(), month.start.getMonth(), biWeekDay);
          const periodEnd = biWeekDay === 1
            ? new Date(month.start.getFullYear(), month.start.getMonth(), 14, 23, 59, 59)
            : new Date(month.start.getFullYear(), month.start.getMonth() + 1, 0, 23, 59, 59);
          const periodLabel = `${month.label} (${biWeekDay === 1 ? '1st-14th' : '15th-end'})`;

          const existing = await prisma.requirementInstance.findFirst({
            where: { requirementId: req.id, periodStart: periodStart },
          });
          if (!existing) {
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
          } else {
            instancesSkipped++;
          }
        }
        continue;
      }

      // MONTHLY (and others)
      const existing = await prisma.requirementInstance.findFirst({
        where: {
          requirementId: req.id,
          periodStart: month.start,
        },
      });

      if (!existing) {
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
      } else {
        instancesSkipped++;
      }
    }
  }

  console.log(`  Instances created: ${instancesCreated}, skipped: ${instancesSkipped}`);

  // Summary
  const totalReqs = await prisma.invoiceRequirement.count({
    where: { pharmacyId: { in: [branchBrook, hillPharmacy, masonRx, vimDrugs] } },
  });
  const totalInstances = await prisma.requirementInstance.count({
    where: { requirement: { pharmacyId: { in: [branchBrook, hillPharmacy, masonRx, vimDrugs] } } },
  });

  console.log(`\n========================================`);
  console.log(`DONE!`);
  console.log(`  Total requirements: ${totalReqs}`);
  console.log(`  Total instances: ${totalInstances}`);
  console.log(`========================================\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
