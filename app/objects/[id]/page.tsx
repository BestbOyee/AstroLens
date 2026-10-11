
import { notFound } from "next/navigation";

import { astronomicalObjects } from "@/data/objects";

export function generateStaticParams() {
  return astronomicalObjects.map(({ id }) => ({ id }));
}

type ObjectPageProps = {
  params: { id: string };
};

export default async function ObjectPage({ params }: ObjectPageProps) {
  const { id } = params;
  const object = astronomicalObjects.find((entry) => entry.id === id);

  if (!object) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <h1 className="text-3xl font-bold">{object.name}</h1>
      <p className="mt-2 text-sm uppercase tracking-[0.2em] text-sky-300">
        {object.type}
      </p>
      <p className="mt-4 max-w-2xl text-slate-300">
        {object.description}
      </p>
      <p className="mt-6 text-slate-400">
        Object ID: {id}
      </p>
    </main>
  );
}
