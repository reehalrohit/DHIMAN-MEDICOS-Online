"use client";

import { useEffect, useState } from "react";

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();

      setDeferredPrompt(e);

      setShowInstall(true);
    };

    window.addEventListener(
      "beforeinstallprompt",
      handler
    );

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handler
      );
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    const result =
      await deferredPrompt.userChoice;

    if (result.outcome === "accepted") {
      console.log("PWA installed");
    }

    setDeferredPrompt(null);
    setShowInstall(false);
  };

  const closePopup = () => {
    setShowInstall(false);
  };

  if (!showInstall) return null;

  return (
    <div className="install-popup">
      <div className="install-content">
        <div>
          <h3>Install Dhiman Medicos</h3>

          <p>
            Get faster access like a real app.
          </p>
        </div>

        <div className="install-actions">
          <button
            className="install-btn"
            onClick={installApp}
          >
            Install
          </button>

          <button
            className="close-btn"
            onClick={closePopup}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
