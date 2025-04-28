const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const BlackList = require('../models/BlackList');

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Не предоставлен токен авторизации' });
        }

        const token = authHeader.split(' ')[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findByPk(decoded.id);

        if (!user || !user.isActive) {
            return res.status(401).json({ message: 'Пользователь не найден или деактивирован' });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Срок действия токена истек' });
        }
        return res.status(401).json({ message: 'Неверный токен авторизации' });
    }
};

const checkNotBlocked = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const targetUserId = req.params.userId || req.body.userId;

        if (!targetUserId || userId === targetUserId) {
            return next();
        }

        // Проверяем, не заблокировал ли нас целевой пользователь
        const isBlocked = await BlackList.findOne({
            where: {
                blockerId: targetUserId,
                blockedId: userId
            }
        });

        if (isBlocked) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    authenticate,
    checkNotBlocked
};