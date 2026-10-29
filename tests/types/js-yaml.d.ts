/** Narrow declaration for the YAML reader used by workflow contract tests. */
declare module "js-yaml" {
  export function load(source: string): unknown;
  const yaml: { load: typeof load };
  export default yaml;
}
