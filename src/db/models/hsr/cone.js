import { DataTypes } from 'sequelize'

export default function defineHsrCone(sequelize) {
  const HsrCone = sequelize.define('HsrCone', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    image: { type: DataTypes.TEXT('long') },
    pathId: { type: DataTypes.INTEGER, allowNull: false },
    rarityId: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'hsr_cones',
    timestamps: true
  })
  return HsrCone
}