import React, { useState } from "react";

export default function BareSearch() {
  const [searchQuery, setSearchQuery] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    console.log("Typing:", value);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Minimal React Test</h1>
      <p>Current value: {searchQuery}</p>
      <input
        value={searchQuery}
        onChange={handleChange}
        placeholder="Type something..."
        style={{ padding: 8, fontSize: 16, width: "100%" }}
      />
      <button onClick={() => console.log("Button clicked!")}>
        Test Click
      </button>
    </div>
  );
}