import express from 'express';
import { notifyClick } from '../controllers/notificationController.js';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

// Регистрируем маршрут для обработки уведомлений
router.post('/notify-click', notifyClick);

// Получаем __dirname для ES-модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Регистрируем маршрут для страницы /megapack
router.get('/megapack', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'megapack.html'));
});

export default router;
