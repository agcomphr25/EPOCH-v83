/**
 * Seed script to create "Onboarding Documents" folder in Media Library
 * This folder is visible to ADMIN only and intended for signable PDF templates
 * 
 * NOTE: This script will skip gracefully if media_folders table doesn't exist yet.
 */

import { db } from '../db';
import { mediaFolders } from '../schema';
import { eq, sql } from 'drizzle-orm';

async function seedOnboardingFolder() {
  console.log('🗂️ Checking for Onboarding Documents folder...');
  
  // Check if media_folders table exists
  const tableCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'media_folders'
    );
  `);
  
  const tableExists = (tableCheck.rows[0] as any)?.exists;
  
  if (!tableExists) {
    console.log('⚠️ media_folders table does not exist yet. Skipping folder creation.');
    console.log('   Run this seed again after the table is created.');
    return null;
  }
  
  const existing = await db
    .select()
    .from(mediaFolders)
    .where(eq(mediaFolders.name, 'Onboarding Documents'))
    .limit(1);
  
  if (existing.length > 0) {
    console.log('✅ Onboarding Documents folder already exists:', existing[0].id);
    return existing[0];
  }
  
  console.log('📁 Creating Onboarding Documents folder...');
  
  const [folder] = await db
    .insert(mediaFolders)
    .values({
      name: 'Onboarding Documents',
      parentId: null, // Root level folder
      visibleToRoles: ['ADMIN'], // Admin-only visibility
      createdByName: 'System',
    })
    .returning();
  
  console.log('✅ Onboarding Documents folder created:', folder.id);
  return folder;
}

seedOnboardingFolder()
  .then(() => {
    console.log('🎉 Seed complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
