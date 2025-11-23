import { DataTypes } from 'sequelize'

export default function defineHsrRelicType(sequelize) {
  const HsrRelicType = sequelize.define('HsrRelicType', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true }
  }, {
    tableName: 'hsr_relic_types',
    timestamps: true
  })
  return HsrRelicType
}