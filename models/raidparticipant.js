'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class RaidParticipant extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  RaidParticipant.init({
    raidId: DataTypes.INTEGER,
    telegramId: DataTypes.STRING,
    hasLiked: DataTypes.BOOLEAN,
    hasRetweeted: DataTypes.BOOLEAN,
    payoutStatus: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'RaidParticipant',
  });
  return RaidParticipant;
};