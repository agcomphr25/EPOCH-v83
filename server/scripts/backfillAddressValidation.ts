import { db } from '../db';
import { customerAddresses } from '../schema';
import { isNull, sql } from 'drizzle-orm';
import { validateAndNormalize, fromLegacyFields, toLegacyFields } from '../src/domain/address/addressService';

const BATCH_SIZE = 50;
const DELAY_MS = 500;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillAddressValidation() {
  console.log('🔄 Starting address validation backfill...');

  const unvalidated = await db
    .select()
    .from(customerAddresses)
    .where(isNull(customerAddresses.validationStatus));

  console.log(`📊 Found ${unvalidated.length} addresses without validation status`);

  let validated = 0;
  let invalid = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < unvalidated.length; i += BATCH_SIZE) {
    const batch = unvalidated.slice(i, i + BATCH_SIZE);
    console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} addresses)...`);

    for (const addr of batch) {
      if (!addr.street || !addr.city || !addr.state || !addr.zipCode) {
        skipped++;
        console.log(`  ⏭️ Skipped address ${addr.id} — missing required fields`);
        continue;
      }

      try {
        const input = fromLegacyFields({
          street: addr.street,
          city: addr.city,
          state: addr.state,
          zipCode: addr.zipCode,
          country: addr.country || 'United States',
        });

        const result = await validateAndNormalize(input);

        if (result.success) {
          const legacyFields = toLegacyFields(result.address);
          await db
            .update(customerAddresses)
            .set({
              ...legacyFields,
              validationStatus: result.address.status,
              validatedAt: result.address.validatedAt || new Date(),
              validationProvider: result.address.validationProvider || null,
              dpvMatchCode: result.address.dpvMatchCode || null,
            })
            .where(sql`${customerAddresses.id} = ${addr.id}`);
          validated++;
          console.log(`  ✅ Address ${addr.id} → ${result.address.status}`);
        } else {
          await db
            .update(customerAddresses)
            .set({
              validationStatus: result.address.status,
              validatedAt: new Date(),
              validationProvider: result.address.validationProvider || null,
              dpvMatchCode: result.address.dpvMatchCode || null,
            })
            .where(sql`${customerAddresses.id} = ${addr.id}`);
          invalid++;
          console.log(`  ❌ Address ${addr.id} → ${result.address.status}: ${result.message}`);
        }
      } catch (err) {
        errors++;
        console.error(`  💥 Error processing address ${addr.id}:`, err);
      }
    }

    if (i + BATCH_SIZE < unvalidated.length) {
      console.log(`  ⏳ Waiting ${DELAY_MS}ms before next batch...`);
      await sleep(DELAY_MS);
    }
  }

  console.log('\n📊 Backfill Summary:');
  console.log(`  Total processed: ${unvalidated.length}`);
  console.log(`  Validated: ${validated}`);
  console.log(`  Invalid: ${invalid}`);
  console.log(`  Skipped (missing fields): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log('✅ Backfill complete');
}

backfillAddressValidation()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('💥 Backfill failed:', err);
    process.exit(1);
  });
