import wc26Logo from "../assets/WC26_Logo.png";
import wc26LogoWhite from "../assets/WC26_Logo-white.png";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";

type HeaderProps = {
  onLogout: () => void;
  onNavigate: (href: string) => void;
  currentPath?: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
};

export type ThemeMode = "light" | "dark";

const navItems = [
  { label: "Tus predicciones", href: "/predicciones", match: "/predicciones" },
  { label: "Posiciones", href: "/posiciones", match: "/posiciones" },
  { label: "Partidos", href: "/#partidos", match: "/" },
  { label: "Mundial", href: "/mundial", match: "/mundial" },
  {
    label: "Selección favorita",
    href: "/seleccion-favorita",
    match: "/seleccion-favorita",
  },
] as const;

function ThemeSwitch({
  theme,
  onToggle,
  mobile = false,
}: {
  theme: ThemeMode;
  onToggle: () => void;
  mobile?: boolean;
}) {
  const isDarkMode = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isDarkMode}
      aria-label={isDarkMode ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center overflow-hidden rounded-full border p-1 transition-colors ${
        mobile ? "self-end" : ""
      } ${
        isDarkMode
          ? "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
          : "border-amber-200 bg-amber-100 hover:bg-amber-50"
      }`}
    >
      <span
        className={`absolute left-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full shadow-sm transition-transform duration-200 ${
          isDarkMode
            ? "translate-x-6 bg-zinc-100 text-zinc-950"
            : "translate-x-0 bg-white text-amber-500"
        }`}
      >
        {isDarkMode ? (
          <Moon size={14} strokeWidth={2.2} />
        ) : (
          <Sun size={14} strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}

export default function Header({
  onLogout,
  onNavigate,
  currentPath = "/",
  theme,
  onToggleTheme,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const isDarkMode = theme === "dark";

  useEffect(() => {
    if (mobileMenuOpen || !mobileMenuVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setMobileMenuVisible(false);
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mobileMenuOpen, mobileMenuVisible]);

  function toggleMobileMenu() {
    if (!mobileMenuOpen) {
      setMobileMenuVisible(true);
    }

    setMobileMenuOpen((value) => !value);
  }

  function toggleTheme() {
    onToggleTheme();
  }

  return (
    <header className="sticky top-0 z-50 w-full">
      <div
        className={`relative w-full border-b shadow-[0_20px_60px_rgba(16,24,40,0.08)] backdrop-blur-xl ${
          isDarkMode
            ? "border-zinc-800 bg-zinc-950/90 shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
            : "border-emerald-200/70 bg-white/85"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={() => onNavigate("/")}
            className="inline-flex items-center gap-3"
            aria-label="Ir al inicio"
          >
            <img
              src={isDarkMode ? wc26LogoWhite : wc26Logo}
              alt="World Cup 2026"
              className="h-12 w-12 object-contain"
            />
          </button>

          <div className="flex items-center gap-2">
            <nav className="hidden min-w-0 items-center gap-2 overflow-x-auto lg:flex lg:justify-end lg:self-center">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => onNavigate(item.href)}
                  className={`group relative whitespace-nowrap px-3 py-2 text-sm font-medium transition ${
                    currentPath === item.match
                      ? isDarkMode
                        ? "text-white"
                        : "text-zinc-950"
                      : isDarkMode
                        ? "text-zinc-300 hover:text-white"
                        : "text-zinc-700 hover:text-zinc-950"
                  }`}
                >
                  <span>{item.label}</span>
                  <span
                    className={`absolute bottom-0 left-3 h-0.5 transition-all duration-200 ${
                      isDarkMode ? "bg-white" : "bg-black"
                    } ${
                      currentPath === item.match
                        ? "w-[calc(100%-1.5rem)]"
                        : "w-0 group-hover:w-[calc(100%-1.5rem)]"
                    }`}
                  />
                </button>
              ))}
            </nav>

            <div className="hidden lg:block">
              <ThemeSwitch theme={theme} onToggle={toggleTheme} />
            </div>

            <button
              type="button"
              onClick={onLogout}
              aria-label="Cerrar sesión"
              className={`hidden items-center justify-center rounded-full text-sm font-semibold transition lg:inline-flex lg:h-auto lg:w-auto lg:gap-2 lg:px-4 lg:py-2 ${
                isDarkMode
                  ? "bg-white text-zinc-950 hover:bg-zinc-200"
                  : "bg-zinc-950 text-white hover:bg-zinc-800"
              }`}
            >
              <LogOut size={16} strokeWidth={2.2} />
              <span className="hidden lg:inline">Cerrar sesión</span>
            </button>

            <button
              type="button"
              onClick={toggleMobileMenu}
              aria-controls="mobile-menu"
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Cerrar menu" : "Abrir menu"}
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition lg:hidden ${
                isDarkMode
                  ? "border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
                  : "border-emerald-200/70 bg-white/80 text-zinc-950 hover:bg-white"
              }`}
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

        {mobileMenuVisible && (
          <div
            id="mobile-menu"
            className={`absolute inset-x-0 top-full overflow-hidden lg:hidden ${
              mobileMenuOpen
                ? "pointer-events-auto z-40"
                : "pointer-events-none z-30"
            }`}
          >
            <div
              className={`min-h-[calc(100dvh-5rem)] w-full overflow-y-auto border-b backdrop-blur-xl transition-all duration-300 ease-out ${
                isDarkMode
                  ? "border-zinc-800 bg-zinc-950/95 shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
                  : "border-emerald-200/70 bg-white/95 shadow-[0_24px_64px_rgba(16,24,40,0.16)]"
              } ${
                mobileMenuOpen
                  ? "translate-x-0 opacity-100"
                  : "translate-x-full opacity-0"
              }`}
            >
              <nav className="flex min-h-[calc(100dvh-5rem)] flex-col gap-4 px-5 py-8">
                <div className="flex flex-1 flex-col justify-center gap-4">
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
                          ? isDarkMode
                            ? "bg-white text-zinc-950"
                            : "bg-zinc-950 text-white"
                          : isDarkMode
                            ? "text-zinc-100 hover:bg-zinc-900"
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
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-6">
                  <div
                    style={{
                      transitionDelay: mobileMenuOpen
                        ? `${120 + navItems.length * 70}ms`
                        : "0ms",
                    }}
                    className={`transition-all duration-300 ease-out ${
                      mobileMenuOpen
                        ? "translate-x-0 opacity-100"
                        : "translate-x-6 opacity-0"
                    }`}
                  >
                    <ThemeSwitch theme={theme} onToggle={toggleTheme} mobile />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                    style={{
                      transitionDelay: mobileMenuOpen
                        ? `${190 + navItems.length * 70}ms`
                        : "0ms",
                    }}
                    className={`inline-flex w-60 items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-300 ease-out ${
                      mobileMenuOpen
                        ? "translate-x-0 opacity-100"
                        : "translate-x-6 opacity-0"
                    } ${
                      isDarkMode
                        ? "border-white bg-transparent text-white hover:bg-white hover:text-zinc-950"
                        : "border-zinc-950 bg-transparent text-zinc-950 hover:bg-zinc-950 hover:text-white"
                    }`}
                  >
                    Cerrar sesión
                  </button>
                </div>
              </nav>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
