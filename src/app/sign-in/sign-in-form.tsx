"use client";

import { useEffect, useState, useTransition } from "react";
import { requestCode, verifyCode } from "./actions";

const button = "rounded-lg bg-teal-800 px-4 py-3 font-medium text-white disabled:opacity-50";
const input = "w-full rounded-lg border border-slate-300 px-3 py-3 text-slate-950 focus:outline-2 focus:outline-teal-700";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  function send() {
    startTransition(async () => {
      try {
        const result = await requestCode(email);
        setMessage(result.message);
        setError(!result.ok);
        if (result.retryAfter) setCooldownUntil(Date.now() + result.retryAfter * 1000);
        if (result.ok) { setSent(true); setCode(""); }
      } catch {
        setError(true); setMessage("Unable to connect. Please try again.");
      }
    });
  }

  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (!sent) { send(); return; }
      startTransition(async () => {
        try {
          const result = await verifyCode(email, code);
          setMessage(result.message); setError(!result.ok);
          if (result.retryAfter) setCooldownUntil(Date.now() + result.retryAfter * 1000);
        } catch {
          setError(true); setMessage("Unable to connect. Please try again.");
        }
      });
    }}>
      {sent ? <>
        <p className="break-words text-sm text-slate-600">Enter the code sent to {email.trim()}. It expires in 10 minutes.</p>
        <label htmlFor="code" className="font-medium">Sign-in code</label>
        <input id="code" name="code" className={input} inputMode="numeric" autoComplete="one-time-code" pattern="([0-9]{6}|[0-9]{8})" maxLength={8} required value={code} disabled={pending} onChange={(event) => setCode(event.target.value)} />
        <button className={button} disabled={pending} type="submit">{pending ? "Please wait…" : "Verify code"}</button>
        <button className="text-teal-800 underline disabled:opacity-50" type="button" disabled={pending || remaining > 0} onClick={send}>{remaining > 0 ? `Resend code in ${remaining}s` : "Resend code"}</button>
        <button className="text-teal-800 underline disabled:opacity-50" type="button" disabled={pending} onClick={() => { setSent(false); setCode(""); setMessage(""); }}>Change email</button>
      </> : <>
        <label htmlFor="email" className="font-medium">Email address</label>
        <input id="email" name="email" className={input} type="email" autoComplete="email" maxLength={254} required value={email} disabled={pending} onChange={(event) => setEmail(event.target.value)} />
        <button className={button} disabled={pending || remaining > 0} type="submit">{pending ? "Sending…" : remaining > 0 ? `Send code in ${remaining}s` : "Send code"}</button>
      </>}
      {message && <p role={error ? "alert" : "status"} className={error ? "text-sm text-red-800" : "text-sm text-slate-600"}>{message}</p>}
    </form>
  );
}
