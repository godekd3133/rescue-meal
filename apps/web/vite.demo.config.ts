// Portfolio try-it build. Separate from vite.config.ts (a protected runtime file)
// so the regular build is byte-for-byte unaffected. Run: npm run build:portfolio-demo
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const webDirectory = path.dirname(fileURLToPath(import.meta.url));
const DEMO_BASE = "/demos/rescue-meal/";
const outDir = process.env.RESCUE_MEAL_DEMO_OUT_DIR || "dist/portfolio-demo";

// Installation, offline, push, and camera surfaces do not exist in the try-it build.
const STUBBED_MODULES = new Map([
  ["./InstallPrompt", "src/demo/NullSurface.tsx"],
  ["./ServiceWorkerUpdatePrompt", "src/demo/NullSurface.tsx"],
  ["./BarcodeScanner", "src/demo/NullSurface.tsx"],
  ["./CameraCapture", "src/demo/NullSurface.tsx"],
]);

function portfolioDemo(): Plugin {
  return {
    name: "rescue-meal-portfolio-demo",
    enforce: "pre",
    resolveId(source) {
      const stub = STUBBED_MODULES.get(source);
      return stub ? path.join(webDirectory, stub) : null;
    },
    transform(code, id) {
      if (!/\/src\/.*\.tsx?$/.test(id)) return null;
      // Public assets are addressed by absolute string literals in app code.
      return code.replace(/(["'`])\/assets\//g, `$1${DEMO_BASE}assets/`);
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html
          .replace('src="/src/main.tsx"', 'src="/src/demo/main.tsx"')
          .replace(/\s*<link rel="manifest"[^>]*>/, "")
          .replace(/\s*<meta name="(?:mobile-web-app-capable|apple-mobile-web-app-[a-z-]+)"[^>]*>/g, "")
          .replace("<title>Rescue Meal</title>", '<meta name="robots" content="noindex" />\n    <title>Rescue Meal 체험판</title>');
      },
    },
  };
}

export default defineConfig({
  base: DEMO_BASE,
  define: {
    // Fixture lane only: no API URL can reach this bundle, whatever the shell env holds.
    "import.meta.env.VITE_PORTFOLIO_DEMO": JSON.stringify("1"),
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_DEPLOYMENT_MODE": JSON.stringify("demo"),
    "import.meta.env.VITE_APP_SHELL": JSON.stringify("web"),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify("portfolio-demo"),
    "import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY": JSON.stringify(""),
  },
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
  },
  plugins: [portfolioDemo(), react()],
});
