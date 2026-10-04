"use client";
import { WorkflowForm } from "@/components/workflow-form";
import { groupAction } from "./actions";
import { groupTypes } from "@/lib/groups/constants";
export function GroupForm(props: Omit<Parameters<typeof WorkflowForm>[0], "submitAction">) {
  return <WorkflowForm {...props} submitAction={groupAction} />;
}
export function GroupDetailsFields({ name = "", groupType = "", description = "" }: { name?: string; groupType?: string; description?: string | null }) {
  return <>
    <label className="block">Group name<input name="name" required maxLength={100} defaultValue={name} className="block w-full rounded border p-2" /></label>
    <label className="block">Group type<select name="groupType" defaultValue={groupType} required className="block w-full rounded border p-2"><option value="" disabled>Select a type</option>{groupTypes.map(type => <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>)}</select></label>
    <label className="block">Description<textarea name="description" maxLength={1000} defaultValue={description ?? ""} className="block w-full rounded border p-2" /></label>
  </>;
}
