import type { SiteConfig } from "../templates/client-site/src/lib/site";

export type LocalClientGenerationResult = {
  payload: Record<string, string> & {
    submissionId: string;
    assets: Record<string, string>;
  };
  config: SiteConfig;
  publishReady: false;
};

export declare function prepareLocalClientGeneration(
  rawSubmission: Record<string, unknown>,
): LocalClientGenerationResult;

export declare function generateLocalClientSite(options: {
  intakePath: string;
  outputPath: string;
}): Promise<string>;
