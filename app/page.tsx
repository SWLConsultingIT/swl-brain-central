import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-md w-full">
        <div className="size-12 rounded-lg bg-fg flex items-center justify-center text-bg font-bold text-xl mx-auto mb-6 tracking-tighter">
          B
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-fg">Upwork Brain</h1>
        <p className="text-sm text-fg-muted mt-1.5">Prospecting · SWL Consulting</p>

        <div className="flex items-center justify-center gap-2 mt-8">
          <Link
            href="/prospects"
            className="text-sm font-medium px-4 py-2 rounded-md bg-fg text-bg hover:opacity-90 transition"
          >
            Open Prospects →
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium px-4 py-2 rounded-md text-fg ring-1 ring-border hover:bg-muted transition"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
