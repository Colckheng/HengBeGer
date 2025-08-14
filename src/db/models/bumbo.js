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
      type: DataTypes.STRING,
      defaultValue: '/assets/zzz.jpg'
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