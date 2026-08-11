"use client";

import { useState } from "react";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";

export default function MarketingSignIn({ error, onError }: { error: string; onError: (message: string) => void }) {
  const [password, setPassword] = useState("");
  const email = "stephenraj040899@gmail.com";
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const auth = firebaseAuth();
    if (!auth) return onError("Firebase web authentication is not configured.");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch { onError("The email or password is incorrect. Use Reset password if this is your first sign-in."); }
  }
  async function resetPassword() { const auth = firebaseAuth(); if (!auth) return; try { await sendPasswordResetEmail(auth, email); onError("Password reset email sent."); } catch { onError("Unable to send the password reset email."); } }
  return <main style={{ minHeight: "100vh", background: "#f4f2eb", display: "grid", placeItems: "center", padding: 24, color: "#18392c", fontFamily: "Arial, sans-serif" }}><section style={{ width: "100%", maxWidth: 460, background: "#fff", border: "1px solid #dfe3df", borderRadius: 16, padding: 30 }}><span style={{ color: "#b55b35", fontSize: 10, fontWeight: 800, letterSpacing: 1.5 }}>MARKETING OS · SHARED WORKSPACE</span><h1>Sign in to continue</h1><p style={{ color: "#68776f", lineHeight: 1.6 }}>Leads, events and outreach activity are stored securely in Firestore and shared across authorized devices.</p>{isFirebaseClientConfigured ? <form onSubmit={signIn} style={{ display: "grid", gap: 10 }}><label style={{ display: "grid", gap: 5, fontSize: 11 }}>Authorized email<input value={email} readOnly style={{ border: "1px solid #ccd5cf", borderRadius: 8, padding: 11 }} /></label><label style={{ display: "grid", gap: 5, fontSize: 11 }}>Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} style={{ border: "1px solid #ccd5cf", borderRadius: 8, padding: 11 }} /></label><button style={{ background: "#18392c", border: 0, borderRadius: 9, color: "#fff", cursor: "pointer", fontWeight: 800, padding: "12px 16px" }}>Sign in</button><button type="button" onClick={() => void resetPassword()} style={{ background: "#fff", border: 0, color: "#18392c", cursor: "pointer", textDecoration: "underline" }}>Reset password</button></form> : <p>Firebase web authentication is not configured.</p>}{error && <p role="alert" style={{ color: error.includes("sent") ? "#24633b" : "#9a3c25" }}>{error}</p>}</section></main>;
}
