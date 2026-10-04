"use client";
import type { ReactNode } from "react";
import { WorkflowForm } from "@/components/workflow-form";
import { eventAction } from "./actions";
export function EventForm(props: {
  command: string;
  values?: Record<string, string>;
  label: string;
  confirmation?: string;
  children?: ReactNode;
}) {
  return <WorkflowForm {...props} submitAction={eventAction} />;
}
export function AddressFields({
  values = {},
}: {
  values?: Record<string, string | null>;
}) {
  return (
    <>
      {[
        ["name", "Name"],
        ["addressLine1", "Address line 1"],
        ["addressLine2", "Address line 2"],
        ["city", "City"],
        ["stateRegion", "State / region"],
        ["postalCode", "Postal code"],
        ["countryCode", "Country code"],
      ].map(([name, label]) => (
        <label className="block" key={name}>
          {label}
          <input
            className="block w-full rounded border p-2"
            name={name}
            required={name !== "addressLine2"}
            maxLength={name === "countryCode" ? 2 : 200}
            defaultValue={values[name] ?? (name === "countryCode" ? "US" : "")}
          />
        </label>
      ))}
    </>
  );
}
