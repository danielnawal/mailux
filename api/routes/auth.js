import { Router } from 'express';
import { createHash } from 'crypto';
import db from '../db.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Datos incompletos' });

  const hash = createHash('sha256').update(password).digest('hex');
  const user = db.prepare(`
    SELECT u.id, u.email, u.role, u.distributor_id, d.name as distributor_name
    FROM users u JOIN distributors d ON d.id = u.distributor_id
    WHERE u.email = ? AND u.password_hash = ?
  `).get(email, hash);

  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const token = signToken({ id: user.id, email: user.email, role: user.role, distributor_id: user.distributor_id });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, distributor_name: user.distributor_name } });
});

export default router;
