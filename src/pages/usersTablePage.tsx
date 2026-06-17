import UsersTable, { type UsersTableRow } from "../components/usersTable";

type UsersTablePageProps = {
  users: UsersTableRow[];
  currentUserId: string;
  hasOfficialStartBegun?: boolean;
};

export default function UsersTablePage({
  users,
  currentUserId,
  hasOfficialStartBegun = false,
}: UsersTablePageProps) {
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
            : null}
        </div>

        {hasOfficialStartBegun ? (
          <UsersTable
            users={users}
            currentUserId={currentUserId}
            title="Tabla de posiciones"
          />
        ) : null}
      </div>
    </section>
  );
}
