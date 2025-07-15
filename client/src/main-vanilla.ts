// Vanilla JavaScript approach to bypass Vite React plugin issues
document.addEventListener('DOMContentLoaded', function() {
    const root = document.getElementById('root');
    if (root) {
        root.innerHTML = `
            <div style="padding: 20px; background-color: #f0f0f0; border: 2px solid #333;">
                <h1 style="color: #333;">EPOCH v8 - Manufacturing ERP (Vanilla JS Mode)</h1>
                <p>Application is running in vanilla JavaScript mode due to Vite React plugin issues.</p>
                <div style="margin-top: 20px;">
                    <h2>Available Pages:</h2>
                    <ul>
                        <li><a href="/order-entry">Order Entry</a></li>
                        <li><a href="/orders">Orders List</a></li>
                        <li><a href="/discounts">Discount Management</a></li>
                    </ul>
                </div>
                <div style="margin-top: 20px; padding: 10px; background-color: #ffe0e0; border: 1px solid #ff0000;">
                    <strong>Technical Issue:</strong> Vite React plugin configuration error prevents React from mounting.
                    <br>Error: "@vitejs/plugin-react can't detect preamble"
                </div>
            </div>
        `;
        console.log('Vanilla JS version loaded successfully');
    }
});