type AppLogoProps = {
  size?: "sm" | "lg";
};

export function AppLogo({ size = "sm" }: AppLogoProps) {
  const sizeClass = size === "lg" ? "size-16 rounded-3xl" : "size-10 rounded-2xl";
  const textClass = size === "lg" ? "text-2xl" : "text-base";

  return (
    <div
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-[linear-gradient(135deg,#d946ef,#9333ea_45%,#6d28d9)] text-white shadow-lg shadow-purple-300 ${sizeClass}`}
    >
      <span className="absolute -left-2 -top-2 size-8 rounded-full bg-fuchsia-200/45" />
      <span className="absolute -bottom-3 -right-3 size-10 rounded-full bg-violet-200/35" />
      <span className={`relative font-black tracking-tight ${textClass}`}>P</span>
    </div>
  );
}
