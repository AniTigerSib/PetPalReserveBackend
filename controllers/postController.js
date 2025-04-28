const Post = require('../models/Post');
const PostImage = require('../models/PostImage');
const User = require('../models/User');
const BlackList = require('../models/BlackList');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const Friend = require('../models/Friend');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { validationResult } = require('express-validator');
const {sequelize} = require("../config/db");

// Создать новый пост
const createPost = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { content } = req.body;
        const userId = req.user.id;

        // Создаем транзакцию
        const transaction = await sequelize.transaction();

        try {
            // Создаем новый пост
            const post = await Post.create({
                content,
                userId
            }, { transaction });

            // Если есть изображения, сохраняем их
            if (req.files && req.files.length > 0) {
                const postImages = await Promise.all(req.files.map(file => {
                    return PostImage.create({
                        postId: post.id,
                        imageUrl: '/uploads/posts/' + file.filename
                    }, { transaction });
                }));
            }

            await transaction.commit();

            // Получаем пост с изображениями
            const createdPost = await Post.findByPk(post.id, {
                include: [
                    {
                        model: User,
                        attributes: ['id', 'username', 'displayName', 'profileImage']
                    },
                    {
                        model: PostImage
                    }
                ]
            });

            res.status(201).json({ message: 'Пост успешно создан', post: createdPost });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        // Удаляем загруженные файлы в случае ошибки
        if (req.files) {
            req.files.forEach(file => {
                fs.unlinkSync(file.path);
            });
        }

        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Редактировать пост
const updatePost = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { content } = req.body;
        const { postId } = req.params;
        const userId = req.user.id;

        // Находим пост
        const post = await Post.findByPk(postId);

        if (!post) {
            return res.status(404).json({ message: 'Пост не найден' });
        }

        // Проверяем, является ли пользователь автором поста
        if (post.userId !== userId) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        // Обновляем пост
        post.content = content;
        await post.save();

        // Получаем обновленный пост с изображениями
        const updatedPost = await Post.findByPk(postId, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'username', 'displayName', 'profileImage']
                },
                {
                    model: PostImage
                }
            ]
        });

        res.json({ message: 'Пост успешно обновлен', post: updatedPost });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Удалить пост
const deletePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.id;

        // Находим пост
        const post = await Post.findByPk(postId, {
            include: [
                {
                    model: PostImage
                }
            ]
        });

        if (!post) {
            return res.status(404).json({ message: 'Пост не найден' });
        }

        // Проверяем, является ли пользователь автором поста
        if (post.userId !== userId) {
            return res.status(403).json({ message: 'Доступ запрещен' });
        }

        // Создаем транзакцию
        const transaction = await sequelize.transaction();

        try {
            // Удаляем изображения поста с диска
            if (post.PostImages && post.PostImages.length > 0) {
                post.PostImages.forEach(image => {
                    const imagePath = path.join(__dirname, '..', image.imageUrl);
                    if (fs.existsSync(imagePath)) {
                        fs.unlinkSync(imagePath);
                    }
                });
            }

            // Удаляем пост и все связанные данные (каскадно)
            await post.destroy({ transaction });

            await transaction.commit();

            res.json({ message: 'Пост успешно удален' });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить пост по ID
const getPostById = async (req, res) => {
    try {
        const { postId } = req.params;

        // Находим пост
        const post = await Post.findByPk(postId, {
            include: [
                {
                    model: User,
                    attributes: ['id', 'username', 'displayName', 'profileImage']
                },
                {
                    model: PostImage
                }
            ]
        });

        if (!post) {
            return res.status(404).json({ message: 'Пост не найден' });
        }

        // Если пользователь аутентифицирован, проверяем, не заблокировал ли его автор поста
        if (req.user) {
            const isBlocked = await BlackList.findOne({
                where: {
                    blockerId: post.userId,
                    blockedId: req.user.id
                }
            });

            if (isBlocked) {
                return res.status(403).json({ message: 'Доступ запрещен' });
            }

            // Добавляем информацию о лайке пользователя
            const userLike = await Like.findOne({
                where: {
                    postId,
                    userId: req.user.id
                }
            });

            post.dataValues.isLiked = !!userLike;
        }

        res.json(post);
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить посты пользователя
const getUserPosts = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        // Проверяем, существует ли пользователь
        const user = await User.findByPk(userId);
        if (!user || !user.isActive) {
            return res.status(404).json({ message: 'Пользователь не найден или деактивирован' });
        }

        // Если пользователь аутентифицирован, проверяем, не заблокировал ли его запрашиваемый пользователь
        if (req.user) {
            const isBlocked = await BlackList.findOne({
                where: {
                    blockerId: userId,
                    blockedId: req.user.id
                }
            });

            if (isBlocked) {
                return res.status(403).json({ message: 'Доступ запрещен' });
            }
        }

        // Находим посты пользователя
        const posts = await Post.findAndCountAll({
            where: {
                userId
            },
            include: [
                {
                    model: User,
                    attributes: ['id', 'username', 'displayName', 'profileImage']
                },
                {
                    model: PostImage
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Если пользователь аутентифицирован, добавляем информацию о лайках
        if (req.user) {
            const postIds = posts.rows.map(post => post.id);

            const userLikes = await Like.findAll({
                where: {
                    postId: { [Op.in]: postIds },
                    userId: req.user.id
                }
            });

            const userLikedPostIds = userLikes.map(like => like.postId);

            posts.rows = posts.rows.map(post => {
                post.dataValues.isLiked = userLikedPostIds.includes(post.id);
                return post;
            });
        }

        res.json({
            totalItems: posts.count,
            totalPages: Math.ceil(posts.count / limit),
            currentPage: parseInt(page),
            items: posts.rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
};

// Получить новостную ленту
