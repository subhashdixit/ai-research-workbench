/** Verify the supported release's runtime, lockfiles and browser asset identities. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const sha = (file) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");
const manifest = json("dependency-versions.json");
const pkg = json("package.json");
const lock = json("package-lock.json");
const exact = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;
const normalize = (name) => name.toLowerCase().replace(/[-_.]+/g, "-");

function npmPackages() {
  return Object.entries(lock.packages)
    .filter(([key]) => key)
    .map(([key, info]) => {
      assert.ok(
        info.version && exact.test(info.version),
        `Missing exact npm version: ${key}`,
      );
      assert.ok(
        /^sha(?:256|512)-/.test(info.integrity || ""),
        `Missing npm integrity: ${key}`,
      );
      return {
        path: key,
        name: key.split("node_modules/").at(-1),
        version: info.version,
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
function pythonPins(file) {
  const lines = read(file).split(/\r?\n/),
    pins = [];
  let current;
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const match = line.match(/^([\w.-]+)==([^\s;\\]+)(.*)$/);
      assert.ok(match, `Unpinned Python requirement in ${file}: ${line}`);
      current = {
        name: normalize(match[1]),
        version: match[2],
        marker: match[3].replace(/\\\s*$/, "").trim(),
        hashes: 0,
      };
      assert.ok(
        !/[<>=~*^]/.test(current.version),
        `Non-exact Python version: ${line}`,
      );
      pins.push(current);
    }
    assert.ok(current, `Invalid lockfile structure: ${file}`);
    current.hashes += (line.match(/--hash=sha256:[a-f0-9]{64}/g) || []).length;
  }
  assert.ok(pins.length, `Empty Python environment: ${file}`);
  for (const pin of pins)
    assert.ok(pin.hashes > 0, `Missing package hashes: ${pin.name}`);
  return pins;
}

assert.equal(manifest.schema, 1);
assert.equal(read(".nvmrc").trim(), manifest.runtimes.node);
assert.equal(pkg.engines.node, manifest.runtimes.node);
assert.equal(pkg.engines.npm, manifest.runtimes.npm);
assert.equal(pkg.packageManager, "npm@" + manifest.runtimes.npm);
assert.ok(read(".npmrc").split(/\r?\n/).includes("engine-strict=true"));
assert.equal(lock.lockfileVersion, 3);
assert.equal(sha("package-lock.json"), manifest.npm.lockfile_sha256);
assert.deepEqual(lock.packages[""].engines, pkg.engines);
for (const section of [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
]) {
  for (const [name, version] of Object.entries(pkg[section] || {})) {
    assert.ok(exact.test(version), `Use an exact direct dependency: ${name}`);
    assert.equal(
      lock.packages["node_modules/" + name]?.version,
      version,
      `Lock mismatch: ${name}`,
    );
  }
}
assert.deepEqual(npmPackages(), manifest.npm.resolved);
if (!process.argv.includes("--manifest-only")) {
  assert.equal(
    process.versions.node,
    manifest.runtimes.node,
    "Use the Node version in .nvmrc",
  );
  const npm = process.env.npm_config_user_agent?.match(/npm\/([^\s]+)/)?.[1];
  assert.equal(
    npm,
    manifest.runtimes.npm,
    "Run via npm with the pinned bundled npm version",
  );
}
if (manifest.python) {
  assert.equal(read(".python-version").trim(), manifest.runtimes.python);
  for (const environment of manifest.python.environments) {
    assert.equal(
      sha(environment.lockfile),
      environment.sha256,
      `Changed Python lock: ${environment.lockfile}`,
    );
    assert.deepEqual(pythonPins(environment.lockfile), environment.resolved);
    for (const source of environment.sources) {
      assert.equal(
        sha(source.path),
        source.sha256,
        `Regenerate Python locks after editing ${source.path}`,
      );
      for (const line of read(source.path).split(/\r?\n/)) {
        const clean = line.split("#")[0].trim();
        if (!clean || clean.startsWith("-r ")) continue;
        const match = clean.match(/^([\w.-]+)==([^\s;]+)$/);
        assert.ok(
          match,
          `Use exact input requirements in ${source.path}: ${clean}`,
        );
        assert.ok(
          environment.resolved.some(
            (p) => p.name === normalize(match[1]) && p.version === match[2],
          ),
          `Input/lock version mismatch: ${clean}`,
        );
      }
    }
  }
  const production = manifest.python.environments.find(
    (e) => e.role === "production",
  );
  const development = manifest.python.environments.find(
    (e) => e.role === "development",
  );
  if (production && development)
    for (const pin of production.resolved)
      assert.ok(
        development.resolved.some(
          (d) => d.name === pin.name && d.version === pin.version,
        ),
        `Production/dev drift: ${pin.name}`,
      );
}
if (manifest.browser.vendor_metadata) {
  assert.deepEqual(
    json(manifest.browser.vendor_metadata).libraries,
    manifest.browser.libraries,
  );
  assert.equal(
    sha(manifest.browser.integrity_manifest.path),
    manifest.browser.integrity_manifest.sha256,
  );
}
if (manifest.browser.model_catalog) {
  const { MODEL_CATALOG } = await import(
    pathToFileURL(path.join(root, manifest.browser.model_catalog)).href
  );
  assert.deepEqual(MODEL_CATALOG, manifest.browser.models);
}
for (const library of manifest.browser.libraries) {
  assert.ok(
    library.version,
    `Missing browser library version: ${library.name}`,
  );
  if (library.delivery === "remote-module") {
    assert.ok(
      read(library.imported_by).includes(library.url),
      `Remote import version drift: ${library.name}`,
    );
    if (process.argv.includes("--network")) {
      assert.equal(new URL(library.url).origin, "https://cdn.jsdelivr.net");
      const response = await fetch(library.url, {
        signal: AbortSignal.timeout(30000),
      });
      assert.ok(response.ok, `Cannot verify ${library.name}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.ok(bytes.length < 5 * 1024 * 1024, "Oversized remote library");
      assert.equal(
        crypto.createHash("sha256").update(bytes).digest("hex"),
        library.sha256,
        `Remote distribution hash changed: ${library.name}`,
      );
    }
  }
}
console.log(
  `Dependency versions verified: ${pkg.name} · Node ${manifest.runtimes.node} · npm ${manifest.runtimes.npm}`,
);
