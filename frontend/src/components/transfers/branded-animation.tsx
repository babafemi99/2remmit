"use client";

import dynamic from "next/dynamic";

import { useReducedMotion } from "@/hooks/use-reduced-motion";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type BrandedAnimationProps = {
  animationData: object;
  className?: string;
  label?: string;
  loop?: boolean;
};

export function BrandedAnimation({
  animationData,
  className,
  label,
  loop = true,
}: BrandedAnimationProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
    >
      <Lottie
        animationData={animationData}
        autoplay={!reducedMotion}
        loop={!reducedMotion && loop}
        initialSegment={reducedMotion ? [0, 1] : undefined}
      />
    </div>
  );
}
