import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function findFiles(dir, matchFn, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, matchFn, results);
    } else if (matchFn(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

console.log("[patch-clerk-next15] Searching for @clerk/nextjs files to patch...");

// 1. Patch server-actions.js (fix ResponseCookies class instance return in Server Action)
const serverActionsFiles = findFiles(
  path.join(rootDir, "node_modules"),
  (p) => p.includes("@clerk/nextjs") && p.endsWith("app-router/server-actions.js")
);

for (const filePath of serverActionsFiles) {
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // ESM version
  if (content.includes("return cookies().delete(")) {
    content = content.replace(
      /return cookies\(\)\.delete\((.*?)\);/g,
      "try { const c = await cookies(); c.delete($1); } catch {} return null;"
    );
    modified = true;
  }

  // CJS version
  if (content.includes("return (0, import_headers.cookies)().delete(")) {
    content = content.replace(
      /return \(0, import_headers\.cookies\)\(\)\.delete\((.*?)\);/g,
      "try { const c = await (0, import_headers.cookies)(); c.delete($1); } catch {} return null;"
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`[patch-clerk-next15] Patched server action in: ${filePath}`);
  }
}

// 2. Patch ClerkProvider.js (ensure initialState.__clerk_ssr_state is plain JSON object)
const clerkProviderFiles = findFiles(
  path.join(rootDir, "node_modules"),
  (p) => p.includes("@clerk/nextjs") && p.includes("app-router/server/ClerkProvider.js")
);

for (const filePath of clerkProviderFiles) {
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // ESM
  if (content.includes("const state = (_a = initialState()) == null ? void 0 : _a.__clerk_ssr_state;")) {
    content = content.replace(
      "const state = (_a = initialState()) == null ? void 0 : _a.__clerk_ssr_state;",
      "const rawState = (_a = initialState()) == null ? void 0 : _a.__clerk_ssr_state; const state = rawState ? JSON.parse(JSON.stringify(rawState)) : undefined;"
    );
    modified = true;
  }

  // CJS
  if (content.includes("const state = (_a = (0, import_auth.initialState)()) == null ? void 0 : _a.__clerk_ssr_state;")) {
    content = content.replace(
      "const state = (_a = (0, import_auth.initialState)()) == null ? void 0 : _a.__clerk_ssr_state;",
      "const rawState = (_a = (0, import_auth.initialState)()) == null ? void 0 : _a.__clerk_ssr_state; const state = rawState ? JSON.parse(JSON.stringify(rawState)) : undefined;"
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`[patch-clerk-next15] Patched ClerkProvider in: ${filePath}`);
  }
}

// 3. Patch clerkMiddleware.js (ensure jwtKey from process.env.CLERK_JWT_KEY is included in options by default)
const clerkMiddlewareFiles = findFiles(
  path.join(rootDir, "node_modules"),
  (p) => p.includes("@clerk/nextjs") && p.endsWith("server/clerkMiddleware.js")
);

for (const filePath of clerkMiddlewareFiles) {
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  if (content.includes("signUpUrl,") && !content.includes("jwtKey: resolvedParams.jwtKey || process.env.CLERK_JWT_KEY,")) {
    content = content.replace(
      /signUpUrl,(\r?\n\s*\.\.\.resolvedParams)/g,
      "signUpUrl,\n        jwtKey: resolvedParams.jwtKey || process.env.CLERK_JWT_KEY,$1"
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`[patch-clerk-next15] Patched clerkMiddleware in: ${filePath}`);
  }
}

console.log("[patch-clerk-next15] Patching complete.");


