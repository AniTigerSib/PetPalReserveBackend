const User = require('../models/User');
const { generateTokens, verifyRefreshToken, revokeToken } = require('../utils/jwt');
// const passport = require('passport');
const { validationResult } = require('express-validator');
const {Op} = require("sequelize");

// Регистрация нового пользователя
const register = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, username, password, displayName } = req.body;

        // Проверяем, не занят ли email или username
        const existingUser = await User.findOne({
            where: {
                [Op.or]: [{ email }, { username }]
            }
        });

        if (existingUser) {
            return res.status(400).json({
                message: existingUser.email === email
                    ? 'Пользователь с таким email уже существует'
                    : 'Пользователь с таким username уже существует'
            });
        }

        // Создаем нового пользователя
        const user = await User.create({
            email,
            username,
            password,
            displayName: displayName || username
        });

        // Генерируем токены
        const { accessToken, refreshToken } = await generateTokens(
            user,
            req.get('user-agent'),
            req.ip
        );

        res.status(201).json({
            message: 'Пользователь успешно зарегистрирован',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.displayName
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Вход пользователя
const login = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { login, password } = req.body;

        // Ищем пользователя по email или username
        const user = await User.findOne({
            where: {
                [Op.or]: [{ email: login }, { username: login }]
            }
        });

        if (!user) {
            return res.status(401).json({ message: 'Неверный логин или пароль' });
        }

        // Проверяем пароль
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Неверный логин или пароль' });
        }

        // Генерируем токены
        const { accessToken, refreshToken } = await generateTokens(
            user,
            req.get('user-agent'),
            req.ip
        );

        res.json({
            message: 'Вход выполнен успешно',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.displayName
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Обновление токенов
const refreshTokens = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh token не предоставлен' });
        }

        // Верифицируем refresh token
        const decoded = await verifyRefreshToken(refreshToken);

        // Находим пользователя
        const user = await User.findByPk(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'Пользователь не найден' });
        }

        // Отзываем старый refresh token (согласно концепции refresh token rotation)
        await revokeToken(refreshToken);

        // Генерируем новые токены
        const tokens = await generateTokens(
            user,
            req.get('user-agent'),
            req.ip
        );

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        res.status(401).json({ message: 'Недействительный refresh token' });
    }
};

// Выход пользователя
const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh token не предоставлен' });
        }

        // Отзываем refresh token
        await revokeToken(refreshToken);

        res.json({ message: 'Выход выполнен успешно' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Вход через Google OAuth
const googleCallback = async (req, res) => {
    try {
        const { user } = req;

        // Генерируем токены
        const { accessToken, refreshToken } = await generateTokens(
            user,
            req.get('user-agent'),
            req.ip
        );

        // В реальном приложении следует перенаправить на фронтенд с токенами
        // например: res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${accessToken}&refreshToken=${refreshToken}`);

        res.json({
            message: 'Вход через Google выполнен успешно',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                displayName: user.displayName
            },
            accessToken,
            refreshToken
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

module.exports = {
    register,
    login,
    refreshTokens,
    logout,
    googleCallback
};