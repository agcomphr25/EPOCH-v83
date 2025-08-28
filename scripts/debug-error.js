// Debug script to capture the exact error
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Capture all errors
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push({
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  });
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });
  
  try {
    await page.goto('http://localhost:5000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    console.log('\n=== CAPTURED ERRORS ===');
    errors.forEach((error, i) => {
      console.log(`\nError ${i + 1}:`);
      console.log('Message:', error.message);
      console.log('Stack:', error.stack);
    });
    
    // Check if error overlay is visible
    const errorOverlay = await page.locator('[data-vite-error-overlay]').count();
    console.log('\nError overlay visible:', errorOverlay > 0);
    
    if (errorOverlay > 0) {
      const errorText = await page.locator('[data-vite-error-overlay]').textContent();
      console.log('Error overlay text:', errorText);
    }
    
  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await browser.close();
  }
})();