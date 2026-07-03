"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1.5rem", fontFamily: "sans-serif" }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
            <p style={{ marginTop: 8, color: "#666" }}>
              This demo environment hit an unexpected error. Your data is safe in your browser&apos;s
              local storage.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 20,
                padding: "8px 16px",
                borderRadius: 8,
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
