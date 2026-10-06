export function PlaceholderPage({ title, screenId }: { title: string; screenId?: string }) {
  return <section data-screen-id={screenId} className="py-6">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <p className="mt-3">UX design pending</p>
  </section>;
}
