import wc26Logo from "../assets/WC26_Logo.png";
import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";

type HeaderProps = {
  onLogout: () => void;
  onNavigate: (href: string) => void;
  currentPath?: string;
};

const navItems = [
  { label: "Mis predicciones", href: "/predicciones", match: "/predicciones" },
  { label: "Posiciones", href: "/posiciones", match: "/posiciones" },
  { label: "Partidos", href: "/#partidos", match: "/" },
  { label: "Mundial", href: "/mundial", match: "/mundial" },
] as const;

export default function Header({
  onLogout,
  onNavigate,
  currentPath = "/",
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="w-full overflow-hidden border-b border-emerald-200/70 bg-white/85 shadow-[0_20px_60px_rgba(16,24,40,0.08)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={() => onNavigate("/")}
            className="inline-flex items-center gap-3"
            aria-label="Ir al inicio"
          >
            <img
              src={wc26Logo}
              alt="World Cup 2026"
              className="h-12 w-12 object-contain"
            />
          </button>

          <div className="flex items-center gap-2">
            <nav className="hidden min-w-0 items-center gap-2 overflow-x-auto pb-1 lg:flex lg:justify-end">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onNavigate(item.href)}
                  className={`group relative whitespace-nowrap px-3 py-2 text-sm font-medium transition ${
                    currentPath === item.match
                      ? "text-zinc-950"
                      : "text-zinc-700 hover:text-zinc-950"
                  }`}
                >
                  <span>{item.label}</span>
                  <span
                    className={`absolute bottom-0 left-3 h-0.5 bg-black transition-all duration-200 ${
                      currentPath === item.match
                        ? "w-[calc(100%-1.5rem)]"
                        : "w-0 group-hover:w-[calc(100%-1.5rem)]"
                    }`}
                  />
                </button>
              ))}
            </nav>

            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <LogOut size={16} strokeWidth={2.2} />
              Cerrar sesión
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((value) => !value)}
              aria-controls="mobile-menu"
              aria-expanded={mobileMenuOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200/70 bg-white/80 text-zinc-950 shadow-sm transition hover:bg-white lg:hidden"
            >
              {mobileMenuOpen ? (
                <X size={18} strokeWidth={2.2} />
              ) : (
                <Menu size={18} strokeWidth={2.2} />
              )}
            </button>
          </div>
        </div>

        <div
          id="mobile-menu"
          className={`${mobileMenuOpen ? "block" : "hidden"} border-t border-emerald-200/70 lg:hidden`}
        >
          <nav className="flex flex-col gap-1 px-5 py-4">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  onNavigate(item.href);
                  setMobileMenuOpen(false);
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  currentPath === item.match
                    ? "bg-zinc-950 text-white"
                    : "text-zinc-800 hover:bg-emerald-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
