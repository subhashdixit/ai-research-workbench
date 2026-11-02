# Dependency versions and reproducible setup

This guide records the **maintained release** of `ai-research-workbench`. Opening the published application requires a compatible browser; development installation uses the exact versions below.

## Runtime and tool versions

| Component | Exact version | Where enforced |
|---|---|---|
| Node.js | 22.23.4 | `.nvmrc`, `package.json` engines, CI |
| npm | 10.9.9 | `packageManager`, engines, `engine-strict=true` |
| CPython | 3.11.17 | `.python-version`, CI |
| pip installer | 26.2.2 | `requirements-installer.lock.txt` |
| uv lock generator | 0.13.6 | Locked regeneration recipe below |

## Install the same JavaScript environment

Install the Node version in `.nvmrc` (with its bundled npm). With nvm:

```bash
nvm install
nvm use
npm ci
npm run check:dependencies
npm test
npm run lint
npm run format
```

Use `npm ci` to consume `package-lock.json` exactly. Plain `npm install` can update a lock during maintenance. The engine check rejects a different Node/npm combination. Windows users can install the same Node release and run the npm commands normally.

`package-lock.json` records every resolved npm package version, dependency placement and integrity hash. `dependency-versions.json` provides the same resolved-version index in a readable machine format.

<details>
<summary>All locked npm packages</summary>

| Package | Version(s) |
|---|---|
| `@eslint-community/eslint-utils` | 4.10.1 |
| `@eslint-community/regexpp` | 4.12.2 |
| `@eslint/config-array` | 0.21.2 |
| `@eslint/config-helpers` | 0.4.2 |
| `@eslint/core` | 0.17.0 |
| `@eslint/eslintrc` | 3.3.7 |
| `@eslint/js` | 9.39.1 |
| `@eslint/object-schema` | 2.1.7 |
| `@eslint/plugin-kit` | 0.4.1 |
| `@humanfs/core` | 0.19.2 |
| `@humanfs/node` | 0.16.8 |
| `@humanfs/types` | 0.15.0 |
| `@humanwhocodes/module-importer` | 1.0.1 |
| `@humanwhocodes/retry` | 0.4.3 |
| `@types/estree` | 1.0.10 |
| `@types/json-schema` | 7.0.15 |
| `acorn` | 8.19.0 |
| `acorn-jsx` | 5.3.2 |
| `ajv` | 6.15.0 |
| `ansi-styles` | 4.3.0 |
| `argparse` | 2.0.1 |
| `balanced-match` | 1.0.2 |
| `brace-expansion` | 1.1.21 |
| `callsites` | 3.1.0 |
| `chalk` | 4.1.2 |
| `color-convert` | 2.0.1 |
| `color-name` | 1.1.4 |
| `concat-map` | 0.0.1 |
| `cross-spawn` | 7.0.6 |
| `debug` | 4.4.3 |
| `deep-is` | 0.1.4 |
| `escape-string-regexp` | 4.0.0 |
| `eslint` | 9.39.1 |
| `eslint-scope` | 8.4.0 |
| `eslint-visitor-keys` | 3.4.3, 4.2.1 |
| `espree` | 10.4.0 |
| `esquery` | 1.7.0 |
| `esrecurse` | 4.3.0 |
| `estraverse` | 5.3.0 |
| `esutils` | 2.0.3 |
| `fast-deep-equal` | 3.1.3 |
| `fast-json-stable-stringify` | 2.1.0 |
| `fast-levenshtein` | 2.0.6 |
| `file-entry-cache` | 8.0.0 |
| `find-up` | 5.0.0 |
| `flat-cache` | 4.0.1 |
| `flatted` | 3.4.4 |
| `glob-parent` | 6.0.2 |
| `globals` | 14.0.0 |
| `has-flag` | 4.0.0 |
| `ignore` | 5.3.2 |
| `import-fresh` | 3.3.1 |
| `imurmurhash` | 0.1.4 |
| `is-extglob` | 2.1.1 |
| `is-glob` | 4.0.3 |
| `isexe` | 2.0.0 |
| `js-yaml` | 4.3.2 |
| `json-buffer` | 3.0.1 |
| `json-schema-traverse` | 0.4.1 |
| `json-stable-stringify-without-jsonify` | 1.0.1 |
| `keyv` | 4.5.4 |
| `levn` | 0.4.1 |
| `locate-path` | 6.0.0 |
| `lodash.merge` | 4.6.2 |
| `minimatch` | 3.1.5 |
| `ms` | 2.1.3 |
| `natural-compare` | 1.4.0 |
| `optionator` | 0.9.4 |
| `p-limit` | 3.1.0 |
| `p-locate` | 5.0.0 |
| `parent-module` | 1.0.1 |
| `path-exists` | 4.0.0 |
| `path-key` | 3.1.1 |
| `prelude-ls` | 1.2.1 |
| `prettier` | 3.6.2 |
| `punycode` | 2.3.1 |
| `resolve-from` | 4.0.0 |
| `shebang-command` | 2.0.0 |
| `shebang-regex` | 3.0.0 |
| `strip-json-comments` | 3.1.1 |
| `supports-color` | 7.2.0 |
| `type-check` | 0.4.0 |
| `uri-js` | 4.4.1 |
| `which` | 2.0.2 |
| `word-wrap` | 1.2.5 |
| `yocto-queue` | 0.1.0 |

</details>

## Browser libraries and model identities

| Library / asset set | Exact version | Delivery |
|---|---|---|
| `@huggingface/transformers` | `4.3.2` | remote-module |
| `onnxruntime-web` | `1.31.0-dev.20260914-8d85527a0` | vendored |
| `pdfjs-dist` | `6.4.299` | vendored |

Vendored files are committed with their license notices, `site/vendor/VERSIONS.json` and SHA-256 identities in `site/vendor-manifest.json`. The remote Transformers.js distribution is pinned to its exact npm-version URL and its byte hash is recorded in `dependency-versions.json`; this identifies the complete bundled distribution. It is not rebuilt from floating transitive package ranges during application setup.

Model IDs, exact upstream Git revisions, quantization and asset sizes are recorded in `site/model-policy.js` and the dependency manifest. Reusing these records preserves the selected model generation. Browser/model downloads still require availability of their upstream host. For an optional remote-distribution integrity check:

```bash
npm run check:dependencies -- --network
```

## Exact Python environments

Use CPython 3.11.17 and create a fresh virtual environment. Install the hashed installer lock first, then the appropriate environment lock. On macOS/Linux:

```bash
python3.11 -m venv .venv
.venv/bin/python -m pip install --require-hashes --only-binary=:all: -r requirements-installer.lock.txt
.venv/bin/python -m pip install --require-hashes --only-binary=:all: -r backend/requirements-dev.lock.txt
.venv/bin/python -m pip check
```

On Windows, create the environment with `py -3.11 -m venv .venv` and use `.venv\Scripts\python.exe` for the same pip commands. Verify the interpreter reports 3.11.17. Production Gunicorn deployment uses Linux; local Flask development can run with the environment’s Python.

| Environment | Exact lock | Use |
|---|---|---|
| installer | [requirements-installer.lock.txt](requirements-installer.lock.txt) | 1 fully pinned distributions with hashes |
| production | [backend/requirements.lock.txt](backend/requirements.lock.txt) | 15 fully pinned distributions with hashes |
| development | [backend/requirements-dev.lock.txt](backend/requirements-dev.lock.txt) | 31 fully pinned distributions with hashes |

The direct input requirements remain readable, while the `.lock.txt` files pin their complete transitive resolution. CI installs the locks with hash verification and wheel-only installation, then runs `pip check` and the existing release checks. Production and development backend locks agree on production package versions.

<details>
<summary>All locked Python distribution versions</summary>

| Environment | Distribution | Version | Platform/Python marker |
|---|---|---|---|
| installer | `pip` | `26.2.2` | all target platforms |
| production | `blinker` | `1.9.0` | all target platforms |
| production | `certifi` | `2026.10.23` | all target platforms |
| production | `charset-normalizer` | `3.5.2` | all target platforms |
| production | `click` | `8.5.0` | all target platforms |
| production | `defusedxml` | `0.7.1` | all target platforms |
| production | `flask` | `3.1.3` | all target platforms |
| production | `gunicorn` | `26.2.0` | all target platforms |
| production | `idna` | `3.20` | all target platforms |
| production | `itsdangerous` | `2.2.0` | all target platforms |
| production | `jinja2` | `3.1.6` | all target platforms |
| production | `markupsafe` | `3.0.4` | all target platforms |
| production | `pillow` | `13.0.0` | all target platforms |
| production | `requests` | `2.34.2` | all target platforms |
| production | `urllib3` | `2.8.0` | all target platforms |
| production | `werkzeug` | `3.1.9` | all target platforms |
| development | `astroid` | `3.3.11` | all target platforms |
| development | `black` | `25.1.0` | all target platforms |
| development | `blinker` | `1.9.0` | all target platforms |
| development | `certifi` | `2026.10.23` | all target platforms |
| development | `charset-normalizer` | `3.5.2` | all target platforms |
| development | `click` | `8.5.0` | all target platforms |
| development | `colorama` | `0.4.6` | sys_platform == 'win32' |
| development | `defusedxml` | `0.7.1` | all target platforms |
| development | `dill` | `0.4.1` | all target platforms |
| development | `flask` | `3.1.3` | all target platforms |
| development | `gunicorn` | `26.2.0` | all target platforms |
| development | `idna` | `3.20` | all target platforms |
| development | `iniconfig` | `2.3.1` | all target platforms |
| development | `isort` | `6.1.0` | all target platforms |
| development | `itsdangerous` | `2.2.0` | all target platforms |
| development | `jinja2` | `3.1.6` | all target platforms |
| development | `markupsafe` | `3.0.4` | all target platforms |
| development | `mccabe` | `0.7.0` | all target platforms |
| development | `mypy-extensions` | `1.1.0` | all target platforms |
| development | `packaging` | `26.3` | all target platforms |
| development | `pathspec` | `1.1.1` | all target platforms |
| development | `pillow` | `13.0.0` | all target platforms |
| development | `platformdirs` | `4.14.3` | all target platforms |
| development | `pluggy` | `1.7.0` | all target platforms |
| development | `pygments` | `2.21.0` | all target platforms |
| development | `pylint` | `3.3.8` | all target platforms |
| development | `pytest` | `8.4.2` | all target platforms |
| development | `requests` | `2.34.2` | all target platforms |
| development | `tomlkit` | `0.15.2` | all target platforms |
| development | `urllib3` | `2.8.0` | all target platforms |
| development | `werkzeug` | `3.1.9` | all target platforms |

</details>

### Deliberate Python lock updates

Use the recorded uv generator version, edit exact direct input versions intentionally, then regenerate and review the complete locks. Commands use CPython 3.11.17 as the resolution target:

```bash
python -m pip install uv==0.13.6
uv pip compile requirements-installer.in --python-version 3.11.17 --universal --only-binary :all: --generate-hashes -o requirements-installer.lock.txt
uv pip compile backend/requirements.txt --python-version 3.11.17 --universal --only-binary :all: --generate-hashes -o backend/requirements.lock.txt
uv pip compile backend/requirements-dev.txt -c backend/requirements.lock.txt --python-version 3.11.17 --universal --only-binary :all: --generate-hashes -o backend/requirements-dev.lock.txt
```

Update the manifest’s recorded input/lock hashes and resolved versions when deliberately upgrading, then run `npm run check:dependencies`, a fresh locked installation and the relevant tests before merging.

## Scope and portability

The supported lockfiles, runtime files and asset identities describe the maintained application. Original prototype dependency lists are preserved as historical records; missing historical pins are not invented or represented as a tested environment.

Exact versions prevent silent dependency upgrades. Operating-system libraries, CPU architecture, browser features and native-wheel availability can still affect execution or floating-point results. Use the pinned interpreter, a compatible supported system and the checks above. Unsupported wheel platforms fail explicitly instead of silently compiling against unrecorded build dependencies.

External news/search APIs supply changing data independently of local package versions. Historical fixture data and model artifacts retain their repository identities. Future upgrades should change the exact version, corresponding lock/manifest and verification together in a reviewed PR.
