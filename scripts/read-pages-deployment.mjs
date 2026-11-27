#!/usr/bin/env node
import fs from "node:fs/promises";
import {
  pagesDeploymentId,
  pagesDeploymentUrl,
} from "./pages-deployment.mjs";

const log = process.argv[2];
if (!log) throw new Error("A wrangler deploy log path is required.");
const url = pagesDeploymentUrl(await fs.readFile(log, "utf8"));
console.log(JSON.stringify({ url, id: pagesDeploymentId(url) }));
