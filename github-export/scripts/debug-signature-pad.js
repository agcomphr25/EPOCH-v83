// Debug script to test signature pad initialization
const SignaturePad = require('signature_pad');

console.log('SignaturePad constructor:', typeof SignaturePad);
console.log('SignaturePad prototype:', Object.getOwnPropertyNames(SignaturePad.prototype));

// Test with a mock canvas
const mockCanvas = {
  getContext: () => ({
    lineTo: () => {},
    moveTo: () => {},
    clearRect: () => {},
    stroke: () => {},
    beginPath: () => {},
    closePath: () => {},
    canvas: { width: 300, height: 150 }
  }),
  width: 300,
  height: 150,
  addEventListener: () => {},
  removeEventListener: () => {}
};

try {
  const pad = new SignaturePad(mockCanvas);
  console.log('SignaturePad created successfully');
  console.log('Available methods:', Object.getOwnPropertyNames(pad));
} catch (error) {
  console.error('Error creating SignaturePad:', error.message);
}