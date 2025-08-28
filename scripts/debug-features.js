// Debug script to check feature structure
const axios = require('axios');

async function debugFeatures() {
  try {
    const response = await axios.get('http://localhost:5000/api/features');
    const features = response.data;
    
    const otherOptions = features.find(f => f.id === 'other_options');
    console.log('Other Options Feature:');
    console.log('ID:', otherOptions.id);
    console.log('Type:', otherOptions.type);
    console.log('Options type:', typeof otherOptions.options);
    console.log('Options value:', otherOptions.options);
    
    if (typeof otherOptions.options === 'string') {
      console.log('Options are stored as string, parsing...');
      const parsed = JSON.parse(otherOptions.options);
      console.log('Parsed options:', parsed);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugFeatures();