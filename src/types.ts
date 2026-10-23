export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  UPLOADS?: R2Bucket;

  APP_URL?: string;
  TEMPLATES?: Record<string, string> | string;
  DEPLOY_WEBHOOK_URL?: string;

  // Secrets (wrangler secret put ...)
  SESSION_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  DEPLOY_WEBHOOK_SECRET?: string;
  GITLAB_CLIENT_ID?: string;
  GITLAB_CLIENT_SECRET?: string;
  BITBUCKET_CLIENT_ID?: string;
  BITBUCKET_CLIENT_SECRET?: string;
}

export type Provider = 'github' | 'gitlab' | 'bitbucket';
export const PROVIDERS: Provider[] = ['github', 'gitlab', 'bitbucket'];

export interface User {
  id: string;
  login: string;
  name: string | null;
  avatar: string | null;
  github_id: string | null;
  gitlab_id: string | null;
  bitbucket_id: string | null;
}

export interface Ctx {
  req: Request;
  env: Env;
  ctx: ExecutionContext;
  url: URL;
}

export interface RepoInfo {
  provider: Provider;
  full_name: string;
  name: string;
  private: boolean;
  default_branch: string;
  description: string | null;
  updated_at: string | null;
  language: string | null;
  html_url: string;
}
