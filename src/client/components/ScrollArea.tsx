import type { SystemStyleObject } from "@chakra-ui/react";


export const scrollShadowCss: SystemStyleObject = {
  "--scroll-shadow-size": "4rem",
  maskImage: "linear-gradient(#000, #000)",
  "&[data-overflow-y]": {
    maskImage: "linear-gradient(#000,#000,transparent 0,#000 var(--scroll-shadow-size),#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    "&[data-at-top]": {
      maskImage: "linear-gradient(180deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
    "&[data-at-bottom]": {
      maskImage: "linear-gradient(0deg,#000 calc(100% - var(--scroll-shadow-size)),transparent)",
    },
  },
};
