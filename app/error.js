"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("Application Error:", error);
  }, [error]);

  return (
    <div className="state-page">
      <div className="state-card">
        <div className="state-icon">⚠️</div>
        <h1>Something went wrong</h1>
        <p>An unexpected error occurred. Please try again.</p>

        <div className="state-actions">
          <button onClick={() => reset()} className="state-btn-primary">
            Try Again
          </button>
          <button onClick={() => window.location.reload()} className="state-btn-secondary">
            Reload Page
          </button>
        </div>

        {process.env.NODE_ENV === "development" && (
          <details className="state-details">
            <summary>Error Details</summary>
            <pre>{error?.message}</pre>
            <pre>{error?.stack}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
