import { DataTypes } from 'sequelize';

export default function defineDriveDisk(sequelize) {
  return sequelize.define(
    'DriveDisk',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
      },
      image: {
        type: DataTypes.TEXT('long'),
      },
    },
    {
      tableName: 'drive_disks',
      timestamps: true,
    },
  );
}
