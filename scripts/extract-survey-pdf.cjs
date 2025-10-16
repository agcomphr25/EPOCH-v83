const fs = require('fs').promises;
const path = require('path');
const pdfLib = require('pdf-parse');

async function extractSurveyFromPDF() {
  try {
    const pdfPath = path.join(
      process.cwd(),
      'attached_assets',
      'Customer Survey Greg Patterson July 2025_1760455174845.pdf'
    );

    // Read the PDF file
    const dataBuffer = await fs.readFile(pdfPath);

    // Parse the PDF using PDFParse class
    const parser = new pdfLib.PDFParse(dataBuffer);
    const data = await parser.parse();

    console.log('PDF Text Content:');
    console.log('='.repeat(80));
    console.log(data.text);
    console.log('='.repeat(80));
    console.log(`\nTotal pages: ${data.numpages}`);

    // Save to a text file for easier analysis
    const outputPath = path.join(
      process.cwd(),
      'attached_assets',
      'survey-extracted.txt'
    );
    await fs.writeFile(outputPath, data.text);
    console.log(`\nExtracted text saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error extracting PDF:', error);
    process.exit(1);
  }
}

extractSurveyFromPDF();
