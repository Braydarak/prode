import UsersTable, { type UsersTableRow } from "../components/usersTable";

type UsersTablePageProps = {
  users: UsersTableRow[];
  currentUserId: string;
  officialStartMs?: number | null;
  hasOfficialStartBegun?: boolean;
};

function formatOfficialStart(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function UsersTablePage({
  users,
  currentUserId,
  officialStartMs = null,
  hasOfficialStartBegun = false,
}: UsersTablePageProps) {
  const formattedOfficialStart = formatOfficialStart(officialStartMs);

  return (
    <section className="relative left-1/2 right-1/2 mx-[-50vw] w-screen">
      <div className="space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-emerald-100 bg-white/80 px-6 py-6 shadow-sm backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Posiciones
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-zinc-950">
            Tabla general
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            Ranking ordenado por puntos (desc).
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {hasOfficialStartBegun
            ? "Los puntos ya cuentan desde que finalizó el partido Argentina vs Algeria del Grupo J."
            : `Los puntos empiezan a contar cuando finalice Argentina vs Algeria del Grupo J${
                formattedOfficialStart ? ` (${formattedOfficialStart})` : ""
              }. Hasta entonces, la tabla se mantiene en 0 aunque ya puedan cargar predicciones.`}
        </div>

        <UsersTable
          users={users}
          currentUserId={currentUserId}
          title="Tabla de posiciones"
        />
      </div>
    </section>
  );
}
