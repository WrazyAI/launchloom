export type PreviewDelivery = {
  repository: string;
  attemptId: string;
  project: string;
  pr: number;
  sha: string;
  deploymentId: string;
  previewUrl: string;
};

export type PreviewDeliveryPayload = PreviewDelivery;
