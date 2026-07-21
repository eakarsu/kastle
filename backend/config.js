function required(name, minimumLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minimumLength || /^(change|replace|secret|password)/i.test(value)) {
    throw new Error(`${name} is required and must not be a placeholder`);
  }
  return value;
}

function loadConfig() {
  const corsOrigins = required('CORS_ORIGINS').split(',').map((value) => value.trim()).filter(Boolean);
  if (!corsOrigins.length || corsOrigins.includes('*')) throw new Error('CORS_ORIGINS must contain explicit origins');
  return {
    port: Number(process.env.BACKEND_PORT || 4002),
    host: process.env.BACKEND_HOST || '0.0.0.0',
    jwtSecret: required('JWT_SECRET', 32),
    jwtIssuer: process.env.JWT_ISSUER || 'kastle-access-control',
    jwtAudience: process.env.JWT_AUDIENCE || 'kastle-operators',
    corsOrigins,
  };
}

module.exports = { loadConfig, required };
