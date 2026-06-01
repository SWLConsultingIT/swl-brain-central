import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Brain Central</h1>
      <p className="text-sm opacity-70">SWL Consulting · prospecting AI brain</p>
      <Link
        href="/health"
        className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
      >
        /health →
      </Link>
    </main>
  )
}
