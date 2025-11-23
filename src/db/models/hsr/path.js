import { DataTypes } from 'sequelize'

export default function defineHsrPath(sequelize) {
  const HsrPath = sequelize.define('HsrPath', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true }
  }, {
    tableName: 'hsr_paths',
    timestamps: true
  })
  return HsrPath
}