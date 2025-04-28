const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const Post = require('./Post');

const PostImage = sequelize.define('PostImage', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    postId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: Post,
            key: 'id'
        }
    },
    imageUrl: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    timestamps: true
});

PostImage.belongsTo(Post, { foreignKey: 'postId' });
Post.hasMany(PostImage, { foreignKey: 'postId' });

module.exports = PostImage;