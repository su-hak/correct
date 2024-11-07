import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity()
export class GrammarLearning {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  correctedText: string;

  @Column('text')
  originalText: string;

  @Column('simple-array', { nullable: true })
  patterns: string[];

  @Column('int', { default: 1 })
  useCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column('simple-array', { nullable: true })
  alternativeSentences: string[];
}