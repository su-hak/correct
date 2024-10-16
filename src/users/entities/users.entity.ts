import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn()
  id: string;

  @Column()
  token: string;

  @Column()
  name: string;

  @Column()
  contact: string;

  @Column()
  expiryDate: Date;

  @Column({ nullable: true })
  deviceId: string;

  @Column({ default: false })
  isLoggedIn: boolean;

  @Column({ nullable: true })
  lastHeartbeat: Date;
}