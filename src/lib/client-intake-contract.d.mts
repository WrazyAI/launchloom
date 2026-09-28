export type ClientIntakeFormFields = Record<string, unknown>;
export type ClientIntakeSubmission = Record<
  string,
  string | Record<string, string>
> & {
  submissionId: string;
  assets: Record<string, string>;
};

export declare const CLIENT_INTAKE_FORM_FIELDS: readonly string[];
export declare const CLIENT_INTAKE_FILE_FIELDS: readonly string[];
export declare const CLIENT_INTAKE_ISSUE_FIELDS: readonly string[];

export declare function createClientIntakeSubmission(
  formFields: ClientIntakeFormFields,
  metadata: { submissionId: string; assets?: Record<string, string> },
): ClientIntakeSubmission;
