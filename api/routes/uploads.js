import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { requireAuth } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '../../uploads');     // persiste en host /opt/mailux/uploads
const IMG_DIR = join(UPLOADS_DIR, 'img');
const PDF_DIR = join(UPLOADS_DIR, 'pdf');
for (const d of [IMG_DIR, PDF_DIR]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

const BASE_URL = process.env.MAILUX_BASE_URL || 'https://mailux.gpssoftwarenumberone.com';

function makeStorage(dir) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = (extname(file.originalname) || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, randomBytes(16).toString('hex') + ext);
    }
  });
}

const imgUpload = multer({
  storage: makeStorage(IMG_DIR),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype))
});
const pdfUpload = multer({
  storage: makeStorage(PDF_DIR),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf')
});

const router = Router();
router.use(requireAuth);

// Imagen: usa .any() porque distintos editores (GrapesJS) mandan el archivo con
// nombres de campo distintos (file, files, files[]). Responde en el formato del
// gestor de assets de GrapesJS: { data: [ { src, type, name } ] }.
router.post('/image', (req, res) => {
  imgUpload.any()(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen pesa demasiado (máx 25 MB).' : 'No se pudo subir la imagen.';
      return res.status(400).json({ error: msg });
    }
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Solo se permiten imágenes (jpg, png, gif, webp).' });
    res.json({ data: files.map(f => ({ src: `${BASE_URL}/uploads/img/${f.filename}`, type: 'image', name: f.originalname })) });
  });
});

// PDF: devuelve la URL pública y el nombre para armar el botón de descarga.
router.post('/pdf', (req, res) => {
  pdfUpload.any()(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El PDF pesa demasiado (máx 20 MB).' : 'No se pudo subir el PDF.';
      return res.status(400).json({ error: msg });
    }
    const f = (req.files || [])[0];
    if (!f) return res.status(400).json({ error: 'Solo se permiten archivos PDF.' });
    res.json({ ok: true, url: `${BASE_URL}/uploads/pdf/${f.filename}`, name: f.originalname });
  });
});

export default router;
