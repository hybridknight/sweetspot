import Image from "next/image";
import { cn } from "@/lib/cn";
import { assetPath } from "@/lib/paths";
import { BrandWordmark } from "./brand-wordmark";

interface LogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export function Logo({ className, size = 24, showText = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-medium leading-none", className)}>
      <Image
        src={assetPath("/logo.png")}
        alt=""
        width={size}
        height={size}
        className="block shrink-0 rounded-md"
        priority
      />
      {showText ? (
        // Center the main letter shapes against the icon, allowing for the p descender.
        <span className="inline-flex" style={{ transform: `translateY(${size / 8}px)` }}>
          <BrandWordmark width={Math.round(size * 5.8)} />
        </span>
      ) : null}
    </span>
  );
}
