"use client";
import { useRouter } from "next/navigation";
import { householdAction } from "./actions";
import { WorkflowForm } from "@/components/workflow-form";

export function HouseholdForm(props: Omit<Parameters<typeof WorkflowForm>[0], "submitAction">) {
  return <WorkflowForm {...props} submitAction={householdAction} />;
}
export function NameFields({ firstName = "", lastName = "", lastNameRequired = true }: { firstName?: string | null; lastName?: string | null; lastNameRequired?: boolean }) {
  return <><label className="block">First name<input name="firstName" required maxLength={100} defaultValue={firstName ?? ""} className="block w-full rounded border p-2" autoComplete="given-name" /></label>
    <label className="block">Last name<input name="lastName" required={lastNameRequired} maxLength={100} defaultValue={lastName ?? ""} className="block w-full rounded border p-2" autoComplete="family-name" /></label>{!lastNameRequired && <p className="text-sm text-slate-600">Last name is optional for transportation participants.</p>}</>;
}
export function HouseholdSelector({ households, selected }: { households: { id: string; display_name: string | null }[]; selected?: string }) {
  const router = useRouter();
  return <label className="block my-4">Household<select aria-label="Household" value={selected ?? ""} onChange={event => { if (event.target.value) router.push(`/households/${event.target.value}`); }} className="ml-3 rounded border p-2">
    <option value="" disabled>Select a household</option>{households.map(h => <option key={h.id} value={h.id}>{h.display_name ?? "Household"}</option>)}
  </select></label>;
}
