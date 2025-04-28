const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Создаем папки для загрузок, если они не существуют
const createUploadDirs = () => {
    const dirs = ['uploads', 'uploads/profile', 'uploads/posts', 'uploads/messages'];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

createUploadDirs();

// Настройка хранилища для multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = 'uploads/';

        if (req.path.includes('/users/profile')) {
            uploadPath += 'profile/';
        } else if (req.path.includes('/posts')) {
            uploadPath += 'posts/';
        } else if (req.path.includes('/messages')) {
            uploadPath += 'messages/';
        }

        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // Генерируем уникальное имя файла
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// Фильтр файлов для разрешения только изображений
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Недопустимый тип файла. Разрешены только JPG, PNG и GIF.'), false);
    }
};

// Максимальный размер файла - 5 МБ
const uploadImage = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter
});

module.exports = {
    uploadImage
};