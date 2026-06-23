import * as THREE from 'three';

function part(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

/**
 * A blocky Steve-like avatar shown in third-person view. Built facing -Z (so
 * group.rotation.y = player yaw orients it toward the look direction).
 */
export class PlayerModel {
  readonly group = new THREE.Group();
  private armL: THREE.Group;
  private armR: THREE.Group;
  private legL: THREE.Group;
  private legR: THREE.Group;
  private phase = 0;

  constructor(scene: THREE.Scene) {
    const skin = 0xd9a06a, shirt = 0x33a7c4, pants = 0x3b3bbf, hair = 0x4a3320;

    // head (with hair cap + face toward -Z)
    const head = new THREE.Group();
    head.add(this.place(part(0.5, 0.5, 0.5, skin), 0, 0, 0));
    const cap = part(0.52, 0.18, 0.52, hair); cap.position.set(0, 0.18, 0); head.add(cap);
    head.add(this.place(part(0.1, 0.1, 0.02, 0x2a1a0a), -0.12, 0.02, -0.26));
    head.add(this.place(part(0.1, 0.1, 0.02, 0x2a1a0a), 0.12, 0.02, -0.26));
    head.position.set(0, 1.45, 0);
    this.group.add(head);

    // body
    this.group.add(this.place(part(0.5, 0.7, 0.26, shirt), 0, 0.85, 0));

    // limbs hang from a pivot at the top so they can swing
    this.armL = this.limb(part(0.22, 0.7, 0.22, skin), -0.36, 1.2, 0.7);
    this.armR = this.limb(part(0.22, 0.7, 0.22, skin), 0.36, 1.2, 0.7);
    this.legL = this.limb(part(0.24, 0.72, 0.24, pants), -0.13, 0.72, 0.72);
    this.legR = this.limb(part(0.24, 0.72, 0.24, pants), 0.13, 0.72, 0.72);
    this.group.add(this.armL, this.armR, this.legL, this.legR);

    this.group.visible = false;
    scene.add(this.group);
  }

  private place(mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
    mesh.position.set(x, y, z);
    return mesh;
  }

  /** Wrap a limb mesh in a pivot group so rotation swings from the shoulder/hip. */
  private limb(mesh: THREE.Mesh, x: number, pivotY: number, height: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, pivotY, 0);
    mesh.position.set(0, -height / 2, 0);
    g.add(mesh);
    return g;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  update(pos: THREE.Vector3, yaw: number, moving: boolean, dt: number): void {
    this.group.position.set(pos.x, pos.y, pos.z);
    this.group.rotation.y = yaw;
    if (moving) {
      this.phase += dt * 8;
      const s = Math.sin(this.phase) * 0.7;
      this.legL.rotation.x = s; this.legR.rotation.x = -s;
      this.armL.rotation.x = -s; this.armR.rotation.x = s;
    } else {
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    }
  }
}
