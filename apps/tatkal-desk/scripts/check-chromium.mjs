try {
  const { chromium } = await import("playwright");
  const fs = await import("node:fs");
  const exe = chromium.executablePath();
  process.stdout.write(fs.existsSync(exe) ? "ready\n" : "missing-browser\n");
} catch {
  process.stdout.write("missing-package\n");
}
