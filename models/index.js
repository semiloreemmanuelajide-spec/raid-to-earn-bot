'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

let sequelize;
if (process.env.NODE_ENV === 'production' || process.env.MYSQLHOST) {
  // Cloud Database Connection (Aiven / Render / Production)
  sequelize = new Sequelize(
    process.env.MYSQLDATABASE,
    process.env.MYSQLUSER,
    process.env.MYSQLPASSWORD,
    {
      host: process.env.MYSQLHOST,
      port: process.env.MYSQLPORT || 3306,
      dialect: 'mysql',
      logging: false,
      dialectOptions: {
        ssl: {
          rejectUnauthorized: false
        },
        connectTimeout: 60000,
        // Force TCP socket keep-alive to stop cloud firewalls from dropping idle sockets
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
      },
      pool: {
        max: 10,
        min: 2,         // Keeps 2 warm connections active so cold starts never fail
        acquire: 60000, // Allows 60s for connection acquisition during peak load
        idle: 10000,    // Closes idle connections beyond minimum after 10s
        evict: 10000    // Checks and evicts dead/broken connections every 10s
      },
      retry: {
        max: 3          // Automatically retries failed queries up to 3 times before erroring out
      }
    }
  );
} else if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  // Local Database Connection (XAMPP / Development)
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;