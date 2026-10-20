import Image from "next/image";
import { assetPath } from "@/lib/paths";
import { appName } from "@/lib/shared";

export function BrandWordmark({ width = 144 }: { width?: number }) {
  const height = Math.round((width * 160) / 920);
  return (
    <span
      role="img"
      aria-label={appName}
      className="inline-flex items-center min-w-0 leading-none"
      style={{ width, maxWidth: "42vw" }}
    >
      <Image
        src={assetPath("/images/wordmark-light.svg")}
        alt=""
        width={width}
        height={height}
        className="block h-auto w-full dark:hidden"
      />
      <Image
        src={assetPath("/images/wordmark-dark.svg")}
        alt=""
        width={width}
        height={height}
        className="hidden h-auto w-full dark:block"
      />
    </span>
  );
}
