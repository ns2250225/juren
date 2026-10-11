/** 军团资金 / 建筑材料 / 评分 / 战功点数 (gas & blades live on the player). */
export class ResourceManager {
  funds = 600
  materials = 300
  score = 0
  merit = 0

  add(funds: number, materials: number) {
    this.funds += Math.round(funds)
    this.materials += Math.round(materials)
  }
  can(c: { funds: number; materials: number }) {
    return this.funds >= c.funds && this.materials >= c.materials
  }
  spend(c: { funds: number; materials: number }) {
    if (!this.can(c)) return false
    this.funds -= c.funds
    this.materials -= c.materials
    return true
  }
}
