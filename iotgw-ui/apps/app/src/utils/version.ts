import type { BuildInfo } from "../../../../build-metadata/build-info.mjs";

declare const __FRONTEND_BUILD_INFO__: BuildInfo;

/** Identity of the assets loaded by this browser, fixed when Vite starts/builds. */
export const frontendBuild = __FRONTEND_BUILD_INFO__;
