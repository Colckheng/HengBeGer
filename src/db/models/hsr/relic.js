import { DataTypes } from 'sequelize'

export default function defineHsrRelic(sequelize) {
  const HsrRelic = sequelize.define('HsrRelic', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    image: { type: DataTypes.TEXT('long') },
    typeId: { type: DataTypes.INTEGER, allowNull: false },
    setName: { type: DataTypes.STRING },
    part: { type: DataTypes.STRING }
  }, {
    tableName: 'hsr_relics',
    timestamps: true
  })
  return HsrRelic
}