import { DataTypes } from 'sequelize';

export default function defineAppMeta(sequelize) {
  const AppMeta = sequelize.define('AppMeta', {
    key: {
      type: DataTypes.STRING(64),
      allowNull: false,
      primaryKey: true,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  }, {
    tableName: 'app_meta',
    timestamps: true,
  });

  return AppMeta;
}
