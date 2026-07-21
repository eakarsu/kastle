const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sha256 } = require('../lib/canonical');

function createUserAuth(pool, config) {
  return async function userAuth(req, res, next) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      });
      const result = await pool.query(
        `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.is_active, u.token_version
         FROM security_users u JOIN security_tenants t ON t.id = u.tenant_id
         WHERE u.id = $1 AND u.tenant_id = $2 AND t.is_active = true`,
        [payload.sub, payload.tenantId],
      );
      const user = result.rows[0];
      if (!user?.is_active || Number(user.token_version) !== Number(payload.tokenVersion)) throw new Error('revoked');
      req.user = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Session is invalid or revoked', code: 'SESSION_REVOKED' });
    }
  };
}

function createReaderAuth(pool) {
  return async function readerAuth(req, res, next) {
    const readerId = req.headers['x-reader-id'];
    const key = req.headers['x-reader-key'];
    if (typeof readerId !== 'string' || typeof key !== 'string' || key.length < 32 || key.length > 200) {
      return res.status(401).json({ error: 'Reader authentication required', code: 'READER_UNAUTHORIZED' });
    }
    try {
      const result = await pool.query(
        `SELECT r.* FROM security_readers r
         JOIN security_tenants t ON t.id = r.tenant_id
         JOIN security_properties p ON p.id = r.property_id AND p.tenant_id = r.tenant_id
         WHERE r.id = $1 AND r.status = 'ACTIVE' AND t.is_active = true AND p.is_active = true`,
        [readerId],
      );
      const reader = result.rows[0];
      if (!reader) throw new Error('unknown reader');
      const supplied = Buffer.from(sha256(key), 'hex');
      const stored = Buffer.from(reader.key_hash, 'hex');
      if (supplied.length !== stored.length || !crypto.timingSafeEqual(supplied, stored)) throw new Error('bad key');
      req.reader = reader;
      await pool.query('UPDATE security_readers SET last_seen_at = now() WHERE id = $1', [reader.id]);
      next();
    } catch {
      return res.status(401).json({ error: 'Reader authentication failed', code: 'READER_UNAUTHORIZED' });
    }
  };
}

function requireRoles(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient role', code: 'FORBIDDEN' });
    next();
  };
}

module.exports = { createUserAuth, createReaderAuth, requireRoles };
