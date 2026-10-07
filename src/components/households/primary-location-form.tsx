"use client";
import { WorkflowForm } from "@/components/workflow-form";
import { setPrimaryLocation } from "@/app/households/primary-location-actions";
export function PrimaryLocationForm({ householdId, locationId }: { householdId: string; locationId: string }) {
  return <WorkflowForm command="primary-location" values={{ householdId, locationId }} label="Set as primary" submitAction={setPrimaryLocation} />;
}
