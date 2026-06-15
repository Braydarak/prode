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
      <div className="relative w-full border-b border-emerald-200/70 bg-white/85 shadow-[0_20px_60px_rgba(16,24,40,0.08)] backdrop-blur-xl">
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
              aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200/70 bg-white/80 text-zinc-950 shadow-sm transition hover:bg-white lg:hidden"
            >
              <span
                className={`absolute transition-all duration-300 ease-out ${
                  mobileMenuOpen
                    ? "scale-75 rotate-90 opacity-0"
                    : "scale-100 rotate-0 opacity-100"
                }`}
              >
                <Menu size={18} strokeWidth={2.2} />
              </span>
              <span
                className={`absolute transition-all duration-300 ease-out ${
                  mobileMenuOpen
                    ? "scale-100 rotate-0 opacity-100"
                    : "scale-75 -rotate-90 opacity-0"
                }`}
              >
                <X size={18} strokeWidth={2.2} />
              </span>
            </button>
          </div>
        </div>

        <div
          id="mobile-menu"
          className={`pointer-events-none absolute inset-x-0 top-full overflow-hidden lg:hidden ${
            mobileMenuOpen ? "z-40" : "z-30"
          }`}
        >
          <div
            className={`pointer-events-auto min-h-[calc(100dvh-5rem)] w-full overflow-y-auto border-b border-emerald-200/70 bg-white/95 shadow-[0_24px_64px_rgba(16,24,40,0.16)] backdrop-blur-xl transition-all duration-300 ease-out ${
              mobileMenuOpen
                ? "translate-x-0 opacity-100"
                : "translate-x-full opacity-0"
            }`}
          >
            <nav className="flex min-h-[calc(100dvh-5rem)] flex-col justify-center gap-3 px-5 py-8">
              {navItems.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    onNavigate(item.href);
                    setMobileMenuOpen(false);
                  }}
                  style={{
                    transitionDelay: mobileMenuOpen
                      ? `${120 + index * 70}ms`
                      : "0ms",
                  }}
                  className={`rounded-2xl px-4 py-4 text-right text-lg font-semibold transition-all duration-300 ease-out ${
                    currentPath === item.match
                      ? "bg-zinc-950 text-white"
                      : "text-zinc-800 hover:bg-emerald-50"
                  } ${
                    mobileMenuOpen
                      ? "translate-x-0 opacity-100"
                      : "translate-x-6 opacity-0"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
