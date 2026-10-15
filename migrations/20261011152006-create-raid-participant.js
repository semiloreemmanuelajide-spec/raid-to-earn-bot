'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('RaidParticipants', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      raidId: {
        type: Sequelize.INTEGER
      },
      telegramId: {
        type: Sequelize.STRING
      },
      hasLiked: {
        type: Sequelize.BOOLEAN
      },
      hasRetweeted: {
        type: Sequelize.BOOLEAN
      },
      payoutStatus: {
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('RaidParticipants');
  }
};