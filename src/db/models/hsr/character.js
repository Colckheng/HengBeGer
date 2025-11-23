import { DataTypes } from 'sequelize'

export default function defineHsrCharacter(sequelize) {
  const HsrCharacter = sequelize.define('HsrCharacter', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    image: { type: DataTypes.TEXT('long') },
    elementId: { type: DataTypes.INTEGER, allowNull: false },
    pathId: { type: DataTypes.INTEGER, allowNull: false },
    rarityId: { type: DataTypes.INTEGER, allowNull: false }
  }, {
    tableName: 'hsr_characters',
    timestamps: true
  })
  return HsrCharacter
}