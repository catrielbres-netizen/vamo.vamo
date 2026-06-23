import Image from "next/image";
import { cn } from "@/lib/utils";
import vamoLogo from "../../../public/branding/vamo-logo.png";

type VamoLogoVariant =
  | "splash"
  | "login"
  | "auth"
  | "navbar"
  | "desktop"
  | "profile";

interface VamoLogoProps {
  variant?: VamoLogoVariant;
  className?: string;
  priority?: boolean;
}

const variantClass: Record<VamoLogoVariant, string> = {
  splash: "w-[82vw] max-w-[520px]",
  login: "w-[240px] sm:w-[280px] md:w-[320px]",
  auth: "w-[140px]",
  navbar: "w-[56px]",
  desktop: "w-[240px] lg:w-[320px]",
  profile: "w-[180px] rounded-full overflow-hidden",
};

export function VamoLogo({
  variant = "login",
  className,
  priority = true,
}: VamoLogoProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center shrink-0",
        variantClass[variant],
        className
      )}
    >
      <Image
        src={vamoLogo}
        alt="VamO"
        priority={priority}
        placeholder="empty"
        quality={95}
        sizes="(max-width: 640px) 240px, (max-width: 1024px) 280px, 320px"
        className="h-auto w-full object-contain invert brightness-0 dark:invert-0 dark:brightness-100"
      />
    </div>
  );
}
