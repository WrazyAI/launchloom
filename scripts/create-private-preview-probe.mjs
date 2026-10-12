import path from "node:path";
import { createPrivatePreviewProbe } from "./private-pages-preview.mjs";

const directory = process.argv[2];
if (!directory)
  throw new Error("A temporary probe output directory is required.");
await createPrivatePreviewProbe(path.resolve(directory));
console.log("Created validated content-free private preview probe.");
