import XLSX from 'xlsx';

const filePath = 'attached_assets/Ready to Ship Stocks (version 1)_1762023743348.xlsx';
const workbook = XLSX.readFile(filePath);

console.log('Available Sheets:', workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  console.log('\n=== Sheet:', sheetName, '===');
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log('Total Rows:', data.length);
  if (data.length > 0) {
    console.log('Columns:', Object.keys(data[0]).join(', '));
    console.log('\nFirst 5 rows:');
    console.log(JSON.stringify(data.slice(0, 5), null, 2));
  }
});
