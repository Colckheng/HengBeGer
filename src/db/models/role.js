// Role.js - 职业模型
import { DataTypes } from 'sequelize';

// 定义模型函数
export default function defineRole(sequelize) {
  const Role = sequelize.define('Role', {
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
    tableName: 'roles',
    timestamps: true
  });

  return Role;
}