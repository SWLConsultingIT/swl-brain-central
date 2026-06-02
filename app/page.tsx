import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="size-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-info flex items-center justify-center text-bg font-bold text-2xl mx-auto shadow-card-hover">
          B
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Brain Central</h1>
          <p className="text-sm text-muted-fg">
            AI-native prospecting brain for SWL Consulting
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/prospects"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-accent text-bg hover:opacity-90 transition"
          >
            Open Prospects →
          </Link>
          <Link
            href="/health"
            className="text-sm font-medium px-4 py-2 rounded-lg bg-muted hover:bg-border text-fg ring-1 ring-border transition"
          >
            /health
          </Link>
        </div>
      </div>
    </main>
  )
}
