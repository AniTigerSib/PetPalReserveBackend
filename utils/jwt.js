const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Token = require('../models/Token');

const generateTokens = async (user, userAgent, ipAddress) => {
    // Создание payload для токенов
    const payload = {
        id: user.id,
        email: user.email,
        username: user.username
    };

    // Создание access token
    const accessToken = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRATION }
    );

    // Создание refresh token с уникальным идентификатором
    const refreshTokenId = uuidv4();
    const refreshToken = jwt.sign(
        { ...payload, jti: refreshTokenId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRATION }
    );

    // Вычисление времени истечения refresh token
    const decoded = jwt.decode(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);

    // Сохранение refresh token в базе данных
    await Token.create({
        userId: user.id,
        refreshToken,
        expiresAt,
        userAgent,
        ipAddress
    });

    return {
        accessToken,
        refreshToken,
        expiresAt
    };
};

const verifyRefreshToken = async (refreshToken) => {
    try {
        // Проверка валидности refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

        // Проверка наличия токена в базе данных
        const storedToken = await Token.findOne({
            where: {
                refreshToken,
                isRevoked: false,
                expiresAt: { [Op.gt]: new Date() }
            }
        });

        if (!storedToken) {
            throw new Error('Invalid refresh token');
        }

        return decoded;
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
};

const revokeToken = async (refreshToken) => {
    await Token.update(
        { isRevoked: true },
        { where: { refreshToken } }
    );
};

module.exports = {
    generateTokens,
    verifyRefreshToken,
    revokeToken
};