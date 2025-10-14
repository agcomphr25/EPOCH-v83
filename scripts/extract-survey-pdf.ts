import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Use dynamic import for pdf-parse
async function extractSurveyFromPDF() {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const pdfPath = path.join(process.cwd(), 'attached_assets', 'Customer Survey Greg Patterson July 2025_1760455174845.pdf');
    
    // Read the PDF file
    const dataBuffer = await fs.readFile(pdfPath);
    
    // Parse the PDF
    const data = await pdfParse(dataBuffer);
    
    console.log('PDF Text Content:');
    console.log('='.repeat(80));
    console.log(data.text);
    console.log('='.repeat(80));
    console.log(`\nTotal pages: ${data.numpages}`);
    
    // Save to a text file for easier analysis
    const outputPath = path.join(process.cwd(), 'attached_assets', 'survey-extracted.txt');
    await fs.writeFile(outputPath, data.text);
    console.log(`\nExtracted text saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error extracting PDF:', error);
    process.exit(1);
  }
}

extractSurveyFromPDF();
