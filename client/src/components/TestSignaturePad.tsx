import React, { useRef, useEffect } from 'react';
import SignaturePad from 'signature_pad';

export default function TestSignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    console.log('Canvas element:', canvas);
    console.log('Canvas context:', canvas.getContext('2d'));
    
    try {
      // Set canvas size
      canvas.width = 400;
      canvas.height = 200;
      
      console.log('About to create SignaturePad with canvas:', canvas);
      console.log('Canvas context 2d:', canvas.getContext('2d'));
      console.log('SignaturePad constructor:', SignaturePad);
      
      // Create signature pad
      sigPadRef.current = new SignaturePad(canvas);
      console.log('SignaturePad created successfully');
      
      // Test methods
      console.log('Available methods:', Object.getOwnPropertyNames(sigPadRef.current));
      
    } catch (error) {
      console.error('Error creating signature pad:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Check if the error is related to useRef
      if (error.message.includes('useRef')) {
        console.error('This is a useRef related error!');
        console.error('Checking canvas properties:', Object.getOwnPropertyNames(canvas));
      }
    }

    return () => {
      if (sigPadRef.current) {
        sigPadRef.current.clear();
        sigPadRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', margin: '20px' }}>
      <h3>Test Signature Pad</h3>
      <canvas
        ref={canvasRef}
        style={{
          border: '1px solid #000',
          display: 'block',
          width: '400px',
          height: '200px'
        }}
      />
      <button onClick={() => sigPadRef.current?.clear()}>Clear</button>
      <button onClick={() => console.log('Data URL:', sigPadRef.current?.toDataURL())}>
        Get Data URL
      </button>
    </div>
  );
}