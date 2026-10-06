export function AppMain({ children, fullWidth = false }: { children: React.ReactNode; fullWidth?: boolean }) {
  return <main id="app-main" tabIndex={-1} className={`flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] ${fullWidth ? "w-full" : "mx-auto w-full max-w-4xl px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6"}`}>
    {children}
  </main>;
}
