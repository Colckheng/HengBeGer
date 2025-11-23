import { DataTypes } from 'sequelize'

export default function defineHsrRarity(sequelize) {
  const HsrRarity = sequelize.define('HsrRarity', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false, unique: true }
  }, {
    tableName: 'hsr_rarities',
    timestamps: true
  })
  return HsrRarity
}