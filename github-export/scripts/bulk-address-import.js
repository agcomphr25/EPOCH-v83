/**
 * Bulk Address Import Script
 * This script allows you to import addresses for existing customers (IDs 11-115)
 * who were created without addresses in the original database setup.
 */

import fs from 'fs';
import csv from 'csv-parser';

// Example CSV format expected:
// customer_id,street,city,state,zip_code,country,type
// 11,"123 Main St","Anytown","NY","12345","United States","both"
// 12,"456 Oak Ave","Springfield","IL","62701","United States","both"

class BulkAddressImporter {
  constructor(apiBaseUrl = 'http://localhost:5000') {
    this.apiBaseUrl = apiBaseUrl;
  }

  async importFromCSV(csvFilePath) {
    console.log(`Starting bulk address import from ${csvFilePath}`);
    
    const addresses = [];
    
    return new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          addresses.push({
            customerId: row.customer_id.toString(),
            street: row.street,
            city: row.city,
            state: row.state,
            zipCode: row.zip_code,
            country: row.country || 'United States',
            type: row.type || 'both',
            isDefault: row.is_default === 'true' || row.is_default === true
          });
        })
        .on('end', async () => {
          try {
            console.log(`Found ${addresses.length} addresses to import`);
            const results = await this.processAddresses(addresses);
            resolve(results);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  async processAddresses(addresses) {
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const address of addresses) {
      try {
        // Validate customer exists
        const customerExists = await this.validateCustomer(address.customerId);
        if (!customerExists) {
          results.failed++;
          results.errors.push(`Customer ID ${address.customerId} not found`);
          continue;
        }

        // Create address
        const response = await fetch(`${this.apiBaseUrl}/api/addresses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(address)
        });

        if (response.ok) {
          results.successful++;
          console.log(`✓ Created address for customer ${address.customerId}`);
        } else {
          results.failed++;
          const error = await response.text();
          results.errors.push(`Customer ${address.customerId}: ${error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`Customer ${address.customerId}: ${error.message}`);
      }
    }

    return results;
  }

  async validateCustomer(customerId) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/customers/${customerId}`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async generateSampleCSV(outputPath = 'sample-addresses.csv') {
    const sampleData = [
      'customer_id,street,city,state,zip_code,country,type,is_default',
      '11,"123 Main Street","Anytown","NY","12345","United States","both","true"',
      '12,"456 Oak Avenue","Springfield","IL","62701","United States","both","true"',
      '20,"789 Pine Road","Denver","CO","80202","United States","both","true"',
      '// Add more rows for customers 11-115 as needed'
    ];

    fs.writeFileSync(outputPath, sampleData.join('\n'));
    console.log(`Sample CSV created at ${outputPath}`);
  }

  async bulkCreateForMissingCustomers() {
    console.log('Creating placeholder addresses for customers without addresses...');
    
    // Get all customers
    const customersResponse = await fetch(`${this.apiBaseUrl}/api/customers`);
    const customers = await customersResponse.json();
    
    // Get all addresses
    const addressesResponse = await fetch(`${this.apiBaseUrl}/api/addresses/all`);
    const addresses = await addressesResponse.json();
    
    // Find customers without addresses
    const addressedCustomerIds = new Set(addresses.map(addr => parseInt(addr.customerId)));
    const customersWithoutAddresses = customers.filter(c => !addressedCustomerIds.has(c.id));
    
    console.log(`Found ${customersWithoutAddresses.length} customers without addresses`);
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const customer of customersWithoutAddresses) {
      try {
        const placeholderAddress = {
          customerId: customer.id.toString(),
          street: 'Address not provided',
          city: 'Unknown',
          state: 'Unknown',
          zipCode: '00000',
          country: 'United States',
          type: 'both',
          isDefault: true
        };

        const response = await fetch(`${this.apiBaseUrl}/api/addresses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(placeholderAddress)
        });

        if (response.ok) {
          results.successful++;
          console.log(`✓ Created placeholder address for ${customer.name} (ID: ${customer.id})`);
        } else {
          results.failed++;
          const error = await response.text();
          results.errors.push(`${customer.name}: ${error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${customer.name}: ${error.message}`);
      }
    }

    return results;
  }
}

// Usage examples:
async function main() {
  const importer = new BulkAddressImporter();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'sample':
      await importer.generateSampleCSV();
      break;
      
    case 'import':
      const csvFile = process.argv[3];
      if (!csvFile) {
        console.error('Please provide CSV file path');
        process.exit(1);
      }
      const results = await importer.importFromCSV(csvFile);
      console.log('Import Results:', results);
      break;
      
    case 'placeholder':
      const placeholderResults = await importer.bulkCreateForMissingCustomers();
      console.log('Placeholder Creation Results:', placeholderResults);
      break;
      
    default:
      console.log('Usage:');
      console.log('  node bulk-address-import.js sample              # Generate sample CSV');
      console.log('  node bulk-address-import.js import <csv-file>   # Import from CSV');
      console.log('  node bulk-address-import.js placeholder         # Create placeholder addresses');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default BulkAddressImporter;