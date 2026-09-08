import { config, CcdbError, type Config } from 'ccdb-client';

const clientIds: Record<string, string> = {
  local: 'ccdb-cli-local',
  test: 'ccdb-cli-test',
  pre: 'ccdb-cli-pre',
  production: 'ccdb-cli-prod',
};

/** Application defaults belong here, not in the shared SDK or remote HTTP server. */
export function appConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Config> = {},
): Config {
  const profile = overrides.profile || env.CCDB_PROFILE || 'production';
  const clientId = overrides.clientId || env.CCDB_CLIENT_ID || clientIds[profile];
  if (!clientId)
    throw new CcdbError('INVALID_CONFIG', '自定义 profile 需要显式配置 CCDB_CLIENT_ID');
  return config(env, { ...overrides, clientId });
}
