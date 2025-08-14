// Faction.js - 阵营模型
import { DataTypes } from 'sequelize';

// 定义模型函数
export default function defineFaction(sequelize) {
  const Faction = sequelize.define('Faction', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'factions',
    timestamps: true
  });

  return Faction;
}