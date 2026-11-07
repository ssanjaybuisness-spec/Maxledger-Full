
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GoogleAuth from "./components/GoogleAuth";
import WelcomeScreen from "./components/WelcomeScreen";
import { Preferences } from "@capacitor/preferences";
import { auth, onAuthStateChanged } from "./services/firebase";
import { showToast } from "./services/toast";
import "./styles.css";
import "./styles/premium-ui.css";
// Show themed toasts instead of the plain system alert pop-ups.
window.alert = (message?: unknown) => {
  showToast(String(message ?? ""));
};

function Root() {
  const [user, setUser] = useState<typeof auth.currentUser>(null);
  const [checking, setChecking] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, currentUser => {
      setUser(currentUser);
      setChecking(false);
    });
  }, []);

  // Show the welcome screen once per account on each device.
  useEffect(() => {
    if (!user) {
      setShowWelcome(false);
      return;
    }

    let cancelled = false;
    const key = `maxledger_welcomed_${user.uid}`;

    Preferences.get({ key })
      .then(({ value }) => {
        if (!cancelled) setShowWelcome(!value);
      })
      .catch(() => {
        if (!cancelled) setShowWelcome(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  function dismissWelcome() {
    setShowWelcome(false);

    if (user) {
      void Preferences.set({
        key: `maxledger_welcomed_${user.uid}`,
        value: "1"
      }).catch(() => undefined);
    }
  }

  if (checking) {
    return <main className="app-shell"><h2>Checking sign-in...</h2></main>;
  }

  if (!user) {
    return <GoogleAuth />;
  }

  const isNewAccount =
    Boolean(user.metadata?.creationTime) &&
    user.metadata.creationTime === user.metadata.lastSignInTime;

  return (
    <>
      <App />
      {showWelcome && (
        <WelcomeScreen
          displayName={user.displayName || ""}
          email={user.email || ""}
          isNewAccount={isNewAccount}
          onContinue={dismissWelcome}
        />
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
