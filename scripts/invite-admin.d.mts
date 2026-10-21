export declare class InviteError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}

export declare type InviteArgs = {
  ownerSubject: string;
  email: string;
  out: string;
  confirm: boolean;
  dryRun: boolean;
  databaseUrlFile: string;
  origin: string;
  help: boolean;
};

export declare type InviteSql = {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
};

export declare function parseInviteArgs(argv?: string[]): InviteArgs;

export declare function runInvite(options?: {
  argv?: string[];
  env?: { ADMIN_DATABASE_URL?: string; ADMIN_PUBLIC_ORIGIN?: string };
  sql?: InviteSql;
  stdout?: (line: string) => void;
}): Promise<number>;
