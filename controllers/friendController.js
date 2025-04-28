const Friend = require('../models/Friend');
const User = require('../models/User');
const BlackList = require('../models/BlackList');
const { Op } = require('sequelize');

// Отправить заявку в друзья
const sendFriendRequest = async (req, res) => {
    try {
        const requesterId = req.user.id;
        const { addresseeId } = req.body;

        if (requesterId === addresseeId) {
            return res.status(400).json({ message: 'Нельзя отправить заявку самому себе' });
        }

        // Проверяем, существует ли пользователь, которому отправляем заявку
        const addressee = await User.findByPk(addresseeId);
        if (!addressee || !addressee.isActive) {
            return res.status(404).json({ message: 'Пользователь не найден или деактивирован' });
        }

        // Проверяем, не заблокировал ли нас этот пользователь
        const isBlocked = await BlackList.findOne({
            where: {
                blockerId: addresseeId,
                blockedId: requesterId
            }
        });

        if (isBlocked) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        // Проверяем, не заблокировали ли мы этого пользователя
        const haveBlocked = await BlackList.findOne({
            where: {
                blockerId: requesterId,
                blockedId: addresseeId
            }
        });

        if (haveBlocked) {
            return res.status(400).json({ message: 'Невозможно отправить заявку пользователю, которого вы заблокировали' });
        }

        // Проверяем, нет ли уже заявки между этими пользователями
        const existingFriendship = await Friend.findOne({
            where: {
                [Op.or]: [
                    { requesterId, addresseeId },
                    { requesterId: addresseeId, addresseeId: requesterId }
                ]
            }
        });

        if (existingFriendship) {
            if (existingFriendship.status === 'accepted') {
                return res.status(400).json({ message: 'Вы уже являетесь друзьями' });
            } else if (existingFriendship.requesterId === requesterId) {
                return res.status(400).json({ message: 'Вы уже отправили заявку этому пользователю' });
            } else {
                // Если вторая сторона уже отправила заявку, принимаем её
                existingFriendship.status = 'accepted';
                await existingFriendship.save();
                return res.json({ message: 'Заявка в друзья принята', friendship: existingFriendship });
            }
        }

        // Создаем новую заявку в друзья
        const friendship = await Friend.create({
            requesterId,
            addresseeId,
            status: 'pending'
        });

        res.status(201).json({ message: 'Заявка в друзья отправлена', friendship });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Ответить на заявку в друзья
const respondToFriendRequest = async (req, res) => {
    try {
        const userId = req.user.id;
        const { requestId, action } = req.body;

        if (!['accepted', 'rejected'].includes(action)) {
            return res.status(400).json({ message: 'Некорректное действие' });
        }

        // Находим заявку
        const friendRequest = await Friend.findOne({
            where: {
                id: requestId,
                addresseeId: userId,
                status: 'pending'
            }
        });

        if (!friendRequest) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }

        // Обновляем статус заявки
        friendRequest.status = action;
        await friendRequest.save();

        res.json({ message: `Заявка ${action === 'accepted' ? 'принята' : 'отклонена'}`, friendship: friendRequest });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Удалить из друзей
const removeFriend = async (req, res) => {
    try {
        const userId = req.user.id;
        const { friendId } = req.params;

        // Находим запись о дружбе
        const friendship = await Friend.findOne({
            where: {
                status: 'accepted',
                [Op.or]: [
                    { requesterId: userId, addresseeId: friendId },
                    { requesterId: friendId, addresseeId: userId }
                ]
            }
        });

        if (!friendship) {
            return res.status(404).json({ message: 'Пользователь не найден в списке друзей' });
        }

        // Удаляем запись о дружбе
        await friendship.destroy();

        res.json({ message: 'Пользователь удален из друзей' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить список друзей
const getFriends = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Находим все записи, где пользователь является участником принятой дружбы
        const friendships = await Friend.findAndCountAll({
            where: {
                status: 'accepted',
                [Op.or]: [
                    { requesterId: userId },
                    { addresseeId: userId }
                ]
            },
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Извлекаем ID друзей
        const friendIds = friendships.rows.map(friendship =>
            friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId
        );

        // Получаем данные друзей
        const friends = await User.findAll({
            where: {
                id: { [Op.in]: friendIds },
                isActive: true
            },
            attributes: { exclude: ['password', 'googleId'] }
        });

        res.json({
            totalItems: friendships.count,
            totalPages: Math.ceil(friendships.count / limit),
            currentPage: parseInt(page),
            items: friends
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить входящие заявки в друзья
const getIncomingFriendRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Находим входящие заявки в друзья
        const requests = await Friend.findAndCountAll({
            where: {
                addresseeId: userId,
                status: 'pending'
            },
            include: [{
                model: User,
                as: 'requester',
                attributes: ['id', 'username', 'displayName', 'profileImage']
            }],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            totalItems: requests.count,
            totalPages: Math.ceil(requests.count / limit),
            currentPage: parseInt(page),
            items: requests.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить исходящие заявки в друзья
const getOutgoingFriendRequests = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        // Находим исходящие заявки в друзья
        const requests = await Friend.findAndCountAll({
            where: {
                requesterId: userId,
                status: 'pending'
            },
            include: [{
                model: User,
                as: 'addressee',
                attributes: ['id', 'username', 'displayName', 'profileImage']
            }],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            totalItems: requests.count,
            totalPages: Math.ceil(requests.count / limit),
            currentPage: parseInt(page),
            items: requests.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

module.exports = {
    sendFriendRequest,
    respondToFriendRequest,
    removeFriend,
    getFriends,
    getIncomingFriendRequests,
    getOutgoingFriendRequests
};