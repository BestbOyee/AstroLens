
type ObjectPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ObjectPage({ params }: ObjectPageProps) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <h1 className="text-3xl font-bold">Astronomical Object</h1>
      <p className="mt-4 text-slate-300">
        Object ID: {id}
      </p>
    </main>
  );
}
