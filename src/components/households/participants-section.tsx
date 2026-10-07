"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HouseholdForm, NameFields } from "@/app/households/forms";

export function ParticipantsSection({ householdId, children }: { householdId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const formContainer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) formContainer.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [open]);
  return <section id="participants" className="mt-8" aria-labelledby="participants-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="participants-heading" className="text-2xl font-semibold">Participants</h2>
      <button ref={addButton} type="button" aria-expanded={open} aria-controls={formId} onClick={() => setOpen(value => !value)} className="min-h-11 rounded-lg bg-teal-800 px-4 py-2 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2">Add participant</button>
    </div>
    <p>Participants can be adults or children, with or without accounts.</p>
    {children}
    <div id={formId} ref={formContainer} hidden={!open}>
      {open && <>
        <h3 className="mt-6 text-xl font-semibold">Add participant</h3>
        <HouseholdForm command="participant" values={{ householdId }} label="Save participant">
          <NameFields lastNameRequired={false} />
          <label className="block">Participant type<select name="memberType" className="ml-3 rounded border p-2"><option value="adult">Adult</option><option value="child">Child</option></select></label>
          <button type="button" className="min-h-11 rounded-lg border px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => {
            setOpen(false);
            addButton.current?.focus();
          }}>Cancel</button>
        </HouseholdForm>
      </>}
    </div>
  </section>;
}
