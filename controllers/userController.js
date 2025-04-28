const User = require('../models/User');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const BlackList = require('../models/BlackList');
const { validationResult } = require('express-validator');
const {sequelize} = require("../config/db");

// Получить текущего пользователя
const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password', 'googleId'] }
        });

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Обновить профиль пользователя
const updateProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { displayName, bio } = req.body;
        const userId = req.user.id;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Обновляем только те поля, которые предоставлены
        if (displayName) user.displayName = displayName;
        if (bio !== undefined) user.bio = bio;

        // Если загружено новое изображение профиля
        if (req.file) {
            // Удаляем старое изображение, если оно есть
            if (user.profileImage) {
                const oldImagePath = path.join(__dirname, '..', user.profileImage);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }

            // Сохраняем путь к новому изображению
            user.profileImage = '/uploads/profile/' + req.file.filename;
        }

        await user.save();

        res.json({
            message: 'Профиль успешно обновлен',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.displayName,
                bio: user.bio,
                profileImage: user.profileImage
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Изменение пароля
const changePassword = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Для пользователей, зарегистрированных через OAuth, возможно, нет пароля
        if (!user.password) {
            return res.status(400).json({ message: 'Для учетной записи, созданной через OAuth, нельзя изменить пароль напрямую' });
        }

        // Проверяем текущий пароль
        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Неверный текущий пароль' });
        }

        // Хешируем и сохраняем новый пароль
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);

        await user.save();

        res.json({ message: 'Пароль успешно изменен' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Удаление аккаунта
const deleteAccount = async (req, res) => {
    try {
        const userId = req.user.id;

        // Используем транзакцию, чтобы удалить или деактивировать всё связанное с пользователем
        const transaction = await sequelize.transaction();

        try {
            const user = await User.findByPk(userId);
            if (!user) {
                await transaction.rollback();
                return res.status(404).json({ message: 'Пользователь не найден' });
            }

            // В реальном приложении вместо физического удаления
            // лучше деактивировать аккаунт
            user.isActive = false;
            await user.save({ transaction });

            await transaction.commit();

            res.json({ message: 'Аккаунт успешно деактивирован' });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить профиль пользователя по ID или username
const getUserProfile = async (req, res) => {
    try {
        const identifier = req.params.identifier; // может быть ID или username

        // Проверка, является ли identifier UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

        const whereClause = isUUID
            ? { id: identifier }
            : { username: identifier };

        const user = await User.findOne({
            where: {
                ...whereClause,
                isActive: true
            },
            attributes: { exclude: ['password', 'googleId'] }
        });

        if (!user) {
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Проверяем, не заблокировал ли нас этот пользователь
        if (req.user) {
            const isBlocked = await BlackList.findOne({
                where: {
                    blockerId: user.id,
                    blockedId: req.user.id
                }
            });

            if (isBlocked) {
                return res.status(403).json({ message: 'Доступ запрещен' });
            }
        }

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Поиск пользователей
const searchUsers = async (req, res) => {
    try {
        const { query, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const users = await User.findAndCountAll({
            where: {
                [Op.or]: [
                    { username: { [Op.iLike]: `%${query}%` } },
                    { displayName: { [Op.iLike]: `%${query}%` } }
                ],
                isActive: true
            },
            attributes: { exclude: ['password', 'googleId'] },
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Если пользователь аутентифицирован, фильтруем тех, кто его заблокировал
        if (req.user) {
            const blockedBy = await BlackList.findAll({
                where: {
                    blockedId: req.user.id
                },
                attributes: ['blockerId']
            });

            const blockerIds = blockedBy.map(item => item.blockerId);

            users.rows = users.rows.filter(user => !blockerIds.includes(user.id));
            users.count -= blockedBy.length;
        }

        res.json({
            totalItems: users.count,
            totalPages: Math.ceil(users.count / limit),
            currentPage: parseInt(page),
            items: users.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

module.exports = {
    getCurrentUser,
    updateProfile,
    changePassword,
    deleteAccount,
    getUserProfile,
    searchUsers
};