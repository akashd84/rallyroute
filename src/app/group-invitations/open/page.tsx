"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { captureGroupInvitation } from "@/app/groups/actions";

export default function OpenGroupInvitation() {
  const router = useRouter();
  const started = useRef(false);
  const [message, setMessage] = useState("Opening your invitation…");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Fragments never reach HTTP request/access logs. Strip before any network call.
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    void (async () => {
      try {
        await Promise.resolve();
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid invitation fragment");
        const bytes = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
        const hash = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
        const result = await captureGroupInvitation(hash);
        if (result.ok) router.replace("/group-invitations/accept");
        else setMessage(result.message);
      } catch { setMessage("Unable to open this invitation. Open the original link again to retry."); }
    })();
  }, [router]);
  return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-semibold">Group invitation</h1><p role="status" className="my-4">{message}</p><Link href="/account" className="underline">Your account</Link></main>;
}
