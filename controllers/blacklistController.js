const BlackList = require('../models/BlackList');
const User = require('../models/User');
const Friend = require('../models/Friend');
const { Op } = require('sequelize');

// Добавить пользователя в черный список
const blockUser = async (req, res) => {
    try {
        const blockerId = req.user.id;
        const { blockedId } = req.body;

        if (blockerId === blockedId) {
            return res.status(400).json({ message: 'Нельзя заблокировать самого себя' });
        }

        // Проверяем, существует ли пользователь, которого блокируем
        const blockedUser = await User.findByPk(blockedId);
        if (!blockedUser || !blockedUser.isActive) {
            return res.status(404).json({ message: 'Пользователь не найден или деактивирован' });
        }

        // Проверяем, не заблокирован ли уже пользователь
        const existingBlock = await BlackList.findOne({
            where: {
                blockerId,
                blockedId
            }
        });

        if (existingBlock) {
            return res.status(400).json({ message: 'Этот пользователь уже заблокирован' });
        }

        // Если пользователи были друзьями, удаляем их дружбу
        await Friend.destroy({
            where: {
                [Op.or]: [
                    { requesterId: blockerId, addresseeId: blockedId },
                    { requesterId: blockedId, addresseeId: blockerId }
                ]
            }
        });

        // Добавляем пользователя в черный список
        const blacklistEntry = await BlackList.create({
            blockerId,
            blockedId
        });

        res.status(201).json({ message: 'Пользователь добавлен в черный список', blacklistEntry });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Удалить пользователя из черного списка
const unblockUser = async (req, res) => {
    try {
        const blockerId = req.user.id;
        const { blockedId } = req.params;

        // Находим запись в черном списке
        const blacklistEntry = await BlackList.findOne({
            where: {
                blockerId,
                blockedId
            }
        });

        if (!blacklistEntry) {
            return res.status(404).json({ message: 'Пользователь не найден в черном списке' });
        }

        // Удаляем запись из черного списка
        await blacklistEntry.destroy();

        res.json({ message: 'Пользователь удален из черного списка' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить список заблокированных пользователей
const getBlockedUsers = async (req, res) => {
    try {
        const blockerId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Находим всех заблокированных пользователей
        const blacklist = await BlackList.findAndCountAll({
            where: {
                blockerId
            },
            include: [{
                model: User,
                as: 'blocked',
                attributes: ['id', 'username', 'displayName', 'profileImage']
            }],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            totalItems: blacklist.count,
            totalPages: Math.ceil(blacklist.count / limit),
            currentPage: parseInt(page),
            items: blacklist.rows.map(entry => entry.blocked)
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

module.exports = {
    blockUser,
    unblockUser,
    getBlockedUsers
};