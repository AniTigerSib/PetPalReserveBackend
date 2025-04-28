const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const BlackList = sequelize.define('BlackList', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    blockerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    blockedId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    }
}, {
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['blockerId', 'blockedId']
        }
    ]
});

BlackList.belongsTo(User, { as: 'blocker', foreignKey: 'blockerId' });
BlackList.belongsTo(User, { as: 'blocked', foreignKey: 'blockedId' });

module.exports = BlackList;