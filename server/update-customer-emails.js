import fs from 'fs';
import path from 'path';
import { db } from './storage.js';

// Function to normalize customer names for better matching
function normalizeCustomerName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s&()-]/g, '')
    .replace(/\b(llc|inc|ltd|corporation|corp|company|co|custom|precision|firearms|gunworks|arms|tactical|outdoors)\b/gi, '')
    .trim();
}

// Function to calculate similarity between two strings
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// Levenshtein distance calculation
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Function to validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function updateCustomerEmails() {
  try {
    console.log('Starting customer email update process...');
    
    // Read CSV file
    const csvPath = path.join(process.cwd(), 'attached_assets', 'Customers export emails_1754623675320.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    
    // Parse CSV content
    const lines = csvContent.split('\n').slice(1); // Skip header
    const csvCustomers = [];
    
    for (const line of lines) {
      if (line.trim()) {
        const [name, email] = line.split(',').map(s => s.trim().replace(/"/g, ''));
        if (name && email && isValidEmail(email)) {
          csvCustomers.push({
            originalName: name,
            normalizedName: normalizeCustomerName(name),
            email: email
          });
        }
      }
    }
    
    console.log(`Parsed ${csvCustomers.length} valid customer records from CSV`);
    
    // Get customers without emails from database
    const customersWithoutEmails = await db.execute(`
      SELECT id, name FROM customers 
      WHERE email IS NULL OR email = '' 
      ORDER BY name
    `);
    
    console.log(`Found ${customersWithoutEmails.length} customers without emails in database`);
    
    let matchedCount = 0;
    let updatedCount = 0;
    const matches = [];
    
    // Match customers
    for (const dbCustomer of customersWithoutEmails) {
      const normalizedDbName = normalizeCustomerName(dbCustomer.name);
      let bestMatch = null;
      let bestSimilarity = 0;
      
      // Try exact match first
      const exactMatch = csvCustomers.find(csvCustomer => 
        csvCustomer.normalizedName === normalizedDbName
      );
      
      if (exactMatch) {
        bestMatch = exactMatch;
        bestSimilarity = 1.0;
      } else {
        // Try fuzzy matching
        for (const csvCustomer of csvCustomers) {
          const similarity = calculateSimilarity(normalizedDbName, csvCustomer.normalizedName);
          
          if (similarity > bestSimilarity && similarity >= 0.8) {
            bestMatch = csvCustomer;
            bestSimilarity = similarity;
          }
        }
      }
      
      if (bestMatch && bestSimilarity >= 0.8) {
        matches.push({
          id: dbCustomer.id,
          dbName: dbCustomer.name,
          csvName: bestMatch.originalName,
          email: bestMatch.email,
          similarity: bestSimilarity
        });
        matchedCount++;
      }
    }
    
    console.log(`Found ${matchedCount} potential matches`);
    console.log('\nMatches found:');
    
    // Show matches for review
    for (const match of matches.slice(0, 10)) { // Show first 10 for review
      console.log(`DB: "${match.dbName}" -> CSV: "${match.csvName}" (${match.email}) - Similarity: ${(match.similarity * 100).toFixed(1)}%`);
    }
    
    if (matches.length > 10) {
      console.log(`... and ${matches.length - 10} more matches`);
    }
    
    // Update database with matches
    console.log('\nUpdating database...');
    
    for (const match of matches) {
      try {
        await db.execute(`
          UPDATE customers 
          SET email = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [match.email, match.id]);
        
        updatedCount++;
      } catch (error) {
        console.error(`Error updating customer ${match.id}:`, error.message);
      }
    }
    
    console.log(`\nUpdate complete!`);
    console.log(`- Customers processed: ${customersWithoutEmails.length}`);
    console.log(`- Matches found: ${matchedCount}`);
    console.log(`- Successfully updated: ${updatedCount}`);
    console.log(`- Customers still without emails: ${customersWithoutEmails.length - updatedCount}`);
    
    return {
      processed: customersWithoutEmails.length,
      matched: matchedCount,
      updated: updatedCount,
      remaining: customersWithoutEmails.length - updatedCount
    };
    
  } catch (error) {
    console.error('Error during email update process:', error);
    throw error;
  }
}

// Run the update if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateCustomerEmails()
    .then(result => {
      console.log('\nFinal results:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Process failed:', error);
      process.exit(1);
    });
}

export { updateCustomerEmails };