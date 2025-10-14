const fs = require('fs');
const path = require('path');

// Use pdfjs-dist which is already installed
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function extractPDFText() {
  try {
    const pdfPath = path.join(__dirname, '..', 'attached_assets', 'Customer Survey Greg Patterson July 2025_1760455174845.pdf');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    
    const loadingTask = pdfjsLib.getDocument({data});
    const pdf = await loadingTask.promise;
    
    console.log('PDF loaded successfully');
    console.log(`Total pages: ${pdf.numPages}`);
    console.log('='.repeat(80));
    
    let fullText = '';
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      
      console.log(`\nPage ${pageNum}:`);
      console.log(pageText);
      fullText += pageText + '\n\n';
    }
    
    // Save to file
    const outputPath = path.join(__dirname, '..', 'attached_assets', 'survey-extracted.txt');
    fs.writeFileSync(outputPath, fullText);
    console.log('\n' + '='.repeat(80));
    console.log(`\nExtracted text saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

extractPDFText();
