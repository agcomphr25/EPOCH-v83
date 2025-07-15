// Test script to reproduce the React error
const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', (msg) => {
      console.log('CONSOLE:', msg.text());
    });
    
    // Enable error logging  
    page.on('pageerror', (error) => {
      console.log('PAGE ERROR:', error.message);
    });
    
    await page.goto('http://localhost:5000');
    
    // Wait for any errors to appear
    await page.waitForTimeout(3000);
    
    await browser.close();
  } catch (error) {
    console.error('Script error:', error);
  }
})();