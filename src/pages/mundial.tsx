import Fixture from "../components/fixture";

export default function MundialPage() {
  return (
    <section className="relative left-1/2 right-1/2 mx-[-50vw] w-screen">
      <div className="space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-emerald-100 bg-white/80 px-6 py-6 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Mundial 2026
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-950">
            Grupos, posiciones y fixture completo
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            Consultá la tabla de cada grupo y los partidos de las tres fechas de
            la fase de grupos en una sola vista.
          </p>
        </div>

        <Fixture />
      </div>
    </section>
  );
}
