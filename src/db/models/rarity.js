// Rarity.js - 稀有度模型
import { DataTypes } from 'sequelize';

// 定义模型函数
export default function defineRarity(sequelize) {
  const Rarity = sequelize.define('Rarity', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isIn: [['S', 'A', 'B']]
      }
    }
  }, {
    tableName: 'rarities',
    timestamps: true
  });

  // 定义关联关系
  Rarity.associate = function(models) {
    Rarity.hasMany(models.Agent);
    Rarity.hasMany(models.SoundEngine);
    Rarity.hasMany(models.Bumbo);
  };

  return Rarity;
}