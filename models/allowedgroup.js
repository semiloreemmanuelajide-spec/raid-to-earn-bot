'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AllowedGroup extends Model {
    static associate(models) {
      // Define associations if needed in the future
    }
  }
  AllowedGroup.init({
    groupId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    groupTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    }
  }, {
    sequelize,
    modelName: 'AllowedGroup',
  });
  return AllowedGroup;
};