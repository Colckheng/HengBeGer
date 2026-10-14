// Bumbo.js - 邦布模型
import { DataTypes } from 'sequelize';

// 定义模型函数
export default function defineBumbo(sequelize) {
  const Bumbo = sequelize.define('Bumbo', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    image: {
      // 注意：TEXT 列不能设 defaultValue —— MySQL 8 拒绝 BLOB/TEXT/JSON 的默认值，
      // 会导致全新空库上 sequelize.sync() 建表失败（应用无法自举）。
      // 兜底 '/assets/zzz.jpg' 由写入方负责（initializedata.js / api.js 均已显式传值）。
      type: DataTypes.TEXT('long')
    },
    rarityId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'bumbos',
    timestamps: true,
    underscored: false
  });

  // 定义关联关系
  // Bumbo.associate = function(models) {
  //   // 暂时注释掉以避免自动字段生成
  // };

  return Bumbo;
}