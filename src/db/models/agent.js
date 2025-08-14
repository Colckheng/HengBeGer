// Agent.js - 代理人模型
import { DataTypes } from 'sequelize';

// 定义模型函数
export default function defineAgent(sequelize) {
  const Agent = sequelize.define('Agent', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    element: {
      type: DataTypes.STRING
    },
    image: {
      type: DataTypes.TEXT('long')
    },
    factionId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rarityId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: 'agents',
    timestamps: true,
    underscored: false
  });

  // 定义关联关系（但不直接导入其他模型）
  // 关联将在初始化脚本中手动设置
  // Agent.associate = function(models) {
  //   // 暂时注释掉以避免自动字段生成
  // };

  return Agent;
}