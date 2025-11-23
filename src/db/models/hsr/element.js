import { DataTypes } from 'sequelize'

export default function defineHsrElement(sequelize) {
  const HsrElement = sequelize.define('HsrElement', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true }
  }, {
    tableName: 'hsr_elements',
    timestamps: true
  })
  return HsrElement
}