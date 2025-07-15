import React, { useState, useEffect, useRef } from "react";
import debounce from "lodash.debounce";

export default function BareSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    debouncedRef.current = debounce(() => {
      console.log("Would search for:", searchQuery);
    }, 300);

    return () => {
      if (debouncedRef.current && (debouncedRef.current as any).cancel) {
        (debouncedRef.current as any).cancel();
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedRef.current) {
      debouncedRef.current();
    }
  }, [searchQuery]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Bare Search Test</h1>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Type something..."
        style={{ padding: 8, fontSize: 16, width: "100%" }}
      />
    </div>
  );
}