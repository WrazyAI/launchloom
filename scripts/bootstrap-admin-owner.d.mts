export declare class BootstrapError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}

export declare type BootstrapArgs = {
  subject: string;
  email: string;
  name: string;
  confirm: boolean;
  dryRun: boolean;
  databaseUrlFile: string;
  help: boolean;
};

export declare type BootstrapSql = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};

export declare function legacyAccessId(verifiedEmail: string): string;

export declare function parseBootstrapArgs(argv?: string[]): BootstrapArgs;

export declare function runBootstrap(options?: {
  argv?: string[];
  env?: { ADMIN_DATABASE_URL?: string };
  sql?: BootstrapSql;
  stdout?: (line: string) => void;
}): Promise<number>;
