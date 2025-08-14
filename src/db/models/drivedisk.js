// DriveDisk.js - 驱动盘模型
import { DataTypes } from 'sequelize';

// 定义模型函数
export default function defineDriveDisk(sequelize) {
  const DriveDisk = sequelize.define('DriveDisk', {
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
    }
  }, {
    tableName: 'drive_disks',
    timestamps: true
  });

  // 定义关联关系（如果有）
  DriveDisk.associate = function(models) {
    // 在这里添加关联
  };

  return DriveDisk;
}