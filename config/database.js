const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize('raid_bot_db', 'root', '', {
  host: '127.0.0.1',
  dialect: 'mysql',
  logging: false,
});

module.exports = sequelize;