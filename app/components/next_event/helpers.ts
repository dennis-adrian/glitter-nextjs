import { ElementSize } from "@/app/api/stands/definitions";

export const getStandSize = (
  imageSize: { width: number; height: number },
  proportions: { wide: number; narrow: number },
): ElementSize => ({
  wide: imageSize.width * (proportions.wide || 0.089),
  narrow: imageSize.height * (proportions.narrow || 0.059),
});
