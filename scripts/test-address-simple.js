// Test script to run in browser console
async function testAddressAPI() {
  console.log('Testing address API...');
  
  const query = '123 Main';
  const url = `/api/address/autocomplete?query=${encodeURIComponent(query)}`;
  
  console.log('Making request to:', url);
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    console.log('Response ok:', response.ok);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Success! API response:', data);
    return data;
  } catch (error) {
    console.error('Error during API call:', error);
    throw error;
  }
}

// Run the test
testAddressAPI();