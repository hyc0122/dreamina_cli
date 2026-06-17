import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";

const sourcePath = path.resolve("src/lib/apiUrl.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module });

const { resolveApiUrl } = module.exports;

assert.equal(resolveApiUrl("http://127.0.0.1:19000/", undefined, false), "http://127.0.0.1:19000");
assert.equal(
  resolveApiUrl(undefined, { protocol: "http:", host: "127.0.0.1:62100", hostname: "127.0.0.1" }, false),
  "http://127.0.0.1:62100",
);
assert.equal(
  resolveApiUrl(undefined, { protocol: "http:", host: "127.0.0.1:62100", hostname: "127.0.0.1" }, true),
  "http://127.0.0.1:18177",
);
assert.equal(resolveApiUrl(undefined, undefined, false), "http://127.0.0.1:18177");

