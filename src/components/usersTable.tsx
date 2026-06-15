import { useMemo } from "react";

export type UsersTableRow = {
  id: string;
  name: string;
  points: number;
  email?: string | null;
  photoUrl?: string | null;
};

type UsersTableProps = {
  users: UsersTableRow[];
  currentUserId?: string | null;
  title?: string;
};

function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.slice(0, 1).toUpperCase()).join("");
}

export default function UsersTable({
  users,
  currentUserId = null,
  title = "Tabla de posiciones",
}: UsersTableProps) {
  const rows = useMemo(() => {
    return [...users].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [users]);

  return (
    <section className="w-full">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-zinc-900">
            {title}
          </h2>
          <p className="text-sm text-zinc-500">Ordenado por puntos (desc).</p>
        </div>
        <span className="shrink-0 rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600">
          {rows.length} jugadores
        </span>
      </header>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-zinc-600">
            Todavía no hay usuarios para mostrar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th
                    scope="col"
                    className="w-16 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600"
                  >
                    #
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600"
                  >
                    Usuario
                  </th>
                  <th
                    scope="col"
                    className="w-28 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600"
                  >
                    Puntos
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((user, index) => {
                  const displayName =
                    user.name?.trim() || user.email || "Usuario";
                  const initials = getInitials(displayName);
                  const isCurrent = currentUserId
                    ? user.id === currentUserId
                    : false;

                  return (
                    <tr
                      key={user.id}
                      className={
                        isCurrent
                          ? "bg-emerald-50/60"
                          : index % 2 === 0
                            ? "bg-white"
                            : "bg-zinc-50/40"
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-zinc-800">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
                            {user.photoUrl ? (
                              <img
                                src={user.photoUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-xs font-bold text-zinc-700">
                                {initials}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-zinc-900">
                              {displayName}
                            </p>
                            {user.email && (
                              <p className="truncate text-xs text-zinc-500">
                                {user.email}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-zinc-900">
                        {user.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
