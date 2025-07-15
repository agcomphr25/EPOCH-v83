// Simple Node.js script to capture browser console errors
const { chromium } = require('playwright');

(async () => {
  try {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    // Capture all console messages
    const logs = [];
    page.on('console', (msg) => {
      logs.push(`${msg.type()}: ${msg.text()}`);
    });
    
    // Capture page errors
    const pageErrors = [];
    page.on('pageerror', (error) => {
      pageErrors.push({
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    });
    
    console.log('Navigating to localhost:5000...');
    await page.goto('http://localhost:5000', { waitUntil: 'networkidle' });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    console.log('\n=== CONSOLE LOGS ===');
    logs.forEach((log, i) => {
      console.log(`${i + 1}. ${log}`);
    });
    
    console.log('\n=== PAGE ERRORS ===');
    pageErrors.forEach((error, i) => {
      console.log(`\nError ${i + 1}:`);
      console.log('Message:', error.message);
      console.log('Stack:', error.stack);
    });
    
    // Check if there's an error overlay visible
    const errorOverlay = await page.locator('[data-vite-error-overlay]').count();
    console.log('\n=== ERROR OVERLAY ===');
    console.log('Visible:', errorOverlay > 0);
    
    if (errorOverlay > 0) {
      const errorContent = await page.locator('[data-vite-error-overlay]').textContent();
      console.log('Content:', errorContent);
    }
    
    await browser.close();
    
  } catch (error) {
    console.error('Script failed:', error);
  }
})();