export class PlayerStats {
  readonly maxHealth = 20;
  readonly maxHunger = 20;
  readonly maxAir = 10;

  health = 20;
  hunger = 20;
  air = 10;
  dead = false;

  /** Set when damage was applied this frame; Game reads + clears it. */
  pendingHurt = false;

  private exhaustion = 0;
  private regenTimer = 0;
  private starveTimer = 0;
  private airTimer = 0;

  /** Add exhaustion from movement/actions; drains hunger over time. */
  addExhaustion(amount: number): void {
    this.exhaustion += amount;
  }

  damage(amount: number): void {
    if (amount <= 0 || this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.pendingHurt = true;
    if (this.health <= 0) this.dead = true;
  }

  feed(amount: number): void {
    this.hunger = Math.min(this.maxHunger, this.hunger + amount);
  }

  reset(): void {
    this.health = this.maxHealth;
    this.hunger = this.maxHunger;
    this.air = this.maxAir;
    this.dead = false;
    this.exhaustion = 0;
  }

  update(dt: number, submerged: boolean): void {
    if (this.dead) return;

    // exhaustion → hunger
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      this.hunger = Math.max(0, this.hunger - 1);
    }

    // natural regeneration when well-fed
    if (this.hunger >= 18 && this.health < this.maxHealth) {
      this.regenTimer += dt;
      if (this.regenTimer >= 3.5) {
        this.regenTimer = 0;
        this.health = Math.min(this.maxHealth, this.health + 1);
        this.addExhaustion(3);
      }
    } else {
      this.regenTimer = 0;
    }

    // starvation
    if (this.hunger <= 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 2) {
        this.starveTimer = 0;
        if (this.health > 1) this.damage(1);
      }
    } else {
      this.starveTimer = 0;
    }

    // drowning
    if (submerged) {
      this.airTimer += dt;
      if (this.airTimer >= 1) {
        this.airTimer = 0;
        if (this.air > 0) this.air -= 1;
        else this.damage(2);
      }
    } else {
      this.air = this.maxAir;
      this.airTimer = 0;
    }
  }
}
