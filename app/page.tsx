
export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold tracking-tight">
        AstroLens
      </h1>

      <p className="mt-4 max-w-lg text-center text-slate-300">
        Discover what you can realistically observe in the night
        sky from your location.
      </p>

      <a
        href="/sky"
        className="mt-8 rounded-lg bg-indigo-500 px-6 py-3 font-medium hover:bg-indigo-400"
      >
        Explore the Sky
      </a>
    </main>
  );
}
