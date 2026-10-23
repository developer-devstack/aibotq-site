-- Aibotq.dev initial schema.

CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  github_id    TEXT UNIQUE,
  gitlab_id    TEXT UNIQUE,
  bitbucket_id TEXT UNIQUE,
  login        TEXT NOT NULL,
  name         TEXT,
  avatar       TEXT,
  created_at   INTEGER NOT NULL
);

-- Provider access tokens, AES-GCM encrypted with a key derived from SESSION_SECRET. Never returned by the API.
CREATE TABLE provider_tokens (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL CHECK (provider IN ('github','gitlab','bitbucket')),
  token_enc  TEXT NOT NULL,
  scope      TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- id is the SHA-256 of the cookie value, so a leaked DB cannot be used to forge sessions.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE projects (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  repo_full_name TEXT,
  source         TEXT NOT NULL CHECK (source IN ('import','template','url','upload')),
  provider       TEXT CHECK (provider IN ('github','gitlab','bitbucket')),
  repo_private   INTEGER NOT NULL DEFAULT 0,
  branch         TEXT,
  upload_id      TEXT,
  framework      TEXT,
  build_command  TEXT,
  output_dir     TEXT,
  root_dir       TEXT,
  env_enc        TEXT,
  webhook_id     TEXT,
  webhook_status TEXT,
  status         TEXT NOT NULL DEFAULT 'created',
  url            TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_repo ON projects(provider, repo_full_name);

CREATE TABLE deployments (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step        TEXT NOT NULL DEFAULT 'queued',
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','building','ready','failed')),
  log         TEXT NOT NULL DEFAULT '',
  commit_sha  TEXT,
  url         TEXT,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('production','preview')),
  ref         TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_deployments_project ON deployments(project_id, created_at);

-- Fixed-window rate limiter for auth and deploy endpoints.
CREATE TABLE rate_limits (
  key          TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE uploads (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_count INTEGER NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
